import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function HistoryTab({ token }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [expandedContent, setExpandedContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)

  const authHeaders = { Authorization: `Bearer ${token}` }

  useEffect(() => { fetchHistory() }, [])

  const fetchHistory = async () => {
    setLoading(true)
    setError('')
    setSearchQuery('')
    try {
      const res = await fetch(`${API_URL}/history`, { headers: authHeaders })
      if (!res.ok) throw new Error('Failed to fetch history')
      setHistory(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) { fetchHistory(); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `${API_URL}/search?query=${encodeURIComponent(searchQuery)}`,
        { method: 'POST', headers: authHeaders }
      )
      if (!res.ok) throw new Error('Search failed')
      setHistory(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); setExpandedContent(''); return }
    setExpandedId(id)
    setExpandedContent('')
    setContentLoading(true)
    try {
      const res = await fetch(`${API_URL}/transcript/${id}`, { headers: authHeaders })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setExpandedContent(data.content)
    } catch (err) {
      setExpandedContent(`Error: ${err.message}`)
    } finally {
      setContentLoading(false)
    }
  }

  return (
    <div>
      <div className="search-row">
        <input
          type="text"
          placeholder="Search transcripts..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="button button-primary" onClick={handleSearch} disabled={loading}>
          Search
        </button>
        <button className="button button-secondary" onClick={fetchHistory} disabled={loading}>
          All
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading && (
        <div style={{ color: '#475569', fontSize: '0.875rem', padding: '16px 0' }}>Loading...</div>
      )}

      {!loading && !error && history.length === 0 && (
        <div style={{ color: '#334155', fontSize: '0.9rem', padding: '32px 0', textAlign: 'center' }}>
          No transcripts yet. Record something on the Record tab.
        </div>
      )}

      <div className="history-list">
        {history.map(item => (
          <div
            key={item.id}
            className={`history-item ${expandedId === item.id ? 'expanded' : ''}`}
            onClick={() => toggleExpand(item.id)}
          >
            <div className="history-item-header">
              <div className="history-title">{item.title}</div>
              <div className="history-timestamp">{new Date(item.created_at).toLocaleString()}</div>
            </div>

            {expandedId === item.id && (
              <div className="history-content">
                {contentLoading ? 'Loading...' : expandedContent}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default HistoryTab
