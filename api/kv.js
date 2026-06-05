import { rateLimit, clientIp } from '../lib/rateLimit.js'

const KV_URL   = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

// Wrap an Upstash REST command or pipeline call
async function upstash(cmds) {
  const isBatch = Array.isArray(cmds[0])
  const r = await fetch(`${KV_URL}${isBatch ? '/pipeline' : ''}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  })
  if (!r.ok) throw new Error(`KV error: ${r.status}`)
  return r.json()
}

function ns(userId, key) { return `u:${userId}:${key}` }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  if (!KV_URL || !KV_TOKEN) {
    return res.status(503).json({ error: 'Cloud storage not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN to your Vercel environment variables.' })
  }

  const rl = rateLimit(clientIp(req.headers))
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many requests' })
  }

  try {
    const { action, userId, key, value, keys, pairs } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    if (action === 'get') {
      if (!key) return res.status(400).json({ error: 'Missing key' })
      const { result } = await upstash(['GET', ns(userId, key)])
      return res.json({ value: result != null ? JSON.parse(result) : null })
    }

    if (action === 'mget') {
      if (!keys?.length) return res.status(400).json({ error: 'Missing keys' })
      const results = await upstash(keys.map(k => ['GET', ns(userId, k)]))
      return res.json({ values: results.map(({ result }) => result != null ? JSON.parse(result) : null) })
    }

    if (action === 'set') {
      if (!key) return res.status(400).json({ error: 'Missing key' })
      await upstash(['SET', ns(userId, key), JSON.stringify(value)])
      return res.json({ ok: true })
    }

    if (action === 'mset') {
      if (!pairs?.length) return res.status(400).json({ error: 'Missing pairs' })
      await upstash(pairs.map(([k, v]) => ['SET', ns(userId, k), JSON.stringify(v)]))
      return res.json({ ok: true })
    }

    if (action === 'del') {
      if (!key) return res.status(400).json({ error: 'Missing key' })
      await upstash(['DEL', ns(userId, key)])
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
