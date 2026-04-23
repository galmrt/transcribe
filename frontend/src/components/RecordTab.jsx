import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

function RecordTab({ token }) {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [cleanedText, setCleanedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [mode, setMode] = useState('clean') // 'clean' | 'raw'
  const [instructions, setInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [tags, setTags] = useState([])
  const [actionItems, setActionItems] = useState([])

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const authHeaders = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    if (isRecording) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRecording])

  const startRecording = async () => {
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
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
        setAudioBlob(blob)
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setError('')
      setTranscript('')
      setCleanedText('')
    } catch {
      setError('Could not access microphone. Please allow microphone access and try again.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const transcribeAudio = async () => {
    if (!audioBlob) return
    setLoading(true)
    setError('')
    try {
      setStatus('Transcribing...')
      const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const formData = new FormData()
      formData.append('audio', audioBlob, `recording.${ext}`)
      const res = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      })
      if (!res.ok) throw new Error(`Transcription failed (${res.status})`)
      const { transcript: raw } = await res.json()
      setTranscript(raw)

      if (mode === 'clean') {
        setStatus('Cleaning & saving...')
        const cleanRes = await fetch(`${API_URL}/clean`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: raw, instructions }),
        })
        if (!cleanRes.ok) throw new Error(`Cleaning failed (${cleanRes.status})`)
        const { cleaned_text, tags: t, action_items: a } = await cleanRes.json()
        setCleanedText(cleaned_text)
        setTags(t || [])
        setActionItems(a || [])
      } else {
        setStatus('Saving...')
        const saveRes = await fetch(`${API_URL}/save`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: raw }),
        })
        if (!saveRes.ok) throw new Error(`Save failed (${saveRes.status})`)
        const { tags: t, action_items: a } = await saveRes.json()
        setTags(t || [])
        setActionItems(a || [])
      }
      setStatus('')
    } catch (err) {
      setError(err.message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setAudioBlob(null)
    setTranscript('')
    setCleanedText('')
    setTags([])
    setActionItems([])
    setError('')
    setStatus('')
    setElapsed(0)
  }

  return (
    <div className="record-page">

      {/* Centered record area */}
      <div className="record-stage">
        {!audioBlob && !isRecording && (
          <div className="record-hero">
            <div className="record-hero-title">What's on your mind?</div>
            <div className="record-hero-sub">Record a thought, meeting, or note — and ask questions about it later.</div>
          </div>
        )}

        {!audioBlob && (
          <>
            <button
              className={`record-btn ${isRecording ? 'record-btn-active' : 'record-btn-idle'}`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              <span className="record-btn-icon" />
            </button>

            {isRecording ? (
              <>
                <div className="record-timer">{formatTime(elapsed)}</div>
                <div className="record-label">Recording — tap to stop</div>
              </>
            ) : (
              <div className="record-label">Tap to start recording</div>
            )}
          </>
        )}

        {audioBlob && !isRecording && (
          <div className="record-actions">
            <audio controls src={audioUrl} style={{ width: '100%', borderRadius: '8px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="button button-primary"
                onClick={transcribeAudio}
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? status || 'Processing...' : 'Transcribe & Save'}
              </button>
              <button className="button button-secondary" onClick={reset} disabled={loading}>
                Redo
              </button>
            </div>
          </div>
        )}

        {/* Mode toggle — below record button */}
        {!audioBlob && !isRecording && (
          <div className="record-options">
            <div className="record-option-group">
              <div className="record-option-label">Output mode</div>
              <div className="record-option-hint">
                {mode === 'clean'
                  ? 'Removes filler words, fixes grammar, and applies your formatting instructions.'
                  : 'Saves the transcript exactly as spoken, with no edits.'}
              </div>
              <div className="mode-toggle" style={{ marginTop: '10px' }}>
                <button
                  className={`mode-btn ${mode === 'clean' ? 'active' : ''}`}
                  onClick={() => setMode('clean')}
                >
                  Clean
                </button>
                <button
                  className={`mode-btn ${mode === 'raw' ? 'active' : ''}`}
                  onClick={() => setMode('raw')}
                >
                  Raw
                </button>
              </div>
            </div>

            {mode === 'clean' && (
              <div className="record-option-group">
                <div className="record-option-label">Formatting instructions</div>
                <div className="record-option-hint">
                  Tell the AI how to format the result — e.g. "bullet list", "table", "highlight action items".
                  Leave blank to just clean the transcript.
                </div>
                <button
                  className="instructions-toggle"
                  style={{ marginTop: '10px' }}
                  onClick={() => setShowInstructions(v => !v)}
                >
                  {showInstructions ? '− Hide instructions' : '+ Add instructions'}
                </button>
                {showInstructions && (
                  <textarea
                    className="instructions-input"
                    style={{ marginTop: '8px' }}
                    placeholder="e.g. Format as a bullet list. Highlight action items."
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    rows={3}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {transcript && mode === 'clean' && (
        <div className="result">
          <h3>Raw transcript</h3>
          <div className="result-markdown">{transcript}</div>
        </div>
      )}

      {transcript && mode === 'raw' && !loading && (
        <div className="result result-success">
          <h3>Saved</h3>
          <div className="result-markdown">{transcript}</div>
        </div>
      )}

      {cleanedText && (
        <div className="result result-success">
          <h3>Cleaned & saved</h3>
          <div className="result-markdown">
            <ReactMarkdown>{cleanedText}</ReactMarkdown>
          </div>
          {tags.length > 0 && (
            <div className="tag-list" style={{ marginTop: '12px' }}>
              {tags.map(tag => <span key={tag} className="tag-chip">{tag}</span>)}
            </div>
          )}
          {actionItems.length > 0 && (
            <div className="action-items">
              <div className="action-items-label">Action items</div>
              <ul className="action-items-list">
                {actionItems.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {transcript && mode === 'raw' && !loading && tags.length > 0 && (
        <div className="tag-list" style={{ marginTop: '12px' }}>
          {tags.map(tag => <span key={tag} className="tag-chip">{tag}</span>)}
        </div>
      )}

      {transcript && mode === 'raw' && !loading && actionItems.length > 0 && (
        <div className="action-items">
          <div className="action-items-label">Action items</div>
          <ul className="action-items-list">
            {actionItems.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

export default RecordTab
