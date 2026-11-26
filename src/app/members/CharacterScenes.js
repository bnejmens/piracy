import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

const SCENES_PER_PAGE = 12
const POSTS_PER_BATCH = 500

async function listScenes(characterId, page, signal) {
  const offset = page * SCENES_PER_PAGE
  const { data: topics, error } = await supabase
    .from('rp_topics')
    .select('id,title,participation:rp_posts!rp_posts_topic_id_fkey!inner()')
    .eq('participation.author_character_id', characterId)
    .order('created_at', { ascending: false })
    .order('id')
    .range(offset, offset + SCENES_PER_PAGE)
    .abortSignal(signal)
  if (error) throw error

  const scenes = topics.slice(0, SCENES_PER_PAGE)
  const namesByTopic = new Map(scenes.map(scene => [scene.id, new Map()]))
  let cursor

  while (scenes.length) {
    let query = supabase
      .from('rp_posts')
      .select('id,topic_id,author_character_id,author:characters!rp_posts_author_character_id_fkey(name)')
      .in('topic_id', scenes.map(scene => scene.id))
      .not('author_character_id', 'is', null)
      .order('id')
      .limit(POSTS_PER_BATCH)
      .abortSignal(signal)
    if (cursor !== undefined) query = query.gt('id', cursor)
    const { data: posts, error: postsError } = await query
    if (postsError) throw postsError
    for (const post of posts) {
      if (post.author?.name) {
        namesByTopic.get(post.topic_id).set(post.author_character_id, post.author.name)
      }
    }
    if (posts.length < POSTS_PER_BATCH) break
    cursor = posts.at(-1).id
  }

  return {
    scenes: scenes.map(scene => ({ ...scene, characters: [...namesByTopic.get(scene.id)] })),
    hasNext: topics.length > SCENES_PER_PAGE,
  }
}

export default function CharacterScenes({ characterId }) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    listScenes(characterId, page, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ page, ...data })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ page, error: true })
    })
    return () => controller.abort()
  }, [characterId, page])

  const current = result?.page === page ? result : null

  return (
    <section className="min-w-0 rounded-2xl border border-white/15 bg-black/25 p-4">
      <h3 className="mb-3 font-serif text-lg text-amber-100">Scènes RP jouées</h3>
      {!current ? (
        <p role="status" className="text-sm text-white/60">Chargement des scènes…</p>
      ) : current.error ? (
        <p role="status" className="text-sm text-rose-200">Impossible de charger les scènes.</p>
      ) : current.scenes.length ? (
        <ul className="divide-y divide-white/10">
          {current.scenes.map(scene => (
            <li key={scene.id} className="py-2 first:pt-0">
              <Link href={`/rp/scene?topic=${encodeURIComponent(scene.id)}`}
                className="break-words text-sm font-medium text-amber-100 underline decoration-amber-100/45 underline-offset-4 hover:text-amber-300">
                {scene.title}
              </Link>
              <p className="mt-1 break-words text-xs text-white/70">
                {scene.characters.map(([, name]) => name).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm italic text-white/45">Aucune scène RP visible.</p>
      )}
      {(page > 0 || current?.hasNext) && (
        <div className="mt-3 flex justify-between gap-3 text-xs text-amber-100">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}
            className="rounded border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-40">
            Précédent
          </button>
          <button type="button" disabled={!current?.hasNext} onClick={() => setPage(page + 1)}
            className="rounded border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-40">
            Suivant
          </button>
        </div>
      )}
    </section>
  )
}
