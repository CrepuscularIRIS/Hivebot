import re

data = open('/tmp/t78-asar/dist/renderer/assets/index.eager-app-iGTgHP_Q.js', encoding='utf-8', errors='ignore').read()
# 聊天流 entry 的 turn 状态字段：搜 entry 类型定义与 status 字段
for kw in ['turnStatus', 'agentRunStatus', 'runStatus', 'turn.status', 'status===`stopped`', 'status===`interrupted`', '`interrupted`']:
    hits = list(re.finditer(re.escape(kw), data))
    print(kw, len(hits))

print()
# interrupted 字面量上下文
for m in list(re.finditer(r'`interrupted`', data))[:8]:
    i = m.start()
    print(repr(data[i-150:i+150].replace('\n', ' ')))
    print('---')
