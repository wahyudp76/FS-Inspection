import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
import { makeEnv, loadCode, post } from './mock.gs.mjs'
import { expandRecords } from '../src/lib/compress.js'
import fs from 'node:fs'

const env = makeEnv()
const ctx = loadCode(env)
const h = post(ctx, { action: 'history', payload: {} })
const records = expandRecords(h.records, h.kmap)
const seed = { records, syncedAt: new Date().toISOString() }
fs.writeFileSync(R('seed-cache.json'), JSON.stringify(seed))
console.log('seed:', records.length, 'record,', (JSON.stringify(seed).length / 1024).toFixed(0), 'KB')
console.log('contoh:', JSON.stringify(records[0]).slice(0, 240))
