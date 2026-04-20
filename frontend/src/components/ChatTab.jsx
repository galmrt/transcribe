import { useState, useEffect, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function ChatTab({ token }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [sessions, setSessions] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(generateUUID)
  const messagesEndRef = useRef(null)

  const authHeaders = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const loadSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/sessions`, { headers: authHeaders })
      if (res.ok) setSessions(await res.json())
    } catch {
      // non-fatal
    }
  }

  const loadSession = async (sessionId) => {
    try {
      const res = await fetch(`${API_URL}/chat/${sessionId}`, { headers: authHeaders })
      if (!res.ok) throw new Error('Session not found')
      const data = await res.json()
      setCurrentSessionId(sessionId)
      setMessages(data.messages || [])
      setError('')
    } catch (err) {
      setError(`Failed to load session: ${err.message}`)
    }
  }

  const startNewChat = () => {
    setMessages([])
    setCurrentSessionId(generateUUID())
    setStreamingContent('')
    setError('')
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const query = input
    setMessages((prev) => [...prev, { role: 'user', content: query }])
    setInput('')
    setLoading(true)
    setError('')
    setStreamingContent('')

    try {
      const res = await fetch(`${API_URL}/chat/${currentSessionId}/stream`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, query }),
      })

      if (!res.ok) throw new Error(`Request failed (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'status') {
              setStatus(data.message)
            } else if (data.type === 'chunk') {
              accumulated += data.content
              setStreamingContent(accumulated)
              setStatus('')
            } else if (data.type === 'done') {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: accumulated },
              ])
              setStreamingContent('')
              loadSessions()
            } else if (data.type === 'error') {
              setError(data.message)
            }
          } catch {
            // malformed line, skip
          }
        }
      }
    } catch (err) {
      setError(`Error: ${err.message}`)
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div style={{ display: 'flex', gap: '16px', height: '600px' }}>
      {/* Sidebar */}
      <div style={{
        width: '220px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <button
          className="button button-primary"
          onClick={startNewChat}
          style={{ width: '100%' }}
        >
          + New chat
        </button>

        <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
          Recent
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {sessions.length === 0 && (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No chats yet</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => loadSession(s.id)}
              style={{
                padding: '10px 12px',
                marginBottom: '4px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                background: s.id === currentSessionId ? '#3b82f6' : '#f8fafc',
                color: s.id === currentSessionId ? 'white' : '#1e293b',
                border: s.id === currentSessionId ? 'none' : '1px solid #e2e8f0',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.title || 'Untitled'}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>
                {new Date(s.updated_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px',
          marginBottom: '12px',
        }}>
          {messages.length === 0 && !streamingContent && (
            <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '100px', fontSize: '0.9rem' }}>
              Ask anything about your transcripts.
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: '10px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                  : '#f1f5f9',
                color: msg.role === 'user' ? 'white' : '#1e293b',
                marginLeft: msg.role === 'user' ? '15%' : '0',
                marginRight: msg.role === 'user' ? '0' : '15%',
                border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', opacity: 0.75 }}>
                {msg.role === 'user' ? 'You' : 'AI'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.95rem' }}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Streaming bubble */}
          {(streamingContent || (loading && status)) && (
            <div style={{
              marginBottom: '10px',
              padding: '12px 16px',
              borderRadius: '10px',
              background: '#f1f5f9',
              color: '#1e293b',
              marginRight: '15%',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', opacity: 0.75 }}>AI</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.95rem' }}>
                {streamingContent || <span style={{ color: '#94a3b8' }}>{status}</span>}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && <div className="error" style={{ marginBottom: '10px' }}>{error}</div>}

        {/* Input row */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your transcripts..."
            disabled={loading}
            style={{
              flex: 1,
              padding: '11px 14px',
              fontSize: '0.95rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#3b82f6' }}
            onBlur={(e) => { e.target.style.borderColor = '#e2e8f0' }}
          />
          <button
            className="button button-primary"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatTab
