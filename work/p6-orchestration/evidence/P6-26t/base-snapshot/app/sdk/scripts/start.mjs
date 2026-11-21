import('../src/start.ts').then((m) => m.main().then((code) => process.exit(code)), (e) => { console.error(e); process.exit(1) })
