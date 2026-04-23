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

  useEffect(() => { loadSessions() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingContent])

  const loadSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/sessions`, { headers: authHeaders })
      if (res.ok) setSessions(await res.json())
    } catch { }
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
    setMessages(prev => [...prev, { role: 'user', content: query }])
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
        for (const line of decoder.decode(value).split('\n')) {
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
              setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
              setStreamingContent('')
              loadSessions()
            } else if (data.type === 'error') {
              setError(data.message)
            }
          } catch { }
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
    <div className="chat-layout">
      {/* Sidebar */}
      <div className="chat-sidebar">
        <button className="button button-primary" onClick={startNewChat} style={{ width: '100%' }}>
          + New chat
        </button>
        <div className="chat-sidebar-label">Recent</div>
        <div className="chat-session-list">
          {sessions.length === 0 && (
            <div style={{ fontSize: '0.8rem', color: '#334155', padding: '4px 2px' }}>No chats yet</div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              className={`chat-session-item ${s.id === currentSessionId ? 'active' : ''}`}
              onClick={() => loadSession(s.id)}
            >
              <div className="chat-session-title">{s.title || 'Untitled'}</div>
              <div className="chat-session-date">{new Date(s.updated_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat main */}
      <div className="chat-main">
        <div className="chat-messages">
          {messages.length === 0 && !streamingContent && (
            <div className="chat-empty">
              Ask anything about<br />your transcripts.
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`msg ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
              <div className="msg-role">{msg.role === 'user' ? 'You' : 'AI'}</div>
              {msg.content}
            </div>
          ))}

          {(streamingContent || (loading && status)) && (
            <div className="msg msg-streaming">
              <div className="msg-role">AI</div>
              {streamingContent || <span style={{ opacity: 0.5 }}>{status}</span>}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && <div className="error" style={{ margin: '0 16px 12px' }}>{error}</div>}

        <div className="chat-input-row">
          <input
            className="chat-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your transcripts..."
            disabled={loading}
          />
          <button
            className="button button-primary"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            {loading ? '···' : 'Send'}
          </button>
        </div>
      </div>
    </div>
    </div>
  )
}

export default ChatTab
