import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import AuthPage from './components/AuthPage'
import RecordTab from './components/RecordTab'
import HistoryTab from './components/HistoryTab'
import ChatTab from './components/ChatTab'
import TasksTab from './components/TasksTab'

const NAV_ITEMS = [
  { id: 'record',  label: 'Record'  },
  { id: 'history', label: 'History' },
  { id: 'tasks',   label: 'Tasks'   },
  { id: 'chat',    label: 'Chat'    },
]

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#2d6be4"/>
      <rect x="13" y="6" width="6" height="12" rx="3" fill="white"/>
      <path d="M9 17a7 7 0 0014 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <rect x="15" y="24" width="2" height="4" fill="white"/>
    </svg>
  )
}

function UserAvatar({ email }) {
  const initial = email ? email[0].toUpperCase() : '?'
  return (
    <div className="user-avatar">{initial}</div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('record')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div className="app-loading">Loading...</div>
  }

  if (!session) {
    return <AuthPage />
  }

  const token = session.access_token

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <MicIcon />
          <div>
            <div className="sidebar-brand-name">Transcripts</div>
            <div className="sidebar-brand-tagline">Voice to knowledge</div>
          </div>
        </div>

        <div className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user-row">
            <UserAvatar email={session.user.email} />
            <div className="sidebar-user-email">{session.user.email}</div>
          </div>
          <button
            className="nav-item signout"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="main-content">
        {activeTab === 'record' && (
          <div className="record-wrapper">
            <RecordTab token={token} />
          </div>
        )}
        {activeTab === 'history' && (
          <div className="content-padded">
            <HistoryTab token={token} />
          </div>
        )}
        {activeTab === 'tasks' && (
          <div className="content-padded">
            <TasksTab token={token} />
          </div>
        )}
        {activeTab === 'chat' && <ChatTab token={token} />}
      </main>
    </div>
  )
}

export default App
