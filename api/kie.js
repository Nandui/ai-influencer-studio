import { rateLimit, clientIp } from '../lib/rateLimit.js'

const KIE_BASE = 'https://api.kie.ai'

// These models use the dedicated Flux Kontext endpoint with a flat body
const FLUX_MODELS = new Set(['flux-kontext-pro', 'flux-kontext-max'])

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-kie-key')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = req.headers['x-kie-key']
  if (!apiKey) return res.status(400).json({ error: 'Missing x-kie-key header' })

  const rl = rateLimit(clientIp(req.headers))
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many requests' })
  }

  const { operation, model, input, taskId } = req.body
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

  try {
    let upstream
    if (operation === 'createTask') {
      if (FLUX_MODELS.has(model)) {
        // Flux Kontext uses its own endpoint; body is flat (model + input fields merged)
        upstream = await fetch(`${KIE_BASE}/api/v1/flux/kontext/generate`, {
          method: 'POST', headers,
          body: JSON.stringify({ model, ...input }),
        })
      } else {
        upstream = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
          method: 'POST', headers,
          body: JSON.stringify({ model, input }),
        })
      }
    } else if (operation === 'recordInfo') {
      upstream = await fetch(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers })
    } else {
      return res.status(400).json({ error: `Unknown operation: ${operation}` })
    }

    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
