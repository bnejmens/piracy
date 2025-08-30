"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"

const BUCKET = "avatars"

export default function RandomVavaPage() {
  const [session, setSession] = useState(null)

  // pools = slugs distincts
  const [slugs, setSlugs] = useState([])
  const [loadingSlugs, setLoadingSlugs] = useState(true)
  const [error, setError] = useState("")

  // création de pool (par slug)
  const [slugInput, setSlugInput] = useState("")
  const slug = useMemo(() => normalizeSlug(slugInput), [slugInput])

  // pool actif
  const [activeSlug, setActiveSlug] = useState(null)
  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)

  // upload
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    alert("Lien copié ✅")
  } catch {
    alert("Impossible de copier")
  }
}

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data?.session || null))
    loadSlugs()
  }, [])

  async function loadSlugs() {
    setLoadingSlugs(true); setError("")
    // récupère toutes les lignes et déduplique pool_slug
    const { data, error } = await supabase
      .from("pool_images")
      .select("pool_slug")
      .order("created_at", { ascending: false })

    if (error) setError(error.message)
    const uniq = Array.from(new Set((data || []).map(r => (r.pool_slug || "").trim()).filter(Boolean)))
    setSlugs(uniq)
    setLoadingSlugs(false)
  }

  async function loadImages(s) {
    if (!s) return
    setLoadingImages(true)
    const { data } = await supabase
      .from("pool_images")
      .select("id, url, title, created_at")
      .eq("pool_slug", s)
      .order("created_at", { ascending: false })
    setImages(data || [])
    setLoadingImages(false)
  }

  function normalizeSlug(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  }

  function publicUrl(path) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl || null
  }

  async function upload(files) {
    if (!session) { alert("Connecte-toi"); return }
    if (!slug) { alert("Choisis un slug de pool"); return }
    if (!files?.length) return

    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const safe = file.name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "")
        const path = `${slug}/${Date.now()}-${i}-${safe}`

        const { error: upErr } = await supabase
          .storage.from(BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false })
        if (upErr) throw upErr

        const url = publicUrl(path)
        if (!url) throw new Error("URL publique introuvable")

        const { error: insErr } = await supabase
          .from("pool_images")
          .insert({ pool_slug: slug, url, title: file.name })
        if (insErr) throw insErr
      }
      // refresh
      await loadSlugs()
      if (activeSlug === slug) await loadImages(slug)
      alert("Upload OK ✅")
    } catch (e) {
      alert(e.message || "Upload échoué")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function removeImage(id) {
    if (!confirm("Supprimer cette image ?")) return
    const { error } = await supabase.from("pool_images").delete().eq("id", id)
    if (error) { alert(error.message); return }
    await loadImages(activeSlug)
  }

  const randomUrlFor = (s) =>
    (typeof window === "undefined")
      ? `/api/randimg/${s}`
      : `${window.location.origin}/api/randimg/${s}`

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/vava-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      <header className="absolute top-6 left-8 right-8 z-40 flex items-center justify-between">
+ <h1 className="text-white text-2xl font-semibold drop-shadow">Librairie d&apos;Avatars</h1>
        <Link href="/dashboard" className="rounded-full border border-white/25 bg-white/15 backdrop-blur-md px-3 py-1.5 text-white/90 text-sm hover:bg-white/20">
          ← Dashboard
        </Link>
      </header>

<div className="absolute inset-0 pt-20 pb-8 px-6 overflow-hidden">
        {/* Création/Upload */}
        <section className="max-w-5xl mx-auto rounded-2xl border border-white/30 bg-black/20 backdrop-blur p-4 text-white mb-6">
          <h2 className="text-lg font-semibold mb-3">Ajouter des portraits</h2>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3">
            <div className="space-y-2">
              <label className="text-sm text-white/80">Nom de la Galerie</label>
              <input
                value={slugInput}
                onChange={(e)=>setSlugInput(e.target.value)}
                placeholder="Ex: Michel Michel"
                className="w-full rounded-md bg-white/10 border border-white/20 px-3 py-2 placeholder-white/60"
              />
              <div className="text-xs text-white/60">Dossier: <code>/avatars/{slug || "…"}</code></div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/80">Images à uploader</label>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                disabled={!slug || uploading || !session}
                onChange={(e)=>upload(e.target.files)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-amber-300 file:text-slate-900 file:px-3 file:py-1.5 hover:file:bg-amber-200 disabled:opacity-50"
              />
              {!session && <div className="text-xs text-white/70">Connecte-toi pour uploader.</div>}
            </div>
          </div>
        </section>

        {/* Liste des pools (slugs) + sélection */}
<section className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-0">
          <div className="rounded-2xl border border-white/30 bg-black/25 backdrop-blur p-4 text-white min-h-[50vh]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Pools existants</h3>
              {loadingSlugs && <span className="text-white/70 text-sm">Chargement…</span>}
            </div>
            {error && <div className="text-rose-200 text-sm mb-2">{error}</div>}
            <div className="space-y-2">
              {slugs.map(s => (
                <button
                  key={s}
                  onClick={()=>{ setActiveSlug(s); loadImages(s) }}
                  className={`w-full text-left rounded-lg px-3 py-2 border transition
                    ${activeSlug===s ? 'bg-white/15 border-white/35' : 'bg-white/6 border-white/15 hover:bg-white/10'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{s}</div>
                      <div className="text-xs text-white/70">/api/randimg/{s}</div>
                    </div>
                    <a
                      href={randomUrlFor(s)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-cyan-600/90 text-slate-900 text-xs px-3 py-1.5 hover:bg-emerald-300"
                      onClick={(e)=>e.stopPropagation()}
                    >
                      Ouvrir la Galerie
                    </a>
                  </div>
                </button>
              ))}
              {!slugs.length && !loadingSlugs && (
                <div className="text-white/70 text-sm">Aucun pool pour le moment.</div>
              )}
            </div>
          </div>

          {/* Détails du pool sélectionné */}
          <div className="rounded-2xl border border-white/30 bg-black/20 backdrop-blur p-4 text-white min-h-[50vh]">
            {activeSlug ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Pool : {activeSlug}</h3>
                  <button
  onClick={() => copyText(randomUrlFor(activeSlug))}
  className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 hover:bg-white/15"
  title="Copier l’URL random"
>
  Copier le lien random
</button>

                </div>

                {loadingImages ? (
                  <div className="text-white/70">Chargement des images…</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map(img => (
                      <figure key={img.id} className="group relative rounded-lg overflow-hidden border border-white/15 bg-white/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.title||""} className="w-full h-40 object-cover" />
                        <figcaption className="p-1 text-xs text-white/80 truncate">{img.title || "Image"}</figcaption>
                        {!!session && (
                          <button
                            onClick={()=>removeImage(img.id)}
                            className="absolute top-2 right-2 rounded bg-black/60 text-white text-xs px-2 py-0.5 hover:bg-black/80"
                            title="Supprimer"
                          >
                            ✕
                          </button>
                        )}
                      </figure>
                    ))}
                    {!images.length && (
                      <div className="text-white/70 text-sm">Aucune image dans ce pool.</div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-white/70">Sélectionne un pool à gauche pour voir ses images.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
