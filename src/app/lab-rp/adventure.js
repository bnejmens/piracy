import { useRef, useState } from 'react'
import { Compiler } from 'inkjs/full'

const script = `L’inventaire du cabinet des reliques a disparu. Par où commencer ?
* [Examiner le registre]
  Une tache de cire violette recouvre la dernière signature.
  -> END
* [Interroger Mara]
  Mara t’apprend qu’Elian a emprunté la clé avant le couvre-feu.
  -> END
`
const storageKey = 'piracy-lab-ink-v1'

function read(story) {
  return {
    text: story.canContinue ? story.ContinueMaximally().trim() : story.currentText?.trim(),
    choices: story.currentChoices.map(choice => ({ index: choice.index, text: choice.text })),
  }
}

export default function Adventure() {
  const story = useRef(null)
  const [view, setView] = useState(() => {
    story.current = new Compiler(script).Compile()
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved) {
        story.current.state.LoadJson(saved.state)
        return saved.view
      }
    } catch {}
    return read(story.current)
  })
  function choose(index) {
    story.current.ChooseChoiceIndex(index)
    const next = read(story.current)
    setView(next)
    try { localStorage.setItem(storageKey, JSON.stringify({ state: story.current.state.ToJson(), view: next })) } catch {}
  }
  function restart() {
    story.current.ResetState()
    setView(read(story.current))
    try { localStorage.removeItem(storageKey) } catch {}
  }
  return <>
    <h2>Le registre disparu</h2>
    <p aria-live="polite">{view.text}</p>
    <div className="lab-tools">
      {view.choices.map(choice => <button key={choice.index} onClick={() => choose(choice.index)}>{choice.text}</button>)}
      <button onClick={restart}>Recommencer</button>
    </div>
  </>
}
