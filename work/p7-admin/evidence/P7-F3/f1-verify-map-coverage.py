import pathlib,json,re,subprocess
E=pathlib.Path(__file__).parent; W=pathlib.Path('/tmp/bot-wt/P7-F3f1-verify'); S=E/'f1-verify-source'; SHA='de36bbc587d604c2672ede53c32d4554973082ec'
assert subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD'],text=True).strip()==SHA
text=subprocess.check_output(['git','-C',str(W),'diff','--unified=0','e5ff286',SHA,'--','app/sdk/src','app/ui/main'],text=True)
changed={};f=None;n=0
for row in text.splitlines():
 if row.startswith('+++ b/'):f=row[6:];changed[f]=set()
 elif row.startswith('@@'):n=int(re.search(r'\+(\d+)',row).group(1))
 elif row.startswith('+') and not row.startswith('+++'):changed[f].add(n);n+=1
 elif row.startswith(' '):n+=1
assert len(changed)==10

def metrics(vals):
 return {'covered':sum(v>0 for v in vals),'total':len(vals),'pct':round(sum(v>0 for v in vals)*100/len(vals),2) if vals else None}
def map_record(c,add):
 rows={};counts={}
 for label,m,v in [('statement','statementMap','s'),('branch','branchMap','b'),('function','fnMap','f')]:
  selected=[];values=[]
  for ident,entry in c[m].items():
   loc=entry if label=='statement' else entry['loc'];hits=add.intersection(range(loc['start']['line'],loc['end']['line']+1))
   if hits:
    count=c[v][ident];values.extend(count if isinstance(count,list) else [count]);selected.append({'id':ident,'map':entry,'changed_lines':sorted(hits),'count':count})
  rows[label]=selected;counts[label]=values
 lines={}
 for ident,loc in c['statementMap'].items():
  n=loc['start']['line'];lines[n]=max(lines.get(n,0),c['s'][ident])
 rows['line']=[{'line':n,'count':lines[n]} for n in sorted(add.intersection(lines))];counts['line']=[x['count'] for x in rows['line']]
 return {'changed_lines':sorted(add),'metrics':{k:metrics(v) for k,v in counts.items()},'changed_lines_without_statement_start':sorted(add-set(lines)),'maps':rows}

def collect(prefix,root):
 result={}
 for name in ['sdk-worker','sdk-child','ui']:
  path=E/(prefix+'coverage-'+name)/'coverage-final.json';data=json.loads(path.read_text())
  for absname,c in data.items():
   f=str(pathlib.Path(absname).relative_to(root))
   if f not in changed:continue
   if (f=='app/sdk/src/orchestration/main-channel.mjs')!=(name=='sdk-child'):continue
   assert f not in result,f
   # Check all official mapped source locations against the precise new source; not only selected spans.
   length=len((W/f).read_text().splitlines())
   for label in ['statementMap','branchMap','fnMap']:
    for v in c[label].values():
     loc=v if label=='statementMap' else v['loc'];assert 0<=loc['start']['line']<=loc['end']['line']<=length,(name,f,loc)
   result[f]=map_record(c,changed[f]);result[f]['provenance']=str(path)
 assert set(result)==set(changed),(set(changed)-set(result))
 return result

author=collect('f1-',pathlib.Path('/tmp/bot-wt/P7-F3'))
claimed=json.loads((E/'f1-coverage-diff-map.json').read_text());assert claimed['sha']==SHA and not claimed['dirty']
for f,record in author.items():assert record==claimed['files'][f],f
ours=collect('f1-verify-',S)
summary=['Author map: all ten complete records independently reconstructed from official JSON and fixed SHA diff; exact match.','No count merging between transformed worker and bare Loader source; main-channel child record only. Enclosing legacy spans retained.']
for f,r in ours.items():
 summary.append(f+' '+json.dumps(r['metrics']))
 # Shape must match author coordinates, regardless of runtime counts.
 for kind in ['statement','branch','function']:
  assert [(x['id'],x['map'],x['changed_lines']) for x in r['maps'][kind]]==[(x['id'],x['map'],x['changed_lines']) for x in author[f]['maps'][kind]],(f,kind)
failed=[f+':'+k for f,r in ours.items() for k,m in r['metrics'].items() if m['pct'] is not None and m['pct']<80]
summary.append('INDEPENDENT_CHANGED_GATE '+('FAIL '+str(failed) if failed else 'PASS (each applicable per-file S/B/F/L >=80%; zero denominator N.A.)'))
(E/'f1-verify-coverage-diff-map.json').write_text(json.dumps({'sha':SHA,'base':'e5ff286','files':ours,'failed':failed,'author_exact_reconstruction':True,'coordinate_shapes_match':True},indent=2)+'\n')
(E/'f1-verify-coverage-diff-summary.txt').write_text('\n'.join(summary)+'\n');print('\n'.join(summary))
raise SystemExit(bool(failed))
