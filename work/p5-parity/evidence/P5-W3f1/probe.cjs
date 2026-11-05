// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer/fold/turn-fold.ts
var EMPTY_RESULT_NOTICE = "\u5DF2\u5B8C\u6210\uFF0C\u6CA1\u6709\u6587\u5B57\u7ED3\u679C \xB7 \u5C55\u5F00\u67E5\u770B\u8FC7\u7A0B";
var turnOf = (id) => {
  const m = /^t(\d+)-/.exec(id);
  return m === null ? null : Number(m[1]);
};
function segment(items, hasMore) {
  const segs = [];
  let cur = null;
  const open = (byUser) => {
    cur = { items: [], turn: null, byUser, fragment: false };
    segs.push(cur);
    return cur;
  };
  for (const item of items) {
    if (item.kind === "user") {
      open(true).items.push(item);
      continue;
    }
    if (cur === null) open(false);
    if (item.kind === "assistant" || item.kind === "thinking") {
      const t = turnOf(item.id);
      if (t !== null && cur.turn !== null && t !== cur.turn) open(false);
      if (t !== null && cur.turn === null) cur.turn = t;
    }
    cur.items.push(item);
  }
  if (segs.length > 0) segs[0].fragment = hasMore && !segs[0].byUser;
  return segs;
}
var atOf = (item) => item.at === void 0 ? {} : { at: item.at };
function foldTurns(items, input) {
  const segs = segment(items, input.hasMore);
  const entries = [];
  segs.forEach((seg, si) => {
    const endN = seg.items.find((i) => i.kind === "notice" && /^end-\d+$/.test(i.id));
    const state = endN !== void 0 ? endN.tone === "danger" ? "error" : "stopped" : si === segs.length - 1 && input.running ? "running" : "completed";
    const firstTool = seg.items.findIndex((i) => i.kind === "tool");
    const lastTool = seg.items.reduce((acc, i, idx) => i.kind === "tool" ? idx : acc, -1);
    const textIdx = seg.items.map((item, idx) => item.kind === "assistant" ? idx : -1).filter((idx) => idx >= 0);
    const hasTail = lastTool >= 0 && textIdx.some((idx) => idx > lastTool);
    const mids = lastTool >= 0 ? textIdx.filter((idx) => idx > firstTool && idx < lastTool) : [];
    const promoteMid = !seg.fragment && state === "completed" && lastTool >= 0 && !hasTail && mids.length > 0 ? mids[mids.length - 1] : -1;
    const emptyNotice = !seg.fragment && state === "completed" && lastTool >= 0 && !hasTail && mids.length === 0 && textIdx.length === 0;
    seg.items.forEach((item, idx) => {
      switch (item.kind) {
        case "user":
          entries.push({ kind: "user", id: item.id, text: item.text, ...atOf(item) });
          break;
        case "tool":
          entries.push({ kind: "tool-call", id: item.id, callId: item.callId, name: item.name, args: item.args, status: item.status, result: item.result, awaiting: item.awaiting, decision: item.decision, ...atOf(item) });
          break;
        case "thinking":
          entries.push({ kind: "thinking", id: item.id, text: item.text, from: "reasoning", ...atOf(item) });
          break;
        case "notice":
          entries.push({ kind: "notice", id: item.id, tone: item.tone, text: item.text, source: "reduce", ...atOf(item) });
          break;
        case "assistant": {
          if (idx === promoteMid) {
            entries.push({ kind: "message", id: item.id, text: item.text, role: "result", ...atOf(item) });
            break;
          }
          if (seg.fragment) {
            entries.push({ kind: "thinking", id: item.id, text: item.text, from: "text", ...atOf(item) });
            break;
          }
          if (firstTool < 0 || idx < firstTool) {
            entries.push({ kind: "message", id: item.id, text: item.text, role: "ack", ...atOf(item) });
            break;
          }
          if (idx > lastTool && state === "completed") {
            entries.push({ kind: "message", id: item.id, text: item.text, role: "result", ...atOf(item) });
            break;
          }
          entries.push({ kind: "thinking", id: item.id, text: item.text, from: "text", ...atOf(item) });
          break;
        }
      }
    });
    if (emptyNotice) entries.push({ kind: "notice", id: `fold-empty-${seg.turn ?? `seg${si}`}`, tone: "muted", text: EMPTY_RESULT_NOTICE, source: "fold" });
  });
  const last = segs[segs.length - 1];
  const streamingAs = last === void 0 || !last.fragment && !last.items.some((i) => i.kind === "tool") ? "message" : "thinking";
  return { entries, streamingAs };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/shim/src/entries.ts
var ts = (at) => at ?? Date.now();
function argText(args) {
  try {
    const parsed = JSON.parse(args);
    for (const key of ["command", "path", "file_path", "query", "url"]) {
      const v = parsed[key];
      if (typeof v === "string" && v !== "") return v;
    }
  } catch {
  }
  return null;
}
function toolSummary(name, args, result) {
  const text = argText(args);
  if (text !== null) return text.slice(0, 120);
  if (result !== null && result !== "") return result.replace(/\s+/g, " ").slice(0, 120);
  return args === "" ? name : args.slice(0, 120);
}
function serialize(input) {
  const out = foldTurns(input.items, { hasMore: input.hasMore, running: input.running });
  const raw2 = toRawEntries(out, input.agentName, input.streaming, input.clientNonce === void 0 ? void 0 : { clientNonce: input.clientNonce, prompt: input.clientPrompt });
  if (input.streaming !== null && input.streaming.reasoning !== "" && input.streaming.text === "") {
    raw2.push({ id: "live-reasoning", kind: "thinking", text: input.streaming.reasoning, timestampMs: Date.now() });
  }
  return raw2;
}
function toRawEntries(out, agentName, streaming, nonce) {
  const raw2 = [];
  const nonceEntryId = nonce === void 0 ? null : out.entries.filter((e) => e.kind === "user" && (nonce.prompt === void 0 || e.text === nonce.prompt)).at(-1)?.id ?? null;
  for (const e of out.entries) {
    const at = e.at;
    switch (e.kind) {
      case "user": {
        const entry = { kind: "message", id: e.id, timestampMs: ts(at), role: "user", author: "You", content: e.text };
        if (nonce !== void 0 && e.id === nonceEntryId) entry.clientNonce = nonce.clientNonce;
        raw2.push(entry);
        break;
      }
      case "message":
        raw2.push({ kind: "message", id: e.id, timestampMs: ts(at), role: "assistant", author: agentName, content: e.text });
        break;
      case "thinking":
        raw2.push({ kind: "thinking", id: e.id, timestampMs: ts(at), text: e.text });
        break;
      case "tool-call":
        raw2.push({
          kind: "tool-call",
          id: e.id,
          timestampMs: ts(at),
          name: e.name,
          status: e.status,
          summary: toolSummary(e.name, e.args, e.result),
          args: e.args,
          result: e.result,
          decision: e.decision
        });
        break;
      case "notice":
        raw2.push({ kind: "notice", id: e.id, timestampMs: ts(at), content: e.text });
        break;
    }
  }
  if (streaming !== null && streaming.text !== "") {
    raw2.push(out.streamingAs === "thinking" ? { kind: "thinking", id: "live-stream", timestampMs: Date.now(), text: streaming.text } : { kind: "message", id: "live-stream", timestampMs: Date.now(), role: "assistant", author: agentName, content: streaming.text, isStreaming: true });
  }
  return raw2;
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/transcript-card/reaction-actions.ts
var SAND_REACTION_SELF = "me";
function projectTranscriptReactions(value) {
  if (!Array.isArray(value)) return { reactions: [], myReactions: /* @__PURE__ */ new Set() };
  const reactions = [];
  const myReactions = /* @__PURE__ */ new Set();
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate == null || Array.isArray(candidate)) continue;
    const reaction = candidate;
    if (typeof reaction.emoji !== "string" || reaction.emoji.length === 0 || typeof reaction.by !== "string" || reaction.by.length === 0) continue;
    const projected = { emoji: reaction.emoji, by: reaction.by };
    reactions.push(projected);
    if (reaction.by === SAND_REACTION_SELF) myReactions.add(reaction.emoji);
  }
  return { reactions, myReactions };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/transcript-card/url-card.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeLinkUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0 ? parsed.toString() : null;
  } catch {
    return null;
  }
}
function richTextBareLink(value) {
  let document;
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed) || parsed.type !== "doc" || !Array.isArray(parsed.content)) return null;
    document = parsed;
  } catch {
    return null;
  }
  const paragraphs = document.content?.filter((node2) => node2.type === "paragraph") ?? [];
  if (paragraphs.length !== 1) return null;
  const content = paragraphs[0]?.content?.filter((node2) => node2.type !== "text" || typeof node2.text !== "string" || node2.text.trim().length > 0) ?? [];
  if (content.length !== 1) return null;
  const node = content[0];
  if (node?.type !== "text" || typeof node.text !== "string" || node.marks?.some((mark) => mark.type === "code") === true) return null;
  const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
  return normalizeLinkUrl(typeof href === "string" ? href : node.text);
}
function extractBareLink(content, richText) {
  const rich = richText == null ? null : richTextBareLink(richText);
  if (rich != null) return rich;
  const trimmed = content.trim();
  const markdown = /^\[[^\]\n]*\]\(\s*([^\)\s]+)(?:\s+[^)]*)?\)\s*$/.exec(trimmed);
  return normalizeLinkUrl(markdown?.[1] ?? trimmed);
}
function extractSendMessageTextLink(entry) {
  if (!isRecord(entry) || entry.kind !== "send-message" || entry.streaming === true || !isRecord(entry.message) || entry.message.type !== "text" || typeof entry.message.content !== "string") return null;
  if (Array.isArray(entry.message.images) && entry.message.images.length > 0) return null;
  return extractBareLink(entry.message.content);
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/transcript-card/send-message-text.ts
var SEND_MESSAGE_TEXT_KIND = "send-message";
var SEND_MESSAGE_TEXT_TYPE = "text";
var SEND_MESSAGE_TEXT_URL_UNAVAILABLE = "url-card";
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function projectImages(value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) return null;
  const images = [];
  for (const image of value) {
    if (!isRecord2(image) || !nonEmptyString(image.url) || image.alt !== void 0 && typeof image.alt !== "string") return null;
    images.push({ ...image, url: image.url });
  }
  return images;
}
function projectAdjacency(value) {
  return value == null ? {} : { ...value };
}
function projectSendMessageText(value, adjacency) {
  if (!isRecord2(value) || value.kind !== SEND_MESSAGE_TEXT_KIND || !nonEmptyString(value.id)) return { kind: "invalid", reason: "entry" };
  if (!isRecord2(value.message) || value.message.type !== SEND_MESSAGE_TEXT_TYPE || typeof value.message.content !== "string") return { kind: "invalid", reason: "message" };
  if (value.streaming !== void 0 && typeof value.streaming !== "boolean") return { kind: "invalid", reason: "streaming" };
  if (value.timestampMs !== void 0 && !finiteNumber(value.timestampMs)) return { kind: "invalid", reason: "timestamp" };
  if (value.message.channel !== void 0 && value.message.channel !== null && typeof value.message.channel !== "string") return { kind: "invalid", reason: "channel" };
  const images = projectImages(value.message.images);
  if (images === null) return { kind: "invalid", reason: "images" };
  const projected = {
    kind: SEND_MESSAGE_TEXT_KIND,
    id: value.id,
    message: {
      type: SEND_MESSAGE_TEXT_TYPE,
      content: value.message.content,
      ...images === void 0 ? {} : { images },
      ...value.message.channel === void 0 ? {} : { channel: value.message.channel }
    },
    streaming: value.streaming === true,
    ...value.timestampMs === void 0 ? {} : { timestampMs: value.timestampMs },
    adjacency: projectAdjacency(adjacency),
    isSourceTrusted: true,
    presentation: { kind: "text" }
  };
  const url = classifySendMessageTextUrl(value);
  return url == null ? projected : { ...projected, presentation: { kind: "url-card", url, whenUnavailable: SEND_MESSAGE_TEXT_URL_UNAVAILABLE } };
}
function classifySendMessageTextUrl(value) {
  return extractSendMessageTextLink(value);
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/transcript-card/protocol.ts
var TRANSCRIPT_CARD_ENTRY_KIND = "send-message";
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyString2(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function optionalString(value) {
  return value === void 0 ? void 0 : typeof value === "string" ? value : void 0;
}
function optionalBoolean(value) {
  return value === void 0 ? void 0 : typeof value === "boolean" ? value : void 0;
}
function stringArray(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value;
}
function projectWidget(value) {
  if (!isRecord3(value.widget)) return null;
  const widget = value.widget;
  if (!nonEmptyString2(widget.prompt) || !Array.isArray(widget.options) || widget.options.length < 1 || widget.options.length > 6) return null;
  const options = [];
  for (const optionValue of widget.options) {
    if (!isRecord3(optionValue) || !nonEmptyString2(optionValue.label)) return null;
    const style = optionValue.style;
    if (style !== void 0 && style !== "default" && style !== "primary" && style !== "danger") return null;
    options.push({
      label: optionValue.label,
      ...optionalString(optionValue.value) == null ? {} : { value: optionalString(optionValue.value) },
      ...optionalString(optionValue.description) == null ? {} : { description: optionalString(optionValue.description) },
      ...style === void 0 ? {} : { style }
    });
  }
  return {
    type: "widget",
    widget: {
      prompt: widget.prompt,
      ...optionalString(widget.helpText) == null ? {} : { helpText: optionalString(widget.helpText) },
      options,
      ...optionalBoolean(widget.allowCustom) === void 0 ? {} : { allowCustom: optionalBoolean(widget.allowCustom) },
      ...optionalBoolean(widget.dismissOnMoveOn) === void 0 ? {} : { dismissOnMoveOn: optionalBoolean(widget.dismissOnMoveOn) }
    }
  };
}
function projectCursorAgent(value) {
  if (!nonEmptyString2(value.bcId)) return null;
  return { type: "cursor-agent", bcId: value.bcId, ...optionalString(value.title) == null ? {} : { title: optionalString(value.title) } };
}
function projectEmailDraft(value) {
  if (!isRecord3(value.draft)) return null;
  const draft = value.draft;
  const to = stringArray(draft.to);
  if (to == null || typeof draft.subject !== "string" || typeof draft.body !== "string") return null;
  const ccValue = draft.cc;
  const cc = ccValue === void 0 ? void 0 : stringArray(ccValue);
  if (ccValue !== void 0 && cc == null) return null;
  const projectedCc = cc ?? void 0;
  const fromValue = draft.from;
  if (fromValue !== void 0 && typeof fromValue !== "string") return null;
  if (draft.from !== void 0 && typeof draft.from !== "string") return null;
  return {
    type: "email-draft",
    draft: {
      ...fromValue === void 0 ? {} : { from: fromValue },
      to,
      ...projectedCc === void 0 ? {} : { cc: projectedCc },
      subject: draft.subject,
      body: draft.body
    }
  };
}
function projectSlackDraft(value) {
  if (!isRecord3(value.draft)) return null;
  const draft = value.draft;
  const targetValue = draft.target;
  const bodyValue = draft.body;
  if (!nonEmptyString2(targetValue) || typeof bodyValue !== "string") return null;
  if (draft.workspace !== void 0 && typeof draft.workspace !== "string") return null;
  if (draft.thread !== void 0 && typeof draft.thread !== "string") return null;
  return {
    type: "slack-draft",
    draft: {
      ...draft.workspace === void 0 ? {} : { workspace: draft.workspace },
      target: targetValue,
      ...draft.thread === void 0 ? {} : { thread: draft.thread },
      body: bodyValue
    }
  };
}
function projectAutoReviewApproval(value) {
  if (!isRecord3(value.approval)) return null;
  const approval = value.approval;
  if (!nonEmptyString2(approval.requestId) || typeof approval.summary !== "string") return null;
  if (approval.status !== "pending" && approval.status !== "approved" && approval.status !== "always" && approval.status !== "denied" && approval.status !== "expired") return null;
  if (approval.surface !== void 0 && typeof approval.surface !== "string") return null;
  if (approval.reason !== void 0 && typeof approval.reason !== "string") return null;
  if (approval.command !== void 0 && typeof approval.command !== "string") return null;
  if (approval.proposedRule !== void 0 && typeof approval.proposedRule !== "string") return null;
  return {
    type: "auto-review-approval",
    approval: {
      requestId: approval.requestId,
      status: approval.status,
      surface: typeof approval.surface === "string" ? approval.surface : "unknown",
      summary: approval.summary,
      ...approval.reason === void 0 ? {} : { reason: approval.reason },
      ...approval.command === void 0 ? {} : { command: approval.command },
      ...approval.proposedRule === void 0 ? {} : { proposedRule: approval.proposedRule }
    }
  };
}
function projectListenerConnect(value) {
  if (value.platform !== "github" && value.platform !== "slack") return null;
  if (value.reason !== void 0 && typeof value.reason !== "string") return null;
  return {
    type: "listener-connect",
    platform: value.platform,
    ...value.reason === void 0 ? {} : { reason: value.reason }
  };
}
function projectSecretRequest(value) {
  if (!isRecord3(value.secretRequest) || !nonEmptyString2(value.secretRequest.label)) return null;
  if (value.secretRequest.description !== void 0 && typeof value.secretRequest.description !== "string") return null;
  return {
    type: "secret-request",
    secretRequest: {
      label: value.secretRequest.label,
      ...value.secretRequest.description === void 0 ? {} : { description: value.secretRequest.description }
    }
  };
}
function projectAttachment(value) {
  if (!nonEmptyString2(value.url)) return null;
  if (value.alt !== void 0 && typeof value.alt !== "string") return null;
  return { type: "attachment", url: value.url, ...value.alt === void 0 ? {} : { alt: value.alt } };
}
function projectConnectors(value) {
  if (!Array.isArray(value.connectors) || value.connectors.some((connector) => typeof connector !== "string")) return null;
  return { type: "connectors", connectors: value.connectors };
}
function projectLocalToolPermission(value) {
  if (!isRecord3(value.ask) || !nonEmptyString2(value.ask.requestId)) return null;
  const status = value.ask.status;
  if (status !== "pending" && status !== "always" && status !== "never" && status !== "denied" && status !== "expired" && status !== "allow-once") return null;
  return {
    type: "local-tool-permission",
    ask: {
      requestId: value.ask.requestId,
      status,
      action: value.ask.action,
      target: value.ask.target
    }
  };
}
function projectConnector(value) {
  if (!nonEmptyString2(value.connector)) return null;
  if (value.reason !== void 0 && typeof value.reason !== "string") return null;
  if (value.serverId !== void 0 && typeof value.serverId !== "string") return null;
  if (value.variant !== void 0 && typeof value.variant !== "string") return null;
  if (value.suggestions !== void 0 && (!Array.isArray(value.suggestions) || value.suggestions.some((suggestion) => typeof suggestion !== "string"))) return null;
  return {
    type: "connector",
    connector: value.connector,
    ...value.reason === void 0 ? {} : { reason: value.reason },
    ...value.serverId === void 0 ? {} : { serverId: value.serverId },
    ...value.suggestions === void 0 ? {} : { suggestions: value.suggestions },
    ...value.variant === void 0 ? {} : { variant: value.variant }
  };
}
function projectTranscriptCardEntry(value) {
  if (!isRecord3(value) || value.kind !== TRANSCRIPT_CARD_ENTRY_KIND || !nonEmptyString2(value.id) || !isRecord3(value.message)) return null;
  const message = value.message;
  let projectedMessage = null;
  let projectedStreaming;
  switch (message.type) {
    case "text": {
      const projection = projectSendMessageText({
        kind: TRANSCRIPT_CARD_ENTRY_KIND,
        id: value.id,
        message,
        ...value.streaming === void 0 ? {} : { streaming: value.streaming },
        ...value.timestampMs === void 0 ? {} : { timestampMs: value.timestampMs }
      });
      if (projection.kind === "invalid") return null;
      projectedMessage = {
        type: "text",
        content: projection.message.content,
        ...projection.message.images === void 0 ? {} : { images: projection.message.images },
        ...projection.message.channel === void 0 ? {} : { channel: projection.message.channel }
      };
      projectedStreaming = projection.streaming;
      break;
    }
    case "widget":
      projectedMessage = projectWidget(message);
      break;
    case "cursor-agent":
      projectedMessage = projectCursorAgent(message);
      break;
    case "email-draft":
      projectedMessage = projectEmailDraft(message);
      break;
    case "slack-draft":
      projectedMessage = projectSlackDraft(message);
      break;
    case "auto-review-approval":
      projectedMessage = projectAutoReviewApproval(message);
      break;
    case "listener-connect":
      projectedMessage = projectListenerConnect(message);
      break;
    case "secret-request":
      projectedMessage = projectSecretRequest(message);
      break;
    case "attachment":
      projectedMessage = projectAttachment(message);
      break;
    case "connector":
      projectedMessage = projectConnector(message);
      break;
    case "connectors":
      projectedMessage = projectConnectors(message);
      break;
    case "local-tool-permission":
      projectedMessage = projectLocalToolPermission(message);
      break;
    default:
      return null;
  }
  if (projectedMessage == null) return null;
  if (value.replyTo !== void 0 && typeof value.replyTo !== "string") return null;
  if (value.replyToId !== void 0 && typeof value.replyToId !== "string") return null;
  if (value.respondedValue !== void 0 && typeof value.respondedValue !== "string") return null;
  if (value.widgetDismissed !== void 0 && typeof value.widgetDismissed !== "boolean") return null;
  if (value.widgetSkipped !== void 0 && typeof value.widgetSkipped !== "boolean") return null;
  if (value.respondedValueEchoed !== void 0 && typeof value.respondedValueEchoed !== "boolean") return null;
  if (value.draftSendState !== void 0 && value.draftSendState !== "editable" && value.draftSendState !== "sending" && value.draftSendState !== "sent") return null;
  if (value.secretProvided !== void 0 && typeof value.secretProvided !== "boolean") return null;
  if (value.boxInstruction !== void 0 && typeof value.boxInstruction !== "string") return null;
  if (value.boxRequest !== void 0 && typeof value.boxRequest !== "string") return null;
  if (value.boxRequestId !== void 0 && typeof value.boxRequestId !== "string") return null;
  if (value.boxResolution !== void 0 && value.boxResolution !== null && typeof value.boxResolution !== "string") return null;
  if (value.boxSnapshot !== void 0 && typeof value.boxSnapshot !== "string") return null;
  if (value.timestampMs !== void 0 && (typeof value.timestampMs !== "number" || !Number.isFinite(value.timestampMs))) return null;
  if (value.isGroupStart !== void 0 && typeof value.isGroupStart !== "boolean") return null;
  if (value.streaming !== void 0 && typeof value.streaming !== "boolean") return null;
  if (value.reactions !== void 0 && !Array.isArray(value.reactions)) return null;
  if (value.permissionScope !== void 0 && typeof value.permissionScope !== "string") return null;
  if (value.permissionScopeRevision !== void 0 && (typeof value.permissionScopeRevision !== "number" || !Number.isInteger(value.permissionScopeRevision) || value.permissionScopeRevision < 0)) return null;
  const replyToId = typeof value.replyTo === "string" ? value.replyTo : value.replyToId;
  const reactionFields = value.reactions === void 0 ? {} : projectTranscriptReactions(value.reactions);
  return {
    kind: TRANSCRIPT_CARD_ENTRY_KIND,
    id: value.id,
    message: projectedMessage,
    ...replyToId === void 0 ? {} : { replyToId },
    ...value.respondedValue === void 0 ? {} : { respondedValue: value.respondedValue },
    ...value.widgetDismissed === void 0 ? {} : { widgetDismissed: value.widgetDismissed },
    ...value.widgetSkipped === void 0 ? {} : { widgetSkipped: value.widgetSkipped },
    ...value.respondedValueEchoed === void 0 ? {} : { respondedValueEchoed: value.respondedValueEchoed },
    ...value.draftSendState === void 0 ? {} : { draftSendState: value.draftSendState },
    ...value.secretProvided === void 0 ? {} : { secretProvided: value.secretProvided },
    ...value.boxInstruction === void 0 ? {} : { boxInstruction: value.boxInstruction },
    ...value.boxRequest === void 0 ? {} : { boxRequest: value.boxRequest },
    ...value.boxRequestId === void 0 ? {} : { boxRequestId: value.boxRequestId },
    ...value.boxResolution === void 0 ? {} : { boxResolution: value.boxResolution },
    ...value.boxSnapshot === void 0 ? {} : { boxSnapshot: value.boxSnapshot },
    ...value.timestampMs === void 0 ? {} : { timestampMs: value.timestampMs },
    ...value.isGroupStart === void 0 ? {} : { isGroupStart: value.isGroupStart },
    ...projectedStreaming === void 0 ? {} : { streaming: projectedStreaming },
    ...value.reactions === void 0 ? {} : reactionFields,
    ...value.permissionScope === void 0 ? {} : { permissionScope: value.permissionScope },
    ...value.permissionScopeRevision === void 0 ? {} : { permissionScopeRevision: value.permissionScopeRevision }
  };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/transcript-card/attachment-data.ts
var imageExtensions = /* @__PURE__ */ new Set([".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
var videoExtensions = /* @__PURE__ */ new Set([".m4v", ".mov", ".mp4", ".ogv", ".webm"]);
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function extension(value) {
  let pathname = value;
  try {
    pathname = new URL(value).pathname;
  } catch {
  }
  const lower = pathname.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot < 0 ? "" : lower.slice(dot);
}
function isMediaUrl(value) {
  const ext = extension(value);
  return imageExtensions.has(ext) || videoExtensions.has(ext);
}
function classifyUserAttachmentPath(filePath) {
  return isMediaUrl(filePath) ? "media" : "file";
}
function optionalNonEmptyMetadata(value) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}
function optionalNonNegativeNumber(value) {
  if (value === void 0) return void 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}
function basename(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const leaf = normalized.slice(normalized.lastIndexOf("/") + 1);
  return leaf.length > 0 ? leaf : "Attachment";
}
function projectUserAttachment(value) {
  if (value.kind !== "user-attachment" || typeof value.id !== "string" || value.id.trim().length === 0 || typeof value.file_path !== "string" || value.file_path.trim().length === 0) return null;
  const fileName = value.file_name;
  if (fileName !== void 0 && typeof fileName !== "string") return null;
  const byteSize = optionalNonNegativeNumber(value.byteSize);
  const width = optionalNonNegativeNumber(value.width);
  const height = optionalNonNegativeNumber(value.height);
  const timestampMs = optionalNonNegativeNumber(value.timestampMs);
  const batchId = optionalNonEmptyMetadata(value.batchId);
  const replyTo = optionalNonEmptyMetadata(value.replyTo);
  const clientNonce = optionalNonEmptyMetadata(value.clientNonce);
  if (byteSize === null || width === null || height === null || timestampMs === null || batchId === null || replyTo === null || clientNonce === null) return null;
  const name = fileName === void 0 || fileName.length === 0 ? basename(value.file_path) : fileName;
  return {
    kind: classifyUserAttachmentPath(value.file_path),
    id: value.id,
    attachment: {
      path: value.file_path,
      name,
      ...byteSize === void 0 ? {} : { size: byteSize }
    },
    ...width === void 0 ? {} : { width },
    ...height === void 0 ? {} : { height },
    ...timestampMs === void 0 ? {} : { timestampMs },
    ...batchId === void 0 ? {} : { batchId },
    ...replyTo === void 0 ? {} : { replyTo },
    ...clientNonce === void 0 ? {} : { clientNonce }
  };
}
function projectUserAttachmentEvent(value) {
  return isRecord4(value) ? projectUserAttachment(value) : null;
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/timeline-event-registry.ts
var metadata = (eventType, sourcePath, chunkFile, icon = null) => ({
  protocolKey: `event:${eventType}`,
  entryKind: "event",
  eventType,
  placeholderHeight: 32,
  icon,
  sourcePath,
  chunkFile
});
var TIMELINE_EVENT_REGISTRY = Object.freeze({
  "event:channel-connected": metadata("channel-connected", "/src/electron-renderer/features/channels/cards/event/channel-connected/view.tsx", "view-BEocLLTG.js"),
  "event:channel-disconnected": metadata("channel-disconnected", "/src/electron-renderer/features/channels/cards/event/channel-disconnected/view.tsx", "view-BMD9fbyy.js"),
  "event:name-changed": metadata("name-changed", "/src/electron-renderer/features/chat/cards/event/name-changed/view.tsx", "view-LYKe8-aA.js"),
  "event:automation-changed": metadata("automation-changed", "/src/electron-renderer/features/agents/cards/event/automation-changed/view.tsx", "view-BXS10NUs.js", "calendar")
});
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function projectTimelineEvent(value) {
  if (!isRecord5(value) || typeof value.type !== "string") return null;
  if (value.type === "name-changed" && typeof value.to === "string") return { type: value.type, to: value.to };
  if ((value.type === "channel-connected" || value.type === "channel-disconnected") && typeof value.label === "string") return { type: value.type, label: value.label };
  if (value.type === "automation-changed" && typeof value.automationId === "string" && value.automationId.length > 0 && typeof value.action === "string" && value.action.length > 0 && typeof value.automationName === "string" && value.automationName.length > 0) {
    return {
      type: value.type,
      automationId: value.automationId,
      action: value.action,
      automationName: value.automationName
    };
  }
  return null;
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/production/model.ts
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function numberValue(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function attachmentFromEntry(entry) {
  const path = stringValue(entry.path ?? entry.url ?? entry.source);
  if (path == null) return null;
  return {
    path,
    name: stringValue(entry.fileName ?? entry.name) ?? path.split(/[/\\]/).at(-1) ?? "Attachment",
    ...typeof entry.byteSize === "number" ? { size: entry.byteSize } : {},
    ...typeof entry.mimeType === "string" ? { mimeType: entry.mimeType } : {}
  };
}
function projectPermissionRequestEntry(value, id, timestampMs) {
  const message = isRecord6(value.message) && value.message.type === "permission-request" ? value.message : null;
  if (message == null || !isRecord6(message.permission) || typeof message.permission.title !== "string" || message.permission.title.trim().length === 0) return null;
  if (value.timestampMs !== void 0 && (typeof value.timestampMs !== "number" || !Number.isFinite(value.timestampMs))) return null;
  if (value.isGroupStart !== void 0 && typeof value.isGroupStart !== "boolean") return null;
  return {
    kind: "permission-request",
    id,
    title: message.permission.title,
    timestampMs,
    ...value.isGroupStart === void 0 ? {} : { isGroupStart: value.isGroupStart }
  };
}
function projectUserAttachmentGalleryAttachment(projection) {
  return {
    ...projection.attachment,
    sourceKind: "user-attachment",
    id: projection.id,
    ...projection.width === void 0 ? {} : { width: projection.width },
    ...projection.height === void 0 ? {} : { height: projection.height },
    ...projection.timestampMs === void 0 ? {} : { timestampMs: projection.timestampMs },
    ...projection.batchId === void 0 ? {} : { batchId: projection.batchId },
    ...projection.replyTo === void 0 ? {} : { replyTo: projection.replyTo },
    ...projection.clientNonce === void 0 ? {} : { clientNonce: projection.clientNonce }
  };
}
function messageText(entry) {
  if (typeof entry.content === "string") return entry.content;
  if (typeof entry.text === "string") return entry.text;
  if (isRecord6(entry.message) && typeof entry.message.content === "string") return entry.message.content;
  return null;
}
function transcriptDelivery(entry) {
  const candidate = entry.delivery ?? entry.status;
  if (candidate === "pending" || candidate === "queued" || candidate === "failed" || candidate === "sent") return candidate;
  if (entry.pending === true || entry.isPending === true) return "pending";
  if (entry.failed === true || entry.isFailed === true) return "failed";
  return void 0;
}
function transcriptStreaming(entry) {
  return entry.isStreaming === true || entry.streaming === true;
}
function transcriptRichText(entry) {
  if (typeof entry.richText === "string") return entry.richText;
  const message = isRecord6(entry.message) ? entry.message : null;
  return message != null && typeof message.richText === "string" ? message.richText : void 0;
}
function transcriptReplyToId(entry) {
  const candidate = entry.replyToId ?? entry.replyTo;
  if (typeof candidate === "string" && candidate.length > 0) return candidate;
  if (!isRecord6(candidate)) return void 0;
  const targetId = candidate.targetId ?? candidate.id;
  return typeof targetId === "string" && targetId.length > 0 ? targetId : void 0;
}
function transcriptToolCallStatus(entry) {
  const status = entry.status;
  if (status === "pending" || status === "running" || status === "done" || status === "failed" || status === "error" || status === "aborted") return status;
  return "pending";
}
function transcriptLocalToolPermissionStatus(value) {
  return value === "pending" || value === "always" || value === "never" || value === "denied" || value === "expired" || value === "allow-once" ? value : null;
}
function sentWhileOfflineAtMs(value, entryId) {
  if (!isRecord6(value) || !isRecord6(value.sentWhileOfflineAtMsByEntryId)) return void 0;
  const candidate = value.sentWhileOfflineAtMsByEntryId[entryId];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : void 0;
}
var SEND_MESSAGE_TEXT_ADJACENCY_KEYS = [
  "isContinuedFromPrev",
  "isContinuedToNext",
  "isGroupStart",
  "isRunStart",
  "isFollowedByThreadChip",
  "isGroupEnd"
];
function transcriptTextAdjacency(value) {
  if (value.adjacency !== void 0 && !isRecord6(value.adjacency)) return null;
  const candidate = isRecord6(value.adjacency) ? value.adjacency : value;
  const adjacency = {};
  for (const key of SEND_MESSAGE_TEXT_ADJACENCY_KEYS) {
    const field = candidate[key];
    if (field === void 0) continue;
    if (typeof field !== "boolean") return null;
    adjacency[key] = field;
  }
  return adjacency;
}
function projectSendMessageTextEntry(value, id, timestampMs) {
  const adjacency = transcriptTextAdjacency(value);
  if (adjacency == null) return null;
  const projection = projectSendMessageText(value, adjacency);
  if (projection.kind === "invalid") return null;
  return projectTranscriptCardEntry({
    ...value,
    id,
    timestampMs,
    streaming: projection.streaming,
    isGroupStart: projection.adjacency.isGroupStart
  });
}
function transcriptReactionFields(entry) {
  if (!Array.isArray(entry.reactions)) return {};
  const projection = projectTranscriptReactions(entry.reactions);
  return { reactions: projection.reactions, myReactions: projection.myReactions };
}
function projectTranscriptEntry(value, index, agentName, agentId) {
  if (!isRecord6(value)) return null;
  const id = stringValue(value.id) ?? `entry-${index}`;
  const timestampMs = numberValue(value.timestampMs, Date.now());
  const composedAtMs = typeof (value.composedAtMs ?? value.queuedAtMs) === "number" && Number.isFinite(value.composedAtMs ?? value.queuedAtMs) ? Number(value.composedAtMs ?? value.queuedAtMs) : void 0;
  if (value.kind === "event") {
    const event = projectTimelineEvent(value.event);
    return event == null ? null : { kind: "timeline-event", id, event, timestampMs };
  }
  if (value.kind === "notice") {
    const text2 = messageText(value);
    return text2 == null ? null : { kind: "notice", id, text: text2, timestampMs };
  }
  const message = isRecord6(value.message) ? value.message : null;
  if (value.kind === "send-message" && message?.type === "permission-request") {
    return projectPermissionRequestEntry(value, id, timestampMs);
  }
  if (value.kind === "send-message" && message?.type === "text") {
    return projectSendMessageTextEntry(value, id, timestampMs);
  }
  const ask = message != null && message.type === "local-tool-permission" && isRecord6(message.ask) ? message.ask : null;
  const askStatus = ask == null ? null : transcriptLocalToolPermissionStatus(ask.status);
  if (value.kind === "send-message" && ask != null && askStatus != null && typeof ask.requestId === "string" && ask.requestId.length > 0) {
    return {
      kind: "local-tool-permission",
      id,
      entryId: id,
      agentId: agentId ?? stringValue(value.agentId),
      ask: { requestId: ask.requestId, status: askStatus, action: ask.action, target: ask.target },
      ...typeof value.permissionScope === "string" ? { permissionScope: value.permissionScope } : {},
      ...typeof value.permissionScopeRevision === "number" && Number.isInteger(value.permissionScopeRevision) && value.permissionScopeRevision >= 0 ? { permissionScopeRevision: value.permissionScopeRevision } : {},
      timestampMs
    };
  }
  if (value.kind === "send-message" && message?.type !== "attachment" && typeof value.boxRequestId === "string") {
    return {
      kind: "computer-handoff",
      id,
      requestId: value.boxRequestId,
      instruction: typeof value.boxInstruction === "string" ? value.boxInstruction : "",
      resolution: typeof value.boxResolution === "string" ? value.boxResolution : null,
      timestampMs
    };
  }
  if (value.kind === "send-message") {
    const transcriptCard = projectTranscriptCardEntry(value);
    if (transcriptCard != null) return transcriptCard;
  }
  if (value.kind === "tool-call") {
    const name = stringValue(value.name ?? value.toolName);
    if (name == null) return null;
    return {
      kind: "tool-call",
      id,
      name,
      status: transcriptToolCallStatus(value),
      ...typeof value.summary === "string" && value.summary.length > 0 ? { summary: value.summary } : {},
      timestampMs
    };
  }
  if (value.kind === "thinking") {
    const text2 = messageText(value);
    if (text2 == null || text2.length === 0) return null;
    const durationMs = numberValue(value.durationMs, 0);
    return {
      kind: "thinking",
      id,
      text: text2,
      ...durationMs > 0 ? { durationMs } : {},
      timestampMs
    };
  }
  if (value.kind === "user-attachment") {
    const projection = projectUserAttachmentEvent(value);
    if (projection == null) return null;
    const attachment2 = projectUserAttachmentGalleryAttachment(projection);
    return {
      kind: "message",
      id,
      role: "user",
      author: "You",
      text: "",
      timestampMs,
      attachments: [attachment2],
      sourceKind: "user-attachment",
      userAttachment: projection,
      delivery: transcriptDelivery(value) ?? "sent",
      ...projection.clientNonce == null ? {} : { clientNonce: projection.clientNonce },
      ...projection.replyTo == null ? {} : { replyToId: projection.replyTo },
      ...transcriptReactionFields(value)
    };
  }
  const isAttachmentEntry = value.kind === "user-attachment" || value.kind === "attachment";
  const attachment = isAttachmentEntry ? attachmentFromEntry(value) : null;
  if (attachment != null) {
    return {
      kind: "message",
      id,
      role: "user",
      author: "You",
      text: "",
      timestampMs,
      attachments: [attachment],
      delivery: transcriptDelivery(value) ?? "sent",
      ...typeof value.clientNonce === "string" ? { clientNonce: value.clientNonce } : {},
      ...transcriptReplyToId(value) == null ? {} : { replyToId: transcriptReplyToId(value) },
      ...transcriptReactionFields(value)
    };
  }
  const text = messageText(value);
  if (text == null) return null;
  const role = value.kind === "send-message" || value.role === "assistant" ? "assistant" : "user";
  return {
    kind: "message",
    id,
    role,
    author: role === "assistant" ? agentName : "You",
    text,
    timestampMs,
    ...transcriptRichText(value) === void 0 ? {} : { richText: transcriptRichText(value) },
    delivery: transcriptDelivery(value) ?? "sent",
    ...typeof value.clientNonce === "string" ? { clientNonce: value.clientNonce } : {},
    ...composedAtMs == null ? {} : { composedAtMs },
    ...transcriptStreaming(value) ? { isStreaming: true } : {},
    ...transcriptReplyToId(value) == null ? {} : { replyToId: transcriptReplyToId(value) },
    ...transcriptReactionFields(value)
  };
}
function projectTranscriptFeedEntries(values, agentName, agentId) {
  return values.flatMap((value, index) => {
    const projected = projectTranscriptEntry(value, index, agentName, agentId);
    return projected == null ? [] : [projected];
  });
}
function projectThreadSummaries(value) {
  if (!isRecord6(value) || !isRecord6(value.threadCounts)) return void 0;
  const summaries = [];
  for (const [rootId, count] of Object.entries(value.threadCounts)) {
    if (rootId.length === 0 || typeof count !== "number" || !Number.isInteger(count) || count <= 0) continue;
    summaries.push({ rootId, count });
  }
  return summaries;
}
function projectTranscriptPageResult(value, agentName, agentId) {
  if (!isRecord6(value) || !Array.isArray(value.entries)) return { entries: [] };
  const entries = value.entries.map((entry, index) => projectTranscriptEntry(entry, index, agentName, agentId)).filter((entry) => entry != null).map((entry) => {
    if (entry.kind !== "message" || entry.composedAtMs != null) return entry;
    const composedAtMs = sentWhileOfflineAtMs(value, entry.id);
    return composedAtMs == null ? entry : { ...entry, composedAtMs };
  });
  const nextBeforeSeq = typeof value.nextBeforeSeq === "number" && Number.isFinite(value.nextBeforeSeq) ? value.nextBeforeSeq : void 0;
  const threadSummaries = projectThreadSummaries(value);
  return {
    entries,
    ...nextBeforeSeq == null ? {} : { nextBeforeSeq },
    ...threadSummaries === void 0 ? {} : { threadSummaries }
  };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/model.ts
function resultCardKind(name) {
  if (name === "bash") return "shell";
  if (name === "write") return "file-write";
  if (name === "edit") return "file-edit";
  if (name === "read" || name === "read_image" || name === "glob" || name === "grep" || name === "present") return "file-read";
  return "connector";
}
function resultCardStatus(status) {
  if (status === "done") return "success";
  if (status === "failed" || status === "error") return "error";
  if (status === "aborted") return "cancelled";
  return "running";
}
function toolResultOf(value, entry) {
  const result = typeof value.result === "string" ? value.result : null;
  const decision = typeof value.decision === "string" && value.decision !== "" ? value.decision : null;
  if ((result === null || result === "") && decision === null) return null;
  let args = {};
  if (typeof value.args === "string" && value.args !== "") {
    try {
      args = JSON.parse(value.args);
    } catch {
    }
  }
  const kind = resultCardKind(typeof value.name === "string" ? value.name : "");
  const argString = (key) => typeof args[key] === "string" && args[key] !== "" ? args[key] : null;
  const card = {
    kind,
    toolCallId: entry.id,
    status: resultCardStatus(entry.status),
    path: kind === "shell" ? null : argString("path") ?? argString("file_path"),
    command: kind === "shell" ? argString("command") : null,
    workingDirectory: null,
    summary: decision ?? "",
    // 卡片 detail 按 summary || diff || output 取，置空让 output 全文呈现
    output: result ?? "",
    diff: "",
    isStreaming: false,
    isBackground: false
  };
  return card;
}
function projectTranscriptEntry2(value, index, agentName, agentId) {
  const entry = projectTranscriptEntry(value, index, agentName, agentId);
  if (entry === null || entry.kind !== "tool-call") return entry;
  const toolResult = toolResultOf(value, entry);
  return toolResult === null ? entry : { ...entry, toolResult };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/acknowledgement.ts
var RESEND_PREFIX = "sand-resend-v1:";
function logicalNonce(nonce) {
  if (!nonce.startsWith(RESEND_PREFIX)) return nonce;
  const encoded = nonce.slice(RESEND_PREFIX.length);
  const separator = encoded.indexOf(":");
  if (separator <= 0) return nonce;
  const lengthText = encoded.slice(0, separator);
  if (!/^[1-9]\d*$/.test(lengthText)) return nonce;
  const length = Number(lengthText);
  if (!Number.isSafeInteger(length)) return nonce;
  const start = separator + 1;
  const end = start + length;
  return encoded[end] === ":" && end + 1 < encoded.length ? encoded.slice(start, end) : nonce;
}
function scopeKey(accountSlot, agentId) {
  return `${accountSlot ?? "anonymous"}\0${agentId}`;
}
function recordMatches(record, nonce) {
  const eventLogicalNonce = logicalNonce(nonce);
  return record.nonce === nonce || logicalNonce(record.nonce) === eventLogicalNonce || record.priorNonces.some((candidate) => candidate === nonce || logicalNonce(candidate) === eventLogicalNonce);
}
function cloneRecord(record) {
  return { ...record, priorNonces: [...record.priorNonces], entries: [...record.entries] };
}
function createTranscriptAcknowledgementController() {
  const records = /* @__PURE__ */ new Map();
  const seenEchoKinds = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  let generation = 0;
  let accountSlot = null;
  let agentId = null;
  let disposed = false;
  const emit = () => {
    if (!disposed) for (const listener of [...listeners]) listener();
  };
  const removeRecord = (key) => {
    const removed = records.delete(key);
    seenEchoKinds.delete(key);
    return removed;
  };
  const findRecord = (slot, nonce) => {
    for (const [key, record] of records) {
      if (record.accountSlot === slot && recordMatches(record, nonce)) return [key, record];
    }
    return null;
  };
  const publish = (changed) => {
    if (changed) emit();
    return changed;
  };
  const getSnapshot = () => {
    const visible = [...records.values()].filter((record) => record.accountSlot === accountSlot && record.agentId === agentId);
    return {
      generation,
      accountSlot,
      agentId,
      records: visible.map(cloneRecord),
      optimisticEntries: visible.flatMap((record) => record.entries.map((entry) => ({ entry: { ...entry }, accountSlot: record.accountSlot, agentId: record.agentId, nonce: record.nonce, phase: record.phase })))
    };
  };
  return {
    getSnapshot,
    subscribe(listener) {
      if (disposed) return () => {
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextAccountSlot, nextAgentId) {
      if (disposed || accountSlot === nextAccountSlot && agentId === nextAgentId) return;
      if (accountSlot !== nextAccountSlot) {
        generation += 1;
        records.clear();
        seenEchoKinds.clear();
      }
      accountSlot = nextAccountSlot;
      agentId = nextAgentId;
      emit();
    },
    insertOptimistic(input) {
      if (disposed || input.nonce.length === 0 || input.agentId.length === 0 || records.has(scopeKey(input.accountSlot, input.agentId) + `\0${input.nonce}`)) return false;
      if (input.entries.length === 0 || input.entries.some((entry) => entry.clientNonce !== input.nonce)) return false;
      if (input.entries.some((entry) => entry.kind === "user-attachment" && !entry.id.includes(input.nonce))) return false;
      const key = scopeKey(input.accountSlot, input.agentId) + `\0${input.nonce}`;
      records.set(key, { ...input, priorNonces: [...input.priorNonces ?? []], entries: [...input.entries] });
      seenEchoKinds.set(key, /* @__PURE__ */ new Map());
      return publish(true);
    },
    markDispatching(slot, nonce) {
      const match = findRecord(slot, nonce);
      if (match == null || match[1].phase === "failed") return false;
      if (match[1].phase === "dispatching") return true;
      records.set(match[0], { ...match[1], phase: "dispatching" });
      return publish(true);
    },
    markAcceptedAwaitingEcho(slot, nonce) {
      const match = findRecord(slot, nonce);
      if (match == null || match[1].phase === "failed") return false;
      if (match[1].phase === "accepted-awaiting-echo") return true;
      records.set(match[0], { ...match[1], phase: "accepted-awaiting-echo" });
      return publish(true);
    },
    markFailed(slot, nonce, failedAtMs) {
      const match = findRecord(slot, nonce);
      if (match == null || !Number.isFinite(failedAtMs)) return false;
      records.set(match[0], { ...match[1], phase: "failed", failedAtMs });
      return publish(true);
    },
    retryFailed(input) {
      const match = findRecord(input.accountSlot, input.nonce);
      if (match == null || match[1].agentId !== input.agentId || match[1].phase !== "failed" || input.freshNonce.length === 0 || input.entries.length === 0) return false;
      if (input.entries.some((entry) => entry.clientNonce !== input.freshNonce)) return false;
      removeRecord(match[0]);
      const key = scopeKey(input.accountSlot, input.agentId) + `\0${input.freshNonce}`;
      records.set(key, { accountSlot: input.accountSlot, agentId: input.agentId, nonce: input.freshNonce, priorNonces: [...match[1].priorNonces, match[1].nonce], entries: [...input.entries], phase: input.phase ?? "pending" });
      seenEchoKinds.set(key, /* @__PURE__ */ new Map());
      return publish(true);
    },
    ingestTranscriptEvent(input) {
      if (disposed || input.accountSlot !== accountSlot || input.agentId !== agentId || input.entry.clientNonce == null) return false;
      const match = findRecord(input.accountSlot, input.entry.clientNonce);
      if (match == null) return false;
      const [key, record] = match;
      const seen = seenEchoKinds.get(key) ?? /* @__PURE__ */ new Map();
      if (seen.has(input.entry.id)) return false;
      seen.set(input.entry.id, input.entry.kind);
      seenEchoKinds.set(key, seen);
      const hasMessage = record.entries.some((entry) => entry.kind === "message");
      const echoedMessages = input.entry.kind === "message";
      const attachmentCount = [...seen.values()].filter((kind) => kind === "user-attachment").length;
      const expectedAttachments = record.entries.filter((entry) => entry.kind === "user-attachment").length;
      const complete = echoedMessages || !hasMessage && expectedAttachments > 0 && attachmentCount >= expectedAttachments;
      if (!complete) {
        publish(true);
        return false;
      }
      removeRecord(key);
      return publish(true);
    },
    reconcileEcho(input) {
      if (disposed || input.accountSlot !== accountSlot) return false;
      const match = findRecord(input.accountSlot, input.nonce);
      if (match == null || match[1].agentId !== input.agentId) return false;
      removeRecord(match[0]);
      return publish(true);
    },
    removeOptimistic(input) {
      if (disposed) return false;
      const match = findRecord(input.accountSlot, input.nonce);
      if (match == null) return false;
      removeRecord(match[0]);
      return publish(true);
    },
    reset() {
      if (disposed) return;
      generation += 1;
      records.clear();
      seenEchoKinds.clear();
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      records.clear();
      seenEchoKinds.clear();
      listeners.clear();
    }
  };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/acknowledgement.ts
var retryWireNonces = /* @__PURE__ */ new Map();
function createTranscriptAcknowledgementController2() {
  const controller = createTranscriptAcknowledgementController();
  return {
    ...controller,
    retryFailed(input) {
      if (input.freshNonce.length > 0 && input.nonce.length > 0) {
        retryWireNonces.set(`${input.agentId}::${input.freshNonce}`, input.nonce);
      }
      return controller.retryFailed(input);
    }
  };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/renderer-grok/overrides/modules/coordinator-client.ts
function withWireSendPromptNonce(method, args) {
  if (method !== "sendPrompt" || typeof args !== "object" || args === null) return args;
  const record = args;
  if (typeof record.agentId !== "string" || typeof record.clientNonce !== "string") return args;
  const prior = retryWireNonces.get(`${record.agentId}::${record.clientNonce}`);
  return prior === void 0 ? args : { ...record, clientNonce: prior };
}

// work/p5-parity/evidence/P5-W3f1/probe.ts
var tool = { kind: "tool-call", id: "tool-1", timestampMs: 1, name: "bash", status: "done", summary: "printf result", args: '{"command":"printf result"}', result: "VFY-UNIQUE-FULL-RESULT" };
console.log("R2 projection paths", JSON.stringify({ direct: projectTranscriptEntry2(tool, 0, "Bot", "A")?.toolResult, feed: projectTranscriptFeedEntries([tool], "Bot", "A")[0]?.toolResult ?? null, tail: projectTranscriptPageResult({ entries: [tool] }, "Bot", "A").entries[0]?.toolResult ?? null }));
var ack = createTranscriptAcknowledgementController2();
ack.setScope("s", "A");
ack.insertOptimistic({ accountSlot: "s", agentId: "A", nonce: "N1", entries: [{ id: "e1", kind: "message", clientNonce: "N1" }], phase: "pending" });
var wires = ["N1"];
for (const [old2, fresh] of [["N1", "N2"], ["N2", "N3"]]) {
  ack.markFailed("s", old2, 1);
  const ok = ack.retryFailed({ accountSlot: "s", agentId: "A", nonce: old2, freshNonce: fresh, entries: [{ id: fresh, kind: "message", clientNonce: fresh }] });
  wires.push(withWireSendPromptNonce("sendPrompt", { agentId: "A", clientNonce: fresh }).clientNonce);
  console.log("R5 retry", JSON.stringify({ old: old2, fresh, ok, map: [...retryWireNonces] }));
}
console.log("R5 actual wire requestIds", JSON.stringify(wires));
var old = { kind: "user", id: "old-u", at: "2026-11-04T00:00:00.000Z", text: "repeat this" };
var raw = serialize({ items: [old], hasMore: false, running: false, streaming: null, agentName: "Bot", clientNonce: "new-N", clientPrompt: "repeat this" });
console.log("R4/O2 historical same-text before new message", JSON.stringify(raw));
var a = createTranscriptAcknowledgementController2();
a.setScope("s", "A");
a.insertOptimistic({ accountSlot: "s", agentId: "A", nonce: "new-N", entries: [{ id: "pending-new-N", kind: "message", clientNonce: "new-N" }], phase: "pending" });
var echo = raw.find((e) => e.clientNonce === "new-N");
if (echo) a.ingestTranscriptEvent({ accountSlot: "s", agentId: "A", entry: { id: echo.id, kind: "message", clientNonce: echo.clientNonce } });
console.log("R4/O2 records after historical echo", a.getSnapshot().records.length);
