import re
from pathlib import Path
root = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-18')
lines = (root / 'guard-connect.trace').read_text().splitlines()
main_pid = re.search(r'pid: (\d+)', (root / 'guard-e2e.log').read_text()).group(1)
assert any(line.startswith(main_pid + ' ') and 'e2e-dead-bus' in line and 'ENOENT' in line for line in lines)
user_bus = [line for line in lines if re.search(r'sun_path="(?:/run/user/\d+/bus|[^\"]*dbus-[^\"]*)"', line)]
assert not user_bus, user_bus
bus_lines = [line for line in lines if 'sun_path=' in line and ('bus' in line or 'dbus' in line)]
print('PASS: Electron main pid=' + main_pid + ' attempts dead session bus with ENOENT.')
print('PASS: traced process tree has no /run/user/<uid>/bus or dbus-* session socket connection.')
print('Observed system bus connection is Chromium platform initialization, not session notification bus; no claim of zero system DBus usage.')
print('\n'.join(bus_lines))
