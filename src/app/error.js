'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }) {
  useEffect(() => {
    // Affiche l’erreur brute + ses propriétés (cause Supabase, etc.)
    console.error('App error:', error)
    try {
      // Beaucoup d'erreurs Supabase sont dans error.cause
      if (error?.cause) console.error('Cause:', error.cause)
    } catch {}
  }, [error])

  // Tentative de rendu lisible
  const details = JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2)

  return (
    <div style={{padding:24,fontFamily:'system-ui'}}>
      <h1>Oups 😅</h1>
      <p>Une erreur s'est produite. Ci-dessous le détail pour debug :</p>
      <pre style={{whiteSpace:'pre-wrap',background:'#111',color:'#0f0',padding:12,borderRadius:8}}>
        {details}
      </pre>
      <button onClick={() => reset()} style={{marginTop:12,padding:'8px 12px'}}>Réessayer</button>
    </div>
  )
}
