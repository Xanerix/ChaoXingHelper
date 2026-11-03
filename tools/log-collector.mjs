/**
 * 本地日志收集器：dev 模式下脚本把面板日志 POST 过来，逐条落盘成 logs/run.jsonl。
 * 只监听 127.0.0.1，纯开发用途。
 */
import { createServer } from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 17650
const LOG_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../logs/run.jsonl')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

mkdirSync(dirname(LOG_FILE), { recursive: true })
// 分隔标记，读日志时从最后一个 session 往下看就是这一轮
appendFileSync(LOG_FILE, `${JSON.stringify({ marker: 'session', time: new Date().toISOString() })}\n`)

createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(req.method === 'OPTIONS' ? 204 : 200, CORS)
    res.end()
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    // 来源是 JSON.stringify，裸换行已被转义，直接追加不会破坏 jsonl 的一行一条
    appendFileSync(LOG_FILE, `${body.trim()}\n`)
    res.writeHead(204, CORS)
    res.end()
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`log collector :${PORT} -> ${LOG_FILE}`)
})
