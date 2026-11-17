'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Barre commune inspirée de la navigation de la page RP.
// Son titre remplace les anciens boutons de retour isolés.
const QUICK_LINKS = [
  { href: '/rp', label: 'Le Monde Magique (RP)' },
  { href: '/messages', label: 'Messagerie' },
  { href: '/profile', label: 'Mon profil' },
  { href: '/members', label: 'Membres' },
  { href: '/offrecords', label: 'OffRecords' },
  { href: '/wiki', label: 'Wiki & chronologie' },
  { href: '/dashboard', label: 'Tableau de bord' },
]

export default function SiteTopbar({ title }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="relative z-40 shrink-0 border-b border-amber-200/20 bg-[#17111f]/95 shadow-lg backdrop-blur-xl">
      <div className="mx-auto flex min-h-[64px] max-w-[1650px] flex-wrap items-center gap-2 px-4 py-3 md:px-8">
        <h1 className="mr-auto font-serif text-xl text-amber-100 sm:text-2xl">
          {title}
        </h1>
        <Link href="/rp" className="rounded-lg px-3 py-2 text-sm text-amber-50/90 transition hover:bg-white/10">
          Le Monde Magique
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            aria-haspopup="true"
            className="rounded-lg px-3 py-2 text-sm text-amber-50/90 transition hover:bg-white/10"
          >
            Accès rapides ▾
          </button>
          {open && (
            <>
              <button
                type="button"
                aria-label="Fermer les accès rapides"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
              />
              <nav
                aria-label="Accès rapides"
                className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-amber-200/25 bg-[#271d31] p-2 shadow-2xl"
              >
                {QUICK_LINKS.filter(link => link.href !== pathname).map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-amber-50 hover:bg-white/10"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
