# B29：voice-memo / team-bot-line-render / Calendar 壳评估

**日期**：2026-11-18
**结论**：三项全部 **不接**（无 DSH 后端可接），评估收档无施工。

## 一、voice-memo（chunk-voice-memo-bubble-O-la4bTx.js，20KB）

0.78.1 形态=**TTS 播放气泡**：
- karaoke 逐词高亮（`data-karaoke-token`=past/current/future，`_({text,positionMs,durationMs,measuredMs,charTimesMs})` 二分定位当前词）
- 点击词 seek（`a(j({text,offset,durationMs,...}))`，aria M9a/vQ='Jump to this word in the voice memo'）
- 变速（ha5Bzw='Playback speed'）、暂停/播放（RH7WEB/0zvfOc）、preparing 态（YPa5jn）
- transcript 折叠（9uXmKJ='Hide transcript'/iko5Ih='Show transcript'）；部分播放提示（QdUZjx='Only the first part plays aloud. Show the transcript for the rest.'）
- **entitlement 付费墙**：41Sc6H='Playing voice memos needs Cursor Pro'，status='not_entitled'
- playback 状态机：idle/preparing/playing/paused/not_entitled；数据依赖 segmentDurationsMs+charTimesMs（云端 TTS 时间轴产物）

**判定：不接**。DSH 无 TTS 后端、无 entitlement；charTimesMs 时间轴数据无处产生。我方 dictation.ts（Web Speech STT）是输入侧，与此输出侧无关。

## 二、team-bot-line-render（639KB 渲染库）

B23 已定性：team-bot 专属富文本行渲染（团队 bot 消息卡/引用/@提及渲染管线），服务于云端 team bot 消息流。数据源=getServerAgentRoster+团队消息协议，全云端。

**判定：不接**（同 B25 C 域定案：团队 bot=云端 deferred，渲染库无独立价值）。

## 三、Calendar 壳

B25 已查：无独立 chunk、无 RPC 契约（B23 七域扫描 F 域结论「Calendar 无 chunk 无 RPC」）。0.78.1 的日历视图不存在或内联极小。

**判定：不接**（无规格可复刻——原版即没有独立面）。

## 不做清单汇总

- voice-memo：不做伪造播放引擎（自建非复刻）
- team-bot-line-render：随团队 bot 整体 deferred
- Calendar：无源面，无事可做
