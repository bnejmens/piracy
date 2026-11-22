import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

const storageKey = 'piracy-lab-board-v1'
const startingElements = convertToExcalidrawElements([
  { type: 'text', x: 70, y: 70, text: 'L’inventaire a disparu' },
  { type: 'text', x: 70, y: 155, text: 'Indice : cire violette sur le registre' },
])

export default function Board() {
  let elements = startingElements
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (Array.isArray(saved)) elements = saved
  } catch {}
  return <>
    <h2>Tableau d’enquête</h2>
    <p className="lab-note">Déplace les indices ou ajoute les tiens. Le tableau reste dans ce navigateur.</p>
    <div className="lab-canvas">
      <Excalidraw
        langCode="fr-FR"
        theme="dark"
        initialData={{ elements, scrollToContent: true }}
        onChange={items => {
          try { localStorage.setItem(storageKey, JSON.stringify(items)) } catch {}
        }}
      />
    </div>
  </>
}
