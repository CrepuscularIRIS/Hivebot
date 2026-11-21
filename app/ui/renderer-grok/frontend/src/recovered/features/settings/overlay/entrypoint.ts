// 来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/settings/overlay/entrypoint.ts
import { alwaysAvailable, defineEntrypoint } from "../../../runtime/define-entrypoint";

export interface SettingsOverlayParams {
  section?: string;
}

export default defineEntrypoint<SettingsOverlayParams>({
  availability: alwaysAvailable,
  loadView: () => import("./view")
});
