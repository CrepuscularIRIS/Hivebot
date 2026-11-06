import hashlib
import io
import pathlib
import subprocess
import tarfile

E = pathlib.Path(__file__).parent
W = pathlib.Path('/tmp/bot-wt/P7-F3')
S = E / 'f2-source'
SHA = 'de36bbc587d604c2672ede53c32d4554973082ec'
assert subprocess.check_output(['git', '-C', str(W), 'rev-parse', 'HEAD'], text=True).strip() == SHA
assert not S.exists()
S.mkdir()
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git', '-C', str(W), 'archive', SHA, 'app/sdk', 'app/ui']))) as archive:
    archive.extractall(S, filter='data')
test = pathlib.Path('app/sdk/tests/unit/p7-host-recovery.test.ts')
(S / test).write_bytes((W / test).read_bytes())
rows = []
for p in sorted(S.rglob('*')):
    if p.is_file():
        rel = p.relative_to(S)
        assert p.read_bytes() == (W / rel).read_bytes()
        rows.append(hashlib.sha256(p.read_bytes()).hexdigest() + ' ' + str(rel))
(E / 'f2-source-hashes.txt').write_text(SHA + '\n' + '\n'.join(rows) + '\n')
for pkg in ['sdk', 'ui']:
    target = S / 'app' / pkg / 'node_modules'
    target.mkdir()
    for child in (W / 'app' / pkg / 'node_modules').iterdir():
        if child.name not in {'.vite', '.cache'}:
            (target / child.name).symlink_to(child, target_is_directory=child.is_dir())
text = (E / 'f1-sdk.config.mjs').read_text().replace(str(W), str(S)).replace('f1-cache', 'f2-cache').replace('f1-coverage', 'f2-coverage')
(E / 'f2-sdk.config.mjs').write_text(text)
print('Prepared', len(rows), 'byte-matched files and top-level dependency links excluding .vite/.cache')
