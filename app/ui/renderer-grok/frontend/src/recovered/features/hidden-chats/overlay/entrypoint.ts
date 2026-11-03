// 来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/hidden-chats/overlay/entrypoint.ts
import { alwaysAvailable, defineEntrypoint } from "../../../runtime/define-entrypoint";

export type HiddenChatsOverlayParams = Record<string, never>;

export default defineEntrypoint<HiddenChatsOverlayParams>({
  availability: alwaysAvailable,
  loadView: () => import("./view")
});
