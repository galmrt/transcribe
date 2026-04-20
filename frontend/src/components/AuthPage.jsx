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

    const { error } = await supabase.auth.signInWithOtp({ email })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="app">
      <div className="auth-card">
        <h2>Transcripts</h2>
        <p className="subtitle">
          Record audio, search your transcripts, ask questions.
          <br />Sign in with a magic link — no password needed.
        </p>

        {sent ? (
          <div className="auth-sent">
            Check your email for a magic link.
            <br />You can close this tab and click the link from any device.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
      </div>
    </div>
  )
}

export default AuthPage
