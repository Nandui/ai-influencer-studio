import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev search proxy — mirrors api/search.js for Vercel production
const searchPlugin = {
  name: 'search-proxy',
  configureServer(server) {
    server.middlewares.use('/api/search', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

      const q = new URLSearchParams(req.url.split('?')[1] || '').get('q')
      if (!q) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing q' })); return }

      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        })
        const xml = await r.text()
        const items = []
        for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
          const block = match[1]
          const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '').trim()
          const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<description>(.*?)<\/description>/)?.[1] || '')
            .replace(/<[^>]+>/g, '').trim().slice(0, 300)
          const date = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '').trim()
          if (title) items.push({ title, description: desc, date })
          if (items.length >= 8) break
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ items }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message, items: [] }))
      }
    })
  },
}

// Local dev image proxy — mirrors api/img-proxy.js for Vercel production
const imgProxyPlugin = {
  name: 'img-proxy',
  configureServer(server) {
    server.middlewares.use('/api/img-proxy', async (req, res) => {
      const qs = new URLSearchParams(req.url.split('?')[1] || '')
      const url = qs.get('url')
      const name = qs.get('name') || 'image.jpg'
      if (!url) { res.writeHead(400); res.end('Missing url'); return }
      try {
        const r = await fetch(decodeURIComponent(url))
        const ct = r.headers.get('content-type') || 'image/jpeg'
        const buf = await r.arrayBuffer()
        res.writeHead(r.status, {
          'Content-Type': ct,
          'Content-Disposition': `attachment; filename="${decodeURIComponent(name)}"`,
          'Access-Control-Allow-Origin': '*',
        })
        res.end(Buffer.from(buf))
      } catch (e) {
        res.writeHead(500); res.end('Proxy error: ' + e.message)
      }
    })
  },
}

// Local dev KV proxy — mirrors api/kv.js for Vercel production
// Uses KV_REST_API_URL + KV_REST_API_TOKEN from .env if set; otherwise returns null/ok stubs so
// the app still works in dev without a real KV store configured.
const kvPlugin = {
  name: 'kv-proxy',
  configureServer(server) {
    server.middlewares.use('/api/kv', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
      if (req.method !== 'POST') { res.writeHead(405); res.end(JSON.stringify({ error: 'Method not allowed' })); return }

      const chunks = []
      req.on('data', c => chunks.push(c))
      await new Promise(r => req.on('end', r))
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      const { action, userId, key, keys, value, pairs } = body

      const kvUrl   = process.env.KV_REST_API_URL
      const kvToken = process.env.KV_REST_API_TOKEN

      if (!kvUrl || !kvToken) {
        // No KV configured — return empty reads and ok writes so the app doesn't break
        if (action === 'get')  { res.writeHead(200); res.end(JSON.stringify({ value: null })); return }
        if (action === 'mget') { res.writeHead(200); res.end(JSON.stringify({ values: (keys || []).map(() => null) })); return }
        res.writeHead(200); res.end(JSON.stringify({ ok: true })); return
      }

      function ns(k) { return `u:${userId}:${k}` }
      async function upstash(cmds) {
        const isBatch = Array.isArray(cmds[0])
        const r = await fetch(`${kvUrl}${isBatch ? '/pipeline' : ''}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(cmds),
        })
        return r.json()
      }

      try {
        if (action === 'get') {
          const { result } = await upstash(['GET', ns(key)])
          res.writeHead(200); res.end(JSON.stringify({ value: result != null ? JSON.parse(result) : null }))
        } else if (action === 'mget') {
          const results = await upstash((keys || []).map(k => ['GET', ns(k)]))
          res.writeHead(200); res.end(JSON.stringify({ values: results.map(({ result }) => result != null ? JSON.parse(result) : null) }))
        } else if (action === 'set') {
          await upstash(['SET', ns(key), JSON.stringify(value)])
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
        } else if (action === 'mset') {
          await upstash((pairs || []).map(([k, v]) => ['SET', ns(k), JSON.stringify(v)]))
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
        } else if (action === 'del') {
          await upstash(['DEL', ns(key)])
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(400); res.end(JSON.stringify({ error: `Unknown action: ${action}` }))
        }
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
      }
    })
  },
}

// Local dev Claude proxy — mirrors api/claude.js for Vercel production
const claudePlugin = {
  name: 'claude-proxy',
  configureServer(server) {
    server.middlewares.use('/api/claude', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-beta')
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
      if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return }
      const apiKey = req.headers['x-api-key']
      if (!apiKey) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Missing x-api-key' } })); return }
      const chunks = []
      req.on('data', c => chunks.push(c))
      await new Promise(r => req.on('end', r))
      const body = Buffer.concat(chunks).toString()
      try {
        const upstreamHeaders = {
          'x-api-key': apiKey,
          'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
          'content-type': 'application/json',
        }
        if (req.headers['anthropic-beta']) upstreamHeaders['anthropic-beta'] = req.headers['anthropic-beta']
        const upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: upstreamHeaders, body })
        const data = await upstream.json()
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: e.message } }))
      }
    })
  },
}

export default defineConfig({
  plugins: [react(), searchPlugin, imgProxyPlugin, claudePlugin, kvPlugin],
  server: {
    proxy: {
      '/api/hf': {
        target: 'https://mcp.higgsfield.ai',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/hf/, ''),
      },
    },
  },
})
