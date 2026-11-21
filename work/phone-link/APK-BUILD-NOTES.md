# DS-Bot Android APK 本地构建记录（2026-11-21）

## 结论
- 官方 release APK（v0.3.9）只带 arm64/armeabi-v7a，x86_64 emulator 上 libreactnative.so DSO 加载必崩
- Google 官方 emulator 不支持 x86_64 宿主跑 arm 镜像（QEMU2 硬限制，FATAL at boot）
- 唯一正路=mobile/ 源码本地构建 x86_64 APK

## 构建配方（全 npmmirror/清华镜像，无 sudo）
1. JDK17（Adoptium GitHub 直连可达）：/tmp/jdk（javac 必须有——系统 java21 是 JRE）
2. mobile/ 仓 npm ci（registry.npmmirror.com）+ npx expo prebuild -p android --no-install
3. gradle 镜像：~/.gradle/init.d/mirror.gradle（aliyun google/public/gradle-plugin 三仓）
4. app/build.gradle defaultConfig 注入 ndk { abiFilters "x86_64" }
5. JAVA_HOME=/tmp/jdk ./gradlew assembleRelease --no-daemon（首次 ~26 分钟，自动装 NDK 27.1 2GB+Platform 36）

## 已知坑
- worklets/reanimated/expo-modules 等 AAR 的 x86_64 so 即使 abiFilters 也不进 APK（prebuilt 打包层 ABI 过滤 bug）——解法=构建后重打包补 so：
  - unzip APK；扫全部 node_modules/*/android/build/outputs/aar/*-release.aar 的 jni/x86_64/*.so 补进 lib/x86_64/
  - zip 重打包：**so 和 resources.arsc 必须 -0 store 模式**（R+ 要求 arsc 不压缩对齐；native lib legacy packaging=false 要求 so store）
  - zipalign -f -p 4 + apksigner debug 签名
- headless emulator 上 app 退后台即被 cached freezer 处决：adb root + settings put global cached_apps_freezer disabled（每次 emulator 重启要重做）
- 产物：/tmp/apk-repack/final4.apk（86MB，全 x86_64 so 齐，安装过且无 DSO 崩溃）

## 遗留
- 真 UI 配对未完成：app 在无屏 emulator 存活窗口短（配对深链已能送达 RN 层），下一轮建议带屏 emulator（-no-window 去掉）+ scrcpy/CDP 观测
- emulator-5554 每次重启都要：adb root → freezer disabled
