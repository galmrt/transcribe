import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import AudioPlayer from './AudioPlayer'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function toWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new AudioContext()
  let audioBuffer
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    await ctx.close()
  }
  const sampleRate = 16000
  const offline = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * sampleRate), sampleRate)
  const src = offline.createBufferSource()
  src.buffer = audioBuffer
  src.connect(offline.destination)
  src.start(0)
  const rendered = await offline.startRendering()
  return encodeWav(rendered)
}

function encodeWav(buf) {
  const samples = buf.getChannelData(0)
  const n = samples.length
  const ab = new ArrayBuffer(44 + n * 2)
  const v = new DataView(ab)
  const str = (off, s) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  let off = 44
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    off += 2
  }
  return new Blob([ab], { type: 'audio/wav' })
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

function generateRings() {
  return Array.from({ length: 8 }, () => ({
    x: `${8 + Math.random() * 84}%`,
    y: `${8 + Math.random() * 84}%`,
    d: `${(Math.random() * 3.5).toFixed(2)}s`,
    s: `${(0.7 + Math.random() * 0.7).toFixed(2)}`,
  }))
}

function CollapsibleText({ children, render }) {
  const ref = useRef(null)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (ref.current) {
      setOverflows(ref.current.scrollHeight > ref.current.clientHeight + 4)
    }
  }, [children])

  return (
    <>
      <div ref={ref} className={`result-markdown result-collapsible ${expanded ? 'expanded' : ''}`}>
        {render ? render(children) : children}
      </div>
      {(overflows || expanded) && (
        <button className="result-collapse-toggle-btn" onClick={() => setExpanded(v => !v)}>
          {expanded ? 'Show less ↑' : 'Show more ↓'}
        </button>
      )}
    </>
  )
}

function RecordTab({ token, isRecording, isPaused, audioBlob, audioUrl, previewUrl, elapsed, startRecording, stopRecording, pauseRecording, resumeRecording, resetRecording, discardRecording }) {
  const [transcript, setTranscript] = useState('')
  const [cleanedText, setCleanedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState('clean')
  const [instructions, setInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [tags, setTags] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [rings, setRings] = useState([])
  const [autoTranscribe, setAutoTranscribe] = useState(false)
  const transcribeRef = useRef(null)

  const authHeaders = { Authorization: `Bearer ${token}` }

  const transcribeAudio = async (blob) => {
    const b = blob || audioBlob
    if (!b) return
    setLoading(true)
    setError('')
    try {
      setStatus('Preparing audio...')
      let audioToSend = b
      let ext = b.type.includes('mp4') ? 'mp4' : 'webm'
      try {
        audioToSend = await toWav(b)
        ext = 'wav'
      } catch (e) {
        console.warn('WAV conversion failed, sending original:', e)
      }
      setStatus('Transcribing...')
      const formData = new FormData()
      formData.append('audio', audioToSend, `recording.${ext}`)
      const res = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Transcription failed (${res.status})`)
      }
      const { transcript: raw } = await res.json()

      if (!raw || !raw.trim()) {
        setError('Nothing was recorded — the audio appears to be empty or silent.')
        setStatus('')
        setLoading(false)
        return
      }

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

  // keep a ref so the useEffect below always calls the latest version
  transcribeRef.current = transcribeAudio

  // when stopRecording() fires and audioBlob is set, auto-transcribe if requested
  useEffect(() => {
    if (audioBlob && autoTranscribe) {
      setAutoTranscribe(false)
      transcribeRef.current(audioBlob)
    }
  }, [audioBlob, autoTranscribe])

  // Regenerate rings each time a new recording session starts
  useEffect(() => {
    if (isRecording && !isPaused) setRings(prev => prev.length === 0 ? generateRings() : prev)
  }, [isRecording])

  const handleStartRecording = () => {
    setTranscript('')
    setCleanedText('')
    setTags([])
    setActionItems([])
    setError('')
    setRings([])
    startRecording((err) => setError(err))
  }

  const handleTranscribeFromPause = () => {
    setAutoTranscribe(true)
    stopRecording()
  }

  const handleDiscard = () => {
    discardRecording()
    setTranscript('')
    setCleanedText('')
    setTags([])
    setActionItems([])
    setError('')
    setStatus('')
  }

  const reset = () => {
    resetRecording()
    setTranscript('')
    setCleanedText('')
    setTags([])
    setActionItems([])
    setError('')
    setStatus('')
  }

  const hasResults = transcript || cleanedText

  return (
    <div className={`record-page ${isRecording && !isPaused ? 'is-recording' : ''}`}>

      {isRecording && (
        <div className={`recording-rings ${isPaused ? 'rings-paused' : ''}`} aria-hidden="true">
          {rings.map((r, i) => (
            <div key={i} className="recording-ring" style={{ '--x': r.x, '--y': r.y, '--d': r.d, '--s': r.s }} />
          ))}
        </div>
      )}

      <div className="record-stage">

        {!audioBlob && (
          <div className="record-hero">
            <div className="record-hero-title">What's on your mind?</div>
            <div className="record-hero-sub">Record a thought, meeting, or note — and ask questions about it later.</div>
          </div>
        )}

        {/* Record button — shown while idle or actively recording */}
        {!audioBlob && (
          <>
            <button
              className={`record-btn ${isRecording ? (isPaused ? 'record-btn-paused' : 'record-btn-active') : 'record-btn-idle'}`}
              onClick={isRecording ? (isPaused ? resumeRecording : pauseRecording) : handleStartRecording}
            >
              <span className="record-btn-icon" />
            </button>

            {isRecording && !isPaused && (
              <>
                <div className="record-timer">{formatTime(elapsed)}</div>
                <div className="record-label">Recording — tap to pause</div>
              </>
            )}

            {!isRecording && !isPaused && (
              <div className="record-label">Tap to start recording</div>
            )}
          </>
        )}

        {/* Paused state — shown while paused, no blob yet */}
        {isPaused && !audioBlob && (
          <div className="record-paused-options">
            <div className="record-timer" style={{ color: '#6b7280' }}>{formatTime(elapsed)}</div>
            <div className="record-label" style={{ color: '#6b7280' }}>Paused — tap button to continue</div>
            {previewUrl && <AudioPlayer src={previewUrl} knownDuration={elapsed} />}
            <button
              className="button button-primary record-ready-btn"
              onClick={handleTranscribeFromPause}
              disabled={loading || elapsed < 1}
            >
              {loading ? status || 'Processing...' : 'Transcribe & Save'}
            </button>
            <button className="button button-secondary record-ready-btn-secondary" onClick={handleDiscard}>
              Discard & Redo
            </button>
          </div>
        )}

        {/* Post-stop: audio player + buttons */}
        {audioBlob && !isRecording && (
          <div className="record-ready">
            <div className="record-ready-icon">✓</div>
            <div className="record-ready-title">Recording complete</div>
            <AudioPlayer src={audioUrl} knownDuration={elapsed} />
            <div className="record-ready-actions">
              {hasResults ? (
                <button className="button button-primary record-ready-btn" onClick={reset}>
                  Make another recording
                </button>
              ) : (
                <>
                  <button
                    className="button button-primary record-ready-btn"
                    onClick={() => transcribeAudio()}
                    disabled={loading || elapsed < 1}
                  >
                    {loading ? status || 'Processing...' : 'Transcribe & Save'}
                  </button>
                  <button className="button button-secondary record-ready-btn-secondary" onClick={reset} disabled={loading}>
                    Discard & Redo
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Mode toggle */}
        {!audioBlob && (
          <div className="record-options">
            <div className="record-option-group">
              <div className="record-option-label">Output mode</div>
              <div className="record-option-hint">
                {mode === 'clean'
                  ? 'Removes filler words, fixes grammar, and applies your formatting instructions.'
                  : 'Saves the transcript exactly as spoken, with no edits.'}
              </div>
              <div className="mode-toggle" style={{ marginTop: '10px' }}>
                <button className={`mode-btn ${mode === 'clean' ? 'active' : ''}`} onClick={() => setMode('clean')}>Clean</button>
                <button className={`mode-btn ${mode === 'raw' ? 'active' : ''}`} onClick={() => setMode('raw')}>Raw</button>
              </div>
            </div>

            {mode === 'clean' && (
              <div className="record-option-group">
                <div className="record-option-label">Formatting instructions</div>
                <div className="record-option-hint">
                  Tell the AI how to format the result — e.g. "bullet list", "table", "highlight action items".
                  Leave blank to just clean the transcript.
                </div>
                <button className="instructions-toggle" style={{ marginTop: '10px' }} onClick={() => setShowInstructions(v => !v)}>
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

      {/* Full-width results */}
      {error && <div className="error record-result-pad">{error}</div>}

      {transcript && mode === 'clean' && (
        <div className="result record-result-pad">
          <h3>Raw transcript</h3>
          <CollapsibleText>{transcript}</CollapsibleText>
        </div>
      )}

      {transcript && mode === 'raw' && !loading && (
        <div className="result result-success record-result-pad">
          <h3>Saved</h3>
          <CollapsibleText>{transcript}</CollapsibleText>
        </div>
      )}

      {cleanedText && (
        <div className="result result-success record-result-pad">
          <h3>Cleaned & saved</h3>
          <CollapsibleText render={(c) => <ReactMarkdown>{c}</ReactMarkdown>}>{cleanedText}</CollapsibleText>
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
        <div className="tag-list record-result-pad">
          {tags.map(tag => <span key={tag} className="tag-chip">{tag}</span>)}
        </div>
      )}

      {transcript && mode === 'raw' && !loading && actionItems.length > 0 && (
        <div className="action-items record-result-pad">
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
