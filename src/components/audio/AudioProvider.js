
'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import moodistSounds from './moodistSounds.json'

const AudioContext = createContext(null)

export const useAudio = () => useContext(AudioContext)

const SOUNDS = moodistSounds.map(sound => ({
  ...sound,
  icon: '🎵',
}))

const STORAGE_KEY = 'ambient:mixer:v1'

const clamp = value =>
  Math.min(1, Math.max(0, Number(value) || 0))

function initialMix() {
  return Object.fromEntries(
    SOUNDS.map((sound, index) => [
      sound.src,
      {
        active: index === 0,
        volume: 0.4,
      },
    ])
  )
}

export default function AudioProvider({ children }) {
  const audioRefs = useRef({})

  const [mix, setMix] = useState(initialMix)
  const [masterVolume, setMasterVolume] = useState(0.65)
  const [playing, setPlaying] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  // Restaurer les réglages, sans lancer automatiquement le son.
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || 'null'
      )

      if (saved?.mix) {
        const defaults = initialMix()
        const restored = {}

        for (const sound of SOUNDS) {
          const old = saved.mix[sound.src]
          restored[sound.src] = {
            active:
              typeof old?.active === 'boolean'
                ? old.active
                : defaults[sound.src].active,
            volume:
              typeof old?.volume === 'number'
                ? clamp(old.volume)
                : defaults[sound.src].volume,
          }
        }

        setMix(restored)

        if (typeof saved.masterVolume === 'number') {
          setMasterVolume(clamp(saved.masterVolume))
        }
      } else {
        // Importer les anciennes préférences du lecteur simple.
        const legacy = JSON.parse(
          localStorage.getItem('ambient:global') || 'null'
        )

        if (legacy) {
          const next = initialMix()

          for (const sound of SOUNDS) {
            next[sound.src].active =
              sound.src === legacy.trackSrc
          }

          if (!SOUNDS.some(s => s.src === legacy.trackSrc)) {
            next[SOUNDS[0].src].active = true
          }

          setMix(next)

          if (typeof legacy.volume === 'number') {
            setMasterVolume(clamp(legacy.volume))
          }
        }
      }
    } catch (e) {
      console.warn('Préférences audio :', e)
    }

    setReady(true)
  }, [])

  // Sauvegarder uniquement les réglages.
  useEffect(() => {
    if (!ready) return

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mix, masterVolume })
      )
    } catch (e) {
      console.warn('Sauvegarde audio :', e)
    }
  }, [mix, masterVolume, ready])

  // Appliquer les volumes sans recharger les fichiers audio.
  useEffect(() => {
    for (const sound of SOUNDS) {
      const audio = audioRefs.current[sound.src]
      if (!audio) continue

      const settings = mix[sound.src]

      audio.volume = clamp(
        (settings?.volume ?? 0) * masterVolume
      )

      if (!playing || !settings?.active) {
        audio.pause()
      }
    }
  }, [mix, masterVolume, playing])

  const start = () => {
    setError('')

    const activeSounds = SOUNDS.filter(
      sound => mix[sound.src]?.active
    )

    if (!activeSounds.length) {
      setError('Active au moins une ambiance.')
      return
    }

    // Tous les play() partent directement du clic utilisateur.
    const attempts = activeSounds.map(sound => {
      const audio = audioRefs.current[sound.src]

      if (!audio) return Promise.resolve(false)

      audio.volume = clamp(
        mix[sound.src].volume * masterVolume
      )

      try {
        return Promise.resolve(audio.play())
          .then(() => true)
          .catch(e => {
            console.warn('Lecture audio :', sound.src, e)
            return false
          })
      } catch (e) {
        console.warn('Lecture audio :', sound.src, e)
        return Promise.resolve(false)
      }
    })

    setPlaying(true)

    Promise.all(attempts).then(results => {
      if (!results.some(Boolean)) {
        setPlaying(false)
        setError(
          'Lecture impossible. Vérifie les fichiers audio ou réessaie.'
        )
      }
    })
  }

  const stop = () => {
    Object.values(audioRefs.current).forEach(audio => {
      audio?.pause()
    })

    setPlaying(false)
    setError('')
  }

  const toggle = () => {
    if (playing) stop()
    else start()
  }

  const toggleSound = src => {
    const current = mix[src]
    if (!current) return

    const nextActive = !current.active

    // Si le mixeur joue déjà, lancer la nouvelle piste
    // directement depuis le clic, sans interrompre les autres.
    if (nextActive && playing) {
      const audio = audioRefs.current[src]

      if (audio) {
        audio.volume = clamp(
          current.volume * masterVolume
        )

        audio.play().catch(e => {
          console.warn('Démarrage de piste :', e)
          setError(`Impossible de lire cette ambiance.`)
        })
      }
    }

    if (!nextActive) {
      audioRefs.current[src]?.pause()
    }

    setMix(previous => ({
      ...previous,
      [src]: {
        ...previous[src],
        active: nextActive,
      },
    }))
  }

  const setSoundVolume = (src, value) => {
    const v = clamp(value)

    setMix(previous => ({
      ...previous,
      [src]: {
        ...previous[src],
        volume: v,
      },
    }))

    const audio = audioRefs.current[src]
    if (audio) {
      audio.volume = clamp(v * masterVolume)
    }
  }

  // Compatibilité avec les composants utilisant l'ancien lecteur.
  const trackSrc =
    SOUNDS.find(sound => mix[sound.src]?.active)?.src ||
    SOUNDS[0].src

  const setTrack = src => {
    if (!SOUNDS.some(sound => sound.src === src)) return

    const previous = Object.keys(audioRefs.current)
    for (const key of previous) {
      if (key !== src) audioRefs.current[key]?.pause()
    }

    setMix(current =>
      Object.fromEntries(
        SOUNDS.map(sound => [
          sound.src,
          {
            ...current[sound.src],
            active: sound.src === src,
          },
        ])
      )
    )

    if (playing) {
      audioRefs.current[src]?.play().catch(e => {
        console.warn('Changement de piste :', e)
      })
    }
  }

  const value = useMemo(() => ({
    enabled: playing,
    playing,
    toggle,
    start,
    stop,
    tracks: SOUNDS,
    sounds: SOUNDS,
    mix,
    toggleSound,
    setSoundVolume,
    volume: masterVolume,
    setVolume: setMasterVolume,
    trackSrc,
    setTrack,
    isOpen,
    setIsOpen,
    error,
  }), [playing, mix, masterVolume, trackSrc, isOpen, error])

  return (
    <AudioContext.Provider value={value}>
      {children}

      {/* Lecteurs permanents : ne pas déplacer dans SoundModal */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed h-0 w-0 overflow-hidden"
      >
        {SOUNDS.map(sound => (
          <audio
            key={sound.src}
            ref={el => {
              if (el) audioRefs.current[sound.src] = el
              else delete audioRefs.current[sound.src]
            }}
            src={sound.src}
            loop
            playsInline
            preload="none"
          />
        ))}
      </div>
    </AudioContext.Provider>
  )
}
