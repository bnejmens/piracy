// src/components/FXGate.js
'use client'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'

// charge MagicFX uniquement côté client (évite l’hydratation)
const MagicFX = dynamic(() => import('@/components/MagicFX'), { ssr: false })

export default function FXGate() {
  const pathname = usePathname() || ''
  const enabled = pathname.startsWith('/auth') || pathname.startsWith('/dashboard')
  return enabled ? <MagicFX strength="medium" /> : null
}
