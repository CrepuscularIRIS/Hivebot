"""Rebuild byte-identical disposable inputs under this evidence directory; no install."""
import pathlib, subprocess, tarfile, io, hashlib
E=pathlib.Path(__file__).parent; S=E/'verify-source'; SHA='4da62902c7a9c26452eafc4e98cf40c6d6a6d452'; W='/tmp/bot-wt/P7-F3-verify'
assert subprocess.check_output(['git','-C',W,'rev-parse','HEAD'],text=True).strip()==SHA
assert not S.exists(), 'Do not overwrite an existing input tree'
S.mkdir()
data=subprocess.check_output(['git','-C',W,'archive',SHA,'app/sdk','app/ui'])
with tarfile.open(fileobj=io.BytesIO(data)) as t:t.extractall(S,filter='data')
expected={row.split(' ',1)[0]:row.rsplit(' ',1)[1] for row in (E/'verify-source-hashes.txt').read_text().splitlines()[1:]}
for rel,digest in expected.items():assert hashlib.sha256((S/rel).read_bytes()).hexdigest()==digest,rel
for pkg in ['sdk','ui']:
 target=S/'app'/pkg/'node_modules'; target.mkdir()
 for child in (pathlib.Path('/tmp/bot-wt/P7-F3/app')/pkg/'node_modules').iterdir():
  if child.name in {'.vite','.cache'}:continue
  (target/child.name).symlink_to(child,target_is_directory=child.is_dir())
for name in ['verify-home','verify-tmp']:(E/name).mkdir(exist_ok=True)
print('Prepared',len(expected),'SHA-matched files. Reuse installed dependencies read-only; per-package cache directories stay in evidence.')
