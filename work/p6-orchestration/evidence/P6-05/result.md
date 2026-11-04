# P6-05 探针运行记录（probe.mjs）

## 红（改动前，worktree = main @ 6abbbc0）
```
$ node work/p6-orchestration/evidence/P6-05/probe.mjs
FAIL: approval.yml standard persona prefix != p6-reply 定稿（前 60 字符："You are a coding agent powered by the {{model}} model."）
[p6-05] 静态：1 项不过
exit=1
```

## 绿（改动后）
```
$ node work/p6-orchestration/evidence/P6-05/probe.mjs
[p6-05] 静态：PASS
[sdk] [p2sdk] ready http://127.0.0.1:39141
[p6-05] 默认会话 session-3065f223-3be4-48a2-94df-8f6e9aab87a6 preset=standard llm 记录 1 条，系统提示 6148 字符
[p6-05] 动态：PASS
probe PASS
exit=0
```

静态 PASS = approval.yml preset-standard persona prefix 与 p6-reply-style.yml 的
p6-reply prefix 逐字节一致，段落 sha256 = D3 run-meta.json 的 presetSectionSha256
（c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356）。
动态 PASS = spawn scripts/start.mjs（P2SDK_PROVIDER=mock，P2SDK_PATCH 只挂 recorder、
不挂 p6-reply-style.yml）默认链建会话（session/create 无 agentPreset），
header.agentPreset=standard，llm/stream 记录的 systemTexts 含段落全文。
运行时布局 /tmp/bot-p6-05 用后即删，无残留子进程。
