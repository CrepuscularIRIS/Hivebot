// ../../../tmp/bot-wt/P5-W3f1/app/ui/tests/support/launch.ts
var import_playwright = require("playwright");
var import_node_path3 = require("node:path");

// ../../../tmp/bot-wt/P5-W3f1/app/ui/tests/support/tmp-sweep.ts
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var g = globalThis;
var state = g.__pbotsTmpSweep ??= { dirs: [], hooked: false };
function trackTmpDir(dir) {
  state.dirs.push(dir);
  if (!state.hooked) {
    state.hooked = true;
    process.on("exit", sweepTmpDirs);
  }
  return dir;
}
function tmkdir(prefix) {
  return trackTmpDir((0, import_node_fs.mkdtempSync)((0, import_node_path.join)((0, import_node_os.tmpdir)(), prefix)));
}
function sweepTmpDirs() {
  const pending = state.dirs;
  state.dirs = [];
  for (const dir of pending) {
    try {
      (0, import_node_fs.rmSync)(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[tmp-sweep] cleanup failed (ignored): ${dir}:`, err);
    }
  }
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/tests/support/sdk-env.ts
var import_node_path2 = require("node:path");
var SANDBOXED_CREDENTIAL_KEYS = [
  "P2SDK_LLM_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LITELLM_MASTER_KEY"
];
function sdkChildEnv(builtIn, extra = {}) {
  const child = { ...process.env };
  for (const key of SANDBOXED_CREDENTIAL_KEYS) delete child[key];
  return { ...child, ...builtIn, ...extra };
}
function shellChildEnv(home, extra = {}) {
  return sdkChildEnv({
    HOME: home,
    XDG_CONFIG_HOME: (0, import_node_path2.join)(home, ".config"),
    XDG_CACHE_HOME: (0, import_node_path2.join)(home, ".cache"),
    PBOTS_DATA_DIR: (0, import_node_path2.join)(home, "data")
  }, extra);
}
function sdkDataDirEnv(dataDir) {
  return dataDir === void 0 ? {} : { PBOTS_DATA_DIR: dataDir };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/tests/support/launch.ts
var UI_ROOT = (0, import_node_path3.resolve)("/tmp/bot-wt/P5-W3f1/app/ui/tests/support", "..", "..");
function sandboxHome(label) {
  return tmkdir(`bot-${label}-`);
}
async function launchShell(opts = {}) {
  const home = opts.home ?? sandboxHome("U-00");
  const app = await import_playwright._electron.launch({
    args: [(0, import_node_path3.join)(UI_ROOT, "out", "main", "index.js"), "--disable-gpu", ...opts.extraArgs ?? []],
    cwd: UI_ROOT,
    env: shellChildEnv(home, opts.env)
  });
  const page = await app.firstWindow();
  return {
    app,
    page,
    home,
    async stop() {
      await app.close();
    }
  };
}

// ../../../tmp/bot-wt/P5-W3f1/app/ui/tests/support/sdk-runtime.ts
var import_node_child_process = require("node:child_process");
var import_node_fs2 = require("node:fs");
var import_node_path4 = require("node:path");
var import_node_url = require("node:url");
var SDK_ROOT = (0, import_node_path4.join)("/tmp/bot-wt/P5-W3f1/app/ui/tests/support", "..", "..", "..", "sdk");
var clientMod;
async function dshClient() {
  if (clientMod === void 0) {
    clientMod = await import((0, import_node_url.pathToFileURL)((0, import_node_path4.join)(SDK_ROOT, "examples", "lib", "client.mjs")).href);
  }
  return clientMod;
}
function fakeOverlayPath() {
  const dir = tmkdir("bot-ui-fake-patch-");
  const pluginUrl = (0, import_node_url.pathToFileURL)((0, import_node_path4.join)(SDK_ROOT, "tests", "support", "fake", "plugin.mjs")).href;
  const overlay = (0, import_node_path4.join)(dir, "fake-llm.yml");
  (0, import_node_fs2.writeFileSync)(overlay, `- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pluginUrl}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`);
  return overlay;
}
async function launchSdkRuntime(opts) {
  const home = opts.home ?? tmkdir("p2sdk-runtime-");
  const handoff = tmkdir("p2sdk-handoff-");
  const child = (0, import_node_child_process.spawn)(process.execPath, [(0, import_node_path4.join)(SDK_ROOT, "scripts", "start.mjs")], {
    ...opts.cwd !== void 0 ? { cwd: opts.cwd } : {},
    env: sdkChildEnv({
      P2SDK_PROVIDER: "mock",
      P2SDK_HOME: home,
      P2SDK_HANDOFF: handoff,
      P2SDK_PORT: "0",
      P2SDK_PATCH: opts.patch,
      P2SDK_READY_TIMEOUT_MS: String(opts.readyTimeoutMs ?? 6e4),
      ...sdkDataDirEnv(opts.dataDir),
      ...opts.env
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c) => {
    output += c;
  });
  child.stderr.on("data", (c) => {
    output += c;
  });
  const deadline = Date.now() + (opts.readyTimeoutMs ?? 6e4);
  for (; ; ) {
    if (/\[p2sdk\] ready http/.test(output)) break;
    if (child.exitCode !== null) throw new Error(`runtime exited early (code ${child.exitCode}):
${output}`);
    if (Date.now() >= deadline) throw new Error(`runtime not ready in ${opts.readyTimeoutMs ?? 6e4}ms:
${output}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  const baseUrl = (0, import_node_fs2.readFileSync)((0, import_node_path4.join)(handoff, "base-url"), "utf8").trim();
  const token = (0, import_node_fs2.readFileSync)((0, import_node_path4.join)(handoff, "launch-token"), "utf8").trim();
  const mod = await dshClient();
  const client = await mod.connect({ baseUrl, token, interactions: "answer" });
  return {
    home,
    handoff,
    baseUrl,
    token,
    client,
    child,
    writeScriptCalls(sessionId, calls) {
      const dir = (0, import_node_path4.join)(home, "fake", "scripts");
      (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
      (0, import_node_fs2.writeFileSync)((0, import_node_path4.join)(dir, `${sessionId}.json`), JSON.stringify({ calls }));
    },
    async stop() {
      client.close();
      child.kill("SIGTERM");
      await new Promise((resolve2) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve2();
        }, 1e4);
        child.on("exit", () => {
          clearTimeout(timer);
          resolve2();
        });
        if (child.exitCode !== null) {
          clearTimeout(timer);
          resolve2();
        }
      });
    }
  };
}

// work/p5-parity/evidence/P5-W3f1/browser-harness.ts
var import_node_fs3 = require("node:fs");
var import_node_path5 = require("node:path");
var evidence = "/home/lingxufeng/bot/work/p5-parity/evidence/P5-W3f1";
async function main() {
  const home = sandboxHome("P5-W3f1-browser");
  const rt = await launchSdkRuntime({ patch: "/tmp/bot-wt/P5-W3f1/app/sdk/profile/patches/presets.yml:" + fakeOverlayPath(), dataDir: (0, import_node_path5.join)(home, "data") });
  let shell;
  try {
    shell = await launchShell({ home, env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: ["--remote-debugging-port=19331"] });
    await shell.page.locator(".sand-agent-item").first().waitFor({ timeout: 6e4 });
    const list = await rt.client.call("session/list", { _request: {} });
    const sid = list.items.find((i) => i.origin !== "subagent").sessionId;
    const args = JSON.stringify({ command: "printf VFY-UNIQUE-FULL-RESULT", description: "independent verifier tool output" });
    rt.writeScriptCalls(sid, [{ chunks: [{ type: "block-start", index: 0, blockType: "tool-call" }, { type: "tool-call-delta", index: 0, id: "vfy-tool", name: "bash", argumentsDelta: args }, { type: "block-end", index: 0, block: { type: "tool-call", id: "vfy-tool", name: "bash", arguments: args } }, { type: "finish", reason: { kind: "tool-calls" } }] }, { chunks: [{ type: "block-start", index: 0, blockType: "text" }, { type: "text-delta", index: 0, text: "Verifier turn finished." }, { type: "block-end", index: 0, block: { type: "text", text: "Verifier turn finished." } }, { type: "finish", reason: { kind: "stop" } }] }]);
    (0, import_node_fs3.writeFileSync)((0, import_node_path5.join)(evidence, "browser-ready.txt"), "CDP http://127.0.0.1:19331\n");
    console.log("BROWSER_READY");
    while (!(0, import_node_fs3.existsSync)((0, import_node_path5.join)(evidence, "browser-stop.flag"))) await new Promise((r) => setTimeout(r, 500));
  } finally {
    if (shell) await shell.stop();
    await rt.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
