#!/usr/bin/env bash
# 生成 source.kind 生产者与 DS-Bot 主 bot 身份模型的原始证据（带行号），供审查与复核使用。
# 用法: bash collect_source_kind_evidence.sh <输出文件> [<DS-Bot 的 node_modules 根目录>]
# 默认根目录是 fresh-boot 所用 0.3.8 AppImage 的解包位置（临时目录，重跑 fresh-boot 后仍在）。
OUT="$1"
N="$2"
[ -n "$N" ] || N=/tmp/dsbot-trial/squashfs-root/resources/app/node_modules
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
[ -d "$N/ds-bot/src/host" ] || { echo "DS-Bot node_modules not found: $N" >&2; exit 1; }
ex() { awk -v from="$2" -v to="$3" 'NR>=from && NR<=to {print NR": "$0}' "$1"; }
H="$N/ds-bot/src/host"
{
  echo "# DS-Bot 0.3.8（fresh-boot 所用 AppImage 解包）里 user/message 的 source.kind 生产者与主 bot 身份模型"
  echo "# 根目录: $N"
  echo "# 摘录均为原样行（行号前缀）；生成脚本: work/retest-4b922fde/evidence/ui-ego/collect_source_kind_evidence.sh"
  echo
  echo "## 1. 引擎消息来源类型 MessageSourceMap（dsh-session-reference/lib/typert.host.js:461，单行声明，截 1500 字符）"
  sed -n '461p' "$N/@deepseek-ai/dsh-session-reference/lib/typert.host.js" | cut -c1-1500
  echo
  echo "## 2. dsh-schedule：定时提醒以 source.kind = schedule 投递"
  echo "### lib/index.js 1381-1392（send → agent.followup，开新一轮）"
  ex "$N/@deepseek-ai/dsh-schedule/lib/index.js" 1381 1392
  echo "### lib/index.js 2553-2561（inject，不开新一轮）"
  ex "$N/@deepseek-ai/dsh-schedule/lib/index.js" 2553 2561
  echo
  echo "## 3. DS-Bot IM 入站：kind 仍是 user，rpcId 以 im: 开头（ds-bot/src/host/im/index.js）"
  ex "$H/im/index.js" 1444 1456
  echo
  echo "## 4. DS-Bot 手机联通：走同一个 bot API（ds-bot/src/host/phone.js:96）"
  ex "$H/phone.js" 96 96
  echo
  echo "## 5. DS-Bot 频道投递：source 来自请求方（ds-bot/src/host/channel.js）"
  ex "$H/channel.js" 686 686
  ex "$H/channel.js" 815 815
  ex "$H/channel.js" 934 934
  echo
  echo "## 6. DS-Bot 的 bot 转播、问题回答与快照类来源（不是新的用户请求）"
  ex "$H/groups.js" 1723 1723
  ex "$H/groups.js" 1964 1964
  ex "$H/parts.js" 76 76
  ex "$H/memory.js" 919 919
  ex "$H/time-context.js" 42 42
  echo
  echo "## 7. 主 bot 身份模型（ds-bot/src/host/store.js，共 $(wc -l < "$H/store.js") 行）"
  echo "### :28 与 :479-508"
  ex "$H/store.js" 28 28
  ex "$H/store.js" 479 508
  echo "### :545-560（own chat 的归属：current + segments + openParts）"
  ex "$H/store.js" 545 560
  echo "### :671-678（sessionsOf）"
  ex "$H/store.js" 671 678
  echo
  echo "## 8. 插件侧守卫的最终形态（app/superagent/src/sources/local.ts）"
  ex "$ROOT/app/superagent/src/sources/local.ts" 13 24
  echo
  echo "## 9. 运行时实测（会话文件）"
  echo "- UI 输入与 /api/bot send 的真人消息: source = {kind:\"user\", rpcId:<uuid>}"
  echo "- 引擎与 DS-Bot 的注入: runtime-context / skill-catalog / time-context / bot(form relay) / dsh-superagent（本插件卡片）"
  echo "- 守卫放行 user 与 schedule；user-question-reply（ask_user_question 的回答）属于进行中的那一轮，不计新 trigger；webhook 通知不计。"
} > "$OUT"
wc -l "$OUT"
