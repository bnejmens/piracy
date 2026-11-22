'use client'

import { useLayoutEffect, useRef } from 'react'
import SoundTrigger from './audio/SoundTrigger'
import styles from './RpPostReader.module.css'

export default function RpPostReader({ title, posts, startPostId, renderByline, textSize, onTextSizeChange, onClose }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const scrollRef = useRef(null)
  const startRef = useRef(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })
    if (startRef.current) scrollRef.current.scrollTop = startRef.current.offsetTop - scrollRef.current.firstElementChild.offsetTop
  }, [startPostId])

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
            <span className={styles.ambience}><SoundTrigger inline /></span>
            <button ref={closeRef} type="button" onClick={() => dialogRef.current.close()}>Fermer</button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className={styles.scroll} style={{ '--reader-text-size': `${textSize}px` }}>
        {posts.map(post => (
          <article key={post.id} ref={post.id === startPostId ? startRef : undefined} className={styles.page}>
            <div className={styles.byline}>{renderByline(post)}</div>
            <div className={styles.content} dangerouslySetInnerHTML={{ __html: post.html }} />
          </article>
        ))}
      </div>
    </dialog>
  )
}
