'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const AudioCtx = createContext(null)
export const useAudio = () => useContext(AudioCtx)

export default function AudioProvider({ children }) {
  const audioRef = useRef(null)
  const [enabled, setEnabled] = useState(false)
  const [trackSrc, setTrackSrc] = useState('/audio/ambient.mp3')
  const [volume, setVolume] = useState(0.4)
  const [isOpen, setIsOpen] = useState(false)

  // Ta bibliothèque globale (ajoute/enlève des pistes ici)
  const tracks = useMemo(() => ([
    { src: '/audio/litoral.mp3', label: 'Littoral' },
    { src: '/audio/fireplace.mp3', label: '	cheminée' },
    { src: '/audio/rain.mp3',  label: 'Pluie' },
    { src: '/audio/nature.mp3',  label: 'Nature' },
    { src: '/audio/ocean.mp3',  label: 'Ocean' },
    { src: '/audio/inwater.mp3',  label: 'Inwater' },
    { src: '/audio/reef.mp3',  label: 'Reef' },
    { src: '/audio/tavern.mp3',  label: 'Tavern' },
  ]), [])

  const storageKey = 'ambient:global'

  // Charger préférence
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (saved.trackSrc) setTrackSrc(saved.trackSrc)
      if (typeof saved.enabled === 'boolean') setEnabled(saved.enabled)
      if (typeof saved.volume === 'number') setVolume(Math.max(0, Math.min(1, saved.volume)))
    } catch {}
  }, [])

  // Sauver préférence
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ enabled, trackSrc, volume }))
  }, [enabled, trackSrc, volume])

  // Appliquer volume/mute en continu
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
    el.muted = !enabled
  }, [enabled, volume])

  const fade = (el, from, to, ms = 250) => new Promise((resolve) => {
  const v0 = clamp01(from);
  const v1 = clamp01(to);
  el.volume = v0;

  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / ms);
    const v = v0 + (v1 - v0) * p;
    el.volume = clamp01(v);
    if (p < 1) requestAnimationFrame(step);
    else resolve();
  };
  requestAnimationFrame(step);
});


  const toggle = async () => {
    const el = audioRef.current
    if (!el) return
    try {
      if (enabled) {
        await fade(el, el.volume, 0, 180)
        el.pause()
        setEnabled(false)
      } else {
        el.currentTime = 0
        el.volume = 0
        el.muted = false
        await el.play() // geste utilisateur
        await fade(el, 0, volume, 220)
        setEnabled(true)
      }
    } catch (e) {
      console.warn('Playback issue:', e)
    }
  }

  const setTrack = async (src) => {
    const el = audioRef.current
    setTrackSrc(src)
    if (!el) return
    if (enabled) {
      try {
        await fade(el, el.volume, 0, 180)
        el.src = src
        await el.play()
        await fade(el, 0, volume, 220)
      } catch (e) {
        console.warn('Switch track issue:', e)
      }
    } else {
      el.src = src
      el.load()
    }
  }

  const value = {
    enabled, toggle,
    trackSrc, setTrack,
    volume, setVolume,
    isOpen, setIsOpen,
    tracks,
  }

  return (
    <AudioCtx.Provider value={value}>
      {children}
      <audio ref={audioRef} src={trackSrc} loop playsInline preload="auto" />
    </AudioCtx.Provider>
  )
}
