'use client'
import { useAudio } from './AudioProvider'

export default function SoundTrigger() {
  const { setIsOpen } = useAudio()
  return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-4 left-14 z-50 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2 text-white hover:bg-white/15 transition shadow-lg"
      style={{ boxShadow: '0 8px 30px rgba(0,0,0,.35)' }}
      aria-label="Ouvrir le sélecteur d’ambiance"
    >
      - Ambiance -
    </button>
  )
}
