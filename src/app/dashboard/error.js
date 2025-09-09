'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }) {
  useEffect(() => {
    // Affiche le vrai contenu de l'erreur dans la console
    console.error('[dashboard] error =', error)
    try { if (error?.cause) console.error('[dashboard] cause =', error.cause) } catch {}
  }, [error])

  const details = JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2)

  return (
    <div style={{padding:16,fontFamily:'system-ui'}}>
      <h1>Oups sur /dashboard</h1>
      <p>Voici le détail de l’erreur :</p>
      <pre style={{whiteSpace:'pre-wrap',background:'#111',color:'#0f0',padding:12,borderRadius:8}}>
        {details}
      </pre>
      <button onClick={() => reset()} style={{marginTop:12,padding:'8px 12px'}}>Réessayer</button>
    </div>
  )
}
