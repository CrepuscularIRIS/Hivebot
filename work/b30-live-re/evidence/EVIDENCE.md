# B30 证据链（真机运行时，2026-11-18 12:0x 采集）

## 采集环境
- app: work/grok-1.1.0-re/gb0781/fs/opt/Grok Bot/grok-bot（0.78.1，signedIn:true——desktop-status.json）
- 拉起: DISPLAY=:0 setsid nohup ./grok-bot --no-sandbox --disable-gpu --remote-debugging-port=9223 '--remote-allow-origins=*'
- CDP: ws://127.0.0.1:9223（python websocket 直连 Runtime.evaluate/Page.captureScreenshot）

## 证据清单
| 文件 | 内容 |
|---|---|
| live-first-screen.png | 真机首屏全分辨率截图（2494x1048，登录态真实数据） |
| net-endpoints.json | CDP Network domain 抓取结果——**空**（RPC 不走 renderer 网络） |
| renderer-net.json | renderer fetch/XHR/WS monkey-patch 结果——**空**（同上） |
| storage.json | localStorage/IndexedDB——**空**（状态不在 renderer 存储） |
| feature-flags.txt | statsig bootstrap 4414 gates（全 hash 名无产品语义，仅存档） |

## 关键发现

### 1. 网络面：RPC 全在 main 进程
- renderer 无任何 HTTP/WS（CDP Network + monkey-patch 双证）
- 结论：**renderer↔main 走 IPC，main↔xAI 走 Node fetch**——契约面只能从静态 bundle 挤（已完成 B23–B29）或 main 进程侧抓（需注入，超出本轮）
- localStorage/IndexedDB 空：状态在 main 内存 + sand-client-persistence/*.blob

### 2. userData 磁盘面（契约名，非内容）
sand-client-persistence/*.blob（base32ish 名，95/115KB 大 blob=transcript 持久层）、box-secrets-push-state.v1.json、sand-statsig-bootstrap.json（4414 gates/2088 true，hash 名）、attachment-image-cache/、plugin-logo-cache/、link-preview-cache/、desktop-status.json{version,pid,appVersion,signedIn}、window-state.json、dune-reliability/sessions/*.running.json、sand-secrets.json（未读内容）

### 3. renderer 桥面（contextBridge 暴露）
window.sandPopout{agentId}、__duneReliability{report}、sandRenderTrace{postMessage}、__SENTRY__ 10.27.0、__anysphereUiTrustedTypesPolicy——**无 pbots 桥**（我方 shim 桥名，0.78.1 不同）；主通信面不暴露在 window（走 Electron ipcRenderer 直连）

### 4. 真实 bot 生态样本（侧栏实拍）
用户真机在跑的自动化 bot（能力面第一手证据）：
- **ComputerUse**：累计 264 条会话（computer use/电脑控制类 bot 的真实使用密度）
- **Design Atlas**：每日设计情报采集（今日收 7，常驻采集流）
- **Harness RSI**：arXiv 常态化采集（Nov 18 collect 13 items→inbox/*.jsonl，GitHub commit 链）
- **CUA**：CUA Radar 候选采集（arXiv version tracking）
- **VLA Harness**：EH Radar 候选采集（时间窗过滤）
→ 后端能力推测：**定时采集+inbox 落盘+GitHub 回写**是这些 bot 的共同骨架——与 dsh schedule（B26 已接）+ file 工具天然对齐

### 5. 主区内容形态
Labs+News/ComputerUse 等会话内容为 markdown 富文本（链接/emoji/分节），与 transcript 渲染链（B19 分页）已对齐；无特殊渲染需求浮出
