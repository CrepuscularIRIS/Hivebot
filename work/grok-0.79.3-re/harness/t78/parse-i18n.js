const fs = require('fs');
const src = fs.readFileSync('/tmp/t78-asar/dist/renderer/assets/index.eager-common-DbK3Oi_r.js', 'utf8');
const i = src.indexOf('JSON.parse(`');
const start = src.indexOf('`', i);
const end = src.indexOf('`', start + 1);
const raw = src.slice(start, end + 1); // includes backticks
const table = JSON.parse(eval(raw)); // eval the template literal exactly as JS would
const out = {};
for (const [k, v] of Object.entries(table)) {
  const flat = (x) => Array.isArray(x) ? x.filter(s => typeof s === 'string').join(' ') : (typeof x === 'string' ? x : '');
  out[k] = flat(v);
}
fs.writeFileSync('t78-i18n-en-flat.json', JSON.stringify(out));
console.log('entries:', Object.keys(out).length);
