import { useState } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const characters = [
  { id: 'ysill', name: 'Ysill Rowle', bio: 'Elle a découvert la disparition du registre.' },
  { id: 'mara', name: 'Mara Vale', bio: 'Archiviste. Elle détient le registre des accès.' },
  { id: 'elian', name: 'Elian Flint', bio: 'Élève aperçu dans le couloir après le couvre-feu.' },
]
const nodes = characters.map((character, i) => ({
  id: character.id,
  position: { x: i === 0 ? 110 : (i - 1) * 220, y: i === 0 ? 0 : 140 },
  data: { label: character.name },
}))
const edges = [
  { id: 'mara', source: 'ysill', target: 'mara', label: 'Alliée' },
  { id: 'elian', source: 'ysill', target: 'elian', label: 'Rival' },
]

export default function Relations() {
  const [selected, setSelected] = useState(characters[0])
  return <>
    <h2>Relations de Ysill</h2>
    <div className="lab-canvas">
      <ReactFlow colorMode="dark" nodes={nodes} edges={edges} fitView nodesDraggable={false}
        onNodeClick={(_, node) => setSelected(characters.find(character => character.id === node.id))}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <aside aria-live="polite"><h3>{selected.name}</h3><p>{selected.bio}</p></aside>
  </>
}
