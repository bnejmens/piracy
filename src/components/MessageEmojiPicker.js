'use client'

import { useEffect, useRef } from 'react'
import { Picker } from 'emoji-mart'
import data from '@emoji-mart/data'
import frenchInterface from '@emoji-mart/data/i18n/fr.json'
import frenchEmojis from 'emojibase-data/fr/compact.json'

function searchKey(hexcode) {
  return hexcode.toLowerCase().split('-').filter(code => code !== 'fe0f').join('-')
}

const translations = new Map(frenchEmojis.map(emoji => [searchKey(emoji.hexcode), emoji]))
const localizedData = {
  ...data,
  emojis: Object.fromEntries(Object.entries(data.emojis).map(([id, emoji]) => {
    const unified = emoji.skins?.[0]?.unified
    const french = unified && translations.get(searchKey(unified))
    if (!french) return [id, emoji]
    const terms = [french.label, ...(french.tags || [])]
    const folded = terms.map(term => term.normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('œ', 'oe'))
    return [id, {
      ...emoji,
      name: french.label,
      keywords: [...new Set([emoji.name, ...(emoji.keywords || []), ...terms, ...folded])],
    }]
  })),
}

export default function MessageEmojiPicker({ onSelect }) {
  const mountRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    const mount = mountRef.current
    const picker = new Picker({
      data: localizedData,
      i18n: frenchInterface,
      locale: 'fr',
      set: 'native',
      theme: 'dark',
      dynamicWidth: true,
      emojiButtonSize: 34,
      emojiSize: 22,
      previewPosition: 'none',
      skinTonePosition: 'search',
      maxFrequentRows: 2,
      onEmojiSelect: emoji => {
        if (emoji.native) onSelectRef.current(emoji.native)
      },
    })
    picker.style.width = '100%'
    picker.style.height = 'clamp(230px, 42dvh, 345px)'
    picker.style.setProperty('--rgb-accent', '252, 211, 77')
    picker.style.setProperty('--rgb-background', '30, 41, 59')
    mount.appendChild(picker)
    return () => picker.remove()
  }, [])

  return <div ref={mountRef} className="min-w-0" />
}
