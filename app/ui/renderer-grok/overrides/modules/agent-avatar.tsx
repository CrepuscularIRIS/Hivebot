// T88：bot 吉祥物换 0.78.1 原版引擎（程序动画，53 状态）。
// 来源: grok-bot_0.78.1 dist/renderer/assets/index.eager-common-DbK3Oi_r.js（p_ 工厂/i_ body/o_ appearance）
// 静态 import（vite 打包；NO_XVFB 实测挂载成功）——vendor 原件另经 stage-renderer 拷到
// out/renderer/vendor-078/（字节不改，闸门/独立验证用）。
// React 包装按 0.78.1 dT(GrokBotMark) 复写；状态映射按 JZe/hO/lO（index.eager-app-iGTgHP_Q.js）。
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { resolvePersonaColor, resolvePersonaShape } from "../../frontend/src/recovered/features/onboarding/signed-in/character";

// 引擎（T=工厂 p_，E=body 名映射 i_，D=appearance o_）——静态 import（vite 打包）
import { T as engineFactory, E as engineBody, D as engineAppearance } from "../../assets/vendor-078/index.eager-common-DbK3Oi_r.js";
type Engine = {
  attach: (e: { host: HTMLElement }) => () => void;
  setState: (s: string) => void;
  setPlaying: (p: boolean) => void;
};

export type AgentAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AgentAvatarKind = "agent" | "group" | "shared-room";
/** 引擎状态名（0.78.1 53 目录的 Lifecycle 子集 + blocked）。 */
export type PersonaState = string;

export interface AgentAvatarProps {
  readonly agentId: string;
  readonly name?: string;
  readonly dataUrl?: string | null;
  readonly shape?: string | null;
  readonly color?: string | null;
  readonly size?: AgentAvatarSize;
  readonly kind?: AgentAvatarKind;
  readonly memberIds?: readonly string[];
  readonly state?: PersonaState;
  readonly currentActivity?: unknown | null;
  readonly isRunning?: boolean;
  readonly isComposingMessage?: boolean;
  readonly awaitingUserResponse?: unknown | null;
  readonly isStatic?: boolean;
  readonly paused?: boolean;
  readonly isFollowingPointer?: boolean;
  readonly followTarget?: { x: number; y: number } | null;
  readonly emphasis?: boolean;
  readonly spinSignal?: number;
}

const SIZE_PX: Record<AgentAvatarSize, number> = { xs: 16, sm: 22, md: 28, lg: 36, xl: 72 };

// 0.78.1 JZe（动词→状态）逐字
const VERB_TO_STATE: Record<string, string> = {
  thinking: "thinking", searching: "searching", browsing: "reading", reading: "reading", connecting: "orbit",
  writing: "writing", coding: "coding", generating: "progress", "running-commands": "running", "on-its-computer": "computing",
  "on-your-computer": "controlling", working: "working", messaging: "sending", sending: "sending", waiting: "waiting",
};

// 0.78.1 lO 的工具→动词（锚点 index.eager-app @1058900 function lO(）：
// Task：target=computerUse→on-its-computer 否则 working；Await→waiting；
// Grep/Glob/CheckSubagent 无专门分支→default working；CallMcpTool→UZe(detail)（简化 working）
const TOOL_TO_VERB: Record<string, string> = {
  WebSearch: "searching", PlacesSearch: "searching", WeatherForecast: "searching", RestaurantSearch: "searching", FlightSearch: "searching", FlightDetails: "searching",
  WebFetch: "browsing",
  Read: "reading", BoxRead: "reading", Skill: "reading",
  Write: "writing", Edit: "writing",
  Bash: "running-commands", BoxShell: "running-commands",
  Task: "working", Await: "waiting", CheckSubagent: "working",
  GenerateImage: "generating",
  SendToAgent: "sending", UpdateAgent: "sending",
  CloudAgent: "coding",
};

function activityVerb(activity: unknown): string | null {
  if (typeof activity !== "object" || activity == null) return null;
  const value = activity as Record<string, unknown>;
  if (value.kind === "thinking") return "thinking";
  if (typeof value.verb === "string" && VERB_TO_STATE[value.verb] != null) return value.verb;
  if (typeof value.tool === "string") {
    const verb = TOOL_TO_VERB[value.tool];
    if (verb !== undefined) return verb;
    if (value.tool.startsWith("browser_")) return "browsing";
    return "working";
  }
  return null;
}

/** 0.78.1 hO 简化门（流式检测无信号面；结算 8s 保持未做——ponytail: 需回合结局信号，T88c）。 */
export function personaStateFromAgent(input: Pick<AgentAvatarProps, "awaitingUserResponse" | "currentActivity" | "isRunning" | "isComposingMessage">): PersonaState {
  if (input.awaitingUserResponse != null) return "blocked";
  const verb = activityVerb(input.currentActivity);
  if (verb !== null) return VERB_TO_STATE[verb] ?? "working";
  if (input.isComposingMessage === true) return "thinking";
  return input.isRunning === true ? "working" : "idle";
}

function avatarState(props: AgentAvatarProps): PersonaState {
  return props.state ?? personaStateFromAgent(props);
}

function avatarStyle(sizePx: number): CSSProperties {
  return { height: sizePx, width: sizePx };
}

/** 引擎 mark（0.78.1 dT 复写）：host 内挂 canvas；attach({host, canvas})——经理二轮探针实证：
 * 引擎只在带 canvas 时建图（p() 栅格化目标=c.canvas；无 canvas 永不建，attach({host}) 是 bug）。 */
function PersonaMark({ agentId, color, shape, size, sizePx, state, isStatic, paused, emphasis }: { agentId: string; color: string; shape: string; state: PersonaState; size?: AgentAvatarSize } & Pick<AgentAvatarProps, "isStatic" | "paused" | "emphasis"> & { sizePx: number }) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const isPlaying = !(paused === true || isStatic === true);
  useEffect(() => {
    const host = hostRef.current;
    if (host == null) return;
    try {
      const engine = (engineFactory as unknown as (o: Record<string, unknown>) => Engine)({
        id: `sand-agent-mark-source-${agentId}`,
        body: (engineBody as unknown as (s: string) => string)(shape),
        appearance: (engineAppearance as unknown as (ink: string) => unknown)(color),
        state,
        size: sizePx,
        fill: 0.6,
        isPlaying,
      });
      const detach = engine.attach({ host, canvas: canvasRef.current ?? document.createElement('canvas') });
      detachRef.current = detach;
      engineRef.current = engine;
    } catch (e) { host.setAttribute("data-t88-err", String(e).slice(0, 220)); }
    return () => { detachRef.current?.(); detachRef.current = null; engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 0.78.1 dT 同款：工厂只按身份建一次
  }, [agentId, shape, color, sizePx]);
  useEffect(() => { engineRef.current?.setState(state) }, [state]);
  useEffect(() => { engineRef.current?.setPlaying(isPlaying) }, [isPlaying]);
  return <span ref={hostRef} aria-hidden="true" className="sand-agent-avatar sand-grok-bot-mark" data-avatar-color={color} data-avatar-shape={shape} data-grok-state={state} data-size={typeof size === "string" ? size : undefined} data-emphasis={emphasis || undefined} style={{ ...avatarStyle(sizePx), display: "inline-block", position: "relative", filter: emphasis ? "drop-shadow(0 0 3px color-mix(in srgb, currentColor 32%, transparent))" : undefined }}><canvas ref={canvasRef} width={sizePx} height={sizePx} style={{ display: "block", height: "100%", width: "100%" }} /></span>;
}

function SharedRoomAvatar({ sizePx }: { sizePx: number }) {
  return <span aria-hidden="true" className="sand-agent-avatar sand-shared-room-avatar" data-avatar-kind="shared-room" style={avatarStyle(sizePx)}>
    <svg aria-hidden="true" style={{ fill: "none", height: "65%", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, width: "65%" }} viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2 2.1 3 4.8 3 8s-1 5.9-3 8c-2-2.1-3-4.8-3-8s1-5.9 3-8Z" /></svg>
  </span>;
}

function groupSlots(count: number, frame: number): Array<{ x: number; y: number; size: number }> {
  if (count <= 1) return [{ x: 0, y: 0, size: frame }];
  if (count === 2) { const size = frame * 2 / 3; return [{ x: 0, y: 0, size }, { x: frame - size, y: frame - size, size }]; }
  const size = frame * 5 / 9, offset = frame - size;
  return count === 3
    ? [{ x: offset / 2, y: 0, size }, { x: 0, y: offset, size }, { x: offset, y: offset, size }]
    : [{ x: 0, y: 0, size }, { x: offset, y: 0, size }, { x: 0, y: offset, size }, { x: offset, y: offset, size }];
}

function GroupAvatar({ agentId, memberIds, sizePx, state, isStatic, paused }: { agentId: string; memberIds: readonly string[]; state: PersonaState; isStatic?: boolean; paused?: boolean }) {
  const participants = memberIds.length === 0 ? [agentId] : memberIds;
  const visible = participants.slice(0, participants.length > 4 ? 3 : 4);
  const slots = groupSlots(Math.min(visible.length + (participants.length > 4 ? 1 : 0), 4), sizePx);
  return <span aria-hidden="true" className="sand-agent-avatar sand-group-avatar" data-avatar-kind="group" data-member-count={participants.length} style={avatarStyle(sizePx)}>
    {visible.slice(0, slots.length).map((memberId, index) => {
      const color = resolvePersonaColor(memberId);
      const shape = resolvePersonaShape(memberId);
      const slot = slots[index];
      return <span key={memberId} style={{ display: "block", height: slot.size, left: slot.x, overflow: "hidden", position: "absolute", top: slot.y, width: slot.size }}><PersonaMark agentId={memberId} color={color} isStatic={isStatic ?? true} paused={paused} shape={shape} sizePx={slot.size} state={state} /></span>;
    })}
    {participants.length > 4 ? <span style={{ background: "var(--cursor-bg-elevated)", border: "1px solid var(--cursor-stroke-secondary)", borderRadius: "var(--cursor-radius-full)", bottom: 0, color: "var(--cursor-text-primary)", display: "grid", fontSize: 9, lineHeight: 1, minHeight: 13, minWidth: 13, padding: "1px 3px", placeItems: "center", position: "absolute", right: 0 }}>+{participants.length - 3}</span> : null}
  </span>;
}

export function AgentAvatar(props: AgentAvatarProps) {
  const size = props.size ?? "md";
  const sizePx = SIZE_PX[size];
  const state = avatarState(props);
  const color = useMemo(() => resolvePersonaColor(props.agentId, props.color), [props.agentId, props.color]);
  const shape = useMemo(() => resolvePersonaShape(props.agentId, props.shape), [props.agentId, props.shape]);
  const dataUrl = typeof props.dataUrl === "string" && props.dataUrl.length > 0 ? props.dataUrl : null;
  const kind = props.kind ?? "agent";
  if (dataUrl != null) return <img alt="" aria-hidden="true" className="sand-agent-avatar" data-avatar-kind="photo" data-size={size} draggable={false} height={sizePx} src={dataUrl} style={avatarStyle(sizePx)} width={sizePx} />;
  if (kind === "shared-room") return <SharedRoomAvatar sizePx={sizePx} />;
  if (kind === "group") return <GroupAvatar agentId={props.agentId} memberIds={props.memberIds ?? []} paused={props.paused} sizePx={sizePx} state={state} />;
  return <PersonaMark agentId={props.agentId} color={color} emphasis={props.emphasis} followTarget={props.followTarget} isFollowingPointer={props.isFollowingPointer} isStatic={props.isStatic} paused={props.paused} shape={shape} size={size} sizePx={sizePx} spinSignal={props.spinSignal} state={state} />;
}
