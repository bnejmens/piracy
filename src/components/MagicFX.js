// src/components/MagicFX.js
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

export default function MagicFX({ strength = 'medium' }) {
  // Toujours les hooks dans le même ordre
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Seed stable par montage (pas de random différents entre renders)
  const seedRef = useRef(0)
  if (seedRef.current === 0) seedRef.current = (Math.random() * 1e9) | 0
  const seed = seedRef.current

  // PRNG déterministe basé sur la seed
  const rand = useMemo(() => {
    let t = seed
    return () => {
      t = (t * 1664525 + 1013904223) >>> 0
      return t / 2 ** 32
    }
  }, [seed])

  const mult = strength === 'hard' ? 1.4 : strength === 'soft' ? 0.6 : 1.0

  // Particules calculées une seule fois
  const particles = useMemo(() => {
    const arr = []
    const count = 14
    for (let i = 0; i < count; i++) {
      const l = (rand() * 100).toFixed(3)
      const t = (rand() * 100).toFixed(3)
      const size = (2.6 + rand() * 2.6).toFixed(1)
      const dx = Math.round(20 + rand() * 20)
      const dy = Math.round(20 + rand() * 20)
      const dur1 = (8 + rand() * 6 * mult).toFixed(1)
      const dur2 = (2.4 + rand() * 1.6 * mult).toFixed(2)
      const del1 = (rand() * 5.5).toFixed(1)
      const del2 = (rand() * 2.8).toFixed(2)
      const color = i % 2 ? 'gold' : 'blue'
      arr.push({ l, t, size, dx, dy, dur1, dur2, del1, del2, color })
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rand, mult])

  // On ne renvoie pas null avant mount (pour ne pas casser l’ordre des hooks)
  // mais on masque le calque jusqu’au montage
  return (
    <>
      <div
        aria-hidden
        className="fxRoot"
        suppressHydrationWarning
        style={{ opacity: mounted ? 1 : 0 }}
      >
        {particles.map((p, i) => (
          <span
            key={i}
            className={`particle ${p.color}`}
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.dur1}s, ${p.dur2}s`,
              animationDelay: `${p.del1}s, ${p.del2}s`,
              ['--dx']: `${p.dx}px`,
              ['--dy']: `${p.dy}px`,
              boxShadow:
                p.color === 'blue'
                  ? `0 0 ${parseFloat(p.size) * 2}px rgba(120,180,255,.9)`
                  : `0 0 ${parseFloat(p.size) * 2}px rgba(255,220,160,.95)`,
            }}
          />
        ))}
      </div>

      <style jsx>{`
        .fxRoot {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;              /* au-dessus du fond, sous le contenu */
          overflow: hidden;
          transition: opacity .2s ease;
        }
        .particle {
          position: absolute;
          border-radius: 9999px;
          filter: blur(8px);
          opacity: 0.55;
          mix-blend-mode: screen;
          transform: translateZ(0);
          animation-name: drift, twinkle;
          animation-timing-function: ease-in-out, ease-in-out;
          animation-iteration-count: infinite, infinite;
        }
        .particle.blue {
          background: radial-gradient(circle, rgba(120,180,255,.9), rgba(120,180,255,0));
        }
        .particle.gold {
          background: radial-gradient(circle, rgba(255,220,160,.95), rgba(255,220,160,0));
        }
        @keyframes drift {
          0%   { transform: translate(0,0) scale(.95); opacity:.35; }
          50%  { transform: translate(var(--dx), var(--dy)) scale(1.05); opacity:.6; }
          100% { transform: translate(0,0) scale(.98); opacity:.45; }
        }
        @keyframes twinkle {
          0%,100% { filter: blur(8px); }
          50%     { filter: blur(10px); }
        }
      `}</style>
    </>
  )
}
