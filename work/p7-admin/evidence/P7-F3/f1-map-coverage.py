import json,re,subprocess,pathlib
E=pathlib.Path(__file__).parent
S=pathlib.Path('/tmp/bot-wt/P7-F3')
diff=subprocess.check_output(['git','-C',str(S),'diff','--unified=0','e5ff286','--','app/sdk/src','app/ui/main'],text=True)
(E/'f1-production.diff').write_text(diff)
changed={};file=None;line=0
for row in diff.splitlines():
 if row.startswith('+++ b/'):file=row[6:];changed[file]=set()
 elif row.startswith('@@'):line=int(re.search(r'\+(\d+)',row).group(1))
 elif row.startswith('+') and not row.startswith('+++'):changed[file].add(line);line+=1
 elif row.startswith(' '):line+=1

def rng(loc):return set(range(loc['start']['line'],loc['end']['line']+1))
def metric(counts):return {'covered':sum(x>0 for x in counts),'total':len(counts),'pct':round(100*sum(x>0 for x in counts)/len(counts),2) if counts else None}
report={'sha':subprocess.check_output(['git','-C',str(S),'rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','-C',str(S),'status','--porcelain'])),'method':'Official coverage-final.json only. SDK main-channel selected from child-only official autoAttachSubprocess run, other SDK files from worker-only official run: never merge incompatible raw/transformed coordinates. No changed file omitted. Exact zero-context diff intersection including enclosing legacy spans, every branch arm; line counts official statement start maximum. Full maps and provenance retained.','files':{}}
summary=[];failed=False
for pkg in ['sdk','ui']:
 total={k:[] for k in ['statement','branch','function','line']}
 source=E/('f1-coverage-sdk-worker' if pkg=='sdk' else 'f1-coverage-ui')/'coverage-final.json'
 data=json.loads(source.read_text())
 for absfile,c in data.items():
  f=str(pathlib.Path(absfile).relative_to(S))
  provenance=str(source)
  if f=='app/sdk/src/orchestration/main-channel.mjs':
   provenance=str(E/'f1-coverage-sdk-child'/'coverage-final.json')
   c=json.loads(pathlib.Path(provenance).read_text())[absfile]
  add=changed[f];rows={};counts={}
  for label,mapkey,countkey in [('statement','statementMap','s'),('branch','branchMap','b'),('function','fnMap','f')]:
   selected=[];vals=[]
   for id,entry in c[mapkey].items():
    loc=entry if label=='statement' else entry['loc'];hits=rng(loc)&add
    if not hits:continue
    v=c[countkey][id];vals.extend(v if isinstance(v,list) else [v]);selected.append({'id':id,'map':entry,'changed_lines':sorted(hits),'count':v})
   rows[label]=selected;counts[label]=vals;total[label].extend(vals)
  lines={}
  for id,loc in c['statementMap'].items():
   n=loc['start']['line'];lines[n]=max(lines.get(n,0),c['s'][id])
  rows['line']=[{'line':n,'count':lines[n]} for n in sorted(add&lines.keys())];counts['line']=[v['count'] for v in rows['line']];total['line'].extend(counts['line'])
  metrics={k:metric(v) for k,v in counts.items()}
  failed |= any(v['pct'] is not None and v['pct']<80 for v in metrics.values())
  report['files'][f]={'provenance':provenance,'changed_lines':sorted(add),'metrics':metrics,'changed_lines_without_statement_start':sorted(add-lines.keys()),'maps':rows}
  summary.append(f+' '+json.dumps(metrics))
 summary.append(pkg+' changed-intersection aggregate '+json.dumps({k:metric(v) for k,v in total.items()}))
assert set(report['files'])==set(changed), (set(changed)-set(report['files']))
report['gate']='BLOCKED' if failed else 'thresholds met; independent verification required'
(E/'f1-coverage-diff-map.json').write_text(json.dumps(report,indent=2)+'\n')
(E/'f1-coverage-diff-summary.txt').write_text(report['method']+'\n'+'\n'.join(summary)+'\nGATE '+report['gate']+'\n')
print('\n'.join(summary));print('GATE',report['gate'])
raise SystemExit(1 if failed else 0)
