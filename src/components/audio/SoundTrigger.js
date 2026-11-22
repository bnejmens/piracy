'use client'
import { usePathname } from 'next/navigation'
import { useAudio } from './AudioProvider'

export default function SoundTrigger({ inline = false, onOpen }) {
  const { setIsOpen } = useAudio()
  const pathname = usePathname()
  const open = () => {
    onOpen?.()
    setIsOpen(true)
  }

  if (inline) {
    return (
      <button
        type="button"
        onClick={open}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-200/25 bg-white/10 text-xl text-amber-100 transition hover:bg-white/15"
        aria-label="Ouvrir les ambiances sonores"
        title="Ambiances sonores"
      >
        <span aria-hidden="true">♫</span>
      </button>
    )
  }

  if (pathname !== '/dashboard') return null

  return (
    <button
      type="button"
      onClick={open}
      className="fixed bottom-4 left-14 z-50 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-2 text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
      style={{ boxShadow: '0 8px 30px rgba(0,0,0,.35)' }}
      aria-label="Ouvrir le sélecteur d’ambiance"
    >
      - Ambiance -
    </button>
  )
}
