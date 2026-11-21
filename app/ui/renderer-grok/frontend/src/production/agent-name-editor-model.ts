// 来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/production/agent-name-editor-model.ts
// Exact rename commit rule recovered from yut.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51916

export function committedAgentName(initialValue: string, draftValue: string): string | null {
  const trimmed = draftValue.trim();
  return trimmed.length > 0 && trimmed !== initialValue ? trimmed : null;
}
