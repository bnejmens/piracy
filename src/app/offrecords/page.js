'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import SiteTopbar from '@/components/SiteTopbar'
import { supabase } from '@/lib/supabaseClient'

/**
 * ✅ Ce composant :
 * - permet de créer des playlists perso
 * - d’y ajouter des titres (coller URL YouTube ou iframe → ID vidéo auto)
 * - de lire la playlist via YouTube IFrame Player API (player visible, conforme)
 * - commandes : Play / Pause / Précédent / Suivant + sélection d’un titre
 *
 * Assets attendus :
 * - /public/images/radio-bg.webp (fond)
 * - /public/images/radio-icon.png (icône dashboard)
 */

// ---------- Helpers
const normSlug = (s='') =>
  s.toLowerCase()
   .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
   .replace(/[^a-z0-9]+/g, '-')
   .replace(/^-+|-+$/g, '')

/** Extrait un ID vidéo YouTube depuis :
 * - URL standard (watch?v=…)
 * - youtu.be/…
 * - embed/…
 * - iframe collé en entier
 * Retourne null si rien trouvé.
 */
function extractYouTubeId(input='') {
  const str = String(input).trim()

  // Si on a un iframe collé, on tente d’en extraire src="..."
  const iframeSrcMatch = str.match(/<iframe[^>]+src="([^"]+)"/i)
  const url = new URL(iframeSrcMatch ? iframeSrcMatch[1] : str, 'https://dummy.base')

  // Cas youtu.be/<id>
  if (/youtu\.be$/i.test(url.hostname)) {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id || null
  }

  // Cas youtube.com/embed/<id>
  if (/youtube\.com$/i.test(url.hostname) && /\/embed\//i.test(url.pathname)) {
    const id = url.pathname.split('/').filter(Boolean).pop()
    return id || null
  }

  // Cas youtube.com/watch?v=<id>
  if (/youtube\.com$/i.test(url.hostname) && url.searchParams.get('v')) {
    return url.searchParams.get('v')
  }

  // Dernier recours : regex large
  const r = str.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  if (r && r[1]) return r[1]

  return null
}

// Charge le script IFrame API si absent. Retourne une Promise<YT>.
function loadYouTubeAPI() {
  if (typeof window === 'undefined') return Promise.reject('no window')
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)

  return new Promise((resolve) => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.body.appendChild(tag)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
  })
}

// ---------- Page
export default function OffRecordsPage() {
  const [session, setSession] = useState(null)

  // Playlists de l’utilisateur
  const [lists, setLists] = useState([]) // [{id, slug, title}]
  const [loadingLists, setLoadingLists] = useState(true)

  // Création playlist
  const [titleInput, setTitleInput] = useState('')
  const slug = useMemo(() => normSlug(titleInput || 'playlist'), [titleInput])

  // Playlist active
  const [active, setActive] = useState(null) // {id, slug, title}
  const [tracks, setTracks] = useState([])   // [{id, video_id, title, created_at}]
  const [loadingTracks, setLoadingTracks] = useState(false)

  // Ajout titre
  const [paste, setPaste] = useState('')     // url ou iframe
  const [pasteTitle, setPasteTitle] = useState('')

  // Player YT
  const playerRef = useRef(null)
  const playerElRef = useRef(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const videoIds = useMemo(() => tracks.map(t => t.video_id), [tracks])
  const idsKey   = useMemo(() => videoIds.join('|'), [videoIds]) //

  // ------- Init
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data?.session || null))
    loadMyLists()
  }, [])

  async function loadMyLists() {
    setLoadingLists(true)
    const { data, error } = await supabase
      .from('off_playlists')
      .select('id, slug, title, owner_id, created_at')
      .order('created_at', { ascending: false })
    if (!error) setLists(data || [])
    setLoadingLists(false)
  }

  async function createList() {
    if (!session) { alert('Connecte-toi'); return }
    const t = (titleInput || '').trim()
    if (!t) { alert('Titre requis'); return }
    const s = normSlug(t)
    const { error } = await supabase
      .from('off_playlists')
      .insert({ slug: s, title: t, owner_id: session.user.id })
    if (error) { alert(error.message); return }
    setTitleInput('')
    await loadMyLists()
  }

  async function openList(list) {
    setActive(list)
    setCurrentIndex(0)
    await loadTracks(list)
    ensurePlayer()
  }

  async function loadTracks(list) {
    if (!list) return
    setLoadingTracks(true)
    const { data, error } = await supabase
      .from('off_tracks')
      .select('id, video_id, title, created_at')
      .eq('playlist_id', list.id)
      .order('created_at', { ascending: true })
    if (!error) setTracks(data || [])
    setLoadingTracks(false)
  }

  async function addTrack() {
    if (!session) { alert('Connecte-toi'); return }
    if (!active) { alert('Choisis une playlist'); return }
    const id = extractYouTubeId(paste)
    if (!id) { alert('URL/iframe YouTube invalide'); return }

    const { error } = await supabase
      .from('off_tracks')
      .insert({ playlist_id: active.id, video_id: id, title: pasteTitle?.trim() || null })
    if (error) { alert(error.message); return }

    setPaste(''); setPasteTitle('')
    await loadTracks(active)

    if (playerReady && videoIds.length === 0) {
      cuePlaylistToPlayer([id])
    }
  }

  async function removeTrack(id) {
    if (!confirm('Supprimer ce titre ?')) return
    const { error } = await supabase.from('off_tracks').delete().eq('id', id)
    if (error) { alert(error.message); return }
    await loadTracks(active)
  }

  // ------- YouTube Player
  async function ensurePlayer() {
    if (playerRef.current) return
    const YT = await loadYouTubeAPI()
    playerRef.current = new YT.Player(playerElRef.current, {
      height: '240', width: '426',
      playerVars: {
        modestbranding: 1, rel: 0, controls: 1,
        autoplay: 0, // ❌ pas d’autoplay
      },
      events: {
        onReady: () => {
          setPlayerReady(true)
          if (videoIds.length) cuePlaylistToPlayer(videoIds) // ✅ prépare sans jouer
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) next()
          if (playerRef.current?.getPlaylistIndex) {
            const i = playerRef.current.getPlaylistIndex()
            if (typeof i === 'number' && i >= 0) setCurrentIndex(i)
          }
        }
      }
    })
  }

  // ✅ Prépare la playlist sans démarrer
  function cuePlaylistToPlayer(ids) {
    if (!playerRef.current || !ids?.length) return
    if (playerRef.current.cuePlaylist) {
      playerRef.current.cuePlaylist(ids, 0, 0, 'large')
    } else {
      playerRef.current.cueVideoById(ids[0])
    }
    setCurrentIndex(0)
  }

  function loadPlaylistToPlayer(ids) { cuePlaylistToPlayer(ids) }

  useEffect(() => {
    if (playerReady && videoIds.length) {
      cuePlaylistToPlayer(videoIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady, idsKey])

  function play() { playerRef.current?.playVideo?.() }
  function pause() { playerRef.current?.pauseVideo?.() }
  function next() { playerRef.current?.nextVideo?.() }
  function prev() { playerRef.current?.previousVideo?.() }
  function selectAt(i) {
    if (!playerRef.current || i<0 || i>=videoIds.length) return
    playerRef.current.playVideoAt(i)
    setCurrentIndex(i)
  }
  function shuffle() {
    if (!playerRef.current || !videoIds.length) return
    const r = Math.floor(Math.random() * videoIds.length)
    playerRef.current.playVideoAt(r)
    setCurrentIndex(r)
  }

  const currentTitle = tracks[currentIndex]?.title || `Piste #${currentIndex+1}`

  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/radio-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Barre de navigation commune ; titre intégré à gauche */}
      <SiteTopbar title="OffRecords" />

      {/* Content */}
      {/* ⬇️ NE PLUS SCROLLER LA PAGE : on masque le scroll global ici */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-4 sm:px-6 lg:overflow-hidden">
        {/* ⬇️ La grid occupe toute la hauteur, et autorise la contraction */}
        <div className="mx-auto grid w-full max-w-6xl min-h-0 grid-cols-1 gap-4 lg:h-full lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
          {/* Playlists (colonne gauche) */}
          <section className="flex min-h-[230px] min-w-0 flex-col rounded-2xl border border-white/20 bg-black/30 p-3 text-white backdrop-blur sm:p-4 lg:min-h-0">
            <h2 className="font-semibold mb-3">Mes playlists</h2>

            <div className="mb-3 flex min-w-0 gap-2">
              <input
                value={titleInput}
                onChange={e=>setTitleInput(e.target.value)}
                placeholder="Titre (ex: SMOG oh go)"
                className="min-w-0 flex-1 rounded-md border border-white/20 bg-white/10 px-3 py-2 placeholder-white/60"
              />
              <button
                onClick={createList}
                disabled={!session || !titleInput.trim()}
                className="rounded-lg bg-cyan-300 text-slate-900 font-medium px-1.3 py-2 hover:bg-amber-200 disabled:opacity-50"
              >
                Créer
              </button>
            </div>
            <div className="text-xs text-white/70 mb-2">Slug : <code>{slug || 'playlist'}</code></div>

            {loadingLists ? (
              <div className="text-white/70 text-sm">Chargement…</div>
            ) : (
              // ⬇️ Zone scrollable interne : prend tout l’espace restant
              <div className="max-h-64 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-none">
                {lists.map(L => (
                  <button
                    key={L.id}
                    onClick={()=>openList(L)}
                    className={`w-full text-left rounded-lg px-3 py-2 border transition
                      ${active?.id===L.id ? 'bg-white/15 border-white/35' : 'bg-white/6 border-white/15 hover:bg-white/10'}`}
                  >
                    <div className="font-medium">{L.title || L.slug}</div>
                    <div className="text-xs text-white/70">{L.slug}</div>
                  </button>
                ))}
                {!lists.length && <div className="text-white/70 text-sm">Aucune playlist pour l’instant.</div>}
              </div>
            )}
          </section>

          {/* Lecteur + pistes (colonne droite) */}
          <section className="flex min-h-[320px] min-w-0 flex-col rounded-2xl border border-white/20 bg-black/30 p-3 text-white backdrop-blur sm:p-4 lg:min-h-0">
            {!active ? (
              <div className="text-white/70">Sélectionne une playlist à gauche.</div>
            ) : (
              <>
                {/* Lecteur */}
                <div className="rounded-xl border border-white/20 bg-gradient-to-b from-black/50 to-black/30 p-4 mb-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-white/70">Lecture : {active.title || active.slug}</div>
                    <div className="text-sm text-white/70">Piste : {currentIndex+1}/{tracks.length || 0}</div>
                  </div>

                  <div className="rounded-lg overflow-hidden border border-white/15 bg-black/60 mb-3">
                    <div ref={playerElRef} className="w-full aspect-video" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={prev} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 hover:bg-white/15">⏮︎</button>
                    <button onClick={play} className="rounded-md bg-emerald-400/90 text-slate-900 px-3 py-1.5 hover:bg-emerald-300">▶︎</button>
                    <button onClick={pause} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 hover:bg-white/15">⏸︎</button>
                    <button onClick={next} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 hover:bg-white/15">⏭︎</button>
                    <button onClick={shuffle} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 hover:bg-white/15">🔀</button>
                    <div className="min-w-0 basis-full truncate text-sm text-white/80 sm:ml-auto sm:basis-auto" title={currentTitle}>🎵 {currentTitle}</div>
                  </div>
                </div>

                {/* Ajout de titre */}
                <div className="rounded-lg border border-white/15 bg-white/5 p-3 mb-3">
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
                    <input
                      value={paste}
                      onChange={e=>setPaste(e.target.value)}
                      placeholder='Colle ici un lien YouTube ou un <iframe …>'
                      className="min-w-0 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 placeholder-white/60"
                    />
                    <input
                      value={pasteTitle}
                      onChange={e=>setPasteTitle(e.target.value)}
                      placeholder='Titre (optionnel)'
                      className="rounded-md bg-white/10 border border-white/20 px-3 py-2 placeholder-white/60"
                    />
                    <button
                      onClick={addTrack}
                      disabled={!session || !paste.trim()}
                      className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200 disabled:opacity-50"
                    >
                      + Ajouter
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Astuce : colle un lien <code>https://youtu.be/…</code>, <code>https://www.youtube.com/watch?v=…</code> ou un <code>&lt;iframe …&gt;</code>
                  </div>
                </div>

                {/* Pistes — zone scrollable interne qui prend tout le reste */}
                <div className="max-h-[380px] min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-white/15 bg-white/5 lg:max-h-none">
                  {loadingTracks ? (
                    <div className="p-3 text-white/70">Chargement des titres…</div>
                  ) : !tracks.length ? (
                    <div className="p-3 text-white/70">Aucun titre pour l’instant.</div>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {tracks.map((t, i) => (
                        <li key={t.id} className="flex items-center gap-2 p-2">
                          <button
                            onClick={()=>selectAt(i)}
                            className={`rounded-md px-2 py-1 text-sm border
                              ${i===currentIndex ? 'bg-emerald-400/20 border-emerald-300/40' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}
                          >
                            ▶︎
                          </button>
                          <div className="flex-1 truncate">
                            <div className="truncate">{t.title || `Piste #${i+1}`}</div>
                            <div className="text-xs text-white/60 truncate">ID: {t.video_id}</div>
                          </div>
                          {!!session && (
                            <button
                              onClick={()=>removeTrack(t.id)}
                              className="rounded-md bg-white/10 border border-white/20 px-2 py-1 text-sm hover:bg-white/15"
                            >
                              Suppr
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
