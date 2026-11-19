'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

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
  const [activeCharacter, setActiveCharacter] = useState(null)

  useEffect(() => {
    let mounted = true

    const loadActiveCharacter = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      if (!session?.user?.id) {
        setActiveCharacter(null)
        return
      }

      // Même personnage actif que sur le Dashboard, sans dépendre
      // du champ profiles.active_character_id qui peut être ancien.
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, avatar_url')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!mounted) return
      if (error) {
        console.warn('Avatar du personnage actif :', error.message)
        return
      }
      setActiveCharacter(data || null)
    }

    loadActiveCharacter()
    return () => { mounted = false }
  }, [pathname])

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

        <Link
          href="/profile"
          aria-label={activeCharacter ? `Voir le profil de ${activeCharacter.name}` : 'Mon profil'}
          title={activeCharacter ? `Personnage actif : ${activeCharacter.name}` : 'Mon profil'}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-amber-200/25 bg-white/5 py-1 pl-1 pr-2.5 transition hover:border-amber-200/50 hover:bg-white/10 sm:pr-3"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-amber-200/15 text-sm font-semibold text-amber-100 ring-1 ring-amber-200/25">
            {activeCharacter?.avatar_url ? (
              <img
                src={activeCharacter.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              (activeCharacter?.name?.[0] || '?').toUpperCase()
            )}
          </span>
          <span className="hidden max-w-32 flex-col text-left sm:flex">
            <span className="text-[10px] leading-tight text-amber-100/55">Personnage actif</span>
            <span className="truncate text-xs font-medium text-amber-50">
              {activeCharacter?.name || 'Mon profil'}
            </span>
          </span>
        </Link>
      </div>
    </header>
  )
}
