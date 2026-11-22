'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import SiteTopbar from '@/components/SiteTopbar'
import './lab.css'

const Writing = dynamic(() => import('./writing'), { ssr: false })
const Board = dynamic(() => import('./board'), { ssr: false })
const Relations = dynamic(() => import('./relations'), { ssr: false })
const Adventure = dynamic(() => import('./adventure'), { ssr: false })

const tabs = [
  ['writing', 'Réponse RP'],
  ['board', 'Tableau d’enquête'],
  ['adventure', 'Enquête interactive'],
  ['relations', 'Relations'],
]

export default function LabPage() {
  const [tab, setTab] = useState('writing')
  return (
    <>
    <SiteTopbar title="Aperçu RP" />
    <main className="rp-lab">
      <header>
        <h1>Les archives de Poudlard</h1>
        <p>Aperçu de test de Piracy. Personnages et données fictifs.</p>
      </header>
      <nav aria-label="Outils RP">
        {tabs.map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <section hidden={tab !== 'writing'}><Writing /></section>
      {tab === 'board' && <section><Board /></section>}
      {tab === 'adventure' && <section><Adventure /></section>}
      {tab === 'relations' && <section><Relations /></section>}
    </main>
    </>
  )
}
