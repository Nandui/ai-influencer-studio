// Cloud storage backed by Vercel KV (Upstash Redis) via /api/kv.
// All data is namespaced by a per-user UUID that lives in localStorage.
// Cloud sync is best-effort — failures fall back to localStorage silently.

const USER_ID_KEY = 'cloud_user_id'

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function getCloudUserId() {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = generateId()
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function setCloudUserId(id) {
  const trimmed = (id || '').trim()
  if (trimmed.length < 8) throw new Error('Sync ID is too short')
  localStorage.setItem(USER_ID_KEY, trimmed)
}

async function post(body) {
  const res = await fetch('/api/kv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: getCloudUserId(), ...body }),
  })
  if (res.status === 503) throw new Error('cloud_not_configured')
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}))
    throw new Error(error || `KV ${res.status}`)
  }
  return res.json()
}

export async function cloudGet(key) {
  const { value } = await post({ action: 'get', key })
  return value
}

export async function cloudMGet(keys) {
  const { values } = await post({ action: 'mget', keys })
  return values
}

export async function cloudSet(key, value) {
  await post({ action: 'set', key, value })
}

// pairs: [[key, value], ...]
export async function cloudMSet(pairs) {
  await post({ action: 'mset', pairs })
}

export async function cloudDel(key) {
  await post({ action: 'del', key })
}
