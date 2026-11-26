'use client'
import { useAudio } from './AudioProvider'

export default function SoundTrigger({ onOpen }) {
  const { setIsOpen } = useAudio()
  const open = () => {
    onOpen?.()
    setIsOpen(true)
  }

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
