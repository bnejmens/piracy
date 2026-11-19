// La plupart des hébergeurs bloquent l'affichage direct d'images tierces.
// Le proxy Wiki existant fonctionne aussi pour les portraits de baguettes.
// Une URL de page (ex. pinterest.com/pin/...) n'est pas un fichier image :
// privilégier le lien direct vers l'image (i.pinimg.com, i.imgur.com, etc.).
export function displayExternalImage(value) {
  if (!value || typeof value !== 'string') return ''
  try {
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return ''
    if (url.hostname.toLowerCase().endsWith('.supabase.co')) return url.href
    return `/api/img?u=${encodeURIComponent(url.href)}`
  } catch {
    return ''
  }
}
