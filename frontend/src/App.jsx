import { useState, useEffect, useRef } from 'react'
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
  return <img src="/logo.png" alt="logo" width="72" height="72" style={{ objectFit: 'contain', marginLeft: '-10px' }} />
}

function UserAvatar({ email }) {
  const initial = email ? email[0].toUpperCase() : '?'
  return (
    <div className="user-avatar">{initial}</div>
  )
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('record')

  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const discardRef = useRef(false)

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRecording, isPaused])

  const startRecording = async (onError) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (discardRef.current) { discardRef.current = false; return }
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
        setAudioBlob(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setIsPaused(false)
    } catch {
      onError?.('Could not access microphone. Please allow microphone access and try again.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.requestData()
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      setTimeout(() => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current.mimeType })
          setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
        }
      }, 50)
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setAudioUrl(null)
    setAudioBlob(null)
    setPreviewUrl(null)
    setElapsed(0)
    setIsPaused(false)
  }

  const discardRecording = () => {
    discardRef.current = true
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setAudioUrl(null)
    setAudioBlob(null)
    setPreviewUrl(null)
    setElapsed(0)
    setIsPaused(false)
  }

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

        {isRecording ? (
          <div className="recording-indicator">
            <span className={`recording-dot ${isPaused ? 'paused' : ''}`} />
            <span className="recording-indicator-text">
              {isPaused ? 'Paused' : formatTime(elapsed)}
            </span>
            <button className="recording-indicator-action" onClick={isPaused ? resumeRecording : pauseRecording}>
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button className="recording-indicator-action stop" onClick={discardRecording} title="Discard">✕</button>
          </div>
        ) : (
          <button
            className="sidebar-record-btn"
            onClick={() => startRecording()}
            title="Start recording"
          >
            <span className="sidebar-record-dot" />
            Start recording
          </button>
        )}

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
            <RecordTab
              token={token}
              isRecording={isRecording}
              isPaused={isPaused}
              audioBlob={audioBlob}
              audioUrl={audioUrl}
              previewUrl={previewUrl}
              elapsed={elapsed}
              startRecording={startRecording}
              stopRecording={stopRecording}
              pauseRecording={pauseRecording}
              resumeRecording={resumeRecording}
              resetRecording={resetRecording}
              discardRecording={discardRecording}
            />
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
