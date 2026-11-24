// 模拟 DS-Bot 设置编辑器（@deepseek-ai/dsh-config-editor）的一次写入：同一套 parseDocument / setIn / String(document)
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(process.argv[3] + "/package.json");
const Y = require("yaml");
const OPTS = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
const before = fs.readFileSync(process.argv[2], "utf8");
const document = Y.parseDocument(before, OPTS);
if (document.errors[0] !== void 0) throw document.errors[0];
if (!Y.isSeq(document.contents)) throw new Error("Profile patch must be a YAML sequence");
document.contents.flow = false;
const id = process.argv[4];
const next = JSON.parse(process.argv[5]);
const index = document.contents.items.findLastIndex((item, i) => Y.isMap(item) && document.getIn([i, "id"]) === id && !item.has("insert") && (!item.has("name") || document.getIn([i, "name"]) === undefined));
if (index < 0) document.add(document.createNode({ id, config: next }));
else document.setIn([index, "config"], document.createNode(next));
Y.visit(document, { Map(_key, node) {
  if (node.items.length !== 1 || typeof node.get("__jsExpr") !== "string") return;
  const expression = new Y.Scalar(node.get("__jsExpr"));
  expression.tag = "tag:yaml.org,2002:js";
  return expression;
} });
fs.writeFileSync(process.argv[2], String(document), { mode: 0o600 });
