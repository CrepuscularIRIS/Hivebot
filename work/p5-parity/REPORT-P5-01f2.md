# REPORT P5-01.f2 —— 文件根遮蔽跨启动 rc 漂移钉死

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-01f2 @ 71b91be（基 8e857ce）。改动：bwrap-wrap.py（文件根遮蔽原语替换）、三个 e2e 测试收紧、evidence/P5-01/f2-boot-probe.txt。

## 根因（钉死）
rc=1 端机制证明：bwrap 0.9.0 bind-mount.c 对一切非 BIND_DEVICES 用户 bind 无条件强制 MS_NODEV；内核 may_open 对 nodev 挂载上的字符设备 open 返回 EACCES——与 boot 态无关。rc=0 端无 artifact，只能来自无 nodev 的环境（老版本/--dev-bind/普通文件源）——「漂移」真身=bwrap 版本敏感，两端内容恒空（旧实现泄漏面为零）。argv 截断与参数顺序已排除。

## 修复
文件根遮蔽：--ro-bind /dev/null → **--perms 0644 --ro-bind-data <fd>**（宿主读 /dev/null 得 0 字节）。遮蔽节点变空普通文件，open 只走 DAC——MNT_NODEV/设备 cgroup/LSM 均不参与，机制上 boot/版本无关（--ro-bind-data 自 bwrap 0.5.0 存在）。目录根 --tmpfs 不变。

## 测试
红：f2 新测试对旧 wrapper（rc=1/type_f=1 字符设备签名）；绿：wrapper 10/10、hardened+matrix 19/19、**sdk 全量 31 files/249 绿**。不变量：cat rc=0 且空、test -f=0（普通文件）、test -s=1、宿主不变、test -e 语义同旧；matrix cat_ppp 收紧为 /^0:empty$/。
