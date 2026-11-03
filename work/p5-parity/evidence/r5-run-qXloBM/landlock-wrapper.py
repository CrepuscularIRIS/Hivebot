import os,sys
a=sys.argv[3:]
cmd=a[a.index('--')+1:]
grants=[]
for p in ['/usr','/bin','/lib','/lib64','/etc','/dev']: 
 if os.path.exists(p): grants+=['--ro',p]
os.execv(sys.argv[1],[sys.argv[1]]+grants+['--rw','/tmp','--rw',sys.argv[2],'--']+cmd)
