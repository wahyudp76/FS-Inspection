import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
/* Server tiruan Apps Script Web App untuk uji end-to-end di browser. */
import http from 'node:http'
import { makeEnv, loadCode, post, rowCount } from './mock.gs.mjs'

const env = makeEnv()
const ctx = loadCode(env)
let submitCount = 0

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let json = {}
    try { json = JSON.parse(body || '{}') } catch {}
    const t0 = Date.now()
    if (json.action === 'submit') { submitCount++; env.state.modified += 5000 }
    let payload
    try { payload = post(ctx, json) } catch (e) { payload = { ok: false, error: String(e) } }
    const out = JSON.stringify(payload)
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'X-Rows': String(rowCount(env.sheet)), 'X-Handler-Ms': String(Date.now() - t0) })
    res.end(out)
  })
})
server.listen(8111, '0.0.0.0', () => console.log('mock Apps Script di :8111, baris=', rowCount(env.sheet)))
