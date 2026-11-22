'use client'

import { useEffect, useRef } from 'react'
import styles from './RpPostReader.module.css'

export default function RpPostReader({ title, html, children, textSize, onTextSizeChange, onClose }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <dialog ref={dialogRef} aria-labelledby="rp-reader-title" onClose={onClose} className={styles.reader}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarInner}>
          <h2 id="rp-reader-title" className={styles.title}>{title || 'Lecture du RP'}</h2>
          <div className={styles.controls}>
            <button type="button" aria-label="Réduire la taille du texte" title="Réduire le texte"
              disabled={textSize <= 17} onClick={() => onTextSizeChange(textSize - 2)}>A−</button>
            <button type="button" aria-label="Agrandir le texte" title="Agrandir le texte"
              disabled={textSize >= 27} onClick={() => onTextSizeChange(textSize + 2)}>A+</button>
            <button ref={closeRef} type="button" onClick={() => dialogRef.current.close()}>Fermer</button>
          </div>
        </div>
      </div>
      <div className={styles.scroll}>
        <article className={styles.page}>
          <div className={styles.byline}>{children}</div>
          <div className={styles.content} style={{ '--reader-text-size': `${textSize}px` }}
            dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
    </dialog>
  )
}
