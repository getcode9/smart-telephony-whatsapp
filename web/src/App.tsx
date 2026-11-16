import { useEffect, useRef, useState, type FormEvent } from 'react'
import { hangUp, isAutoRecord, onCallUpdate, placeCall, setAutoRecord, stateLabel } from './phone'
import { AdminPage, AuthScreen, BillingPage, Dashboard, NumbersPage, type SessionUser } from './desk'

type CallRecord = {
  id: number
  direction: string | null
  from: string | null
  to: string | null
  status: string
  startedAt: string | null
  durationSeconds: number | null
  costAmount: string | null
  currency: string | null
  recordingFile?: string | null
}

type Chat = {
  jid: string
  displayName: string | null
  messageCount: number
  transcriptCount: number
  firstMessageAt: string
  lastMessageAt: string
  lastText: string
  summaryText: string | null
  summaryAt: string | null
  summaryMessageCount: number | null
  summaryStale: boolean
}

type Message = {
  id: number
  pushName: string | null
  body: string
  timestamp: string
  fromMe: boolean
}

type ReplyState = {
  enabled: boolean
  pattern: string
  exampleCount: number
  ready: boolean
  updatedAt: string | null
}

type RecoverySettings = {
  enabled: boolean
  message: string
}

type WaLink = {
  connection: string
  qrDataUrl: string | null
  error: string | null
  type?: string
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Request failed.')
  return body
}

function minutes(seconds: number | null) {
  if (seconds == null) return '—'
  return `${(seconds / 60).toFixed(1)} min`
}

function money(amount: string | null, currency: string | null) {
  if (!amount) return 'Pending'
  return currency ? `${currency} ${Number(amount).toFixed(4)}` : Number(amount).toFixed(4)
}

function when(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function normalizeNumber(input: string) {
  const digits = input.trim().replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

function chatLabel(chat: Chat) {
  return chat.displayName || chat.jid.replace(/@.*/, '')
}

export function App() {
  const route = useHash()
  const [me, setMe] = useState<SessionUser | null | undefined>(undefined)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (response) => {
        if (response.status === 401) {
          setMe(null)
          return
        }
        setMe(await readJson<SessionUser>(response))
      })
      .catch(() => setMe(null))
  }, [])

  useEffect(() => {
    if (me && me.role !== 'admin' && (route === '#/admin' || route === '#/whatsapp')) {
      window.location.hash = '#/'
    }
  }, [me, route])

  if (me === undefined) {
    return (
      <div className="page-wait">
        <div className="mini-spinner" />
        <p>Loading session...</p>
      </div>
    )
  }

  if (!me) return <AuthScreen onSuccess={setMe} />

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setMe(null)
    window.location.hash = '#/'
  }

  const userInitials = me.name
    ? me.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : me.email.slice(0, 2).toUpperCase()

  const formattedBalance = (me.balanceUnits / 10000).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const page =
    route === '#/admin' && me.role === 'admin' ? (
      <AdminPage />
    ) : route === '#/whatsapp' && me.role === 'admin' ? (
      <WhatsApp />
    ) : route === '#/calls' ? (
      <Calls />
    ) : route === '#/numbers' ? (
      <NumbersPage />
    ) : route === '#/billing' ? (
      <BillingPage />
    ) : (
      <Dashboard />
    )

  return (
    <div className={`shell ${route === '#/admin' || route === '#/whatsapp' ? 'shell-admin' : ''}`}>
      <aside className={`side ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="brand-header">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </div>
          <div className="brand-title-wrap">
            <span className="brand-name">Telnyx Desk</span>
            <span className="brand-badge-pill">v2.0</span>
          </div>
        </div>

        <div className="user-profile-card">
          <div className="user-profile-top">
            <div className="avatar-circle">{userInitials}</div>
            <div className="user-info">
              <strong className="user-name">{me.name || 'Operator'}</strong>
              <small className="user-email">{me.email}</small>
            </div>
          </div>
          <div className="user-profile-badges">
            <div className="balance-pill">
              <span className="balance-dot" />
              <span className="balance-text">{formattedBalance}</span>
            </div>
            {me.role === 'admin' && (
              <span className="role-chip-admin">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                ADMIN
              </span>
            )}
          </div>
        </div>

        <nav className="side-nav">
          <div className="nav-section-label">Operator Menu</div>
          <a
            href="#/"
            className={route === '#/' || route === '' ? 'active' : ''}
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            <span>Dashboard</span>
          </a>
          <a
            href="#/calls"
            className={route === '#/calls' ? 'active' : ''}
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            <span>Dialer & Calls</span>
          </a>
          <a
            href="#/numbers"
            className={route === '#/numbers' ? 'active' : ''}
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
            <span>Numbers Store</span>
          </a>
          <a
            href="#/billing"
            className={route === '#/billing' ? 'active' : ''}
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            <span>Credit & Billing</span>
          </a>

          {me.role === 'admin' && (
            <>
              <div className="nav-section-label admin-label">
                <div className="admin-label-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span>ADMIN PANEL</span>
                </div>
                <span className="admin-tag-pill">ACTIVE</span>
              </div>

              <a
                href="#/admin"
                className={`admin-nav-item ${route === '#/admin' ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span>Credit Approvals</span>
              </a>

              <a
                href="#/whatsapp"
                className={`admin-nav-item ${route === '#/whatsapp' ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>WhatsApp Hub</span>
              </a>
            </>
          )}
        </nav>

        <div className="side-foot">
          {me.role === 'admin' && (
            <div className="admin-quick-bar">
              <a
                href={route === '#/admin' || route === '#/whatsapp' ? '#/' : '#/admin'}
                className="btn-admin-switch"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>{route === '#/admin' || route === '#/whatsapp' ? 'Switch to Operator' : 'Open Admin Panel'}</span>
              </a>
            </div>
          )}

          <button type="button" className="btn-ghost" onClick={signOut}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      </aside>

      <div className="wrap">
        <div className="mobile-bar">
          <button type="button" className="menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span className="mobile-title">
            {route === '#/admin'
              ? 'Admin: Approvals'
              : route === '#/whatsapp'
              ? 'Admin: WhatsApp'
              : 'Telnyx Desk'}
          </span>
          {me.role === 'admin' && (
            <a
              href={route === '#/admin' || route === '#/whatsapp' ? '#/' : '#/admin'}
              className="badge-admin-mobile"
            >
              {route === '#/admin' || route === '#/whatsapp' ? 'Desk' : 'Admin'}
            </a>
          )}
        </div>
        {page}
      </div>
    </div>
  )
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

function Calls() {
  const [number, setNumber] = useState('')
  const [live, setLive] = useState<string | undefined>()
  const [cause, setCause] = useState('')
  const [active, setActive] = useState<{ hangup?: () => void; state?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [calls, setCalls] = useState<CallRecord[] | null>(null)
  const [refreshing, setRefreshing] = useState<number | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [autoRecordState, setAutoRecordState] = useState(isAutoRecord())
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  async function load() {
    const rows = await readJson<CallRecord[]>(await fetch('/api/calls'))
    setCalls(rows)
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
    const stop = onCallUpdate((call) => {
      setLive(call.state)
      setCause(call.cause || call.hangupCause || '')
      setActive(call.state === 'destroy' || call.state === 'purge' ? null : call)
      load().catch(() => undefined)
    })
    return () => {
      stop()
      if (audioPlayerRef.current) audioPlayerRef.current.pause()
    }
  }, [])

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (live === 'active' || live === 'answered') {
      timer = setInterval(() => setCallDuration((d) => d + 1), 1000)
    } else {
      setCallDuration(0)
    }
    return () => clearInterval(timer)
  }, [live])

  async function dial(event?: FormEvent) {
    if (event) event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const destination = normalizeNumber(number)
      if (!destination) throw new Error('Enter a valid phone number with at least 8 digits.')
      setLive('requesting')
      const call = await placeCall(destination)
      setActive(call)
    } catch (reason) {
      setLive(undefined)
      setError(reason instanceof Error ? reason.message : 'The call did not start.')
    } finally {
      setBusy(false)
    }
  }

  async function refresh(id: number) {
    setRefreshing(id)
    setError('')
    try {
      await readJson(await fetch(`/api/calls/${id}/refresh-cost`, { method: 'POST' }))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cost refresh failed.')
    } finally {
      setRefreshing(null)
    }
  }

  function togglePlayRecording(callId: number) {
    if (playingId === callId) {
      audioPlayerRef.current?.pause()
      setPlayingId(null)
    } else {
      if (audioPlayerRef.current) audioPlayerRef.current.pause()
      const audio = new Audio(`/api/calls/${callId}/recording`)
      audioPlayerRef.current = audio
      audio.play().catch(() => setError('Could not play recording audio.'))
      setPlayingId(callId)
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => {
        setPlayingId(null)
        setError('Could not load recording audio.')
      }
    }
  }

  const onCall =
    live === 'active' ||
    live === 'ringing' ||
    live === 'early' ||
    live === 'trying' ||
    live === 'requesting' ||
    live === 'answering' ||
    live === 'held'

  const dialKeys = [
    ['1', ''],
    ['2', 'ABC'],
    ['3', 'DEF'],
    ['4', 'GHI'],
    ['5', 'JKL'],
    ['6', 'MNO'],
    ['7', 'PQRS'],
    ['8', 'TUV'],
    ['9', 'WXYZ'],
    ['*', ''],
    ['0', '+'],
    ['#', ''],
  ]

  function appendDigit(digit: string) {
    setNumber((prev) => prev + digit)
  }

  function backspace() {
    setNumber((prev) => prev.slice(0, -1))
  }

  return (
    <main className="page-content">
      <header className="page-header">
        <div>
          <h1>WebRTC Voice Dialer & Audio Recording</h1>
          <p className="page-subtitle">Place high-definition browser calls with automatic audio recording & playback</p>
        </div>
      </header>

      {error && (
        <div className="alert-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{error}</span>
        </div>
      )}

      <div className="dialer-layout">
        <section className="card-panel dialer-card">
          <div className="panel-header">
            <h2>Phone Dialer</h2>
            <div className={`status-pill ${onCall ? 'status-active' : 'status-idle'}`}>
              <span className="pulsing-dot" />
              <span>{busy && !live ? 'Connecting...' : stateLabel(live)}</span>
            </div>
          </div>

          <form onSubmit={dial} className="dialer-form">
            <div className="number-input-wrap">
              <input
                id="number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="+14155551212"
                className="dial-display"
              />
              {number && (
                <button type="button" className="btn-icon" onClick={backspace} title="Backspace">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                </button>
              )}
            </div>

            <div className="keypad-grid">
              {dialKeys.map(([num, letters]) => (
                <button
                  key={num}
                  type="button"
                  className="keypad-btn"
                  onClick={() => appendDigit(num)}
                >
                  <span className="key-num">{num}</span>
                  {letters && <span className="key-letters">{letters}</span>}
                </button>
              ))}
            </div>

            <div className="recording-preference-card">
              <label className="toggle-switch-wrap">
                <input
                  type="checkbox"
                  checked={autoRecordState}
                  onChange={(e) => {
                    setAutoRecord(e.target.checked)
                    setAutoRecordState(e.target.checked)
                  }}
                />
                <span className="toggle-slider-sm" />
                <span className="recording-label-text">
                  {onCall && autoRecordState ? (
                    <span className="rec-active-pill">
                      <span className="rec-dot" /> RECORDING IN PROGRESS
                    </span>
                  ) : (
                    'Auto-Record Call Audio'
                  )}
                </span>
              </label>
            </div>

            {onCall && (
              <div className="live-call-meter">
                <span className="meter-label">Connected Duration</span>
                <span className="meter-time">
                  {Math.floor(callDuration / 60).toString().padStart(2, '0')}:
                  {(callDuration % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}

            <div className="call-actions">
              <button
                type="submit"
                className="btn-call"
                disabled={busy || onCall || !number}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                {busy ? 'Initiating...' : 'Start Call'}
              </button>

              <button
                type="button"
                className="btn-hangup"
                disabled={!active}
                onClick={() => hangUp(active)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" y1="2" x2="2" y2="22"/></svg>
                End Call
              </button>
            </div>
          </form>

          {cause && (live === 'hangup' || live === 'destroy' || live === 'purge' || live === 'failed') && (
            <p className="call-cause-text">Telnyx reason: {cause}</p>
          )}

          <div className="mic-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
            <span>Call audio recordings are stored locally and accessible for playback anytime</span>
          </div>
        </section>

        <section className="card-panel history-panel">
          <div className="panel-header">
            <h2>Call History & Recordings</h2>
            <span className="badge-neutral">{calls ? calls.length : 0} records</span>
          </div>

          {calls == null ? (
            <div className="loading-card">
              <div className="mini-spinner" />
              <p>Loading call logs...</p>
            </div>
          ) : calls.length === 0 ? (
            <div className="empty-state">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              <p>No call logs yet.</p>
              <small>Dial a number using the keypad to place your first WebRTC call.</small>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Direction</th>
                    <th>To</th>
                    <th>Duration</th>
                    <th>Recording</th>
                    <th>Cost</th>
                    <th>Status</th>
                    <th>Pricing</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id}>
                      <td>{when(call.startedAt)}</td>
                      <td>
                        <span className={`badge ${call.direction === 'outbound' ? 'badge-indigo' : 'badge-emerald'}`}>
                          {call.direction === 'outbound' ? '↗ Outbound' : '↙ Inbound'}
                        </span>
                      </td>
                      <td className="font-mono">{call.to || '—'}</td>
                      <td>{minutes(call.durationSeconds)}</td>
                      <td>
                        {call.recordingFile ? (
                          <div className="audio-control-cell">
                            <button
                              type="button"
                              className={`btn-play-audio ${playingId === call.id ? 'playing' : ''}`}
                              onClick={() => togglePlayRecording(call.id)}
                              title={playingId === call.id ? 'Pause' : 'Play Audio Recording'}
                            >
                              {playingId === call.id ? (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                  <span>Pause</span>
                                </>
                              ) : (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                  <span>Play</span>
                                </>
                              )}
                            </button>
                            <a
                              href={`/api/calls/${call.id}/recording`}
                              download={`call_${call.id}.webm`}
                              className="btn-download-audio"
                              title="Download Audio (.webm)"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </a>
                          </div>
                        ) : (
                          <span className="no-rec-label">—</span>
                        )}
                      </td>
                      <td className="font-mono">{money(call.costAmount, call.currency)}</td>
                      <td>
                        <span className={`badge ${call.status === 'answered' ? 'badge-emerald' : call.status === 'ringing' ? 'badge-indigo' : 'badge-neutral'}`}>
                          {call.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-refresh"
                          disabled={refreshing === call.id}
                          onClick={() => refresh(call.id)}
                        >
                          {refreshing === call.id ? (
                            <span className="mini-spinner" />
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                          )}
                          <span>Refresh</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function WhatsApp() {
  const [link, setLink] = useState<WaLink | null>(null)
  const [chats, setChats] = useState<Chat[] | null>(null)
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [summary, setSummary] = useState<Pick<Chat, 'summaryText' | 'summaryAt' | 'summaryMessageCount' | 'summaryStale'> | null>(null)
  const [error, setError] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [reply, setReply] = useState<ReplyState | null>(null)
  const [recovery, setRecovery] = useState<RecoverySettings | null>(null)
  const [savingRecovery, setSavingRecovery] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [outgoingText, setOutgoingText] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [suggestingReplies, setSuggestingReplies] = useState(false)
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([])
  const selectedRef = useRef('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  async function loadChats() {
    const rows = await readJson<Chat[]>(await fetch('/api/whatsapp/chats'))
    setChats(rows)
    return rows
  }

  async function openChat(jid: string, known?: Chat) {
    setSelected(jid)
    setError('')
    setSuggestedReplies([])
    const chat = known ?? chats?.find((item) => item.jid === jid)
    setSummary(
      chat
        ? {
            summaryText: chat.summaryText,
            summaryAt: chat.summaryAt,
            summaryMessageCount: chat.summaryMessageCount,
            summaryStale: chat.summaryStale,
          }
        : null
    )
    try {
      setMessages(
        await readJson<Message[]>(
          await fetch(`/api/whatsapp/chats/${encodeURIComponent(jid)}/messages`)
        )
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load messages.')
    }
  }

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    loadChats().catch((reason: Error) => setError(reason.message))
    fetch('/api/whatsapp/status')
      .then((response) => readJson<WaLink>(response))
      .then(setLink)
      .catch(() => undefined)
    fetch('/api/whatsapp/reply')
      .then((response) => readJson<ReplyState>(response))
      .then(setReply)
      .catch(() => undefined)
    fetch('/api/whatsapp/recovery-settings')
      .then((response) => readJson<RecoverySettings>(response))
      .then(setRecovery)
      .catch(() => undefined)

    const source = new EventSource('/api/whatsapp/events')
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as WaLink
      if (!next.type) setLink(next)
      if (next.type !== 'message') return
      const jid = selectedRef.current
      loadChats()
        .then(async (rows) => {
          if (!jid) return
          const chat = rows.find((item) => item.jid === jid)
          if (chat) {
            setSummary({
              summaryText: chat.summaryText,
              summaryAt: chat.summaryAt,
              summaryMessageCount: chat.summaryMessageCount,
              summaryStale: chat.summaryStale,
            })
          }
          setMessages(
            await readJson<Message[]>(
              await fetch(`/api/whatsapp/chats/${encodeURIComponent(jid)}/messages`)
            )
          )
          setReply(await readJson<ReplyState>(await fetch('/api/whatsapp/reply')))
        })
        .catch(() => undefined)
    }
    source.onerror = () =>
      setLink((current) => current ?? { connection: 'error', qrDataUrl: null, error: 'Live updates paused. Refresh the page.' })
    return () => source.close()
  }, [])

  const current = chats?.find((chat) => chat.jid === selected) ?? null

  async function summarize() {
    if (!selected) return
    setSummarizing(true)
    setError('')
    try {
      const result = await readJson<Chat>(
        await fetch(`/api/whatsapp/chats/${encodeURIComponent(selected)}/summary`, {
          method: 'POST',
        })
      )
      setSummary(result)
      await loadChats()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Summary failed.')
    } finally {
      setSummarizing(false)
    }
  }

  async function requestAiSuggestions() {
    if (!selected) return
    setSuggestingReplies(true)
    setError('')
    try {
      const res = await readJson<{ suggestions: string[] }>(
        await fetch(`/api/whatsapp/chats/${encodeURIComponent(selected)}/suggest-replies`, {
          method: 'POST',
        })
      )
      setSuggestedReplies(res.suggestions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate suggestions.')
    } finally {
      setSuggestingReplies(false)
    }
  }

  async function sendMessage(textToSend?: string) {
    const text = (textToSend ?? outgoingText).trim()
    if (!selected || !text) return
    setSendingMsg(true)
    setError('')
    try {
      await readJson(
        await fetch(`/api/whatsapp/chats/${encodeURIComponent(selected)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        })
      )
      setOutgoingText('')
      setSuggestedReplies([])
      // Reload chat messages
      setMessages(
        await readJson<Message[]>(
          await fetch(`/api/whatsapp/chats/${encodeURIComponent(selected)}/messages`)
        )
      )
      await loadChats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send WhatsApp message.')
    } finally {
      setSendingMsg(false)
    }
  }

  async function saveRecovery(updates: Partial<RecoverySettings>) {
    setSavingRecovery(true)
    setError('')
    try {
      const updated = await readJson<RecoverySettings>(
        await fetch('/api/whatsapp/recovery-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      )
      setRecovery(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save recovery settings.')
    } finally {
      setSavingRecovery(false)
    }
  }

  const filteredChats = chats?.filter((chat) => {
    const label = chatLabel(chat).toLowerCase()
    const text = (chat.lastText || '').toLowerCase()
    const q = filterQuery.toLowerCase()
    return label.includes(q) || text.includes(q)
  })

  return (
    <main className="page-content">
      <header className="page-header">
        <div>
          <h1>WhatsApp Hub & AI Co-Pilot</h1>
          <p className="page-subtitle">Interactive web chat, AI quick replies, missed-call auto recovery & chat intelligence</p>
        </div>
        <div className="header-status-badge">
          <span className={`status-pill ${link?.connection === 'open' ? 'status-active' : 'status-idle'}`}>
            <span className="pulsing-dot" />
            <span>{link ? linkLabel(link.connection) : 'Checking...'}</span>
          </span>
        </div>
      </header>

      {error && (
        <div className="alert-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{error}</span>
        </div>
      )}

      {link?.qrDataUrl && (
        <section className="card-panel qr-sync-panel">
          <div className="qr-wrapper">
            <img src={link.qrDataUrl} alt="WhatsApp QR code" className="qr-image" />
          </div>
          <div className="qr-instructions">
            <h2>Link WhatsApp Web Instance</h2>
            <ol className="step-list">
              <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
              <li>Tap <strong>Settings / Menu (⋮)</strong> and select <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
            </ol>
            <p className="qr-note">Once scanned, messages will begin streaming directly into this portal.</p>
          </div>
        </section>
      )}

      {/* Two Automation Cards Side by Side */}
      <div className="automation-cards-grid">
        <section className="card-panel auto-reply-card">
          <div className="panel-header">
            <div className="title-with-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 12.5"/><path d="m16 8 5-5"/><path d="m18 11 3-3"/></svg>
              <h2>Pattern-Learned Auto-Reply</h2>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={reply?.enabled ?? true}
                onChange={(event) => {
                  const enabled = event.target.checked
                  setReply((current) => (current ? { ...current, enabled } : current))
                  fetch('/api/whatsapp/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled }),
                  })
                    .then((response) => readJson<ReplyState>(response))
                    .then(setReply)
                    .catch((reason: Error) => setError(reason.message))
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="reply-body">
            {reply == null ? (
              <p className="loading-text">Loading tone pattern...</p>
            ) : reply.exampleCount < 3 ? (
              <div className="pattern-learning">
                <span className="badge-amber">{reply.exampleCount} of 3 replies seen</span>
                <p>The AI is learning your personal reply pattern. Reply from your phone to train the automatic agent.</p>
              </div>
            ) : (
              <div className="pattern-ready">
                <span className="badge-emerald">Active Learned Pattern</span>
                <blockquote className="pattern-quote">"{reply.pattern}"</blockquote>
              </div>
            )}
          </div>
        </section>

        {/* Missed Call Auto-Recovery Card */}
        <section className="card-panel recovery-card">
          <div className="panel-header">
            <div className="title-with-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="22" y1="2" x2="2" y2="22"/></svg>
              <h2>Missed Call WhatsApp Recovery</h2>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={recovery?.enabled ?? true}
                onChange={(event) => {
                  const enabled = event.target.checked
                  saveRecovery({ enabled })
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="recovery-body">
            <p className="recovery-desc">
              Sends an immediate friendly WhatsApp greeting whenever a Telnyx voice call goes unanswered or missed.
            </p>
            <div className="recovery-input-wrap">
              <input
                type="text"
                className="recovery-template-input"
                value={recovery?.message || ''}
                onChange={(e) => setRecovery((r) => r ? { ...r, message: e.target.value } : r)}
                placeholder="Hi! We noticed we missed your call. How can we assist you today?"
              />
              <button
                type="button"
                className="btn-recovery-save"
                disabled={savingRecovery}
                onClick={() => recovery && saveRecovery({ message: recovery.message })}
              >
                {savingRecovery ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="messenger-layout">
        <section className="card-panel chat-list-panel">
          <div className="chat-search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search conversations..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="chat-search-input"
            />
          </div>

          {chats == null ? (
            <div className="loading-card">
              <div className="mini-spinner" />
              <p>Loading chats...</p>
            </div>
          ) : chats.length === 0 ? (
            <div className="empty-state">
              <p>No texts recorded yet.</p>
              <small>Incoming WhatsApp messages will appear here automatically.</small>
            </div>
          ) : (
            <ul className="chat-thread-list">
              {filteredChats?.map((chat) => {
                const isSelected = chat.jid === selected
                const label = chatLabel(chat)
                const initial = label.slice(0, 1).toUpperCase()
                return (
                  <li key={chat.jid}>
                    <button
                      type="button"
                      className={`chat-item-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => openChat(chat.jid, chat)}
                    >
                      <div className="chat-avatar">{initial}</div>
                      <div className="chat-preview-wrap">
                        <div className="chat-item-top">
                          <span className="chat-contact-name">{label}</span>
                          <span className="chat-msg-count-pill">{chat.messageCount}</span>
                        </div>
                        <span className="chat-last-snippet">{chat.lastText || 'Media or attachment'}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card-panel chat-view-panel">
          {!current ? (
            <div className="empty-chat-placeholder">
              <div className="empty-icon-circle">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <h3>Select a Conversation</h3>
              <p>Click on any contact on the left to read texts, send direct WhatsApp replies, and run AI summaries.</p>
            </div>
          ) : (
            <>
              <div className="chat-view-header">
                <div className="active-contact-info">
                  <div className="chat-avatar large">{chatLabel(current).slice(0, 1).toUpperCase()}</div>
                  <div>
                    <h2>{chatLabel(current)}</h2>
                    <span className="contact-jid">{current.jid}</span>
                  </div>
                </div>
                <div className="chat-stat-chips">
                  <a
                    href={`#/calls`}
                    className="chip-call-action"
                    title="Directly dial this contact on Telnyx WebRTC"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                    Call on Telnyx
                  </a>
                  <span className="chip-stat"><strong>{current.messageCount}</strong> messages</span>
                </div>
              </div>

              <div className="ai-summary-card">
                <div className="summary-card-header">
                  <div className="title-with-sparkle">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                    <strong>Gemini Conversation Summary</strong>
                  </div>
                  <button
                    type="button"
                    className="btn-summarize"
                    disabled={summarizing}
                    onClick={summarize}
                  >
                    {summarizing ? (
                      <span className="spinner-text"><span className="mini-spinner" /> Summarizing...</span>
                    ) : (
                      'Generate / Refresh Summary'
                    )}
                  </button>
                </div>
                {summary?.summaryText ? (
                  <p className="summary-content">{summary.summaryText}</p>
                ) : (
                  <p className="summary-empty">No summary generated yet. Click above to run Gemini AI on this transcript.</p>
                )}
                {summary?.summaryStale && (
                  <div className="stale-notice">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>Summary is stale: covers {summary.summaryMessageCount} of {current.transcriptCount} messages.</span>
                  </div>
                )}
              </div>

              {/* Chat Message Feed */}
              <div className="messages-stream">
                {messages == null ? (
                  <div className="loading-card">
                    <div className="mini-spinner" />
                    <p>Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="no-msgs-text">No messages recorded in this chat.</p>
                ) : (
                  <div className="bubble-list">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`message-bubble-row ${message.fromMe ? 'outgoing' : 'incoming'}`}
                      >
                        <div className="bubble-body">
                          <div className="bubble-meta">
                            <strong className="sender-name">
                              {message.fromMe ? 'You' : message.pushName || 'Sender'}
                            </strong>
                            <time className="timestamp">{when(message.timestamp)}</time>
                          </div>
                          <p className="bubble-text">{message.body}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* AI Co-Pilot Suggestion Pills */}
              <div className="co-pilot-container">
                <div className="co-pilot-header">
                  <div className="co-pilot-badge">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                    <span>AI Reply Co-Pilot</span>
                  </div>
                  <button
                    type="button"
                    className="btn-suggest-replies"
                    disabled={suggestingReplies}
                    onClick={requestAiSuggestions}
                  >
                    {suggestingReplies ? (
                      <span className="spinner-text"><span className="mini-spinner" /> Thinking...</span>
                    ) : (
                      '✨ Suggest Smart Replies'
                    )}
                  </button>
                </div>

                {suggestedReplies.length > 0 && (
                  <div className="suggested-chips-list">
                    {suggestedReplies.map((replyText, i) => (
                      <button
                        key={i}
                        type="button"
                        className="suggested-reply-chip"
                        onClick={() => setOutgoingText(replyText)}
                        title="Click to populate message box"
                      >
                        <span>"{replyText}"</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Interactive Web Message Composer */}
              <form
                className="chat-composer-bar"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendMessage()
                }}
              >
                <input
                  type="text"
                  className="composer-input"
                  placeholder={`Type a WhatsApp message to ${chatLabel(current)}...`}
                  value={outgoingText}
                  onChange={(e) => setOutgoingText(e.target.value)}
                  disabled={sendingMsg}
                />
                <button
                  type="submit"
                  className="btn-send-message"
                  disabled={sendingMsg || !outgoingText.trim()}
                  title="Send message"
                >
                  {sendingMsg ? (
                    <span className="mini-spinner" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  )}
                  <span>Send</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function linkLabel(connection: string) {
  if (connection === 'open') return 'Linked & Active'
  if (connection === 'qr') return 'Waiting for QR scan'
  if (connection === 'starting') return 'Starting engine'
  if (connection === 'close') return 'Disconnected'
  if (connection === 'error') return 'Service Offline'
  return connection
}
