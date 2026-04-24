export default function RecordingDino() {
  return (
    <div className="dino-scene" aria-hidden="true">
      <div className="dino-ground" />

      {/* Dino */}
      <div className="dino-wrapper">
        <svg width="52" height="56" viewBox="0 0 52 56" fill="none">
          {/* Tail */}
          <polygon points="0,36 12,28 12,36" fill="#4a6a8a" />
          {/* Body */}
          <rect x="10" y="20" width="26" height="18" rx="3" fill="#4a6a8a" />
          {/* Back bump */}
          <rect x="18" y="14" width="16" height="10" rx="3" fill="#4a6a8a" />
          {/* Neck */}
          <rect x="30" y="10" width="10" height="16" rx="2" fill="#4a6a8a" />
          {/* Head */}
          <rect x="26" y="4" width="22" height="13" rx="3" fill="#4a6a8a" />
          {/* Eye */}
          <circle cx="44" cy="9" r="2.5" fill="white" />
          <circle cx="44.5" cy="9.5" r="1" fill="#4a6a8a" />
          {/* Mouth notch */}
          <rect x="46" y="15" width="4" height="2" rx="1" fill="#4a6a8a" />
          {/* Arm */}
          <rect x="32" y="28" width="5" height="8" rx="2" fill="#4a6a8a" />
          {/* Legs */}
          <rect className="dino-leg-l" x="13" y="37" width="8" height="16" rx="3" fill="#4a6a8a" style={{ transformOrigin: '17px 37px' }} />
          <rect className="dino-leg-r" x="24" y="37" width="8" height="16" rx="3" fill="#4a6a8a" style={{ transformOrigin: '28px 37px' }} />
        </svg>
      </div>

      {/* Cacti */}
      <div className="dino-cactus" style={{ '--cdelay': '0.3s', '--cspeed': '3.2s' }}>
        <Cactus />
      </div>
      <div className="dino-cactus" style={{ '--cdelay': '1.9s', '--cspeed': '3.6s' }}>
        <Cactus tall />
      </div>
      <div className="dino-cactus" style={{ '--cdelay': '3.4s', '--cspeed': '3.0s' }}>
        <Cactus />
      </div>
    </div>
  )
}

function Cactus({ tall }) {
  const h = tall ? 38 : 28
  return (
    <svg width="20" height={h + 10} viewBox={`0 0 20 ${h + 10}`} fill="none">
      {/* Main stem */}
      <rect x="7" y="0" width="6" height={h} rx="2" fill="#4a6a8a" />
      {/* Left arm */}
      <rect x="1" y={h * 0.3} width="8" height="5" rx="2" fill="#4a6a8a" />
      <rect x="1" y={h * 0.1} width="5" height={h * 0.25} rx="2" fill="#4a6a8a" />
      {/* Right arm */}
      <rect x="11" y={h * 0.45} width="8" height="5" rx="2" fill="#4a6a8a" />
      <rect x="14" y={h * 0.25} width="5" height={h * 0.25} rx="2" fill="#4a6a8a" />
      {/* Base */}
      <rect x="4" y={h} width="12" height="6" rx="2" fill="#4a6a8a" />
    </svg>
  )
}
