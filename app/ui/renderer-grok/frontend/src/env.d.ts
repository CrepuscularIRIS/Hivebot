// 来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/env.d.ts
import type { Root } from "react-dom/client";
import type { CoordinatorPortBridge, DesktopBridge } from "./recovered/contracts/desktop-bridge";

declare global {
  interface Window {
    __grokDevRoot?: Root;
    desktop?: DesktopBridge;
    coordinatorPort?: CoordinatorPortBridge;
  }
}

export {};
