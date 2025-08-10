import { supabase } from './supabaseClient'

export async function ensureDefaultCharacter(userId) {
  if (!userId) return

  // Y a-t-il déjà ≥1 personnage ?
  const { data: existing, error: e1 } = await supabase
    .from('characters')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (e1) throw e1
  if (existing?.length) return // déjà ok

  // On récupère le profil pour copier pseudo/avatar/bio/genre si dispo
  const { data: prof } = await supabase
    .from('profiles')
    .select('pseudo, avatar_url, bio, genre, email')
    .eq('user_id', userId)
    .maybeSingle()

  const fallbackName =
    prof?.pseudo?.trim() ||
    (prof?.email ? prof.email.split('@')[0] : 'Nouveau personnage')

  const payload = {
    user_id: userId,
    name: fallbackName,
    avatar_url: prof?.avatar_url ?? null,
    bio: prof?.bio ?? null,
    gender: prof?.genre ?? null,
  }

  const { error: e2 } = await supabase.from('characters').insert(payload)
  if (e2) throw e2
}
