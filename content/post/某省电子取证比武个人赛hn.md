---
title: "某省电子取证比武个人赛hn"
date: 2026-09-07
categories: ["Forensic"]
tags: ["网站重构"]
description: "henan~"
draft: false
---

1. 【难度：★★】 代码托管服务器源盘的SHA-1值为？

   ![](../../henan/media/image1.png)

   C25D78BEB308B29E0E32A71BCA69FBA5B2B9C8E1

2. 【难度：★】 代码托管服务器操作系统版本号为？ 【参考格式：1.1.1】

   ![](../../henan/media/image2.png)

   7.9.2009 (Core)

3. 【难度：★★★】 代码托管服务器的Volume Group UUID的值为？
   【参考格式：abc123-456DEF】（关键字得分）

   ![](../../henan/media/image3.png)

   vgs -o vg\_name,vg\_uuid

   centos fXxZAI-JVeb-cfo6-PtTF-tBUC-1yyA-9MniU8

4. 【难度：★★】 代码托管服务器中/root目录中PDF文件的MD5值为
   不区分大小写

   ![](../../henan/media/image4.png)

   D51B7F4C60C3410938E5ADA80DBE9179

5. 【难度：★★】 代码托管服务的web访问端口号为？ 【参考格式：1】

   ![](../../henan/media/image5.png)

   直接看没有，所以要具体看看里面的，火眼看到有docker，直接看

   ![](../../henan/media/image6.png)

   9980

6. 【难度：★★★】 代码托管服务的原始环境中，其访问IP为？
   【参考格式：192.168.1.1】

   ![](../../henan/media/image7.png)

   根据这个搭建教程来找

   ![](../../henan/media/image8.png)

   ![](../../henan/media/image9.png)

   这个时候网页已经有反应了

   ![](../../henan/media/image10.png)

7. 【难度：★★】 代码托管服务（gitlab）所使用容器的完整ID是？
   不区分大小写

   就是容器ID

   ![](../../henan/media/image11.png)

8. 【难度：★★★】 代码托管服务器中托管的 Exchange 项目中共有多少个用户？
   【参考格式：1】

   ![](../../henan/media/image12.png)

   先把虚拟机内存调大一点

   ![](../../henan/media/image13.png)

   然后就能正常启启来了

   ![](../../henan/media/image14.png)

   先修改密码，然后就能正常进去了

   ![](../../henan/media/image15.png)

   ![](../../henan/media/image16.png)

9. 【难度：★★★】 代码托管服务（gitlab）用户setting中共有几种中文模式？
   【参考格式：1】

   ![](../../henan/media/image17.png)

   3

10. 【难度：★★★】 代码托管服务器中托管的 Exchange 项目中角色为Maintainer
    的用户有几个？ 【参考格式：12】

    ![](../../henan/media/image18.png)

    数了一下一共8个

11. 【难度：★★★★】 代码托管服务器中托管的 Exchange 项目创建时间是？
    【参考格式：2023/01/01 23:00】

    ![](../../henan/media/image19.png)

12. 【难度：★★★】 代码托管服务器中托管的 Exchange
    项目最后一次提交合并代码的ID为？（回答前8位） 【参考格式：abc123】

    ![](../../henan/media/image20.png)

    就第一条

13. 【难度：★★★★★】
    请综合分析，嫌疑人转移交易所USDT类虚拟币所用的USDT钱包地址为？
    【参考格式：大小写字母+数字】

    ![](../../henan/media/image21.png)

    ![](../../henan/media/image22.png)

14. 【难度：★★★★】
    请综合分析，本案嫌疑人修改交易所虚拟币地址为个人的钱包地址时，所使用的git账号Username为？
    【参考格式：root】

    直接搜usdt

    ![](../../henan/media/image23.png)

    看到是这个用户名的zhu，然后具体去看器username

    ![](../../henan/media/image24.png)

    Zzzzmt

15. 【难度：★★★★】 分析 Exchange
    项目交易所源码，记录交易所冷钱包地址的代码文件名为？
    【参考格式：Abc123.txt】

    见前一题，ColdPurseAddress.cs

16. 【难度：★★★★】 请分析Exchange
    项目的提交记录，嫌疑人最终修改交易所的USDT的钱包地址代码到主代码（master），所对应的commit
    ID为？(ID填写前8位) 【参考格式：abc123】

    ![](../../henan/media/image25.png)

    820d96e8

17. 【难度：★★】
    请综合分析，嫌疑人于什么时间将自己的USDT钱包地址提交合并到了项目的主代码（master）中?（答案填写到分钟）
    【参考格式：2024-10-10 23:30】

    ![](../../henan/media/image26.png)

18. 【难度：★★★】
    通过分析，发现嫌疑人曾也提交过一段“代币转移到新地址”的代码，这段代码的提交的commit
    ID为(ID填写前8位) 【参考格式：abc123】

    ![](../../henan/media/image27.png)

19. 【难度：★★★】
    通过分析，嫌疑人提交的“代币转移到新地址”的代码，使用这段代码需要输入一段密码才能够进行操作，请问该密码为？
    【参考格式：Abc123!@\#】

    ![](../../henan/media/image28.png)

    点进去就能看到

20. 【难度：★★★】
    嫌疑人提交的“代币转移到新地址”的代码，于什么时间被删除？（答案填写到分钟）
    【参考格式：2024-10-10 23:30】

    ![](../../henan/media/image29.png)

21. 【难度：★】 该数据库备份文件的MD5值为？ 【参考格式：abc123】

    ![](../../henan/media/image30.png)

22. 【难度：★★】 备份的数据库名称为？ 【参考格式：Abc123!@\#】

    猜测是SQLserver的数据库

    ![](../../henan/media/image31.png)

    但是火眼取不出来，所以猜测要仿真还原回去

    从后面检材三的仿真可以知道，就是要还原导入回去

    ![](../../henan/media/image32.png)![](../../henan/media/image33.png)

    ![](../../henan/media/image34.png)

    ![](../../henan/media/image35.png)

23. 【难度：★★★】 该数据库备份文件备份完成日期为？
    【参考格式：2023/01/01 23:00】

    ![](../../henan/media/image36.png)

24. 【难度：★★★】 该数据库备份文件备份时使用的Username为？
    【参考格式：abc123】

    ![](../../henan/media/image37.png)

25. 【难度：★★★】 请还原数据库备份文件，该数据库显示的“所有者”为？
    【参考格式：ABC123\\ab】

    ![](../../henan/media/image38.png)

    ![](../../henan/media/image39.png)

26 【难度：★】 请分析检材2-Vcoin.E01，原始硬盘的SHA1值为？

![](../../henan/media/image40.png)

1.  【难度：★★】 请分析检材2-Vcoin.E01，设备名称为？
    【参考格式：Abc123!@\#】

    ![](../../henan/media/image41.png)

2.  【难度：★★★】 请分析检材2-Vcoin.E01，最后一次正常关机时间为？
    【参考格式：2023/01/01 23:00】

    ![](../../henan/media/image42.png)

3.  【难度：★★】
    请分析检材2-Vcoin.E01，该计算机内登录成功最多的用户SID值为
    【参考格式：答题格式：X-X-X-XX-XXX】

    ![](../../henan/media/image43.png)

4.  【难度：★★】
    请分析检材2-Vcoin.E01，该计算机曾经下载过的文件文件名为？
    【参考格式：1.txt】

    ![](../../henan/media/image44.png)

5.  【难度：★】
    请分析检材2-Vcoin.E01搭建的网站，管理员用户登录后台登录界面的URI为？
    【参考格式：/index】

    ![](../../henan/media/image45.png)

    /user/login

6.  【难度：★★】 请分析检材2-Vcoin.E01，数据库sa账户的密码为？
    【参考格式：Abc123!@\#】

    ![](../../henan/media/image46.png)

    先定位到网站目录

    ![](../../henan/media/image47.png)

    ![](../../henan/media/image48.png)这边是可以登录进去的

7.  【难度：★★★★】
    请分析检材2-Vcoin.E01搭建网站代码，网站登录时“短信验证码”处理代码模块位于哪个文件中？
    【参考格式：Abc.dll】

    根据答案格式先把dll都导出来，导出之后，搜email、message、code、verify

    ![](../../henan/media/image49.png)

    确定是这个了

    ![](../../henan/media/image50.png)

34 【难度：★★★★★】
"请分析检材2-Vcoin.E01搭建的网站，该网站后台登录验证密码方法中所使用到的算法有：

A:Base64

B:SHA256

C:MD5

D:RSA"

![](../../henan/media/image51.png)

这里有个考点，通过主控制程序找到登录程序入口位置，找到 login
函数，一步步跟进进入密码算法可以找到

主控制程序是Exchange.Admin ---看到controllers----找到login函数

![](../../henan/media/image52.png)

![](../../henan/media/image53.png)

跳转到login函数

![](../../henan/media/image54.png)

再编辑方法--把这些注释掉

![](../../henan/media/image55.png)

![](../../henan/media/image56.png)

这里改成这样，发现是base64

35. 【难度：★★】
    请分析检材2-Vcoin.E01，当前系统中，用户身份（Role）为“系统后台管理员”的人员有几个
    【参考格式：1】

    ![](../../henan/media/image57.png)

    ![](../../henan/media/image58.png)

36. 【难度：★★★★】
    请分析检材2-Vcoin.E01并重构好网站，默认状态下，”用户管理“页面共有多少页保存了用户信息？
    【参考格式：100】

    ![](../../henan/media/image59.png)

    要重构网站了,前面几道题目找到登录验证方式，把相应邮箱验证、密码验证代码注释掉，改掉用户
    roleid，之后，可以直接无密码登录

    ![](../../henan/media/image60.png)

    ![](../../henan/media/image61.png)

    ![](../../henan/media/image62.png)

    这两个网站是要访问的

    ![](../../henan/media/image63.png)

    这里也要启动

    ![](../../henan/media/image64.png)

    想用navicat远程连接这个

    需要开几个地方

    ![](../../henan/media/image65.png)

    ![](../../henan/media/image66.png)

    发现这个验证方式是只有windows身份认证

    ![](../../henan/media/image67.png)

    换了个低版本的，然后用sa hl@7001就正常连接上了

    下面开始仔细说明怎么进行网站重构：：：：：

    登录流程只需要看 UserController 和 UserService

    后台登录实际包含两层验证：

    VerifyPassword(email, password)：邮箱作为账号，校验密码。

    VerifyMobileCode(..., code, ...)：校验手机短信验证码。

<!-- -->

1.  注释掉邮箱验证 修改 UserService.Login

    编辑方法，然后注释掉这四行

    ![](../../henan/media/image68.png)

2.  注释掉短信验证

    ![](../../henan/media/image69.png)

3.  而且也要注释掉密码验证

    ![](../../henan/media/image70.png)![](../../henan/media/image71.png)

    这里很明显sha256是很难破解的

    ![](../../henan/media/image72.png)

    其实就改了这个Exchange.AdminApplication.dll，保存一下，重新导入（还是用的U盘）

    ![](../../henan/media/image73.png)

    这里要注意，本来的文件要删除掉，不然加载不了

    这里也要改掉，//不管密码是否正确，直接返回用户

    ![](../../henan/media/image74.png)![](../../henan/media/image75.png)

    再替换掉这个模块 Exchange.Infrastructure.Repositories.dll

    这样就以邮箱为主，改掉

    ![](../../henan/media/image76.png)

    找到这个userid，再去查对应的邮箱

    ![](../../henan/media/image77.png)

    确认了一下id是一样的

    ![](../../henan/media/image78.png)

    发现是无权限*zgf18902339739@163.com*

    再换一个userid的role是1的

    ![](../../henan/media/image79.png)

    发现是跳转到这个无权限页面了

    排查了一下问题是userinroles.userid=user.id

    *wujx0104@gmail.com*

    查到这个账号就可以进来了

    然后就可以猛猛做题了

    后续题目需要将RoleId为1的一名角色的userid改为
    1，可以用管理员登录进入系统

    ![](../../henan/media/image80.png)

    其实并没有，这里需要继续，是数据库并没有连接上的原因

    ![](../../henan/media/image81.png)

    我绷不住了

    这里选择加载100条数据

    竟然数据就显示出来了

    ![](../../henan/media/image82.png)

<!-- -->

35. 【难度：★★】 请分析检材2-Vcoin.E01搭建的网站，有多少用户处于冻结状态
    【参考格式：1】

    ![](../../henan/media/image83.png)

    ![](../../henan/media/image84.png)

36. 【难度：★★★】 该网站中所有用户成功充值ETH的笔数为 【参考格式：1】

    ![](../../henan/media/image85.png)

    ![](../../henan/media/image86.png)

37. 【难度：★★★】 邮箱为78673345@qq.com 的用户id是 【参考格式：1】

    ![](../../henan/media/image87.png)

    ![](../../henan/media/image88.png)

    ![](../../henan/media/image89.png)

38. 【难度：★★★】
    上题该用户是否有提现或充值某个虚拟货币？（如有回答：货币名称：如ETH，如没有回答：无）
    【参考格式：BTC】

    ![](../../henan/media/image90.png)

39. 【难度：★★★★★】 有多少 中国地区 的正常客户在该平台注册？
    【参考格式：1】

    ![](../../henan/media/image91.png)

40. 【难度：★】
    有多少虚拟币地址在该平台进行了提现与充值的操作，去重后统计数量为？
    【参考格式：1】

    ![](../../henan/media/image92.png)

41. 【难度：★★】 在该平台提现次数最多的提币地址为？
    【参考格式：abc123!@\#】

    ![](../../henan/media/image93.png)

    yobit-wallet-new

44 【难度：★★★★】 结合整体检材，推测嫌疑人在平台使用的账号email是多少？
【参考格式：*admin@admin.com】*

![](../../henan/media/image94.png)

test@idax.mn

45. 【难度：★★★★★】
    据了解，嫌疑人交代其盗币过程的链上查询记录集中保存在服务器中“下载目录”内的vc容器，但是容器秘钥记不住了，请综合分析，嫌疑人从交易所盗走的USDT最终流向了哪一个地址？
    【参考格式：abc123】

    ![](../../henan/media/image95.png)

    ![](../../henan/media/image96.png)

    cd1634ef55b13679e59bae595cc026417dc9010738ea0a20ae3b694b54fa82fa

    ![](../../henan/media/image97.png)

    加载出来是这样的

    ![](../../henan/media/image98.png)

46. 【难度：★★★★】 上题中的钱包地址，共计收到了多少USDT?
    【参考格式：123.123123】小数点后6位，见上，答案更精细9,478,388.589078
    USDT

47. 【难度：★★★★】
    通过链上查询记录中可知，嫌疑人盗取交易所所使用的USDT钱包，共计转出多少USDT？
    【参考格式：123.123123】小数点后6位

48. 【难度：★★★★】
    通过链上资金分析，嫌疑人可能有几个账户作为洗钱源头进行资金输出？

    就上面这三个

49 【难度：★】 分析检材4，该手机曾经连接过的手机热点密码是？
【参考格式：abc123】

![](../../henan/media/image99.png)

50. 【难度：★】 分析检材4，该手机登录的微信内部ID是？
    【参考格式：abc123】

    ![](../../henan/media/image100.png)

51. 【难度：★】 分析检材4，该手机登录的微信绑定的手机号是？
    【参考格式：13111111111】

    如上

52 【难度：★★】 "分析检材4，嫌疑人贩卖AI相关资源的拉新渠道为？

A:微信群

B:群发短信

C:群发邮件

D:论坛发帖"

![](../../henan/media/image101.png)

50. 【难度：★★】 分析检材4，与嫌疑人购买过AI资源的微信号为？
    【参考格式：abc123】

    ![](../../henan/media/image102.png)

51. 【难度：★★】 接上题，嫌疑人发送的AI资源压缩包md5值为？
    【参考格式：abc123】

    导出算一下

    ![](../../henan/media/image103.png)

52. 【难度：★★★】 分析嫌疑人制作的AI资源，使用的Model名称是？
    【参考格式：Abc123!@\#】

    ![](../../henan/media/image104.png)

53. 【难度：★】 分析嫌疑人制作的AI资源，AI聊天功能的访问地址是？
    【参考格式：127.0.0.1:80】

    ![](../../henan/media/image105.png)

54. 【难度：★★★】
    分析嫌疑人制作的AI资源，使用图生图生成方式生成的AI资源共有几张？
    【参考格式：10】

    比对一下发现有两张重复的

55. 【难度：★★】 分析检材4，该购买人购买AI资源与服务实际支付多少元钱？
    【参考格式：10.00】

    ![](../../henan/media/image106.png)![](../../henan/media/image107.png)

59 【难度：★】 分析检材5，源盘的SHA-1值为？ 不区分大小写

![](../../henan/media/image108.png)发现有BL锁

![](../../henan/media/image109.png)

60. 【难度：★】 分析检材5，该计算机的设备名称为 【参考格式：ABC-12AB】

    ![](../../henan/media/image110.png)

61. 【难度：★★】 分析检材5，BitLocker加密分区恢复密钥是？
    【参考格式：111111-111111】

    ![](../../henan/media/image111.png)

    171512-092851-665962-073238-392381-086064-343167-444466

62. 【难度：★★】 分析检材5，VeraCrypt加密容器文件名是？
    【参考格式：abc.txt】

    ![](../../henan/media/image112.png)

    感觉像是这个，识别出来也是这个

    ![](../../henan/media/image113.png)

63. 【难度：★★】 分析检材5，VeraCrypt加密容器的密码是？
    【参考格式：Abc123!@\#】

    ![](../../henan/media/image114.png)

    wa-biwu666@2024 wa-biwu666@2024

64. 【难度：★★★】
    请综合分析，嫌疑人保存当年作案使用的USDT钱包地址对应的私钥为
    【参考格式：Abc123】

    ![](../../henan/media/image115.png)

    需要密码，没有什么提示，直接爆破，得到密码240722

    ![](../../henan/media/image116.png)

    C9GXxVAAZZwsN8x6zihLUXBF7G7P86k2kZ4QTcnQqCrxdzYG96cA

65. 【难度：★★★】 请综合分析，嫌疑人盗币使用的最终USDT钱包的私钥为
    【参考格式：Abc123】

    如上，就是用的自己的

66 【难度：★★★】
据嫌疑人交代，他在检材5中保存了一份账单，其中记录的总金额为？
【参考格式：10】

![](../../henan/media/image117.png)![](../../henan/media/image118.png)很明显改个后缀

60. 【难度：★★★】
    据嫌疑人交代，他习惯把客户发给他制作AI资源的原图打上水印保存，找到所有的原图一共有多少张？
    【参考格式：10】

    ![](../../henan/media/image119.png)

    学到了啊

    ![](../../henan/media/image120.png)

    这里还有两张

61. 【难度：★★★】
    请分析检材5，计算机中名为“客户原图NO3”的照片的MD5值为？ 不区分大小写

    ![](../../henan/media/image121.png)

62. 【难度：★★★】 综合分析检材，嫌疑人在2024年6月份可能去过那个城市？
    【参考格式：上海市】

    直接看图片

    ![](../../henan/media/image122.png)

    这张的地点是在南京

63. 【难度：★★】 分析检材5，嫌疑人用于AI聊天服务的主程序文件名为？
    【参考格式：abc.txt】

    ![](../../henan/media/image123.png)

    Main.py

64. 【难度：★★】 分析检材5，嫌疑人用于AI聊天服务的接口KEY值是？
    【参考格式：Abc123!@\#】

    ![](../../henan/media/image124.png)

65. 【难度：★★】 分析检材5，嫌疑人用于AI聊天服务的接口域名是？
    【参考格式：*https://www.baidu.com/ab/】*

    ![](../../henan/media/image125.png)

66. 【难度：★★】
    分析检材5，AI聊天会保存用户的历史聊天记录，其历史记录文件名为？
    【参考格式：abc.txt】

    ![](../../henan/media/image126.png)

67. 【难度：★★】
    分析检材5，嫌疑人计算机中共配置了多少个不同的AI女友模板？
    【参考格式：10】

    ![](../../henan/media/image127.png)

    有这么些版本

68. 【难度：★★】
    分析检材5，检材中共有几个AI女友模板可能被使用过（被代码调用）？
    【参考格式：10】

    ![](../../henan/media/image128.png)

    直接搜AIgirlfriend，这些是使用过的

69. 【难度：★★】
    分析检材5，嫌疑人进行AI生图所用软件保存在名称为（）的文件夹内？
    【参考格式：Abc123!@\#】

    ![](../../henan/media/image129.png)

70. 【难度：★★】 分析检材5，嫌疑人有几个可用的Stable Diffusion模型？
    【参考格式：10】

    ![](../../henan/media/image130.png)

    ![](../../henan/media/image131.png)

    很明显，就这两个

71. 【难度：★★】 分析检材5，嫌疑人使用文生图形式生成了几张图片？
    【参考格式：10】

72. ![](../../henan/media/image132.png)

    ![](../../henan/media/image133.png)

    一共是32张

73. 【难度：★★★】
    分析检材5，嫌疑人发送给赵老五的AI资源中，图生图方式采用的Denoising
    strength（与原图的差异度）值为？ 【参考格式：1.11】

    直接winhex看

    ![](../../henan/media/image134.png)

    ![](../../henan/media/image135.png)

74. 【难度：★★★★】
    分析嫌疑人发给赵老五的AI资源，有几张图片生成时使用的负面提示词数量为16个？
    【参考格式：10】

    ![](../../henan/media/image136.png)


