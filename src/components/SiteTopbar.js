'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const CHARACTER_EVENT = 'piracy:active-character-changed'

const QUICK_LINKS = [
  { href: '/rp', label: 'Le Monde Magique (RP)' },
  { href: '/messages', label: 'Messagerie' },
  { href: '/profile', label: 'Mon profil' },
  { href: '/members', label: 'Membres' },
  { href: '/randomvava', label: 'Random Vava' },
  { href: '/offrecords', label: 'OffRecords' },
  { href: '/wiki', label: 'Wiki & chronologie' },
  { href: '/dashboard', label: 'Tableau de bord' },
]

function CharacterPortrait({ character, size = 'h-9 w-9' }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-amber-200/15 text-sm font-semibold text-amber-100 ring-1 ring-amber-200/25`}>
      {character?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        (character?.name?.[0] || '?').toUpperCase()
      )}
    </span>
  )
}

export default function SiteTopbar({ title }) {
  const pathname = usePathname()
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const [characterMenuOpen, setCharacterMenuOpen] = useState(false)
  const [characters, setCharacters] = useState([])
  const [activeCharacter, setActiveCharacter] = useState(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [switchingId, setSwitchingId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const loadCharacters = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      setCharacters([])
      setActiveCharacter(null)
      return
    }

    const { data, error } = await supabase
      .from('characters')
      .select('id, name, avatar_url, is_active, is_archived')
      .eq('user_id', session.user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    const all = data || []
    setCharacters(all)
    setActiveCharacter(all.find(c => c.is_active) || all[0] || null)
  }, [])

  useEffect(() => {
    setQuickMenuOpen(false)
    setCharacterMenuOpen(false)
    loadCharacters()
    window.addEventListener(CHARACTER_EVENT, loadCharacters)
    return () => window.removeEventListener(CHARACTER_EVENT, loadCharacters)
  }, [pathname, loadCharacters])

  const selectCharacter = async (characterId) => {
    if (!characterId || switchingId || creating) return
    setSwitchingId(characterId)
    setErrorMessage('')
    const { error } = await supabase.rpc('activate_my_character', {
      p_character_id: characterId,
    })
    setSwitchingId('')
    if (error) {
      setErrorMessage(error.message)
      return
    }

    setCharacterMenuOpen(false)
    await loadCharacters()
    window.dispatchEvent(new CustomEvent(CHARACTER_EVENT, {
      detail: { characterId },
    }))
  }

  const createCharacter = async (event) => {
    event.preventDefault()
    const name = newName.trim()
    if (name.length < 2 || name.length > 100 || creating || switchingId) return
    setCreating(true)
    setErrorMessage('')
    const { data: characterId, error } = await supabase.rpc('create_my_character', {
      p_name: name,
    })
    setCreating(false)
    if (error) {
      setErrorMessage(error.message)
      return
    }

    setNewName('')
    setCharacterMenuOpen(false)
    await loadCharacters()
    window.dispatchEvent(new CustomEvent(CHARACTER_EVENT, {
      detail: { characterId },
    }))
  }

  const closeMenus = () => {
    setQuickMenuOpen(false)
    setCharacterMenuOpen(false)
  }

  return (
    <header className="relative z-40 shrink-0 border-b border-amber-200/20 bg-[#17111f]/95 shadow-lg backdrop-blur-xl">
      <div className="mx-auto grid min-h-[64px] max-w-[1650px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 sm:flex sm:flex-wrap sm:gap-2 sm:px-4 sm:py-3 md:px-8">
        <h1 className="col-start-1 row-start-1 min-w-0 truncate font-serif text-lg text-amber-100 sm:mr-auto sm:text-2xl">
          {title}
        </h1>
        <Link href="/rp" className="col-start-1 row-start-2 justify-self-start rounded-lg px-3 py-2 text-sm text-amber-50/90 transition hover:bg-white/10">
          Le Monde Magique
        </Link>

        <div className="relative col-start-2 row-start-2 justify-self-end">
          <button
            type="button"
            onClick={() => {
              setQuickMenuOpen(value => !value)
              setCharacterMenuOpen(false)
            }}
            aria-expanded={quickMenuOpen}
            aria-haspopup="true"
            className="rounded-lg px-3 py-2 text-sm text-amber-50/90 transition hover:bg-white/10"
          >
            Accès rapides ▾
          </button>
          {quickMenuOpen && (
            <>
              <button type="button" aria-label="Fermer les accès rapides" className="fixed inset-0 z-40 cursor-default" onClick={closeMenus} />
              <nav aria-label="Accès rapides" className="absolute right-0 top-full z-50 mt-2 max-h-[70dvh] w-60 overflow-y-auto rounded-xl border border-amber-200/25 bg-[#271d31] p-2 shadow-2xl">
                {QUICK_LINKS.filter(link => link.href !== pathname).map(link => (
                  <Link key={link.href} href={link.href} onClick={closeMenus} className="block rounded-lg px-3 py-2 text-sm text-amber-50 hover:bg-white/10">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </div>

        <div className="relative col-start-2 row-start-1 justify-self-end sm:ml-auto">
          <button
            type="button"
            onClick={() => {
              setCharacterMenuOpen(value => !value)
              setQuickMenuOpen(false)
              setErrorMessage('')
            }}
            aria-label={activeCharacter ? `Changer de personnage (actuel : ${activeCharacter.name})` : 'Choisir ou créer un personnage'}
            aria-expanded={characterMenuOpen}
            aria-haspopup="true"
            title="Changer de personnage ou en créer un"
            className="flex shrink-0 items-center gap-2 rounded-full border border-amber-200/25 bg-white/5 py-1 pl-1 pr-2.5 transition hover:border-amber-200/50 hover:bg-white/10 sm:pr-3"
          >
            <CharacterPortrait character={activeCharacter} />
            <span className="hidden max-w-32 flex-col text-left sm:flex">
              <span className="text-[10px] leading-tight text-amber-100/55">Personnage actif</span>
              <span className="truncate text-xs font-medium text-amber-50">{activeCharacter?.name || 'Sélectionner'}</span>
            </span>
            <span className="text-xs text-amber-100/75" aria-hidden="true">▾</span>
          </button>

          {characterMenuOpen && (
            <>
              <button type="button" aria-label="Fermer le choix du personnage" className="fixed inset-0 z-40 cursor-default" onClick={closeMenus} />
              <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(75dvh,550px)] w-[min(90vw,340px)] overflow-y-auto overscroll-contain rounded-2xl border border-amber-200/25 bg-[#271d31] p-3 text-amber-50 shadow-2xl">
                <h2 className="mb-2 font-serif text-lg text-amber-100">Mes personnages</h2>
                <div className="space-y-1">
                  {characters.map(character => (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => selectCharacter(character.id)}
                      disabled={!!switchingId || creating}
                      aria-current={character.is_active ? 'true' : undefined}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-50 ${
                        character.is_active ? 'border-amber-300/45 bg-amber-300/10' : 'border-transparent hover:bg-white/10'
                      }`}
                    >
                      <CharacterPortrait character={character} size="h-10 w-10" />
                      <span className="min-w-0 flex-1 truncate text-sm">{character.name}</span>
                      {character.is_active && <span className="shrink-0 text-xs text-amber-200">Actif ✓</span>}
                      {switchingId === character.id && <span className="shrink-0 text-xs">…</span>}
                    </button>
                  ))}
                  {!characters.length && <p className="px-2 py-3 text-sm text-white/60">Aucun personnage créé.</p>}
                </div>

                <form onSubmit={createCharacter} className="mt-3 space-y-2 border-t border-amber-200/15 pt-3">
                  <label htmlFor="topbar-new-character" className="block text-xs font-medium text-amber-100">Créer un personnage</label>
                  <input
                    id="topbar-new-character"
                    value={newName}
                    onChange={event => setNewName(event.target.value)}
                    maxLength={100}
                    placeholder="Nom du nouveau personnage"
                    className="w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-amber-300"
                  />
                  <button
                    type="submit"
                    disabled={creating || !!switchingId || newName.trim().length < 2}
                    className="w-full rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-[#251a2d] transition hover:bg-amber-200 disabled:opacity-50"
                  >
                    {creating ? 'Création…' : '+ Créer et activer'}
                  </button>
                </form>

                {errorMessage && <p role="alert" className="mt-3 break-words text-xs text-rose-200">{errorMessage}</p>}
                <Link href="/profile" onClick={closeMenus} className="mt-3 block border-t border-white/10 px-2 pt-3 text-center text-xs text-amber-100 hover:text-amber-300">
                  Modifier la fiche du personnage
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
