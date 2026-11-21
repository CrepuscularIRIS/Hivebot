# 手机联通回归脚本

协议级假手机（与 RN mobile app 走同一 link/ 库链路），三模式：

```sh
# 1. 本地 relay（/tmp/dsbot-src/link 仓）
PORT=8791 DSBOT_LINK_DATA=/tmp/link-relay-data/devices.json npm run server

# 2. 配对（主机 phone-pair 开码后）
node --experimental-strip-types fake-phone.mjs pair "dsbot://pair?..."

# 3. 重连+发消息+读回复（身份持久化在 phone-identity.json，免再配对）
node --experimental-strip-types fake-phone.mjs send <hostKey> <hostDeviceId> [server]
```

依赖：/tmp/dsbot-src clone（Fei2411/DS-Bot）；node 22+。
APK 真机路径见 work/integration-rebuild/（arm64 emulator 基座）。
