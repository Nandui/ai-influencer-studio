// Kie.ai generation — REST API, API-key auth, no OAuth.
// All model IDs here are Kie.ai's internal IDs, verified from their docs.

const KIE_KEY_STORAGE = 'kie_api_key'

export function getKieKey()      { return localStorage.getItem(KIE_KEY_STORAGE) }
export function isKieConnected() { return !!getKieKey() }
export function saveKieKey(key)  { localStorage.setItem(KIE_KEY_STORAGE, key.trim()) }
export function clearKieKey()    { localStorage.removeItem(KIE_KEY_STORAGE) }

// ── Model registries ────────────────────────────────────────────
// These appear in Settings / Create — add more here as Kie.ai adds models.
// kieId is the exact string the Kie.ai API expects in the "model" field.

export const KIE_IMAGE_MODELS = [
  {
    id: 'kie:flux-kontext-pro', kieId: 'flux-kontext-pro',
    name: 'Flux Kontext Pro',  tag: 'Edit & Generate', tagColor: '#F59E0B',
    provider: 'kie', desc: 'Best with reference photos — preserves faces & style.',
    maxRefs: 2,
  },
  {
    id: 'kie:flux-kontext-max', kieId: 'flux-kontext-max',
    name: 'Flux Kontext Max',  tag: 'Max Detail',  tagColor: '#8B5CF6',
    provider: 'kie', desc: 'Higher fidelity version — slower, better prompt adherence.',
    maxRefs: 2,
  },
  {
    id: 'kie:imagen-4', kieId: 'google/imagen4',
    name: 'Imagen 4',  tag: 'Google',  tagColor: '#10B981',
    provider: 'kie', desc: "Google's latest flagship — vivid, photorealistic.",
    maxRefs: 0,
  },
]

export const KIE_VIDEO_MODELS = [
  { id: 'kie:veo3-fast',  kieId: 'veo3_fast',              name: 'Veo 3 Fast',    tag: 'Fast',  tagColor: '#0EA5E9', desc: 'Google Veo 3 — fast & affordable, with audio.' },
  { id: 'kie:veo3',       kieId: 'veo3',                   name: 'Veo 3 Quality', tag: 'Best',  tagColor: '#10B981', desc: 'Google Veo 3 — highest quality, synchronized audio.' },
  { id: 'kie:kling-3.0',  kieId: 'kling-3.0/video',        name: 'Kling 3.0',     tag: 'Long',  tagColor: '#8B5CF6', desc: 'Kuaishou — up to 15 s, cinematic storytelling.' },
  { id: 'kie:wan-t2v',    kieId: 'wan/2-7-text-to-video',  name: 'Wan 2.7',       tag: 'Voice', tagColor: '#EC4899', desc: 'Tencent — character voice & motion, text-to-video.' },
]

const ALL_KIE = [...KIE_IMAGE_MODELS, ...KIE_VIDEO_MODELS]

function resolveKieId(appModelId, { hasImageUrls = false } = {}) {
  const m = ALL_KIE.find(m => m.id === appModelId)
  if (!m) throw new Error(`Unknown Kie.ai model: ${appModelId}`)
  // Wan 2.7 has separate text/image-to-video endpoints
  if (appModelId === 'kie:wan-t2v' && hasImageUrls) return 'wan/2-7-image-to-video'
  return m.kieId
}

// ── Core API helpers ────────────────────────────────────────────

async function kiePost(body) {
  const key = getKieKey()
  if (!key) throw new Error('Kie.ai API key not set — add it in Settings')
  const res = await fetch('/api/kie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kie-key': key },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Kie.ai proxy error ${res.status}`)
  if (data.code && data.code !== 200) throw new Error(data.msg || `Kie.ai error code ${data.code}`)
  return data
}

async function createTask(kieId, input) {
  const data = await kiePost({ operation: 'createTask', model: kieId, input })
  const taskId = data.data?.taskId || data.data?.task_id
  if (!taskId) throw new Error('Kie.ai returned no taskId')
  return taskId
}

async function pollTask(taskId) {
  const data = await kiePost({ operation: 'recordInfo', taskId })
  return data.data || {}
}

function extractUrl(result, type = 'image') {
  const out = result?.output || result
  if (type === 'video') return out?.videoUrl || out?.video_url || out?.url || null
  return out?.imageUrls?.[0] || out?.imageUrl || out?.image_url || out?.url || null
}

function isTerminal(status) {
  return /^(COMPLETED|SUCCESS|DONE|FAILED|ERROR|CANCELLED|REJECTED)$/i.test(status || '')
}
function isFailed(status) {
  return /^(FAILED|ERROR|CANCELLED|REJECTED)$/i.test(status || '')
}

// ── Public generation functions ─────────────────────────────────
// Signatures mirror higgsfieldGenerate so routing is transparent.

export async function kieGenerateImages({ prompts, aspectRatio, model, faceRef, styleRef, onProgress, onPartialResults }) {
  onProgress?.(8)

  // Kie.ai only accepts public HTTPS URLs; base64 refs are skipped
  const imageUrls = [faceRef, styleRef].filter(u => typeof u === 'string' && u.startsWith('https://'))
  const kieId = resolveKieId(model)

  // Submit all prompts in parallel
  const taskIds = await Promise.all(
    prompts.map(prompt => createTask(kieId, {
      prompt,
      aspect_ratio: aspectRatio,
      ...(imageUrls.length ? { image_urls: imageUrls } : {}),
    }))
  )
  onProgress?.(22)

  // Poll until all tasks complete or ~3 min elapses
  const urls = []
  const pending = new Set(taskIds)

  for (let round = 0; round < 60 && pending.size > 0; round++) {
    if (round > 0) await new Promise(r => setTimeout(r, 3000))
    for (const taskId of [...pending]) {
      try {
        const result = await pollTask(taskId)
        const status = result.status || ''
        if (isFailed(status)) {
          pending.delete(taskId)
        } else if (isTerminal(status)) {
          const url = extractUrl(result, 'image')
          if (url) urls.push(url)
          pending.delete(taskId)
        }
      } catch { /* transient error — retry next round */ }
    }
    onProgress?.(Math.min(26 + (urls.length / taskIds.length) * 68, 95))
    onPartialResults?.(urls)
  }

  return urls
}

export async function kieGenerateVideo({ prompt, aspectRatio, model, duration, referenceImages, onProgress, onPartialResults, isCancelled }) {
  onProgress?.(8)

  const imageUrls = (referenceImages || []).filter(u => typeof u === 'string' && u.startsWith('https://'))
  const kieId = resolveKieId(model, { hasImageUrls: imageUrls.length > 0 })

  const taskId = await createTask(kieId, {
    prompt,
    aspect_ratio: aspectRatio,
    ...(duration ? { duration } : {}),
    ...(imageUrls.length ? { image_urls: imageUrls } : {}),
  })
  onProgress?.(15)

  // Poll (videos take longer — up to ~10 min)
  for (let round = 0; round < 200; round++) {
    if (isCancelled?.()) return { urls: [] }
    if (round > 0) await new Promise(r => setTimeout(r, 3000))

    const result = await pollTask(taskId)
    const status = result.status || ''

    onProgress?.(Math.min(18 + round * 0.38, 90))

    if (isFailed(status)) throw new Error(`Kie.ai video failed: ${status}`)
    if (isTerminal(status)) {
      const url = extractUrl(result, 'video')
      if (url) {
        onProgress?.(100)
        onPartialResults?.([url])
        return { urls: [url] }
      }
    }
  }

  throw new Error('Kie.ai video generation timed out')
}
