// 来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/settings/overlay/computer-view-internals.tsx
// T57c：0.78.1 卡层（probe 行 39——section > [h3 行] + [卡 div：padding 8px 0、r14、白底+细边]）
export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3>{title}</h3><div className="sand-settings-group__card">{children}</div></section>;
}
