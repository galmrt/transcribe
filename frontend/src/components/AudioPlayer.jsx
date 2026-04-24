import { useState, useRef, useEffect } from 'react'

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = String(Math.floor(seconds % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function AudioPlayer({ src, knownDuration }) {
  const audioRef = useRef(null)
  const barRef = useRef(null)
  const isDragging = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(knownDuration || 0)

  useEffect(() => {
    const audio = audioRef.current

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => { setPlaying(false); audio.currentTime = 0; setCurrentTime(0) }
    const onDurationChange = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('durationchange', onDurationChange)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('durationchange', onDurationChange)
    }
  }, [src])

  const seekTo = (e) => {
    const audio = audioRef.current
    const dur = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : duration
    if (!dur) return
    const rect = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * dur
    setCurrentTime(audio.currentTime)
  }

  const onMouseDown = (e) => {
    isDragging.current = true
    seekTo(e)
  }

  const onMouseMove = (e) => {
    if (!isDragging.current) return
    seekTo(e)
  }

  const onMouseUp = () => { isDragging.current = false }

  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [duration])

  const togglePlay = () => {
    const audio = audioRef.current
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play(); setPlaying(true) }
  }

  const effectiveDuration = (isFinite(audioRef.current?.duration) && audioRef.current?.duration > 0)
    ? audioRef.current.duration
    : duration
  const progress = effectiveDuration ? (currentTime / effectiveDuration) * 100 : 0

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button className="audio-player-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
        }
      </button>

      <div ref={barRef} className="audio-player-bar" onMouseDown={onMouseDown}>
        <div className="audio-player-progress" style={{ width: `${progress}%` }} />
      </div>

      <div className="audio-player-time">
        {formatTime(currentTime)} / {formatTime(effectiveDuration)}
      </div>
    </div>
  )
}

export default AudioPlayer
