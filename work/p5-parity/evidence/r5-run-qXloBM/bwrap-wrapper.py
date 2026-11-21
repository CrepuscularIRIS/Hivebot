import os,sys
a=sys.argv[2:]
i=a.index('--')
a[i:i]=['--tmpfs',sys.argv[1]]
os.execv('/usr/bin/bwrap',['bwrap']+a)
