
'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const ONLINE_WINDOW_MS = 5 * 60 * 1000
const REFRESH_MS = 30000
const MAX_MARKERS = 18
const DECOY_COUNT = 6

// 36 personnages fictifs
const DECOY_NAMES = [
  'Kaur Nutti',
  'Fronk Leboeuf',
  'Serj',
  'Herschel Aurora',
  'Paul Filly',
  'Cypress Newts',
  'Heather Locket',
  'Vernice Stinkwood',
  'Alice Quilt',
  'Alex Locks',
  'Carol Rabbot',
  'Jasper Fluke',
  'Nick Quasi Sans Tête',
  'Pivey',
  'Le Baron Sanglant',
  'Frances Drake',
  'Dipsy',
  'Fora Nose',
  'Robin Laurel',
  'Pierce Habbot',
  'Allie Pattil',
  'Tino Pantal',
  'Alder Pincushion',
  'Archibald Gerble',
  'Twiggly Sprinkly',
  'Luzie Sunbutt',
  'Barnaby Thistlewick',
  'Mildred Bumblecroft',
  'Oswald Puddlemore',
  'Euphemia Wobblethorn',
  'Percival Crumblebottom',
  'Agatha Fizzlesworth',
  'Wilfred Tumbleby',
  'Cordelia Nettlewick',
  'Basil Widdershins',
  'Prudence Featherbottom',
]

// 120 activités : magie, quotidien et interactions sociales
const ACTIVITIES = [
  // Poudlard
  'Se rend à son cours de potions en traînant les pieds.',
  'Dévore une Chocogrenouille en espérant trouver une carte rare.',
  'Se contemple amoureusement dans un miroir.',
  'Cherche désespérément la salle sur demande.',
  "S'endort sur un livre d'histoire de la magie.",
  'Essaie de convaincre un escalier de changer de direction.',
  'Fait semblant de réviser à la bibliothèque.',
  'Se précipite vers la Grande Salle pour le dîner.',
  "Rédige une lettre qu'il n'osera jamais envoyer.",
  'Se cache derrière une tapisserie pour éviter un professeur.',
  'Tente un sortilège informulé avec un résultat douteux.',
  'Essaie de faire disparaître une tache de jus de citrouille.',
  'Cherche sa baguette alors qu’elle est dans sa poche.',
  "Prépare une potion dont la couleur n'inspire aucune confiance.",
  'Se dispute avec un portrait particulièrement bavard.',
  'Essaie de transfigurer une tasse en souris.',
  'Soupçonne son chaudron de lui en vouloir personnellement.',
  'S’entraîne au Wingardium Leviosa avec beaucoup trop de conviction.',
  'Fait exploser accidentellement une plume.',
  'Tente de réparer ses lunettes d’un coup de baguette.',
  'Suit discrètement un chat dans les couloirs.',
  'Cherche un passage secret derrière une statue.',
  'Prétend ne pas entendre Rusard approcher.',
  'Tente d’apprivoiser un Niffleur attiré par ses poches.',
  'Observe le terrain de Quidditch en rêvant de gloire.',
  'Écoute une conversation qui ne le regarde absolument pas.',
  'Se demande si Peeves prépare encore un mauvais coup.',
  'Essaie de rejoindre Pré-au-Lard sans se faire remarquer.',
  "S'arrête pour observer les mouvements du lac Noir.",
  'Élabore un plan très compliqué pour éviter ses devoirs.',

  // Habitudes ordinaires
  'Se brosse les dents avec application.',
  'Prend une douche beaucoup trop longue.',
  'Se coiffe devant un miroir.',
  'Essaie de dompter une mèche rebelle.',
  'Se coupe les ongles.',
  'Cherche une chaussette disparue.',
  'Se gratte le dos avec difficulté.',
  'Se parfume avec un peu trop d’enthousiasme.',
  'Se regarde sous tous les angles dans un miroir.',
  'Essaie de retirer quelque chose coincé entre ses dents.',
  'Écoute de la musique en hochant la tête.',
  'Fredonne une chanson dont il a oublié les paroles.',
  'Lit tranquillement un roman.',
  'Dessine dans un carnet.',
  'Observe les nuages sans penser à rien.',
  'Fait une petite sieste.',
  'Siffle un air entraînant.',
  'Écrit quelques lignes dans son journal intime.',
  'Joue avec une pièce entre ses doigts.',
  'Regarde la pluie tomber par la fenêtre.',
  'Grignote quelque chose en cachette.',
  'Se prépare une tasse de thé.',
  'Mange une pomme à pleines dents.',
  'Trempe un biscuit dans sa boisson.',
  'Cherche quelque chose à manger.',
  'Se brûle la langue avec une boisson chaude.',
  'Savoure un gâteau en fermant les yeux.',
  'Ramasse discrètement une miette sur ses vêtements.',
  'Regrette d’avoir mangé autant.',
  'Essaie de résister à une deuxième part de dessert.',
  'Parle tout seul sans s’en rendre compte.',
  'Cherche quelque chose qu’il tient déjà dans sa main.',
  'Se demande pourquoi il est entré dans cette pièce.',
  'Éternue trois fois de suite.',
  'Répète une conversation imaginaire.',
  'Regarde autour de lui pour vérifier que personne ne l’observe.',
  'Essaie de se souvenir d’un prénom.',
  'Fait semblant de comprendre une conversation.',
  'Raconte une blague à laquelle personne ne rit.',
  'Se prend les pieds dans son propre pantalon.',

  // Romance et sentiments
  'Échange des regards insistants avec quelqu’un.',
  'Tente une approche romantique particulièrement maladroite.',
  'Embrasse quelqu’un à l’abri des regards.',
  'Attend désespérément que son béguin lui adresse la parole.',
  'Répète une déclaration d’amour devant un miroir.',
  'Rougit après avoir reçu un compliment.',
  'Se fait gentiment repousser après une tentative de séduction.',
  'Écrit un petit mot doux à quelqu’un.',
  'Observe discrètement une personne qui lui plaît.',
  'Tente de rendre quelqu’un jaloux.',

  // Amitié
  'Raconte sa journée à un ami.',
  'Éclate de rire au milieu d’une conversation.',
  'Console quelqu’un qui semble avoir du chagrin.',
  'Partage quelques friandises avec un camarade.',
  'Fait une accolade un peu trop enthousiaste.',
  'Écoute les problèmes amoureux de quelqu’un.',
  'Essaie de convaincre un ami de l’accompagner quelque part.',
  'Organise une petite fête en secret.',
  'Se lance dans une discussion interminable.',
  'Retrouve une vieille connaissance.',

  // Disputes
  'Se dispute pour une histoire sans importance.',
  'Lance un regard noir à quelqu’un.',
  'Refuse obstinément de reconnaître ses torts.',
  'Boude dans un coin en attendant des excuses.',
  'Accuse quelqu’un d’avoir volé ses affaires.',
  'Se moque gentiment de la nouvelle coiffure d’un camarade.',
  'Se retrouve au milieu d’une dispute qui ne le concerne pas.',
  'Essaie de calmer deux personnes sur le point de se battre.',
  'Prépare une réplique cinglante avec beaucoup trop de retard.',
  'Tourne les talons au beau milieu d’une conversation.',

  // Ragots et manigances
  'Échange des ragots avec un camarade.',
  'Chuchote quelque chose à l’oreille de quelqu’un.',
  'Espionne discrètement une conversation.',
  'Prétend ne pas avoir entendu un secret.',
  'Répand une rumeur absolument invérifiable.',
  'Essaie de deviner qui sort avec qui.',
  'Se cache pour surprendre quelqu’un.',
  'Prépare une mauvaise blague avec un complice.',
  'Fait semblant de ne pas reconnaître quelqu’un.',
  'Écoute derrière une porte.',

  // Situations décalées
  'Tente de séduire quelqu’un qui ne remarque même pas sa présence.',
  'Se retrouve involontairement à tenir la chandelle.',
  'Ment effrontément sur ses exploits au Quidditch.',
  'Essaie de récupérer une lettre envoyée à la mauvaise personne.',
  'Fait semblant de rire à une blague incompréhensible.',
  'S’invente une vie passionnante pour impressionner quelqu’un.',
  'Se fait surprendre en train de parler dans le dos d’un professeur.',
  'S’entraîne à avoir l’air mystérieux.',
  'Fuit une conversation devenue beaucoup trop personnelle.',
  'Débat très sérieusement de la plus belle personne de Poudlard.',
]

function random(min, max) {
  return min + Math.random() * (max - min)
}

function randomPoint() {
  return {
    x: random(8, 92),
    y: random(13, 87),
  }
}

function pickDecoys() {
  const shuffled = [...DECOY_NAMES]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled.slice(0, DECOY_COUNT).map((name, index) => ({
    user_id: `decoy-${index}`,
    name,
    decoy: true,
    leaving: false,
  }))
}

function pickActivity(previous) {
  if (ACTIVITIES.length === 1) return ACTIVITIES[0]

  let next

  do {
    next = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)]
  } while (next === previous)

  return next
}

function ShoePrint() {
  return (
    <g className="marauder-print">
      <path d="M-6.4 -7.3 C-9 -3.7 -8.9 1 -7.4 4.1 C-5.7 7.9 -5 12.4 -1 13.2 C3.7 13.9 6.7 10.7 7 6.6 C7.3 2.9 8.8 -1.8 6.1 -6.7 C3.9 -10.6 -3.5 -11.7 -6.4 -7.3 Z" />
      <ellipse cx="-0.1" cy="12" rx="4.9" ry="3.4" />
      <circle cx="-6.1" cy="-13.3" r="2.7" />
      <circle cx="-1.4" cy="-15.4" r="3.1" />
      <circle cx="3.8" cy="-14.2" r="2.7" />
      <circle cx="8.2" cy="-11.2" r="2.1" />
    </g>
  )
}

function Footprints({ walking }) {
  return (
    <svg
      className={`marauder-footprints ${walking ? 'is-walking' : ''}`}
      viewBox="0 0 70 66"
      width="42"
      height="40"
      aria-hidden="true"
    >
      <g transform="translate(23 41) rotate(-18)">
        <ShoePrint />
      </g>
      <g transform="translate(46 24) rotate(15)">
        <ShoePrint />
      </g>
    </svg>
  )
}

function FootprintWalker({ player }) {
  const walkerRef = useRef(null)
  const pausedRef = useRef(false)
  const positionRef = useRef(null)
  const previousActivityRef = useRef(null)
  const pointerRef = useRef({ x: -1000, y: -1000 })

  const [hovered, setHovered] = useState(false)
  const [activity, setActivity] = useState('')
  const [heading, setHeading] = useState(0)
  const [walking, setWalking] = useState(false)

  // Animation calculée image par image.
  // Le survol fige réellement la position.
  useEffect(() => {
    let frame
    let lastTime = 0

    const start = randomPoint()
    positionRef.current = start

    if (walkerRef.current) {
      walkerRef.current.style.left = `${start.x}%`
      walkerRef.current.style.top = `${start.y}%`
    }

    let destination = null
    let travelDuration = 24000
    let elapsed = 0

    // Petite pause avant le premier déplacement.
    let pauseRemaining = random(800, 2200)

    function chooseDestination() {
      const current = positionRef.current
      if (!current) return

      let next = randomPoint()

      // On recherche de préférence une destination éloignée.
      for (
        let i = 0;
        i < 30 &&
        Math.hypot(next.x - current.x, next.y - current.y) < 32;
        i++
      ) {
        next = randomPoint()
      }

      destination = {
        from: { ...current },
        to: next,
      }

      elapsed = 0

      const distance = Math.hypot(
        next.x - current.x,
        next.y - current.y
      )

      travelDuration = Math.max(
        18000,
        Math.min(42000, distance * 510)
      )

      setHeading(
        Math.atan2(
          next.y - current.y,
          next.x - current.x
        ) * 180 / Math.PI + 90
      )

      setWalking(true)
    }

    function animate(time) {
      if (!lastTime) lastTime = time

      // Limite les grands sauts après un onglet inactif.
      const delta = Math.min(time - lastTime, 60)
      lastTime = time

      if (!pausedRef.current) {
        if (!destination) {
          pauseRemaining -= delta

          if (pauseRemaining <= 0) {
            chooseDestination()
          }
        } else {
          elapsed = Math.min(
            elapsed + delta,
            travelDuration
          )

          const progress = elapsed / travelDuration

          // Mouvement linéaire et continu.
          const x =
            destination.from.x +
            (destination.to.x - destination.from.x) *
              progress

          const y =
            destination.from.y +
            (destination.to.y - destination.from.y) *
              progress

          positionRef.current = { x, y }

          if (walkerRef.current) {
            walkerRef.current.style.left = `${x}%`
            walkerRef.current.style.top = `${y}%`
          }

          if (progress >= 1) {
            destination = null
            pauseRemaining = random(1800, 6200)
            setWalking(false)
          }
        }
      }

      frame = window.requestAnimationFrame(animate)
    }

    frame = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [player.user_id])

  
function stopForInspection() {
  if (pausedRef.current) return

  pausedRef.current = true

  const nextActivity = pickActivity(
    previousActivityRef.current
  )

  previousActivityRef.current = nextActivity

  setActivity(nextActivity)
  setHovered(true)
}

function resumeWalking() {
  if (!pausedRef.current) return

  pausedRef.current = false
  setHovered(false)
}


useEffect(() => {
  function checkPointer(event) {
    const walker = walkerRef.current
    if (!walker) return

    const steps = walker.querySelector('.marauder-steps')
    if (!steps) return

    const rect = steps.getBoundingClientRect()

    const x = event.clientX
    const y = event.clientY

    // Petite zone de tolérance autour des pas.
    const margin = 10

    const nearby =
      x >= rect.left - margin &&
      x <= rect.right + margin &&
      y >= rect.top - margin &&
      y <= rect.bottom + margin

    // Ne pas activer le survol lorsqu'un bouton
    // ou un autre élément interactif est sous la souris.
    const target = document.elementFromPoint(x, y)

    const overControl = target?.closest(
      'button, a, input, select, textarea, [role="button"]'
    )

    const overAvatar = target?.closest(
      'main .group.relative.rounded-full.overflow-hidden'
    )

    if (nearby && !overControl && !overAvatar) {
      stopForInspection()
    } else {
      resumeWalking()
    }
  }

  function leaveWindow() {
    resumeWalking()
  }

  window.addEventListener('pointermove', checkPointer)
  document.addEventListener('pointerleave', leaveWindow)

  return () => {
    window.removeEventListener('pointermove', checkPointer)
    document.removeEventListener('pointerleave', leaveWindow)
  }
}, [])

  return (
    <div
      ref={walkerRef}
      className={[
        'marauder-walker',
        player.decoy ? 'marauder-decoy' : '',
        player.leaving ? 'marauder-leaving' : '',
        hovered ? 'marauder-inspecting' : '',
      ].join(' ')}
    >
      <div
        className="marauder-steps"
        style={{ transform: `rotate(${heading}deg)` }}
       onFocus={stopForInspection}
onBlur={resumeWalking}
        tabIndex={0}
        role="button"
        aria-label={`${player.name}, consulter son activité`}
      >
        <Footprints walking={walking && !hovered} />
      </div>

      <div className="marauder-label">
        <span className="marauder-name">
          {player.name}
        </span>

        {hovered && (
          <span className="marauder-activity">
            {activity}
          </span>
        )}
      </div>
    </div>
  )
}

export default function MaraudersPresence() {
  const [players, setPlayers] = useState([])
  const [decoys, setDecoys] = useState([])
  const [reducedMotion, setReducedMotion] = useState(false)

  const layerRef = useRef(null)
  const [maskImage, setMaskImage] = useState(null)

  // Les noms sont retirés au hasard à chaque chargement.
  useEffect(() => {
    setDecoys(pickDecoys())
  }, [])

  // Préférences d'accessibilité.
  useEffect(() => {
    const mq = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )

    const update = () => setReducedMotion(mq.matches)

    update()
    mq.addEventListener?.('change', update)

    return () => {
      mq.removeEventListener?.('change', update)
    }
  }, [])

  // Masque les empreintes et les noms lorsqu'ils passent
  // derrière l'avatar central et les boutons de navigation.
  useEffect(() => {
    let frame = 0
    let observer
    let resizeObserver

    function updateMask() {
      const layer = layerRef.current
      if (!layer) return

      const region = layer.getBoundingClientRect()

      if (!region.width || !region.height) return

      const navNames = new Set([
        'Messages',
        'RP',
        'Lore',
        'Membres',
        'Profil',
      ])

      const buttons = Array.from(
        document.querySelectorAll(
          'main button[aria-label]'
        )
      ).filter(el =>
        navNames.has(el.getAttribute('aria-label'))
      )

      const avatar = document.querySelector(
        'main .group.relative.rounded-full.overflow-hidden'
      )

      const targets = [
        ...buttons,
        ...(avatar ? [avatar] : []),
      ]

      if (!targets.length) {
        setMaskImage(null)
        return
      }

      const circles = targets.map(el => {
        const rect = el.getBoundingClientRect()

        const cx =
          rect.left - region.left + rect.width / 2

        const cy =
          rect.top - region.top + rect.height / 2

        const radius =
          Math.max(rect.width, rect.height) / 2 + 16

        return `
          <circle
            cx="${cx}"
            cy="${cy}"
            r="${radius}"
            fill="black"
          />
        `
      }).join('')

      const svg = `
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="${region.width}"
          height="${region.height}"
          viewBox="0 0 ${region.width} ${region.height}"
        >
          <defs>
            <mask id="holes" maskUnits="userSpaceOnUse">
              <rect
                width="100%"
                height="100%"
                fill="white"
              />
              ${circles}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="white"
            mask="url(#holes)"
          />
        </svg>
      `

      setMaskImage(
        `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
      )
    }

    function scheduleMask() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateMask)
    }

    scheduleMask()

    window.addEventListener('resize', scheduleMask)

    const main = document.querySelector('main')

    if (main) {
      observer = new MutationObserver(scheduleMask)

      observer.observe(main, {
        childList: true,
        subtree: true,
      })

      resizeObserver = new ResizeObserver(scheduleMask)
      resizeObserver.observe(main)
    }

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleMask)
      observer?.disconnect()
      resizeObserver?.disconnect()
    }
  }, [])

  // Présence des joueurs réels via Supabase.
  useEffect(() => {
    let active = true
    let requestSerial = 0
    const timers = new Set()

    async function refresh() {
      if (document.visibilityState !== 'visible') return

      const serial = ++requestSerial

      const since = new Date(
        Date.now() - ONLINE_WINDOW_MS
      ).toISOString()

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('user_id, last_seen_at')
        .gte('last_seen_at', since)
        .order('last_seen_at', { ascending: false })
        .limit(200)

      if (error || !active || serial !== requestSerial) {
        if (error) {
          console.warn(
            '[Carte du Maraudeur] Présences :',
            error.message
          )
        }
        return
      }

      
const ids = (profiles || [])
  .map(p => p.user_id)
  .filter(Boolean)

const names = {}

if (ids.length) {
  const { data: characters, error: charsError } =
    await supabase
      .from('characters')
      .select('id, user_id, name, is_active')
      .in('user_id', ids)
      .eq('is_active', true)

  if (charsError) {
    console.warn(
      '[Carte du Maraudeur] Personnages :',
      charsError.message
    )
  }

  for (const ch of characters || []) {
    if (!names[ch.user_id]) {
      names[ch.user_id] = ch.name
    }
  }
}

if (!active || serial !== requestSerial) return

const incoming = ids
  .filter(id => names[id])
  .slice(0, MAX_MARKERS)
  .map(id => ({
    user_id: id,
    name: names[id],
    decoy: false,
    leaving: false,
  }))

      const incomingIds = new Set(
        incoming.map(p => p.user_id)
      )

      setPlayers(old => [
        ...incoming,
        ...old
          .filter(p => !incomingIds.has(p.user_id))
          .map(p => ({
            ...p,
            leaving: true,
          })),
      ])

      const timer = window.setTimeout(() => {
        timers.delete(timer)

        if (active) {
          setPlayers(old =>
            old.filter(p => !p.leaving)
          )
        }
      }, 1300)

      timers.add(timer)
    }

    void refresh()

    const interval = window.setInterval(
      () => void refresh(),
      REFRESH_MS
    )

    function onVisible() {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }

    document.addEventListener(
      'visibilitychange',
      onVisible
    )

    return () => {
      active = false
      window.clearInterval(interval)

      document.removeEventListener(
        'visibilitychange',
        onVisible
      )

      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  return (
    <div
      ref={layerRef}
      className={`marauder-layer ${
        reducedMotion ? 'reduce-motion' : ''
      }`}
      style={
        maskImage
          ? {
              maskImage,
              WebkitMaskImage: maskImage,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
            }
          : undefined
      }
      aria-label="Personnages en ligne"
      role="group"
    >
      {[...players, ...decoys].map(player =>
        reducedMotion ? (
          <div
            key={player.user_id}
            className={`marauder-static ${
              player.decoy ? 'marauder-decoy' : ''
            }`}
          >
            {player.name}
          </div>
        ) : (
          <FootprintWalker
            key={player.user_id}
            player={player}
          />
        )
      )}

      <style jsx global>{`
        .marauder-layer {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .marauder-walker {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-50%, -50%);
          opacity: 1;
          pointer-events: none;
          will-change: left, top;
          transition: opacity 1.2s ease;
        }

        .marauder-leaving {
          opacity: 0;
        }

        .marauder-steps {
          width: 42px;
          height: 40px;
          pointer-events: auto;
          cursor: help;
          outline-offset: 3px;
          transition: transform 0.5s ease;
          filter:
            drop-shadow(0 0 3px rgba(255,215,151,.9))
            drop-shadow(0 0 8px rgba(241,177,96,.4));
        }

        .marauder-footprints {
          display: block;
          width: 42px;
          height: 40px;
          overflow: visible;
        }

        .marauder-print {
          fill: #f3dbac;
          stroke: #78512d;
          stroke-width: .45;
          opacity: .95;
          transform-box: fill-box;
          transform-origin: center;
        }

        .marauder-footprints.is-walking
        .marauder-print:first-child {
          animation:
            marauder-stamp-left
            1.4s ease-in-out infinite alternate;
        }

        .marauder-steps
        .marauder-footprints.is-walking g:first-child
        .marauder-print {
          animation:
            marauder-stamp-left
            1.4s ease-in-out infinite alternate;
        }

        .marauder-steps
        .marauder-footprints.is-walking g:last-child
        .marauder-print {
          animation:
            marauder-stamp-right
            1.4s ease-in-out infinite alternate;
        }

        .marauder-inspecting .marauder-steps {
          filter:
            drop-shadow(0 0 5px rgba(255,225,166,1))
            drop-shadow(0 0 12px rgba(241,177,96,.65));
        }

        .marauder-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          max-width: 220px;
          padding: 4px 7px;
          border-radius: 5px;
          background: rgba(10,8,6,.42);
          pointer-events: none;
          text-align: center;
        }

        .marauder-name {
          color: #f4dfb4;
          font: italic 14px/1.3 Georgia, serif;
          letter-spacing: .035em;
          white-space: nowrap;
          text-shadow:
            0 1px 4px #120b06,
            0 0 9px #100c07;
        }

        .marauder-activity {
          color: #f2dfc3;
          font: italic 11px/1.45 Georgia, serif;
          width: max-content;
          max-width: 205px;
          white-space: normal;
          text-align: center;
          animation: marauder-activity-appear .22s ease-out;
        }

        .marauder-inspecting .marauder-label {
          background: rgba(15,12,10,.88);
          border: 1px solid rgba(225,189,129,.28);
          box-shadow: 0 3px 15px rgba(0,0,0,.35);
          z-index: 5;
        }

        .marauder-decoy .marauder-steps {
          filter:
            drop-shadow(0 0 3px rgba(121,174,206,.65))
            drop-shadow(0 0 8px rgba(102,153,188,.25));
        }

        .marauder-decoy .marauder-print {
          fill: #a8bccb;
          stroke: #40566c;
          opacity: .78;
        }

        .marauder-decoy .marauder-name {
          color: #bdcddd;
        }

        .marauder-decoy .marauder-activity {
          color: #dae4ee;
        }

        .marauder-decoy.marauder-inspecting
        .marauder-label {
          border-color: rgba(156,188,213,.35);
          background: rgba(10,17,26,.9);
        }

        .reduce-motion {
          display: flex;
          flex-wrap: wrap;
          align-content: flex-end;
          align-items: flex-end;
          gap: 8px;
          padding: 12px 16px 110px;
        }

        .marauder-static {
          color: #f4dfb4;
          font: italic 12px Georgia, serif;
          text-shadow: 0 1px 4px #120b06;
        }

        .marauder-static.marauder-decoy {
          color: #a8bccb;
        }

        @keyframes marauder-stamp-left {
          from {
            opacity: .35;
            transform: translateY(3px) scale(.92);
          }
          to {
            opacity: 1;
            transform: translateY(-3px) scale(1.06);
          }
        }

        @keyframes marauder-stamp-right {
          from {
            opacity: 1;
            transform: translateY(-3px) scale(1.06);
          }
          to {
            opacity: .35;
            transform: translateY(3px) scale(.92);
          }
        }

        @keyframes marauder-activity-appear {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 640px) {
          .marauder-steps,
          .marauder-footprints {
            width: 34px;
            height: 32px;
          }

          .marauder-name {
            font-size: 11px;
          }

          .marauder-activity {
            font-size: 10px;
            max-width: 155px;
          }

          .marauder-label {
            max-width: 170px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .marauder-walker,
          .marauder-print,
          .marauder-activity {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  )
}
