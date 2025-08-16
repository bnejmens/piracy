// src/app/api/randimg/[slug]/route.js
import { supabase } from "@/lib/supabaseClient"

const BUCKET = "avatars"

export async function GET(_req, { params }) {
  const { slug } = params
  if (!slug) return new Response("Missing slug", { status: 400 })

  // 1) BDD d'abord
  const { data: rows, error: e1 } = await supabase
    .from("pool_images")
    .select("url")
    .eq("pool_slug", slug)

  if (e1) return new Response("DB error", { status: 500 })

  let candidates = rows?.map(r => r.url).filter(Boolean) || []

  // 2) Fallback Storage si BDD vide (avatars/<slug>/...)
  if (candidates.length === 0) {
    const { data: list, error: e2 } = await supabase
      .storage.from(BUCKET)
      .list(`${slug}`, { limit: 1000 })
    if (!e2 && Array.isArray(list) && list.length) {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl("")
      const base = pub?.publicUrl?.replace(/\/$/, "") || ""
      candidates = list
        .filter(f => f?.name)
        .map(f => `${base}/${slug}/${encodeURIComponent(f.name)}`)
    }
  }

  if (candidates.length === 0) {
    return new Response("No images", { status: 404 })
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)]

  // cache-busting pour éviter toute mise en cache de la redirection/CDN
  const bust = `${pick}${pick.includes("?") ? "&" : "?"}r=${Date.now()}_${Math.random().toString(36).slice(2)}`

  return new Response(null, {
    status: 302,
    headers: {
      Location: bust,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    },
  })
}
