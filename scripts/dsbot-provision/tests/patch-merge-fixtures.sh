#!/usr/bin/env bash
# patch-merge.mjs 的夹具测试：不变量 = 用户原文件 → apply → remove 后逐字节还原。
# 用法：DSBOT_APP_DIR=<DS-Bot 的 resources/app 目录> bash scripts/dsbot-provision/tests/patch-merge-fixtures.sh
#   条目级合并用的是 DS-Bot 自带的 yaml 库，所以要把它的 resources/app 目录给进来（AppImage 用
#   --appimage-extract 解包后的 squashfs-root/resources/app）。node 用 PATH 上的即可；全部跑完约 10 秒。
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=$(cd "$HERE/.." && pwd)
M=$DIR/patch-merge.mjs
SIM=$HERE/dsbot-editor-sim.mjs
TEMPLATE=$DIR/cordis.patch.template.yml
APP=${DSBOT_APP_DIR:-${1:-}}
NODE=${NODE_BIN:-$(command -v node)}
[ -n "$NODE" ] || { echo "PATH 上没有 node" >&2; exit 2; }
[ -n "$APP" ] && [ -f "$APP/node_modules/yaml/package.json" ] || { echo "需要 DS-Bot 的 resources/app 目录（取它自带的 yaml 库）：DSBOT_APP_DIR=<目录> bash $0" >&2; exit 2; }
W=$(mktemp -d); F=$W/f; OUT=$W/out; mkdir -p "$F" "$OUT"
[ -n "$W" ] && trap 'rm -rf -- "$W"' EXIT
# R = 安装器的渲染结果：和 provision.sh 同一套 sed 从模板生成（路径用中性占位值）
esc() { printf '%s' "$1" | sed -e 's/[&/]/\\&/g'; }
sed -e "s/__STATE_DIR__/$(esc /home/you/.ds-bot/superagent-state)/g" -e "s/__DATA_DIR__/$(esc /home/you)/g" -e "s/__BASE_URL__/$(esc http://127.0.0.1:4001/v1)/g" -e "s/__MODEL_ID__/$(esc glm-5.3-flash)/g" "$TEMPLATE" > "$F/R"
pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass+1)); }
bad() { echo "FAIL $1"; fail=$((fail+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got=[$2] want=[$3])"; fi; }
nonzero() { if [ "$1" != 0 ]; then echo x; else echo zero; fi; }
absent() { if [ "$1" != 0 ]; then echo x; else echo present; fi; }
# run <name> <cmd> <a> <b> <appdir>
run() {
  "$NODE" "$M" "$2" "$3" "$4" "$OUT/$1.out" "$5" >"$OUT/$1.stdout" 2>"$OUT/$1.stderr"; echo $?
}
field() { tr ' ' '\n' < "$OUT/$1.stdout" | sed -n "s/^$2=//p"; }
cat > "$F/U0" <<'EOF'
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
EOF
head -n 1 "$F/R" | grep -q '^# hivebot-provision'; check "R 是旧版渲染结果（首行标记）" "$?" 0
cat > "$F/U1" <<'EOF'
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
- id: dsh-plugin-manager
  disabled: true
- id: llm-pi-ai
  config:
    providers:
      deepseek:
        apiKey: user-key-placeholder
- id: agent-default-model
  config:
    provider: deepseek
    model: deepseek-chat
EOF
cp "$F/U1" "$F/U2"; "$NODE" "$SIM" "$F/U2" "$APP" dsh-plugin-manager '{"someSetting":true}'
cat > "$F/U3" <<'EOF'
- id: dsh-plugin-manager
  disabled: true
- id: some-plugin
  config:
    token: !!js process.env.SOME_TOKEN
EOF
cat > "$F/U6" <<'EOF'
- id: llm-pi-ai
  name: other-instance
  config:
    foo: 1
EOF
printf -- '- id: dsh-superagent\n  config:\n- id: agent-default-model\n' > "$F/U7"
printf '# hivebot-provision x\n' > "$F/U8"
printf -- '- id: [unclosed\n' > "$F/U4"
printf 'id: not-a-sequence\n' > "$F/U5"

echo "--- T1 空骨架 + 渲染结果 = 渲染结果"
rc=$(run t1 apply "$F/U0" "$F/R" "$APP"); check "T1 rc" "$rc" 0
cmp -s "$OUT/t1.out" "$F/R"; check "T1 out == R" "$?" 0
check "T1 state" "$(field t1 state)" skeleton
echo "--- T2 已接入的 R 再 apply = 不变"
rc=$(run t2 apply "$F/R" "$F/R" "$APP"); check "T2 rc" "$rc" 0
cmp -s "$OUT/t2.out" "$F/R"; check "T2 out == R（逐字节）" "$?" 0
check "T2 state/entries" "$(field t2 state) $(field t2 entries)" "merged 3"
echo "--- T3 用户文件 U1 并入"
rc=$(run t3 apply "$F/U1" "$F/R" "$APP"); check "T3 rc" "$rc" 0
check "T3 state/entries" "$(field t3 state) $(field t3 entries)" "merged 4"
for pat in 'apiKey: user-key-placeholder' 'deepseek:' 'disabled: true' 'provider: litellm' 'model: glm-5.3-flash' 'litellm:' 'stateDir:'; do
  grep -qF -- "$pat" "$OUT/t3.out"; check "T3 keeps $pat" "$?" 0
done
head -n 1 "$OUT/t3.out" | grep -q '^# hivebot-provision'; check "T3 首行是标记" "$?" 0
check "T3 DS-Bot 的三行说明还在" "$(grep -cE '^# (Your patch layer|a top-level YAML|overrides, disables)' "$OUT/t3.out")" 3
echo "--- T3b 幂等"
rc=$(run t3b apply "$OUT/t3.out" "$F/R" "$APP"); check "T3b rc" "$rc" 0
cmp -s "$OUT/t3b.out" "$OUT/t3.out"; check "T3b 再并入一次逐字节不变" "$?" 0
echo "--- T4 apply 后 remove = 用户原文件逐字节还原"
rc=$(run t4 remove "$OUT/t3.out" "$F/U1" "$APP"); check "T4 rc" "$rc" 0
cmp -s "$OUT/t4.out" "$F/U1"; check "T4 out == U1（逐字节）" "$?" 0
check "T4 fields" "$(field t4 state) removed=$(field t4 removed) restored=$(field t4 restored) entries=$(field t4 entries)" "kept removed=3 restored=2 entries=3"
echo "--- T5 空骨架接入后摘除 = 空（shell 会整份还原备份）"
rc=$(run t5 remove "$F/R" "$F/U0" "$APP"); check "T5 rc" "$rc" 0
check "T5 fields" "$(field t5 state) removed=$(field t5 removed) restored=$(field t5 restored) entries=$(field t5 entries)" "empty removed=3 restored=0 entries=0"
echo "--- T6 没有备份摘除 = 干净的空骨架"
rc=$(run t6 remove "$F/R" - "$APP"); check "T6 rc" "$rc" 0
check "T6 out" "$(cat "$OUT/t6.out")" "[]"
echo "--- T7 !!js 条目往返"
rc=$(run t7 apply "$F/U3" "$F/R" "$APP"); check "T7 apply rc" "$rc" 0
grep -q '!!js process.env.SOME_TOKEN' "$OUT/t7.out"; check "T7 !!js 保真" "$?" 0
rc=$(run t7r remove "$OUT/t7.out" "$F/U3" "$APP"); check "T7 remove rc" "$rc" 0
cmp -s "$OUT/t7r.out" "$F/U3"; check "T7 remove out == U3（逐字节）" "$?" 0
echo "--- T8 坏文件：不动、不写 out"
rc=$(run t8 apply "$F/U4" "$F/R" "$APP"); check "T8 坏 YAML rc 非 0" "$(nonzero $rc)" x
[ ! -e "$OUT/t8.out" ]; check "T8 没写 out" "$?" 0
rc=$(run t8b apply "$F/U5" "$F/R" "$APP"); check "T8b 顶层非数组 rc 非 0" "$(nonzero $rc)" x
echo "T8b stderr: $(head -n 1 "$OUT/t8b.stderr" | cut -c1-90)"
[ ! -e "$OUT/t8b.out" ]; check "T8b 没写 out" "$?" 0
echo "--- T9 没有 yaml 库（- ）：只认空骨架"
rc=$(run t9 apply "$F/U0" "$F/R" -); check "T9 空骨架 rc" "$rc" 0
cmp -s "$OUT/t9.out" "$F/R"; check "T9 out == R" "$?" 0
rc=$(run t9b apply "$F/U1" "$F/R" -); check "T9b 用户文件 rc=3" "$rc" 3
[ ! -e "$OUT/t9b.out" ]; check "T9b 没写 out" "$?" 0
rc=$(run t9c remove "$F/R" - -); check "T9c remove rc=3" "$rc" 3
[ ! -e "$OUT/t9c.out" ]; check "T9c 没写 out" "$?" 0
echo "--- T10 DS-Bot 编辑器重写过的文件：它的改动在 remove 之后仍在"
rc=$(run t10 apply "$F/U2" "$F/R" "$APP"); check "T10 apply rc" "$rc" 0
cp "$OUT/t10.out" "$F/A2"; "$NODE" "$SIM" "$F/A2" "$APP" dsh-plugin-manager '{"someSetting":false,"addedInGui":1}'
rc=$(run t10r remove "$F/A2" "$F/U1" "$APP"); check "T10 remove rc" "$rc" 0
grep -qF 'addedInGui: 1' "$OUT/t10r.out"; check "T10 GUI 写入的设置还在" "$?" 0
grep -qE 'hivebot-provision|litellm|stateDir' "$OUT/t10r.out"; check "T10 安装器的痕迹清干净" "$(absent $?)" x
grep -qF 'user-key-placeholder' "$OUT/t10r.out"; check "T10 用户自己的 provider 按备份放回" "$?" 0
echo "--- T11 用户在界面里改过默认模型（落在安装器条目上）：摘除时整条拿掉"
rc=$(run t11 apply "$F/U1" "$F/R" "$APP"); check "T11 apply rc" "$rc" 0
cp "$OUT/t11.out" "$F/A11"; "$NODE" "$SIM" "$F/A11" "$APP" agent-default-model '{"provider":"litellm","model":"other-model"}'
rc=$(run t11r remove "$F/A11" "$F/U1" "$APP"); check "T11 remove rc" "$rc" 0
grep -q 'other-model' "$OUT/t11r.out"; check "T11 安装器条目上改过的值不留" "$(absent $?)" x
grep -qF 'model: deepseek-chat' "$OUT/t11r.out"; check "T11 用户原来的默认模型放回" "$?" 0
echo "--- T12 带 name 的同 id 条目不算安装器的"
rc=$(run t12 apply "$F/U6" "$F/R" "$APP"); check "T12 apply rc" "$rc" 0
check "T12 两条 llm-pi-ai" "$(grep -c '^- id: llm-pi-ai' "$OUT/t12.out")" 2
rc=$(run t12r remove "$OUT/t12.out" "$F/U6" "$APP"); check "T12 remove rc" "$rc" 0
cmp -s "$OUT/t12r.out" "$F/U6"; check "T12 out == U6（逐字节）" "$?" 0
echo "--- T13 条目里 config 是空的"
rc=$(run t13 apply "$F/U7" "$F/R" "$APP"); check "T13 apply rc" "$rc" 0
check "T13 条目数（空的壳不算）" "$(field t13 entries)" 3
grep -qF 'stateDir:' "$OUT/t13.out"; check "T13 stateDir 写进去了" "$?" 0
rc=$(run t13r remove "$OUT/t13.out" - "$APP"); check "T13 remove rc" "$rc" 0
check "T13 out" "$(cat "$OUT/t13r.out")" "[]"
echo "--- T14 只有标记行"
rc=$(run t14 remove "$F/U8" - "$APP"); check "T14 rc" "$rc" 0
check "T14 fields" "$(field t14 state)" absent
check "T14 out（标记去掉后的空骨架）" "$(cat "$OUT/t14.out")" "[]"
check "T14 标记行数为 0" "$(grep -c 'hivebot-provision' "$OUT/t14.out")" 0
echo "--- T15 文件缺失"
rc=$(run t15 apply "$F/nope" "$F/R" "$APP"); check "T15 rc 非 0" "$(nonzero $rc)" x
echo "--- T16 用户文件第一条就是要放回的条目，且被 DS-Bot 重写过（说明块挂在它上面）"
cat > "$F/U16" <<'EOF'
# Your patch layer for this dsh profile, applied after every bundle layer:
- id: agent-default-model
  config:
    provider: deepseek
    model: deepseek-chat
EOF
rc=$(run t16 apply "$F/U16" "$F/R" "$APP"); check "T16 apply rc" "$rc" 0
cp "$OUT/t16.out" "$F/A16"; "$NODE" "$SIM" "$F/A16" "$APP" agent-default-model '{"provider":"litellm","model":"other-model"}'
head -n 1 "$F/A16" | grep -q '^# hivebot-provision'; check "T16 重写后标记仍在第一行" "$?" 0
rc=$(run t16r remove "$F/A16" "$F/U16" "$APP"); check "T16 remove rc" "$rc" 0
cmp -s "$OUT/t16r.out" "$F/U16"; check "T16 out == U16（逐字节）" "$?" 0
echo "--- T17 标记行的写法"
head -n 1 "$OUT/t3.out" | grep -c '^# hivebot-provision —— '; check "T17 合并结果首行 = 「# hivebot-provision —— …」" "$(head -n 1 "$OUT/t3.out" | grep -c '^# hivebot-provision —— ')" 1
grep -c '本文件由 scripts/dsbot-provision/provision.sh 渲染' "$OUT/t3.out"; check "T17 整份采用用的十三行文件头没有跟到用户文件里" "$(grep -c '本文件由 scripts/dsbot-provision/provision.sh 渲染' "$OUT/t3.out")" 0
grep -c 'SuperAgent 静态配置只在此层' "$OUT/t3.out"; check "T17 条目自己的说明照带" "$(grep -c 'SuperAgent 静态配置只在此层' "$OUT/t3.out")" 1
echo "--- T18 用户文件头与第一条之间空一行（说明块挂在集合上）"
printf '# my notes\n\n- id: some-plugin\n  config:\n    a: 1\n' > "$F/U18"
rc=$(run t18 apply "$F/U18" "$F/R" "$APP"); check "T18 apply rc" "$rc" 0
rc=$(run t18r remove "$OUT/t18.out" "$F/U18" "$APP"); check "T18 remove rc" "$rc" 0
cmp -s "$OUT/t18r.out" "$F/U18"; check "T18 out == U18（逐字节）" "$?" 0
echo "--- T19 没有 id 的新条目追加后不带渲染结果的文件头"
grep -c '^# hivebot-provision' "$OUT/t16.out"; check "T16/19 合并结果里标记行只有 1 行" "$(grep -c '^# hivebot-provision' "$OUT/t16.out")" 1
echo "--- T20 接入后在安装器那三条里改过别的键：撤销时这些改动照留，安装器的键按备份放回"
cat > "$F/U20" <<'EOF'
- id: agent-default-model
  config:
    provider: deepseek
    model: deepseek-chat
- id: llm-pi-ai
  config:
    providers:
      deepseek:
        apiKey: user-key-placeholder
EOF
cat > "$F/A20" <<'EOF'
# hivebot-provision —— test
- id: agent-default-model
  config:
    provider: litellm
    model: glm-5.3-flash
    temperature: 0.3
- id: llm-pi-ai
  config:
    providers:
      deepseek:
        apiKey: user-key-placeholder-rotated
      litellm:
        displayName: my gateway
    extra: 1
  disabled: true
- id: dsh-superagent
  config:
    stateDir: /home/you/.ds-bot/superagent-state
    dataDir: /home/you
EOF
rc=$(run t20r remove "$F/A20" "$F/U20" "$APP"); check "T20 remove rc" "$rc" 0
for pat in 'temperature: 0.3' 'apiKey: user-key-placeholder-rotated' 'extra: 1' 'disabled: true' 'provider: deepseek' 'model: deepseek-chat'; do
  grep -qF -- "$pat" "$OUT/t20r.out"; check "T20 keeps $pat" "$?" 0
done
grep -qE 'litellm|my gateway|glm-5.3-flash|stateDir|dataDir|hivebot-provision' "$OUT/t20r.out"; check "T20 安装器的键摘干净" "$(absent $?)" x
check "T20 fields" "$(field t20r state) removed=$(field t20r removed) restored=$(field t20r restored) entries=$(field t20r entries)" "kept removed=3 restored=2 entries=2"
check "T20 没有 unrestored 行" "$(sed -n 's/^unrestored=//p' "$OUT/t20r.stdout")" ""
echo "--- T21 旧版安装器接入过的家（现有文件 = 旧的整份渲染结果，备份 = 接入前原件、多一条）：没放回的条目和键要报出来"
cp "$F/U1" "$F/B21"
rc=$(run t21 remove "$F/R" "$F/B21" "$APP"); check "T21 remove rc" "$rc" 0
check "T21 unrestored 行" "$(sed -n 's/^unrestored=//p' "$OUT/t21.stdout")" "llm-pi-ai(config.providers.deepseek),dsh-plugin-manager"
check "T21 statedir 行" "$(sed -n 's/^statedir=//p' "$OUT/t21.stdout")" "/home/you/.ds-bot/superagent-state"
for pat in 'provider: deepseek' 'model: deepseek-chat'; do
  grep -qF -- "$pat" "$OUT/t21.out"; check "T21 放回 $pat" "$?" 0
done
grep -qE 'dsh-plugin-manager|user-key-placeholder|hivebot-provision|litellm' "$OUT/t21.out"; check "T21 没自动放回的东西不在结果里（由 uninstall.sh 保留备份并提示）" "$(absent $?)" x
echo "--- T22 固定键上带锚点、别处有别名：一句话报错、不写 out"
cat > "$F/U22" <<'EOF'
- id: agent-default-model
  config:
    provider: &dp deepseek
    model: deepseek-chat
- id: other
  config:
    provider: *dp
EOF
rc=$(run t22 apply "$F/U22" "$F/R" "$APP"); check "T22 apply rc 非 0" "$(nonzero $rc)" x
[ ! -e "$OUT/t22.out" ]; check "T22 没写 out" "$?" 0
check "T22 stderr 只有一行、以 patch-merge: 开头" "$(wc -l < "$OUT/t22.stderr") $(head -c 12 "$OUT/t22.stderr")" "1 patch-merge:"
echo "--- T23 同一个 id 出现两次：拒改并说明"
printf -- '- id: agent-default-model\n  config:\n    provider: deepseek\n- id: agent-default-model\n  config:\n    model: deepseek-chat\n' > "$F/U23"
rc=$(run t23 apply "$F/U23" "$F/R" "$APP"); check "T23 apply rc 非 0" "$(nonzero $rc)" x
[ ! -e "$OUT/t23.out" ]; check "T23 没写 out" "$?" 0
grep -q '出现了 2 次' "$OUT/t23.stderr"; check "T23 报错说出现两次" "$?" 0
echo "--- T24 多文档 / config 不是映射：不动、不写 out"
printf -- '---\n- id: a\n---\n- id: b\n' > "$F/U24"
printf -- '- id: agent-default-model\n  config: oops\n' > "$F/U25"
rc=$(run t24 apply "$F/U24" "$F/R" "$APP"); check "T24 多文档 apply rc 非 0" "$(nonzero $rc)" x
[ ! -e "$OUT/t24.out" ]; check "T24 没写 out" "$?" 0
rc=$(run t25 apply "$F/U25" "$F/R" "$APP"); check "T25 config 不是映射 rc 非 0" "$(nonzero $rc)" x
[ ! -e "$OUT/t25.out" ]; check "T25 没写 out" "$?" 0
echo "--- T26 --purge-state 用的 stateDir：按 id 从条目里读，行尾注释和空格不碍事"
sed -e 's|^    stateDir: .*|    stateDir: /home/you/.ds-bot/sa state   # 我的状态目录|' "$F/R" > "$F/R26"
rc=$(run t26 remove "$F/R26" - "$APP"); check "T26 rc" "$rc" 0
check "T26 statedir" "$(sed -n 's/^statedir=//p' "$OUT/t26.stdout")" "/home/you/.ds-bot/sa state"
echo "--- T27 落盘权限 0600（文件里有你自己 provider 的 key）"
check "T27 apply 输出权限" "$(stat -c %a "$OUT/t3.out")" 600
check "T27 remove 输出权限" "$(stat -c %a "$OUT/t4.out")" 600
echo "=== pass=$pass fail=$fail"
echo "--- T3 output:"; awk '{print substr($0,1,70)}' "$OUT/t3.out"
echo "--- stderr files:"; for f in "$OUT"/*.stderr; do [ -s "$f" ] && echo "$f: $(head -n 1 "$f" | cut -c1-100)"; done
[ "$fail" = 0 ]
