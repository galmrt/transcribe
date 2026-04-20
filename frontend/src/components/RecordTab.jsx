import { useState, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function RecordTab({ token }) {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [cleanedText, setCleanedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const [audioUrl, setAudioUrl] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const authHeaders = { Authorization: `Bearer ${token}` }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
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
      // Step 1: transcribe
      setStatus('Transcribing audio...')
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

      // Step 2: clean + save
      setStatus('Cleaning and saving...')
      const cleanRes = await fetch(`${API_URL}/clean`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw }),
      })
      if (!cleanRes.ok) throw new Error(`Cleaning failed (${cleanRes.status})`)
      const { cleaned_text } = await cleanRes.json()
      setCleanedText(cleaned_text)
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
    setError('')
    setStatus('')
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        {!isRecording && !audioBlob && (
          <button className="button button-primary" onClick={startRecording}>
            Start Recording
          </button>
        )}

        {isRecording && (
          <button className="button button-danger" onClick={stopRecording}>
            Stop Recording
          </button>
        )}

        {audioBlob && !isRecording && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="button button-primary"
                onClick={transcribeAudio}
                disabled={loading}
              >
                {loading ? status || 'Processing...' : 'Transcribe & Save'}
              </button>
              <button className="button button-secondary" onClick={reset} disabled={loading}>
                Record again
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {transcript && (
        <div className="result">
          <h3>Raw transcript</h3>
          <p>{transcript}</p>
        </div>
      )}

      {cleanedText && (
        <div className="result" style={{ borderLeftColor: '#10b981' }}>
          <h3>Cleaned &amp; saved</h3>
          <p>{cleanedText}</p>
        </div>
      )}
    </div>
  )
}

export default RecordTab
