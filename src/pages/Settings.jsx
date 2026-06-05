import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { startHiggsfieldOAuthPopup, disconnectHF, isHFConnected } from '../utils/higgsfieldAuth'
import { useTheme } from '../context/theme'
import { getCloudUserId, setCloudUserId } from '../utils/cloudStorage'
import { getKieKey, saveKieKey, clearKieKey, isKieConnected, KIE_VIDEO_MODELS } from '../utils/kieGenerate'

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

const CLAUDE_KEY = 'claude_api_key'

export default function Settings() {
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const [hfConnected, setHfConnected] = useState(isHFConnected)
  const [hfLoading, setHfLoading] = useState(false)
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem(CLAUDE_KEY) || '')
  const [claudeInput, setClaudeInput] = useState('')
  const [showClaudeInput, setShowClaudeInput] = useState(false)
  const [cloudUserId] = useState(() => getCloudUserId())
  const [syncIdInput, setSyncIdInput] = useState('')
  const [syncIdStatus, setSyncIdStatus] = useState(null) // 'copied' | 'applied' | 'error'
  const [kieConnected, setKieConnected] = useState(isKieConnected)
  const [kieInput, setKieInput] = useState('')
  const [showKieInput, setShowKieInput] = useState(false)
  const [videoModelPref, setVideoModelPref] = useState(() => localStorage.getItem('video_model_pref') || 'seedance_2_0')
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('connected') === '1') {
      setHfConnected(true)
    }
  }, [location.search])

  async function connectHiggsfield(options = {}) {
    setHfLoading(true)
    try {
      await startHiggsfieldOAuthPopup(options)
      setHfConnected(true)
    } catch (e) {
      if (e.message !== 'cancelled') alert('Failed to connect Higgsfield: ' + e.message)
    } finally {
      setHfLoading(false)
    }
  }

  function disconnectHighgsfield() {
    if (!confirm('Disconnect your Higgsfield account?')) return
    disconnectHF()
    setHfConnected(false)
  }

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 28 }}>Settings</h1>

        <Section title="Appearance">
          <div style={{ display: 'flex', gap: 10 }}>
            {(['light', 'dark']).map(val => {
              const on = theme === val
              return (
                <button key={val} onClick={e => { if (!on) toggle(e.clientX, e.clientY) }} style={{
                  flex: 1, padding: '14px 12px', borderRadius: 12, cursor: on ? 'default' : 'pointer',
                  border: `1.5px solid ${on ? '#8B5CF6' : 'var(--border)'}`,
                  background: on ? 'rgba(139,92,246,0.09)' : 'var(--bg)',
                  color: on ? '#8B5CF6' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  boxShadow: on ? '0 0 0 1px #8B5CF655' : 'none',
                }}>
                  {val === 'light' ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                  {val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Higgsfield">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Connect your Higgsfield account to generate influencer images directly in the app. Images use your own Higgsfield credits.
          </p>
          {hfConnected ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34C759' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#34C759' }}>Higgsfield connected</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => connectHiggsfield({ prompt: 'login' })}
                    disabled={hfLoading}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg)', border: '1px solid var(--border)', fontWeight: 500, cursor: 'pointer', opacity: hfLoading ? 0.6 : 1 }}
                  >
                    Switch account
                  </button>
                  <button onClick={disconnectHighgsfield} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, color: '#FF3B30', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)', fontWeight: 500, cursor: 'pointer' }}>
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => connectHiggsfield()}
                  disabled={hfLoading}
                  style={{ padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: '#1D1D1F', color: '#fff', display: 'flex', alignItems: 'center', gap: 8, opacity: hfLoading ? 0.6 : 1, cursor: hfLoading ? 'not-allowed' : 'pointer', border: 'none' }}
                >
                  {hfLoading ? (
                    <>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                      Connecting…
                    </>
                  ) : (
                    'Connect Higgsfield'
                  )}
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </button>
                <button
                  onClick={() => connectHiggsfield({ prompt: 'login' })}
                  disabled={hfLoading}
                  style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: hfLoading ? 'not-allowed' : 'pointer', opacity: hfLoading ? 0.6 : 1 }}
                >
                  Use a different account
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section title="Kie.ai">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Add your <a href="https://kie.ai/api-key" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)' }}>Kie.ai API key</a> to unlock additional models — Flux Kontext, Imagen 4, Veo 3, Kling 3.0, and more.
          </p>
          {kieConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34C759' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#34C759' }}>Kie.ai connected</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>···{getKieKey().slice(-4)}</span>
              </div>
              <button
                onClick={() => { clearKieKey(); setKieConnected(false); setShowKieInput(false); setKieInput('') }}
                style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, color: '#FF3B30', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)', fontWeight: 500, cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          ) : showKieInput ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                type="password"
                value={kieInput}
                onChange={e => setKieInput(e.target.value)}
                placeholder="Paste Kie.ai API key…"
                onKeyDown={e => {
                  if (e.key === 'Enter' && kieInput.trim()) {
                    saveKieKey(kieInput.trim()); setKieConnected(true); setKieInput(''); setShowKieInput(false)
                  }
                }}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => { if (!kieInput.trim()) return; saveKieKey(kieInput.trim()); setKieConnected(true); setKieInput(''); setShowKieInput(false) }}
                style={{ padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: '#1D1D1F', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowKieInput(true)}
              style={{ padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: '#1D1D1F', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Add API Key
            </button>
          )}
        </Section>

        <Section title="Video Model">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Choose the default model used when generating videos. Kie.ai models require your Kie.ai API key.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'seedance_2_0', name: 'Seedance 2.0', tag: 'Higgsfield', tagColor: '#EC4899', desc: 'Default — Higgsfield native, fast & reliable.' },
              ...KIE_VIDEO_MODELS,
            ].map(m => {
              const on = videoModelPref === m.id
              const needsKie = m.id.startsWith('kie:')
              const disabled = needsKie && !kieConnected
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (disabled) return
                    setVideoModelPref(m.id)
                    localStorage.setItem('video_model_pref', m.id)
                  }}
                  style={{
                    padding: '12px 16px', borderRadius: 10, textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
                    border: `1.5px solid ${on ? '#8B5CF6' : 'var(--border)'}`,
                    background: on ? 'rgba(139,92,246,0.08)' : 'var(--bg)',
                    opacity: disabled ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    transition: 'all 0.15s', fontFamily: 'inherit',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#8B5CF6' : 'var(--text-primary)', marginBottom: 2 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {disabled && <span style={{ fontSize: 10, color: '#FF3B30', fontWeight: 600 }}>Add Kie.ai key</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, color: m.tagColor || '#8B5CF6', background: `${m.tagColor || '#8B5CF6'}18`, padding: '2px 7px', borderRadius: 6 }}>{m.tag}</span>
                    {on && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6', flexShrink: 0 }} />}
                  </div>
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Cloud Sync">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Your Sync ID lets you access your influencers and generated content from any browser or device. Copy it and enter it on another device to sync your data.
          </p>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Your Sync ID</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                {cloudUserId}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(cloudUserId).then(() => {
                    setSyncIdStatus('copied')
                    setTimeout(() => setSyncIdStatus(null), 2000)
                  })
                }}
                style={{ padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: syncIdStatus === 'copied' ? 'rgba(52,199,89,0.12)' : 'var(--bg)', color: syncIdStatus === 'copied' ? '#34C759' : 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
              >
                {syncIdStatus === 'copied' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Use on another device</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>Paste a Sync ID from another device to load its data here. This will replace your current local data on next refresh.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={syncIdInput}
                onChange={e => { setSyncIdInput(e.target.value); setSyncIdStatus(null) }}
                placeholder="Paste Sync ID…"
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${syncIdStatus === 'error' ? '#FF3B30' : 'var(--border)'}`, background: 'var(--bg)', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => {
                  try {
                    setCloudUserId(syncIdInput)
                    localStorage.removeItem('cloud_sync_at')
                    setSyncIdStatus('applied')
                    setSyncIdInput('')
                    setTimeout(() => window.location.reload(), 800)
                  } catch {
                    setSyncIdStatus('error')
                  }
                }}
                disabled={!syncIdInput.trim()}
                style={{ padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: syncIdStatus === 'applied' ? 'rgba(52,199,89,0.12)' : '#1D1D1F', color: syncIdStatus === 'applied' ? '#34C759' : '#fff', border: 'none', cursor: syncIdInput.trim() ? 'pointer' : 'not-allowed', opacity: syncIdInput.trim() ? 1 : 0.4, whiteSpace: 'nowrap', transition: 'all 0.15s' }}
              >
                {syncIdStatus === 'applied' ? 'Applying…' : 'Apply'}
              </button>
            </div>
            {syncIdStatus === 'error' && <p style={{ fontSize: 12, color: '#FF3B30', marginTop: 6 }}>Sync ID must be at least 8 characters.</p>}
          </div>
        </Section>

        <Section title="Claude AI">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Add your Anthropic API key to let Claude analyze the image just before generating your product character sheet.
          </p>
          {claudeKey ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34C759' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#34C759' }}>Claude connected</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>···{claudeKey.slice(-4)}</span>
                </div>
                <button
                  onClick={() => { localStorage.removeItem(CLAUDE_KEY); setClaudeKey(''); setClaudeInput(''); setShowClaudeInput(false) }}
                  style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, color: '#FF3B30', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)', fontWeight: 500 }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : showClaudeInput ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                type="password"
                value={claudeInput}
                onChange={e => setClaudeInput(e.target.value)}
                placeholder="sk-ant-..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && claudeInput.trim()) {
                    const k = claudeInput.trim()
                    localStorage.setItem(CLAUDE_KEY, k)
                    setClaudeKey(k)
                    setClaudeInput('')
                    setShowClaudeInput(false)
                  }
                }}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => {
                  const k = claudeInput.trim()
                  if (!k) return
                  localStorage.setItem(CLAUDE_KEY, k)
                  setClaudeKey(k)
                  setClaudeInput('')
                  setShowClaudeInput(false)
                }}
                style={{ padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: '#1D1D1F', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClaudeInput(true)}
              style={{ padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: '#1D1D1F', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Add API Key
            </button>
          )}
        </Section>
      </div>
    </div>
  )
}
