import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function TasksTab({ token }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authHeaders = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetch(`${API_URL}/tasks`, { headers: authHeaders })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch tasks')
        return res.json()
      })
      .then(data => setItems(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: '#475569', padding: '16px 0' }}>Loading...</div>
  if (error) return <div className="error">{error}</div>

  if (items.length === 0) {
    return (
      <div style={{ color: '#334155', fontSize: '0.9rem', padding: '32px 0', textAlign: 'center' }}>
        No action items yet. They'll appear here after you transcribe something.
      </div>
    )
  }

  return (
    <div className="tasks-list">
      {items.map(item => (
        <div key={item.id} className="task-card">
          <div className="task-card-header">
            <div className="task-card-title">{item.title}</div>
            <div className="task-card-date">{new Date(item.created_at).toLocaleDateString()}</div>
          </div>
          {item.tags && item.tags.length > 0 && (
            <div className="tag-list">
              {item.tags.map(tag => <span key={tag} className="tag-chip">{tag}</span>)}
            </div>
          )}
          <ul className="action-items-list">
            {(item.action_items || []).map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default TasksTab
