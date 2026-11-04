// P5-55 · app 列 vs ref 列（0.78.1）差异：u1-diff 的 app-vs-ref 行 + 处置分类（disposition.mjs）。
// run.mjs 引用 diffAppRef()；单独跑：node appref.mjs <EVID_DIR>（读 styles/styles.json 的 ref + styles/app.json）。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PARTS, STYLE_PROPS } from './views.mjs'
import { dispose } from './disposition.mjs'

/** styles = run.mjs 的 { view: { ref, ours } }；app = app.json 的 { view: { part: style|null } } */
export function diffAppRef(styles, app) {
  const rows = []
  for (const [view, bySide] of Object.entries(styles)) {
    for (const p of PARTS) {
      const ref = bySide.ref?.[p.part] ?? null
      const a = app[view]?.[p.part] ?? null
      if (ref == null && a == null) continue
      if (ref == null || a == null) {
        rows.push({ view, part: p.part, prop: '(element)', ref: ref == null ? 'MISSING' : 'present', app: a == null ? 'MISSING' : 'present' })
        continue
      }
      for (const prop of STYLE_PROPS) {
        const x = (ref[prop] || '').trim(), y = (a[prop] || '').trim()
        if (x !== y) rows.push({ view, part: p.part, prop, ref: x, app: y })
      }
    }
  }
  return rows.map((r) => ({ ...r, ...dispose(r) }))
}

export async function writeAppRef(evid) {
  const styles = JSON.parse(await fs.readFile(path.join(evid, 'styles', 'styles.json'), 'utf8'))
  const app = JSON.parse(await fs.readFile(path.join(evid, 'styles', 'app.json'), 'utf8'))
  const rows = diffAppRef(styles, app)
  const head = 'view\tpart\tproperty\tref(0.78.1)\tapp\tdisposition\treason'
  const tsv = [head, ...rows.map((r) => [r.view, r.part, r.prop, r.ref, r.app, r.disposition, r.reason].map((v) => String(v).replace(/\t|\n/g, ' ')).join('\t'))].join('\n')
  await fs.writeFile(path.join(evid, 'u1-appref.tsv'), tsv)
  const count = {}
  for (const r of rows) count[r.disposition] = (count[r.disposition] ?? 0) + 1
  return { rows, count }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { rows, count } = await writeAppRef(process.argv[2])
  console.log(JSON.stringify(count))
  for (const r of rows.filter((x) => x.disposition === 'open')) console.log([r.view, r.part, r.prop, r.ref, r.app].join(' | '))
}
