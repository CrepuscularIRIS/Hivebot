import hashlib
import json
import pathlib
import subprocess

E = pathlib.Path(__file__).parent
W = pathlib.Path('/tmp/bot-wt/P7-F3')
SHA = 'de36bbc587d604c2672ede53c32d4554973082ec'
original = json.loads((E / 'f1-coverage-diff-map.json').read_text())
assert original['sha'] == SHA
rows = {}
for rel, record in original['files'].items():
    fixed = subprocess.check_output(['git', '-C', str(W), 'show', SHA + ':' + rel])
    current = (W / rel).read_bytes()
    snapshot = (E / 'f2-source' / rel).read_bytes()
    assert fixed == current == snapshot, rel
    source = pathlib.Path(record['provenance'])
    assert source.exists()
    rows[rel] = {
        'sha256': hashlib.sha256(current).hexdigest(),
        'same_as_fixed_f1_and_f2_test_input': True,
        'official_json': str(source),
        'official_json_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'f1_changed_metrics_only_not_new_f2_collection': record['metrics'],
    }
assert len(rows) == 10
result = {'f1_sha': SHA, 'files': rows, 'scope': 'All ten production files unchanged. Reuse byte-identical f1 evidence only; no new production implementation or f2 coverage success claimed.'}
(E / 'f2-byte-reference.json').write_text(json.dumps(result, indent=2) + '\n')
print('10/10 production files byte-identical to fixed f1 and f2 tested input; f1 official JSON references preserved')
