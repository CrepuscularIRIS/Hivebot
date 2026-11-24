#!/usr/bin/env node
// patch-merge.mjs —— 按条目合并 / 摘除 cordis.patch.yml 里安装器写的那几项。
//
// 为什么要有它：DS-Bot 自己也往 profile 的 cordis.patch.yml 里写东西——设置界面（@deepseek-ai/dsh-config-editor）
// 把改过的插件配置写回同 id 的条目，插件管理器的启停开关写「- id: X / disabled: true」条目。旧版 provision.sh
// 整份替换这个文件、uninstall.sh 整份还原首启备份，两边都会把这些设置静默丢掉（2026-11-24 只读审查 #1）。
//
// 做法：用 DS-Bot 自带的 yaml 库（和它的设置编辑器同一套 parseDocument / Document API，!!js 标签的解析规则也照抄），
// 只动安装器写的键：
//   llm-pi-ai            config.providers.litellm
//   agent-default-model  config.provider / config.model
//   dsh-superagent       config.stateDir / config.dataDir
// 条目里其余的键、文件里其余的条目与注释，原样保留。
//
// 用法（<app-dir> = DS-Bot 的 resources/app，用它的 node_modules/yaml；给 - 表示从本脚本位置往上找）：
//   patch-merge.mjs apply  <patch> <rendered> <out> <app-dir|->   把渲染结果里的三项并进 <patch>（<patch> 是空骨架「[]」时整份采用渲染结果）
//   patch-merge.mjs remove <patch> <backup|-> <out> <app-dir|->   把安装器写的键摘掉；接入前就有的值按备份放回，接入后你改的其它键照留
// 结果打印在标准输出（state=… / removed=… / restored=… / entries=…，可能再跟 statedir=… / unrestored=… 两行），<out> 写成功才退出 0。
// 任何一步出错都退出非 0 且不写 <out>；退出码 3 = 现有 patch 不是空骨架、却找不到 yaml 库（加 --appimage 重跑）。

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const MARKER = "hivebot-provision";
const MARKER_LINE =
  // 开头留一个空格：yaml 打印注释时只补「#」，不补空格（首测打成了「#hivebot-provision」）。
  // 这一行与模板渲染结果的首行、uninstall.sh / provision.sh 的 grep 'hivebot-provision' 对得上。
  " hivebot-provision —— 下面三项里由安装器维护的键（llm-pi-ai 的 providers.litellm、agent-default-model 的 provider/model、" +
  "dsh-superagent 的 stateDir/dataDir）归 scripts/dsbot-provision/provision.sh；其余条目与键属于你和 DS-Bot，安装器不动。说明见 scripts/dsbot-provision/README.md。";
// 每一项里归安装器管的键（顺序即 patch 里的先后）
const OWNED = {
  "llm-pi-ai": [["config", "providers", "litellm"]],
  "agent-default-model": [["config", "provider"], ["config", "model"]],
  "dsh-superagent": [["config", "stateDir"], ["config", "dataDir"]],
};
const IDS = Object.keys(OWNED);
// 与 DS-Bot 设置编辑器（@deepseek-ai/dsh-config-editor）同一套解析选项：!!js 标签当字符串原样保留。
const OPTS = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
const NL = String.fromCharCode(10);
const SPACE = " ";

class Bail extends Error {}

const die = (message, code = 1) => {
  process.stderr.write("patch-merge: " + message + NL);
  process.exit(code);
};

function read(file, what) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    die(what + " 读不到: " + file);
  }
}

// 落盘权限 0600：并进去的文件里有你自己 provider 的 key 明文，DS-Bot 自己写这个文件也是 0600（2026-11-24 只读复审 #5）。
function write(out, text) {
  fs.writeFileSync(out, text.endsWith(NL) ? text : text + NL, { mode: 0o600 });
  fs.chmodSync(out, 0o600);
}

const report = (fields) => {
  console.log(Object.entries(fields).map(([key, value]) => key + "=" + value).join(SPACE));
};

function loadYaml(appDir) {
  // appDir = DS-Bot 的 resources/app：用它的 node_modules/yaml（与 DS-Bot 编辑器用的是同一份）。没有就退到本脚本位置往上找。
  let anchor = import.meta.url;
  if (appDir && appDir !== "-") anchor = path.resolve(appDir, "package.json");
  try {
    return createRequire(anchor)("yaml");
  } catch {
    return null;
  }
}

function parse(Y, text, what) {
  let doc;
  try {
    doc = Y.parseDocument(text, OPTS);
  } catch (error) {
    throw new Bail(what + " 解析失败: " + error.message);
  }
  if (doc.errors.length) throw new Bail(what + " 不是合法 YAML: " + doc.errors[0].message);
  if (doc.contents != null && !Y.isSeq(doc.contents)) {
    throw new Bail(what + " 的顶层不是数组（DS-Bot 的 profile patch 必须是 YAML 序列），不敢动");
  }
  return doc;
}

// 去掉注释与空行后只剩 []（或什么都没有）= DS-Bot 首启生成的空骨架。只在没有 yaml 库时用这个判。
function looksEmpty(text) {
  const blanks = new RegExp("[ " + String.fromCharCode(9) + String.fromCharCode(13) + "]", "g");
  const body = text.split(NL).map((line) => line.replace(/#.*$/, "")).join("").replace(blanks, "");
  return body === "" || body === "[]";
}

const itemsOf = (seq) => (seq ? seq.items : []);
// 与 DS-Bot 编辑器同口径：按 id 找「覆盖条目」——跳过带 insert 的（插入列表）和带 name 的（限定名字的覆盖），都不是安装器写的。
// 同一个 id 出现两条以上就中止：DS-Bot 以最后一条为准，安装器不猜该改哪一条（2026-11-24 只读复审 #7）。
function findEntry(Y, seq, id, what) {
  const hits = [];
  itemsOf(seq).forEach((item, index) => {
    if (Y.isMap(item) && item.get("id") === id && !item.has("insert") && !item.has("name")) hits.push(index);
  });
  if (hits.length > 1) {
    throw new Bail(
      "「" + id + "」在" + what + "里出现了 " + hits.length + " 次（第 " + hits.map((index) => index + 1).join("、") + " 条）——DS-Bot 以最后一条为准，安装器不敢猜；先删掉多余的那条再跑",
    );
  }
  return hits.length === 0 ? -1 : hits[0];
}
// undefined 或显式的 null（key: 后面空着）
const isNull = (node) => node == null || node.value === null;

// 条目里 keyPath 指的节点；沿途缺、或中间不是映射，就是没有（undefined）
function nodeAt(Y, item, keyPath) {
  let node = item;
  for (const key of keyPath) {
    if (!Y.isMap(node)) return undefined;
    node = node.get(key, true);
    if (node === undefined) return undefined;
  }
  return node;
}

// 条目的「身份证」：id，加上 name 限定 / insert 列表的区别——备份里有、结果里没有的条目要报给 uninstall.sh
const entryKey = (Y, item) =>
  Y.isMap(item) && item.get("id") != null
    ? JSON.stringify([item.get("id"), item.has("name") ? String(item.get("name")) : null, item.has("insert")])
    : null;

// 安装器的键的完整路径（相对条目）：报「备份里有、现在没有」时不算它们——那几个已经按备份放回或摘掉了
const OWNED_PATHS = new Set(Object.values(OWNED).flat().map((keyPath) => keyPath.join(".")));

// 备份的条目里有、现在的条目里没有的键（递归），例如 providers.deepseek。只报不放：接入后的文件才是你的最新状态
function missingKeys(Y, current, backup, prefix, found) {
  if (!Y.isMap(current) || !Y.isMap(backup)) return;
  for (const pair of backup.items) {
    const key = String(pair.key.value);
    if (key === "id" || key === "name") continue;
    const keyPath = prefix.concat(key);
    if (OWNED_PATHS.has(keyPath.join("."))) continue;
    const here = current.get(key, true);
    if (here === undefined) found.push(keyPath.join("."));
    else missingKeys(Y, here, pair.value, keyPath, found);
  }
}

// 把 src 条目里 keyPath 指的节点写进 dst 条目的同一位置（克隆，连同注释）。沿途缺的中间映射补上；
// 遇到不是映射的节点就中止——那不是安装器写的形状，不碰。
function setOwned(Y, id, dst, src, keyPath) {
  let target = dst;
  let from = src;
  for (let i = 0; i < keyPath.length - 1; i += 1) {
    const key = keyPath[i];
    let node = target.get(key, true);
    if (isNull(node)) {
      node = new Y.YAMLMap();
      target.set(key, node);
    } else if (!Y.isMap(node)) {
      throw new Bail("「" + id + "」的 " + keyPath.slice(0, i + 1).join(".") + " 不是映射，不敢覆盖");
    }
    const source = from.get(key, true);
    if (!Y.isMap(source)) throw new Bail("渲染结果里「" + id + "」缺 " + keyPath.slice(0, i + 1).join("."));
    target = node;
    from = source;
  }
  const leaf = keyPath[keyPath.length - 1];
  const value = from.get(leaf, true);
  if (value === undefined) throw new Bail("渲染结果里「" + id + "」缺 " + keyPath.join("."));
  target.set(leaf, value.clone());
}

// 只摘 keyPath 指的键；沿途缺就什么都不做
function delOwned(Y, item, keyPath) {
  let node = item;
  for (let i = 0; i < keyPath.length - 1; i += 1) {
    const next = node.get(keyPath[i], true);
    if (!Y.isMap(next)) return;
    node = next;
  }
  node.delete(keyPath[keyPath.length - 1]);
}

// 清空壳：keyPath 的各级父映射摘空了就删；条目最后只剩 id（可带 name）也删
function prune(Y, seq, index, keyPaths) {
  const item = seq.items[index];
  const parents = new Set();
  for (const keyPath of keyPaths) {
    for (let i = 1; i < keyPath.length; i += 1) parents.add(keyPath.slice(0, i).join(SPACE));
  }
  const paths = [...parents].map((joined) => joined.split(SPACE)).sort((a, b) => b.length - a.length);
  for (const keyPath of paths) {
    let node = item;
    for (let i = 0; i < keyPath.length - 1; i += 1) {
      const next = node.get(keyPath[i], true);
      if (!Y.isMap(next)) {
        node = null;
        break;
      }
      node = next;
    }
    if (!node) continue;
    const child = node.get(keyPath[keyPath.length - 1], true);
    if (Y.isMap(child) && child.items.length === 0) node.delete(keyPath[keyPath.length - 1]);
  }
  const rest = seq.items[index];
  if (Y.isMap(rest) && rest.items.every((pair) => pair.key.value === "id" || pair.key.value === "name")) seq.delete(index);
}

// 标记行可能挂在文档头、顶层集合或第一条条目上（看 DS-Bot 重写时怎么归位）——三处都认
function markedNodes(doc) {
  return [doc, doc.contents, ...itemsOf(doc.contents)].filter((node) => node != null);
}

function apply(currentText, renderedText, out, appDir) {
  const Y = loadYaml(appDir);
  if (!Y) {
    if (!looksEmpty(currentText)) {
      die("现有 patch 里有 DS-Bot 或你写入的条目，需要 DS-Bot 自带的 yaml 库做条目级合并（不覆盖它们）——加 --appimage 重跑。", 3);
    }
    write(out, renderedText);
    return report({ state: "skeleton" });
  }
  const current = parse(Y, currentText, "现有 patch");
  const rendered = parse(Y, renderedText, "渲染结果");
  const seq = current.contents;
  if (seq == null || seq.items.length === 0) {
    write(out, renderedText);
    return report({ state: "skeleton" });
  }
  // 标记有没有，要在并入之前看：渲染结果的文件头（含标记行）挂在它第一条条目上，
  // 追加进来之后再查就永远「已有标记」，标记行反而不会写到文件头。
  const marked = markedNodes(current).some((node) => String(node.commentBefore ?? "").includes(MARKER));
  for (const item of rendered.contents.items) {
    const id = item.get("id");
    const keyPaths = OWNED[id] ?? [];
    const index = findEntry(Y, seq, id, "现有 patch");
    if (index < 0) {
      const copy = item.clone();
      // 渲染结果的文件头是给「整份采用」的文件写的（「本文件由 provision.sh 渲染」…十三行）：
      // 追加到别人的文件里不合适，也不该落在文件中间。条目自己的说明（dsh-superagent 上面那句）照带。
      if (String(copy.commentBefore ?? "").includes(MARKER)) copy.commentBefore = null;
      seq.add(copy);
      continue;
    }
    for (const keyPath of keyPaths) setOwned(Y, id, seq.items[index], item, keyPath);
  }
  if (!marked) {
    const head = String(seq.commentBefore ?? "");
    seq.commentBefore = head === "" ? MARKER_LINE : MARKER_LINE + NL + head;
  }
  write(out, String(current));
  report({ state: "merged", entries: seq.items.length });
}

function remove(currentText, backupText, out, appDir) {
  const Y = loadYaml(appDir);
  if (!Y) {
    die("找不到 yaml 库，没法只摘安装器写的键（整份覆盖会丢掉 DS-Bot 设置界面写进去的条目）——加 --appimage 重跑。", 3);
  }
  const current = parse(Y, currentText, "现有 patch");
  const backup = backupText == null ? null : parse(Y, backupText, "接入前的备份");
  const seq = current.contents;
  const backupSeq = backup ? backup.contents : null;
  let removed = 0;
  let restored = 0;
  let stateDir;
  const missing = [];
  for (const id of IDS) {
    const index = findEntry(Y, seq, id, "现有 patch");
    if (index < 0) continue;
    removed += 1;
    const item = seq.items[index];
    if (id === "dsh-superagent") {
      const value = nodeAt(Y, item, ["config", "stateDir"]);
      if (Y.isScalar(value) && typeof value.value === "string" && value.value !== "") stateDir = value.value;
    }
    const fromBackup = backupSeq ? findEntry(Y, backupSeq, id, "接入前的备份") : -1;
    if (fromBackup < 0) {
      // 安装器自己加的条目：只摘安装器的键；摘完只剩 id（可带 name）就是空壳，连条目一起删
      for (const keyPath of OWNED[id]) delOwned(Y, item, keyPath);
      prune(Y, seq, index, OWNED[id]);
      continue;
    }
    // 接入前就有的条目：条目本身不动。安装器的键按备份放回原值（备份里没有这个键就摘掉），接入后你在这里改过的
    // 其它键照留——DS-Bot 的设置界面是整条重写同一个条目的 config，接入后的改动必然落在这一条里（2026-11-24
    // 只读复审 #1：此前拿备份里的整条盖回去，这些改动全丢）。
    const back = backupSeq.items[fromBackup];
    for (const keyPath of OWNED[id]) {
      if (nodeAt(Y, back, keyPath) === undefined) delOwned(Y, item, keyPath);
      else setOwned(Y, id, item, back, keyPath);
    }
    // 条目上的注释也按备份放回：安装器在它加的条目上方写说明、旧版安装器把整份文件头写在第一条上；
    // 你自己在这些条目上写的注释在备份里（接入后才加在条目上的注释会丢，属极少数）。
    item.commentBefore = back.commentBefore;
    item.comment = back.comment;
    restored += 1;
    // 接入前有、现在没有的其它键（被旧版安装器整份覆盖掉的）只报不放：uninstall.sh 据此保留备份并提示
    const gone = [];
    missingKeys(Y, item, back, [], gone);
    if (gone.length > 0) missing.push(id + "(" + gone.join(",") + ")");
  }
  // 摘掉标记行；其余注释（DS-Bot 首启写的那三行说明）原样留着
  for (const node of markedNodes(current)) {
    const comment = String(node.commentBefore ?? "");
    if (!comment.includes(MARKER)) continue;
    const rest = comment.split(NL).filter((line) => !line.includes(MARKER)).join(NL);
    node.commentBefore = rest.trim() === "" ? null : rest;
  }
  // 只剩一条标记行、没有任何条目的文件，yaml 的内容是空的（直接 String 会得到 null）
  let text = current.contents == null ? "" : String(current);
  if (text.includes(MARKER)) text = text.split(NL).filter((line) => !line.includes("# " + MARKER)).join(NL);
  const entries = itemsOf(seq).length;
  if (entries === 0 && text.trim() === "") text = "[]" + NL;
  write(out, text);
  report({ state: removed === 0 ? "absent" : entries === 0 ? "empty" : "kept", removed, restored, entries });
  // uninstall.sh --purge-state 只认这里读出的 stateDir（按 id 找条目、交给 yaml 解析，行尾注释不会混进路径）
  if (stateDir !== undefined) console.log("statedir=" + stateDir);
  // 备份里整条都不在结果里的条目（接入后被整份覆盖过——旧版安装器——或被删过）同样只报不放
  const keys = new Set(itemsOf(seq).map((item) => entryKey(Y, item)));
  for (const item of itemsOf(backupSeq)) {
    const key = entryKey(Y, item);
    if (key === null || keys.has(key)) continue;
    missing.push(String(item.get("id")) + (item.has("name") ? "(name=" + String(item.get("name")) + ")" : "") + (item.has("insert") ? "(insert)" : ""));
  }
  if (missing.length > 0) console.log("unrestored=" + missing.join(","));
}

function main(argv) {
  const [command, first, second, out, appDir] = argv;
  if (command === "apply" && out) {
    apply(read(first, "现有 patch"), read(second, "渲染结果"), out, appDir);
    return;
  }
  if (command === "remove" && out) {
    const backup = second && second !== "-" && fs.existsSync(second) ? read(second, "接入前的备份") : null;
    remove(read(first, "现有 patch"), backup, out, appDir);
    return;
  }
  throw new Bail(
    "用法: patch-merge.mjs apply <patch> <rendered> <out> <app-dir|-> | remove <patch> <backup|-> <out> <app-dir|->",
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  if (error instanceof Bail) die(error.message);
  // 兜底成一句话（2026-11-24 只读复审 #8）：yaml 库抛的异常（如固定键上带锚点、别处还有别名）此前带堆栈退出。
  const message = error && error.message ? String(error.message) : String(error);
  die("没做成，什么都没改——" + message + (/[Aa]lias/.test(message) ? "（固定键上带锚点/别名时安装器不处理，先手工去掉那个锚点再跑）" : ""));
}
