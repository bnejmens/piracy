'use client'

import { useState } from 'react'

const button = 'min-h-10 rounded-lg border border-amber-200/25 bg-white/5 px-3 py-2 text-sm text-amber-100 hover:bg-amber-200/10 disabled:opacity-50'
const primary = 'min-h-10 rounded-lg bg-amber-200 px-3 py-2 text-sm font-semibold text-[#281e30] hover:bg-amber-100 disabled:opacity-50'
const field = 'mt-1 block w-full min-w-0 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-base text-white outline-none focus:border-amber-200/55 sm:text-sm'
const blankPath = () => ({ label: '', clue: '' })

function InvestigationEditor({ investigation, onSave, onCancel, busy }) {
  const [title, setTitle] = useState(investigation?.title || '')
  const [intro, setIntro] = useState(investigation?.intro || '')
  const [paths, setPaths] = useState(investigation?.draft || [blankPath(), blankPath()])

  function updatePath(index, key, value) {
    setPaths(current => current.map((path, i) => i === index ? { ...path, [key]: value } : path))
  }

  return (
    <form className="grid min-w-0 gap-3" onSubmit={event => {
      event.preventDefault()
      onSave({ title, intro, paths })
    }}>
      <label className="text-sm text-amber-100">
        Titre de l’enquête
        <input className={field} value={title} onChange={event => setTitle(event.target.value)} required maxLength={100} />
      </label>
      <label className="text-sm text-amber-100">
        Situation de départ
        <textarea className={field} value={intro} onChange={event => setIntro(event.target.value)} required rows={3} maxLength={1500} />
      </label>
      <div className="grid min-w-0 gap-3 @3xl:grid-cols-2">
        {paths.map((path, index) => (
          <fieldset key={index} className="min-w-0 space-y-2 rounded-xl border border-amber-200/15 p-3">
            <legend className="px-1 text-xs text-amber-200/80">Piste {index + 1}</legend>
            <label className="block text-sm text-white/80">
              Choix proposé au joueur
              <input className={field} value={path.label} onChange={event => updatePath(index, 'label', event.target.value)} required maxLength={120} />
            </label>
            <label className="block text-sm text-white/80">
              Indice découvert
              <textarea className={field} value={path.clue} onChange={event => updatePath(index, 'clue', event.target.value)} required rows={2} maxLength={1500} />
            </label>
            {paths.length > 2 && <button type="button" className={button} onClick={() => setPaths(current => current.filter((_, i) => i !== index))}>Retirer la piste {index + 1}</button>}
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {paths.length < 6 && <button type="button" className={button} onClick={() => setPaths(current => [...current, blankPath()])}>Ajouter une piste</button>}
        <button type="submit" className={primary} disabled={busy}>{investigation ? 'Enregistrer le brouillon' : 'Enregistrer la proposition'}</button>
        <button type="button" className={button} onClick={onCancel}>Fermer</button>
      </div>
    </form>
  )
}

export default function RpInvestigation({ investigation, postId, canPropose, archived, onAction }) {
  const [panel, setPanel] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const published = investigation?.status === 'published'

  if (!investigation && !canPropose) return null

  async function act(action, data = {}, nextPanel) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onAction(action, { id: investigation?.id, postId, ...data })
      if (nextPanel !== undefined) setPanel(nextPanel)
      if (action === 'pin') setPin('')
    } catch (err) {
      setError(err.message || 'Action indisponible.')
    } finally {
      setBusy(false)
    }
  }

  if (!investigation && !panel) {
    return <button type="button" className={button} onClick={() => setPanel('edit')}>Proposer une enquête</button>
  }

  return (
    <section className="@container min-w-0 rounded-2xl border border-amber-200/25 bg-[#201727] p-3 sm:p-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-serif text-lg text-amber-100">{investigation?.title || 'Proposer une enquête'}</h3>
        </div>
        {investigation && !published && (
          <span className="rounded-full bg-amber-200/10 px-2.5 py-1 text-xs text-amber-100">
            {investigation.status === 'pending' ? 'En attente de validation' : 'Approuvée · À publier'}
          </span>
        )}
      </header>
      {investigation && panel !== 'edit' && <p className="my-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">{investigation.intro}</p>}

      {investigation && !published && !archived && (
        <div className="flex flex-wrap gap-2">
          {investigation.status === 'pending' && investigation.canApprove && <>
            <button type="button" className={primary} disabled={busy} onClick={() => act('approve')}>Approuver l’enquête</button>
            <button type="button" className={button} disabled={busy} onClick={() => act('reject')}>Refuser</button>
          </>}
          {investigation.isGm && panel !== 'edit' && <button type="button" className={button} onClick={() => setPanel('edit')}>Modifier le brouillon</button>}
          {investigation.isGm && investigation.status === 'approved' && panel !== 'edit' && (
            <button type="button" className={primary} disabled={busy} onClick={() => act('publish', {}, '')}>Publier l’enquête</button>
          )}
        </div>
      )}

      {panel === 'edit' && !archived && (
        <InvestigationEditor investigation={investigation} busy={busy} onCancel={() => setPanel('')}
          onSave={draft => act(investigation ? 'edit' : 'propose', draft, '')} />
      )}

      {published && (investigation.canPlay || investigation.isGm) && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={panel === 'play'} className={panel === 'play' ? primary : button}
              onClick={() => setPanel(current => current === 'play' ? '' : 'play')}>
              {investigation.progress ? 'Mon indice' : 'Mener l’enquête'}
            </button>
            <button type="button" aria-pressed={panel === 'clues'} className={panel === 'clues' ? primary : button}
              onClick={() => setPanel(current => current === 'clues' ? '' : 'clues')}>
              Indices partagés ({investigation.clues?.length || 0})
            </button>
          </div>
          {panel === 'play' && (investigation.progress ? (
            <div className="rounded-xl border border-amber-200/20 bg-black/20 p-3">
              <h4 className="font-medium text-amber-100">Ton indice</h4>
              <p className="my-2 whitespace-pre-wrap break-words text-sm text-white/85">{investigation.progress.clue}</p>
              {investigation.progress.shared ? <p className="text-xs text-amber-200/80">Partagé au tableau</p> : !archived && (
                <button type="button" className={button} disabled={busy} onClick={() => act('share', {}, 'clues')}>Partager au tableau</button>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {archived ? <p className="text-sm text-white/60">L’enquête est en lecture seule.</p> : (
                <>
                  <p className="text-sm text-white/75">Choisis ta piste. Ton indice reste privé jusqu’au partage.</p>
                  {investigation.choices?.map((label, index) => (
                    <button key={index} type="button" className={button + ' whitespace-normal break-words text-left'}
                      disabled={busy} onClick={() => act('choose', { index })}>{label}</button>
                  ))}
                </>
              )}
            </div>
          ))}
          {panel === 'clues' && (
            <div className="grid gap-3">
              {!investigation.clues?.length && <p className="text-sm text-white/60">Aucun indice partagé pour le moment.</p>}
              <ul className="grid min-w-0 gap-2 @3xl:grid-cols-2">
                {investigation.clues?.map(clue => (
                  <li key={clue.id} className="min-w-0 rounded-xl border border-amber-200/20 bg-amber-100/5 p-3">
                    {clue.pinned && <p className="mb-1 text-xs font-semibold text-amber-200">Indice du MJ</p>}
                    <p className="whitespace-pre-wrap break-words text-sm text-white/85">{clue.body}</p>
                    {investigation.isGm && !archived && (
                      <button type="button" className={button + ' mt-2'} disabled={busy}
                        onClick={() => act('remove_clue', { clueId: clue.id })}>Retirer cet indice</button>
                    )}
                  </li>
                ))}
              </ul>
              {investigation.isGm && !archived && (
                <form className="space-y-2" onSubmit={event => { event.preventDefault(); act('pin', { body: pin }) }}>
                  <label className="block text-sm text-amber-100">
                    Ajouter un indice commun
                    <textarea className={field} rows={2} required maxLength={1500} value={pin} onChange={event => setPin(event.target.value)} />
                  </label>
                  <button type="submit" className={primary} disabled={busy || !pin.trim()}>Épingler l’indice</button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 break-words text-sm text-rose-200">{error}</p>}
    </section>
  )
}
