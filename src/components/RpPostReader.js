'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import SoundTrigger from './audio/SoundTrigger'
import styles from './RpPostReader.module.css'

export default function RpPostReader({ title, initialPosts, startPostId, hasPrevious, hasNext, loadPosts, renderByline, textSize, onTextSizeChange, onClose }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const scrollRef = useRef(null)
  const startRef = useRef(null)
  const previousRef = useRef(null)
  const nextRef = useRef(null)
  const readingRef = useRef(null)
  const prependAnchor = useRef(null)
  const [posts, setPosts] = useState(initialPosts)
  const [more, setMore] = useState({ previous: hasPrevious, next: hasNext })
  const [loading, setLoading] = useState(null)
  const [failed, setFailed] = useState({})

  const loadMore = useCallback(async direction => {
    if (readingRef.current || !more[direction]) return
    const previous = direction === 'previous'
    const boundary = previous ? posts[0] : posts.at(-1)
    readingRef.current = direction
    setLoading(direction)
    setFailed(current => ({ ...current, [direction]: false }))
    try {
      const batch = await loadPosts(direction, boundary)
      const existing = new Set(posts.map(post => post.id))
      const additions = batch.posts.filter(post => !existing.has(post.id))
      if (previous && additions.length) {
        const first = scrollRef.current?.querySelector('article')
        if (first) prependAnchor.current = { node: first, top: first.getBoundingClientRect().top }
      }
      if (additions.length) setPosts(current => previous ? [...additions, ...current] : [...current, ...additions])
      setMore(current => ({ ...current, [direction]: batch.hasMore && additions.length > 0 }))
    } catch {
      setFailed(current => ({ ...current, [direction]: true }))
    } finally {
      readingRef.current = null
      setLoading(null)
    }
  }, [loadPosts, more, posts])

  useLayoutEffect(() => {
    const anchor = prependAnchor.current
    if (!anchor) return
    scrollRef.current.scrollTop += anchor.node.getBoundingClientRect().top - anchor.top
    prependAnchor.current = null
  }, [posts])

  useEffect(() => {
    if (loading || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) loadMore(entry.target === previousRef.current ? 'previous' : 'next')
      }
    }, { root: scrollRef.current, rootMargin: '400px 0px' })
    if (more.previous && !failed.previous && previousRef.current) observer.observe(previousRef.current)
    if (more.next && !failed.next && nextRef.current) observer.observe(nextRef.current)
    return () => observer.disconnect()
  }, [failed, loadMore, loading, more])

  function pageControl(direction, ref) {
    if (!more[direction]) return null
    const previous = direction === 'previous'
    return (
      <div ref={ref} className={styles.pageControl}>
        <button type="button" disabled={!!loading} onClick={() => loadMore(direction)}>
          {loading === direction ? 'Chargement…' : failed[direction] ? 'Réessayer' :
            previous ? 'Charger les réponses précédentes' : 'Charger les réponses suivantes'}
        </button>
        {failed[direction] && <p role="alert">Impossible de charger ces réponses.</p>}
      </div>
    )
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })
    const start = startRef.current
    const scroll = scrollRef.current
    if (start) scroll.scrollTop = start.offsetTop - parseFloat(getComputedStyle(scroll).paddingTop)
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
            <span className={styles.ambience}><SoundTrigger /></span>
            <button ref={closeRef} type="button" onClick={() => dialogRef.current.close()}>Fermer</button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className={styles.scroll} style={{ '--reader-text-size': `${textSize}px` }}>
        {pageControl('previous', previousRef)}
        {posts.map(post => (
          <article key={post.id} ref={post.id === startPostId ? startRef : undefined} className={styles.page}>
            <div className={styles.byline}>{renderByline(post)}</div>
            <div className={styles.content} dangerouslySetInnerHTML={{ __html: post.html }} />
          </article>
        ))}
        {pageControl('next', nextRef)}
      </div>
    </dialog>
  )
}
