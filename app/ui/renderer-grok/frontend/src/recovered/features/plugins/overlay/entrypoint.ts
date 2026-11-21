// 来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/plugins/overlay/entrypoint.ts
import { alwaysAvailable, defineEntrypoint } from "../../../runtime/define-entrypoint";

export interface PluginsOverlayParams {
  focusBrowseQuery?: string;
  focusPlugin?: string;
  focusServerId?: string;
  focusWorkflowId?: string;
}

export default defineEntrypoint<PluginsOverlayParams>({
  availability: alwaysAvailable,
  loadView: () => import("./view")
});
