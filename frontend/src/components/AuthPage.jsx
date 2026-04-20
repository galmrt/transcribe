import { useState } from 'react'
import { supabase } from '../supabaseClient'

function AuthPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })

    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="app">
      <div className="auth-card">
        <h2>Transcripts</h2>
        <p className="subtitle">
          Record audio, search your transcripts,<br />and ask questions — all in one place.
        </p>

        {sent ? (
          <div className="auth-sent">
            Magic link sent — check your email.<br />
            <span style={{ opacity: 0.75, fontSize: '0.8rem' }}>You can close this tab and click the link from any device.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button
              type="submit"
              className="button button-primary"
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
          </form>
        )}

        {error && <div className="error" style={{ marginTop: '12px' }}>{error}</div>}

        <p style={{ marginTop: '24px', fontSize: '0.75rem', color: '#2a3f57' }}>
          No password. No tracking. Your data stays yours.
        </p>
      </div>
    </div>
  )
}

export default AuthPage
