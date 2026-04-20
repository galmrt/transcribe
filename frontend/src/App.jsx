import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import AuthPage from './components/AuthPage'
import RecordTab from './components/RecordTab'
import HistoryTab from './components/HistoryTab'
import ChatTab from './components/ChatTab'

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
    return (
      <div className="app" style={{ color: 'white', textAlign: 'center', paddingTop: '100px' }}>
        Loading...
      </div>
    )
  }

  if (!session) {
    return <AuthPage />
  }

  const token = session.access_token

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div>
            <h1>Transcripts</h1>
            <p>Record audio, search your transcripts, ask questions.</p>
          </div>
          <button
            className="button button-secondary"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="card">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'record' ? 'active' : ''}`}
            onClick={() => setActiveTab('record')}
          >
            Record
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button
            className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
        </div>

        {activeTab === 'record'  && <RecordTab  token={token} />}
        {activeTab === 'history' && <HistoryTab token={token} />}
        {activeTab === 'chat'    && <ChatTab    token={token} />}
      </div>
    </div>
  )
}

export default App
