import { useEffect, useState, type FormEvent } from 'react'

export type SessionUser = {
  id: number
  email: string
  name: string
  role: 'admin' | 'user'
  balanceUnits: number
}

type DashboardData = {
  balance: string
  spent: string
  durationSeconds: number
  pendingCostCount: number
  byDestination: { destination: string, calls: number, durationSeconds: number, amount: string }[]
  ledger: { id: number, kind: string, amount: string, note: string | null, createdAt: string }[]
}

type GalleryNumber = {
  phoneNumber: string
  type: string
  region: string
  upfrontCost: string
  monthlyCost: string
  currency: string
  features: string[]
}

type OwnedNumber = {
  phone_number: string
  region: string | null
  upfront_cost: string | null
  monthly_cost: string | null
  currency: string | null
  ordered_at: string
}

type CreditRequest = {
  id: number
  email: string | null
  name: string | null
  amount: string
  note: string | null
  status: string
  createdAt: string
}

const countries: readonly [string, string, string][] = [
  ['US', 'United States', '🇺🇸'],
  ['CA', 'Canada', '🇨🇦'],
  ['GB', 'United Kingdom', '🇬🇧'],
  ['AU', 'Australia', '🇦🇺'],
  ['PK', 'Pakistan', '🇵🇰'],
  ['DE', 'Germany', '🇩🇪'],
  ['FR', 'France', '🇫🇷'],
  ['AE', 'United Arab Emirates', '🇦🇪'],
]

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Request failed.')
  return body
}

function dollars(value: string | number, digits = 2) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return String(value)
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function minutes(seconds: number) {
  return `${(seconds / 60).toFixed(1)} min`
}

function when(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function AuthScreen({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [mode, setMode] = useState(window.location.hash === '#/signup' ? 'signup' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = await readJson<SessionUser>(
        await fetch(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })
      )
      window.location.hash = '#/'
      onSuccess(user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <main className="auth-card">
        <div className="auth-header">
          <div className="brand-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <h1>{mode === 'signup' ? 'Create your account' : 'Welcome to Desk'}</h1>
          <p className="auth-subtitle">
            {mode === 'signup'
              ? 'Sign up to start placing calls and managing Telnyx voice'
              : 'Sign in to access your calls, numbers, and balance'}
          </p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError('') }}
          >
            Create account
          </button>
        </div>

        <form className="stack" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="field">
              <span>Full Name</span>
              <div className="input-with-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
            </label>
          )}

          <label className="field">
            <span>Email Address</span>
            <div className="input-with-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-with-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                required
              />
            </div>
          </label>

          {error && (
            <div className="alert-banner" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}

          <button className="btn-primary full-width" type="submit" disabled={busy}>
            {busy ? (
              <span className="spinner-text">
                <span className="mini-spinner" /> Processing...
              </span>
            ) : mode === 'signup' ? (
              'Create account'
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span>Protected with Telnyx WebRTC & Session Security</span>
        </div>
      </main>
    </div>
  )
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/dashboard')
      .then((response) => readJson<DashboardData>(response))
      .then(setData)
      .catch((reason: Error) => setError(reason.message))
  }, [])

  return (
    <main className="page-content">
      <header className="page-header">
        <div>
          <h1>Dashboard Overview</h1>
          <p className="page-subtitle">Real-time balances, minute usage, and destination cost breakdowns</p>
        </div>
        <div className="header-actions">
          <a href="#/calls" className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            Make a Call
          </a>
          <a href="#/billing" className="btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Add Credit
          </a>
        </div>
      </header>

      {error && (
        <div className="alert-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{error}</span>
        </div>
      )}

      {!data ? (
        <div className="loading-card">
          <div className="mini-spinner" />
          <p>Loading your account stats...</p>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card balance-card">
              <div className="stat-icon-wrapper emerald">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Available Balance</span>
                <span className="stat-value">{dollars(data.balance)}</span>
                <span className="stat-hint">Approved credit available for calls & numbers</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon-wrapper indigo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Total Spent</span>
                <span className="stat-value">{dollars(data.spent, 4)}</span>
                <span className="stat-hint">Billed charges via Telnyx rates</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon-wrapper violet">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Telnyx Minutes</span>
                <span className="stat-value">{minutes(data.durationSeconds)}</span>
                <span className="stat-hint">Actual answered talk time</span>
              </div>
            </div>
          </div>

          {data.pendingCostCount > 0 && (
            <div className="info-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>{data.pendingCostCount} ended {data.pendingCostCount === 1 ? 'call is' : 'calls are'} waiting on Telnyx pricing. Refresh cost under Calls anytime.</span>
            </div>
          )}

          <div className="dashboard-sections">
            <section className="card-panel">
              <div className="panel-header">
                <h2>Usage by Destination</h2>
                <span className="badge-neutral">{data.byDestination.length} destinations</span>
              </div>
              {data.byDestination.length === 0 ? (
                <div className="empty-state">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  <p>No priced calls recorded yet.</p>
                  <small>Once Telnyx prices an answered call, destination stats will appear here.</small>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Destination</th>
                        <th>Calls</th>
                        <th>Minutes</th>
                        <th>Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDestination.map((row) => (
                        <tr key={row.destination}>
                          <td>
                            <span className="destination-badge">{row.destination}</span>
                          </td>
                          <td>{row.calls}</td>
                          <td>{minutes(row.durationSeconds)}</td>
                          <td className="amount-col">{dollars(row.amount, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card-panel">
              <div className="panel-header">
                <h2>Recent Ledger Activity</h2>
                <span className="badge-neutral">{data.ledger.length} entries</span>
              </div>
              {data.ledger.length === 0 ? (
                <div className="empty-state">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <p>No ledger entries yet.</p>
                  <small>Credit approvals and number orders will be tracked here.</small>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Type</th>
                        <th>Note / Description</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((row) => (
                        <tr key={row.id}>
                          <td>{when(row.createdAt)}</td>
                          <td>
                            <span className={`badge ${row.kind.toLowerCase().includes('credit') ? 'badge-emerald' : 'badge-indigo'}`}>
                              {row.kind}
                            </span>
                          </td>
                          <td className="note-col">{row.note || '—'}</td>
                          <td className="amount-col font-mono">{dollars(row.amount, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  )
}

function chargeUnits(item: GalleryNumber) {
  const upfront = Number(item.upfrontCost)
  const monthly = Number(item.monthlyCost)
  const charge = Number.isFinite(upfront) && upfront > 0 ? upfront : monthly
  if (!Number.isFinite(charge) || charge < 0) return null
  return Math.round(charge * 10000)
}

export function NumbersPage() {
  const [country, setCountry] = useState('US')
  const [area, setArea] = useState('')
  const [contains, setContains] = useState('')
  const [results, setResults] = useState<GalleryNumber[] | null>(null)
  const [owned, setOwned] = useState<OwnedNumber[]>([])
  const [balanceUnits, setBalanceUnits] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function loadOwned() {
    setOwned(await readJson<OwnedNumber[]>(await fetch('/api/numbers')))
  }

  useEffect(() => {
    loadOwned().catch((reason: Error) => setError(reason.message))
    fetch('/api/auth/me')
      .then((response) => readJson<SessionUser>(response))
      .then((user) => setBalanceUnits(user.balanceUnits))
      .catch(() => setBalanceUnits(0))
  }, [])

  async function search(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResults(null)
    const params = new URLSearchParams({ country, area, contains })
    try {
      setResults(await readJson<GalleryNumber[]>(await fetch(`/api/numbers/available?${params}`)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The gallery did not load.')
    }
  }

  async function buy(phoneNumber: string) {
    setBusy(phoneNumber)
    setError('')
    try {
      await readJson(
        await fetch('/api/numbers/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber, country }),
        })
      )
      await loadOwned()
      setResults((current) => current?.filter((item) => item.phoneNumber !== phoneNumber) ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The number was not purchased.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="page-content">
      <header className="page-header">
        <div>
          <h1>Phone Numbers Store</h1>
          <p className="page-subtitle">Search Telnyx inventory and purchase dedicated phone numbers using your account balance</p>
        </div>
      </header>

      {balanceUnits === 0 && (
        <div className="alert-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Your balance is $0.00. Please request credit in Billing before purchasing numbers.</span>
        </div>
      )}

      {error && (
        <div className="alert-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{error}</span>
        </div>
      )}

      {owned.length > 0 && (
        <section className="card-panel">
          <div className="panel-header">
            <h2>Your Assigned Numbers</h2>
            <span className="badge-emerald">{owned.length} active</span>
          </div>
          <div className="owned-grid">
            {owned.map((item) => (
              <div key={item.phone_number} className="owned-card">
                <div className="number-display">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  <span className="phone-bold">{item.phone_number}</span>
                </div>
                <div className="number-meta">
                  <span className="badge-neutral">{item.region || 'Assigned'}</span>
                  <small>Ordered {when(item.ordered_at)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card-panel">
        <div className="panel-header">
          <h2>Search Inventory</h2>
          <span className="badge-neutral">Live Telnyx Catalog</span>
        </div>
        <form className="search-form" onSubmit={search}>
          <div className="field-group">
            <label className="field">
              <span>Country</span>
              <select value={country} onChange={(event) => setCountry(event.target.value)}>
                {countries.map(([code, label, flag]) => (
                  <option key={code} value={code}>
                    {flag} {label} ({code})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Area Code</span>
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                inputMode="numeric"
                placeholder="e.g. 415"
              />
            </label>

            <label className="field">
              <span>Contains Digits</span>
              <input
                value={contains}
                onChange={(event) => setContains(event.target.value)}
                placeholder="e.g. 202 or VIP"
              />
            </label>
          </div>

          <button className="btn-primary" type="submit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Search Numbers
          </button>
        </form>

        <div className="results-container">
          {results == null && !error ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <p>Filter by country or area code above and click Search.</p>
            </div>
          ) : results == null ? null : results.length === 0 ? (
            <div className="empty-state">
              <p>No numbers matched those filters. Try another area code or country.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {results.map((item) => {
                const cost = chargeUnits(item)
                const short =
                  balanceUnits == null || balanceUnits <= 0 || (cost != null && balanceUnits < cost)
                return (
                  <div key={item.phoneNumber} className="gallery-card">
                    <div className="gallery-header">
                      <span className="phone-bold">{item.phoneNumber}</span>
                      <span className="badge-neutral">{item.region || item.type || country}</span>
                    </div>

                    <div className="cost-breakdown">
                      <div>
                        <small>Upfront</small>
                        <strong>{dollars(item.upfrontCost)}</strong>
                      </div>
                      <div>
                        <small>Monthly</small>
                        <strong>{dollars(item.monthlyCost)}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`btn-primary full-width ${short ? 'btn-disabled' : ''}`}
                      disabled={short || busy === item.phoneNumber}
                      onClick={() => buy(item.phoneNumber)}
                    >
                      {busy === item.phoneNumber ? (
                        <span className="spinner-text"><span className="mini-spinner" /> Ordering...</span>
                      ) : short ? (
                        'Insufficient balance'
                      ) : (
                        'Purchase Number'
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export function BillingPage() {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<CreditRequest[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setRows(await readJson<CreditRequest[]>(await fetch('/api/billing/requests')))
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await readJson(
        await fetch('/api/billing/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, note }),
        })
      )
      setAmount('')
      setNote('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request was not sent.')
    } finally {
      setBusy(false)
    }
  }

  const quickAmounts = ['10.00', '25.00', '50.00', '100.00']

  return (
    <main className="page-content">
      <header className="page-header">
        <div>
          <h1>Credit & Billing</h1>
          <p className="page-subtitle">Request balance credits for calls and phone number purchases</p>
        </div>
      </header>

      <div className="billing-grid">
        <section className="card-panel">
          <div className="panel-header">
            <h2>Request Balance Credit</h2>
          </div>
          <form className="stack" onSubmit={submit}>
            <div className="field">
              <span>Quick Select Amount</span>
              <div className="quick-chips">
                {quickAmounts.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`chip ${amount === q ? 'active' : ''}`}
                    onClick={() => setAmount(q)}
                  >
                    +${q.split('.')[0]}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span>Amount (USD)</span>
              <div className="input-with-icon">
                <span className="currency-prefix">$</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="25.00"
                  required
                />
              </div>
            </label>

            <label className="field">
              <span>Note / Purpose (Optional)</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Outbound marketing campaign"
              />
            </label>

            {error && (
              <div className="alert-banner" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{error}</span>
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? <span className="spinner-text"><span className="mini-spinner" /> Submitting...</span> : 'Submit Credit Request'}
            </button>
          </form>
        </section>

        <section className="card-panel">
          <div className="panel-header">
            <h2>Your Requests History</h2>
            <span className="badge-neutral">{rows ? rows.length : 0} total</span>
          </div>

          {rows == null ? (
            <div className="loading-card">
              <div className="mini-spinner" />
              <p>Loading requests history...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <p>No credit requests submitted yet.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Note</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{when(row.createdAt)}</td>
                      <td className="amount-col font-mono">{dollars(row.amount)}</td>
                      <td className="note-col">{row.note || '—'}</td>
                      <td>
                        <span
                          className={`badge ${
                            row.status === 'approved'
                              ? 'badge-emerald'
                              : row.status === 'rejected'
                              ? 'badge-rose'
                              : 'badge-amber'
                          }`}
                        >
                          {row.status}
                        </span>
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

export function AdminPage() {
  const [rows, setRows] = useState<CreditRequest[] | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setRows(await readJson<CreditRequest[]>(await fetch('/api/billing/requests')))
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
  }, [])

  async function decide(id: number, approve: boolean) {
    setError('')
    try {
      await readJson(
        await fetch(`/api/billing/requests/${id}/${approve ? 'approve' : 'reject'}`, {
          method: 'POST',
        })
      )
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The decision was not saved.')
    }
  }

  const pending = rows?.filter((row) => row.status === 'pending') ?? []

  return (
    <main className="page-content">
      <header className="page-header">
        <div>
          <h1>Credit Approvals</h1>
          <p className="page-subtitle">Review, approve, or reject user balance credit requests</p>
        </div>
        <div className="header-badge-group">
          <span className="badge-amber">{pending.length} pending review</span>
        </div>
      </header>

      {error && (
        <div className="alert-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{error}</span>
        </div>
      )}

      <section className="card-panel">
        <div className="panel-header">
          <h2>Pending Review Queue</h2>
        </div>

        {rows == null ? (
          <div className="loading-card">
            <div className="mini-spinner" />
            <p>Loading credit requests...</p>
          </div>
        ) : pending.length === 0 ? (
          <div className="empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <p>All caught up! No credit requests are waiting for approval.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Requested</th>
                  <th>Purpose / Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="user-cell">
                        <strong>{row.name || 'Anonymous User'}</strong>
                        <small>{row.email}</small>
                      </div>
                    </td>
                    <td className="amount-col font-mono text-lg">{dollars(row.amount)}</td>
                    <td className="note-col">{row.note || '—'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-approve"
                          onClick={() => decide(row.id, true)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-reject"
                          onClick={() => decide(row.id, false)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
