'use client'
import { usePathname } from 'next/navigation'
import { useAudio } from './AudioProvider'

export default function SoundTrigger({ inline = false }) {
  const { setIsOpen } = useAudio()
  const pathname = usePathname()
  const inMessages = pathname?.startsWith('/messages')

  if (inline) {
    // Dans la messagerie mobile, le bouton rejoint l'en-tête :
    // il ne couvre plus la navigation Conversations / Contacts en bas.
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-200/25 bg-white/10 text-xl text-amber-100 transition hover:bg-white/15 sm:hidden"
        aria-label="Ouvrir les ambiances sonores"
        title="Ambiances sonores"
      >
        <span aria-hidden="true">♫</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className={`fixed bottom-4 left-14 z-50 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-white shadow-lg backdrop-blur-md transition hover:bg-white/15 ${inMessages ? 'hidden sm:inline-flex' : 'inline-flex'}`}
      style={{ boxShadow: '0 8px 30px rgba(0,0,0,.35)' }}
      aria-label="Ouvrir le sélecteur d’ambiance"
    >
      - Ambiance -
    </button>
  )
}
