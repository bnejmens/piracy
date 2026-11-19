'use client'

import { useEffect, useRef, useState } from 'react'

// Le lecteur YouTube reste visible : une vidéo intégrée ne doit pas être
// transformée en lecteur audio dissimulé ni démarrer sans action du joueur.
let youtubeAPIPromise = null

function getYouTubeAPI() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Navigateur requis'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeAPIPromise) return youtubeAPIPromise

  youtubeAPIPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }
    let script = document.querySelector('script[data-offrecords-youtube]')
    if (!script) {
      script = document.createElement('script')
      script.dataset.offrecordsYoutube = 'true'
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.body.appendChild(script)
    }
    script.addEventListener('error', () => {
      youtubeAPIPromise = null
      reject(new Error('YouTube est inaccessible. Vérifie ta connexion ou les extensions du navigateur.'))
    }, { once: true })
  })
  return youtubeAPIPromise
}

export function parseYouTubeId(input = '') {
  const str = String(input).trim()
  if (!str) return null
  const iframe = str.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  try {
    const url = new URL(iframe ? iframe[1] : str)
    const host = url.hostname.toLowerCase()
    let id = null
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0]
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      const segments = url.pathname.split('/').filter(Boolean)
      id = url.searchParams.get('v') || ((['embed', 'shorts', 'live'].includes(segments[0])) ? segments[1] : null)
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

export default function YouTubePlaylistPlayer({ playlistId, tracks }) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState('')
  const ids = tracks.map(t => t.video_id).filter(Boolean)
  const key = ids.join('|')

  useEffect(() => {
    if (!hostRef.current || !ids.length) return
    let mounted = true
    let created = null

    getYouTubeAPI().then(YT => {
      if (!mounted || !hostRef.current) return
      created = new YT.Player(hostRef.current, {
        height: '240',
        width: '426',
        videoId: ids[0],
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: event => {
            if (!mounted) return
            playerRef.current = event.target
            setReady(true)
            event.target.cuePlaylist({ list: ids, index: 0 })
          },
          onStateChange: event => {
            if (!mounted) return
            const index = event.target?.getPlaylistIndex?.()
            if (typeof index === 'number' && index >= 0) setCurrentIndex(index)
          },
          onError: () => setError('Cette vidéo ne peut pas être lue ici. Essaie le titre suivant.'),
        },
      })
    }).catch(err => { if (mounted) setError(err.message) })

    return () => {
      mounted = false
      setReady(false)
      playerRef.current = null
      try { created?.destroy?.() } catch { /* player déjà démonté */ }
    }
    // Le composant est remonté via sa clé lorsqu'on change de playlist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId])

  useEffect(() => {
    if (!ready || !playerRef.current) return
    if (ids.length) {
      playerRef.current.cuePlaylist?.({ list: ids, index: 0 })
      setCurrentIndex(0)
    } else {
      playerRef.current.stopVideo?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready])

  const current = tracks[currentIndex]
  const select = index => {
    playerRef.current?.playVideoAt?.(index)
    setCurrentIndex(index)
  }

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-amber-200/15 bg-black/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg text-amber-100">Écouter la playlist</h3>
        <span className="text-xs text-white/50">{tracks.length} morceau{tracks.length > 1 ? 'x' : ''}</span>
      </div>
      {!tracks.length ? (
        <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-sm text-white/55">
          Aucun titre ajouté à cette playlist.
        </p>
      ) : (
        <>
          <div className="aspect-video min-w-0 overflow-hidden rounded-lg border border-amber-200/15 bg-black">
            <div ref={hostRef} className="h-full w-full" />
          </div>
          {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => playerRef.current?.previousVideo?.()} disabled={!ready} aria-label="Titre précédent" className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm disabled:opacity-40">⏮</button>
            <button type="button" onClick={() => playerRef.current?.playVideo?.()} disabled={!ready} aria-label="Lecture" className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-[#251a2d] disabled:opacity-40">▶ Écouter</button>
            <button type="button" onClick={() => playerRef.current?.pauseVideo?.()} disabled={!ready} aria-label="Pause" className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm disabled:opacity-40">⏸</button>
            <button type="button" onClick={() => playerRef.current?.nextVideo?.()} disabled={!ready} aria-label="Titre suivant" className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm disabled:opacity-40">⏭</button>
            <span className="min-w-0 flex-1 truncate text-xs text-white/65">{current?.title || `Piste ${currentIndex + 1}`}</span>
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto overscroll-contain">
            {tracks.map((t, i) => (
              <button
                type="button"
                key={t.id}
                onClick={() => select(i)}
                disabled={!ready}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-60 ${i === currentIndex ? 'border-amber-300/35 bg-amber-200/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <span className="shrink-0 text-amber-200">{i === currentIndex ? '♫' : '▶'}</span>
                <span className="min-w-0 flex-1 truncate">{t.title || `Piste ${i + 1}`}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-white/45">
        Les vidéos YouTube restent visibles, et la lecture ne démarre jamais automatiquement.
        Les vidéos dont l’intégration est désactivée ne pourront pas être lues ici.
      </p>
    </section>
  )
}
