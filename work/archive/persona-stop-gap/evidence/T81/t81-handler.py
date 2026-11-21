import re

for path, name in [
    ('/tmp/t78-asar/dist/local-exec-daemon/main.cjs', 'daemon'),
    ('/tmp/t78-asar/dist/node-agent-coordinator/main.cjs', 'coordinator'),
]:
    data = open(path, encoding='utf-8', errors='ignore').read()
    # 找 handler 风格：interruptGrokBotAgentRun 后面不是 name: 定义（服务表），而是实现
    for m in re.finditer(r'interruptGrokBotAgentRun\s*\(', data):
        i = m.start()
        seg = data[i:i+700]
        if 'name:' in seg[:120]:
            continue
        print('==', name, 'at', i)
        print(seg.replace('\n', ' ')[:700])
        print('---')
    # 也找 'async interruptAgentRun' 一类
    for m in re.finditer(r'async\s+interrupt[A-Za-z]*\s*\(', data):
        i = m.start()
        print('== async def', name, 'at', i)
        print(data[i:i+600].replace('\n', ' '))
        print('---')
