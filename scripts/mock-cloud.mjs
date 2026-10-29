// 模擬雲端伺服器：讓兩個瀏覽器共用同一個「雲端」（E2E 測試與開發用）
// 用法：npm run mock-cloud（預設 http://localhost:8787）
// 需要 Node 22.6+（直接載入 TypeScript 檔）
import { createServer } from 'node:http'
import { MockCloud } from '../src/sync/mockCloud.ts'

const port = Number(process.env.PORT || 8787)
const cloud = new MockCloud()

const send = (res, code, body) => {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : {}
  try {
    switch (req.url) {
      case '/push':
        cloud.push(body.user, body.table, body.rows)
        return send(res, 200, { ok: true })
      case '/pull':
        return send(res, 200, cloud.pull(body.user, body.table, body.cursor, body.limit))
      case '/has':
        return send(res, 200, { hasData: cloud.hasData(body.user) })
      case '/set-password':
        cloud.setPassword(body.user, body.password)
        return send(res, 200, { ok: true })
      case '/check-password':
        return send(res, 200, { ok: cloud.checkPassword(body.user, body.password) })
      case '/reset':
        cloud.reset()
        return send(res, 200, { ok: true })
      case '/health':
        return send(res, 200, { ok: true })
      default:
        return send(res, 404, { error: 'not found' })
    }
  } catch (e) {
    return send(res, 500, { error: String(e) })
  }
}).listen(port, () => console.log(`模擬雲端已啟動：http://localhost:${port}`))
