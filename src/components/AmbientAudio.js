// src/components/AmbientAudio.js
'use client'

import { useEffect, useRef, useState } from 'react'

export default function AmbientAudio() {
  const audioRef = useRef(null)
  const [enabled, setEnabled] = useState(false) // son activé/désactivé

  // Charger la préférence depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ambient-sound-enabled')
    if (saved === 'true') setEnabled(true)
  }, [])

  // Appliquer la préférence à l'audio
  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    // Toujours démarrer muté (autoplay policy)
    el.muted = !enabled
    el.volume = 0.4 // volume doux
    // Tente de jouer (autoplay passe si muted = true)
    const tryPlay = async () => {
      try {
        await el.play()
      } catch {
        // Sur iOS/Chrome, si bloqué, on attend un geste utilisateur
        // Un simple clic sur le bouton togglera et lancera play.
      }
    }
    tryPlay()

    localStorage.setItem('ambient-sound-enabled', String(enabled))
  }, [enabled])

  return (
    <>
      <audio ref={audioRef} loop playsInline preload="auto">
        <source src="/audio/ambient.ogg" type="audio/ogg" />
        <source src="/audio/ambient.mp3" type="audio/mpeg" />
      </audio>

      {/* Bouton flottant mute/unmute */}
      <button
        onClick={() => setEnabled(v => !v)}
        aria-label={enabled ? 'Couper le son' : 'Activer le son'}
        className="fixed bottom-4 left-4 z-50 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2 text-white hover:bg-white/15 transition shadow-md"
        style={{ boxShadow: '0 8px 30px rgba(0,0,0,.35)' }}
      >
        {enabled ? '🔊 On' : '🔇 Off'}
      </button>
    </>
  )
}
