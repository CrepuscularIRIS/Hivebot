import json,re,subprocess,pathlib
E=pathlib.Path(__file__).parent; S=E/'verify-source'
diff=subprocess.check_output(['git','-C','/tmp/bot-wt/P7-F3-verify','diff','--unified=0','e5ff286..4da62902','--','app/sdk/src','app/ui/main'],text=True)
(E/'verify-production.diff').write_text(diff)
changed={};file=None;line=0
for row in diff.splitlines():
 if row.startswith('+++ b/'):file=row[6:];changed[file]=set()
 elif row.startswith('@@'):line=int(re.search(r'\+(\d+)',row).group(1))
 elif row.startswith('+') and not row.startswith('+++'):changed[file].add(line);line+=1
 elif row.startswith(' '):line+=1

def rng(loc):return set(range(loc['start']['line'],loc['end']['line']+1))
def metric(counts):return {'covered':sum(x>0 for x in counts),'total':len(counts),'pct':round(100*sum(x>0 for x in counts)/len(counts),2) if counts else None}
report={'sha':'4da62902c7a9c26452eafc4e98cf40c6d6a6d452','method':'official V8 Istanbul coverage-final.json; exact zero-context diff added lines (replacement new side); select each statement/branch/function whose mapped source span intersects changed lines, count every branch arm; line coverage uses official statement start.line max(count). Enclosing legacy spans remain included, not stripped. Changed non-start lines listed separately; all maps retained. main-channel subprocess coverage not collected by this provider: zero means unproven, not an observed failed path.','files':{}}
summary=[]
for pkg in ['sdk','ui']:
 total={k:[] for k in ['statement','branch','function','line']}
 data=json.loads((E/('verify-coverage-'+pkg)/'coverage-final.json').read_text())
 for absfile,c in data.items():
  f=str(pathlib.Path(absfile).relative_to(S));add=changed[f];rows={};counts={}
  for label,mapkey,countkey in [('statement','statementMap','s'),('branch','branchMap','b'),('function','fnMap','f')]:
   selected=[];vals=[]
   for id,entry in c[mapkey].items():
    loc=entry if label=='statement' else entry['loc']
    hits=rng(loc)&add
    if not hits:continue
    v=c[countkey][id];vals.extend(v if isinstance(v,list) else [v]);selected.append({'id':id,'map':entry,'changed_lines':sorted(hits),'count':v})
   rows[label]=selected;counts[label]=vals;total[label].extend(vals)
  lines={}
  for id,loc in c['statementMap'].items():
   n=loc['start']['line'];lines[n]=max(lines.get(n,0),c['s'][id])
  rows['line']=[{'line':n,'count':lines[n]} for n in sorted(add&lines.keys())];counts['line']=[v['count'] for v in rows['line']];total['line'].extend(counts['line'])
  metrics={k:metric(v) for k,v in counts.items()}
  report['files'][f]={'changed_lines':sorted(add),'metrics':metrics,'changed_lines_without_statement_start':sorted(add-lines.keys()),'maps':rows}
  summary.append(f+' '+json.dumps(metrics))
 summary.append(pkg+' changed-intersection aggregate '+json.dumps({k:metric(v) for k,v in total.items()}))
(E/'verify-coverage-diff-map.json').write_text(json.dumps(report,indent=2)+'\n')
(E/'verify-coverage-diff-summary.txt').write_text(report['method']+'\n'+'\n'.join(summary)+'\n')
print('\n'.join(summary))
