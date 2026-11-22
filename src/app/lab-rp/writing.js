import { useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import { DiceRoll } from '@dice-roller/rpg-dice-roller'

const sample = '<p><strong>Ysill</strong> pousse la porte. <span style="color:#b78de6">La lumière vacille.</span></p><blockquote><p>Quelqu’un est passé avant nous.</p></blockquote><div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"></iframe></div>'

export default function Writing() {
  const [notation, setNotation] = useState('1d20+3')
  const [rolls, setRolls] = useState([])
  const [error, setError] = useState('')
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, TextStyle, Color, Image, Youtube.configure({ nocookie: true })],
    content: sample,
    editorProps: { attributes: { 'aria-label': 'Réponse RP' } },
  })
  if (!editor) return <p>Chargement de l’éditeur…</p>

  function insertImage() {
    const value = window.prompt('Lien direct vers une image HTTPS')
    if (!value) return
    if (!/^https:\/\/[^\s]+$/i.test(value)) {
      setError('Saisis un lien HTTPS valide.')
      return
    }
    setError('')
    editor.chain().focus().setImage({ src: value }).run()
  }

  function roll(event) {
    event.preventDefault()
    const match = notation.trim().match(/^(\d{1,2})?d(4|6|8|10|12|20|100)([+-]\d{1,2})?$/i)
    if (!match || Number(match[1] || 1) < 1 || Number(match[1] || 1) > 20) {
      setError('Entre une formule entre 1 et 20 dés, par exemple 2d6+2.')
      return
    }
    const result = new DiceRoll(notation.trim().toLowerCase())
    setError('')
    setRolls(current => [...current, result.output])
  }

  return <>
    <h2>Répondre à la scène</h2>
    <div className="lab-tools" aria-label="Mise en forme">
      <button onClick={() => editor.chain().focus().toggleBold().run()}>Gras</button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()}>Italique</button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()}>Citation</button>
      <button onClick={() => editor.chain().focus().setColor('#b78de6').run()}>Violet</button>
      <button onClick={insertImage}>Image</button>
      <button onClick={() => editor.chain().focus().undo().run()}>Annuler</button>
    </div>
    <EditorContent editor={editor} className="lab-editor" />
    <form className="lab-tools" onSubmit={roll}>
      <label>Formule <input value={notation} onChange={e => setNotation(e.target.value)} maxLength={12} /></label>
      <button type="submit">Lancer les dés</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <ol aria-live="polite">{rolls.map((result, index) => <li key={index}>{result}</li>)}</ol>
    <p className="lab-note">Les jets de cet aperçu sont locaux au navigateur.</p>
  </>
}
