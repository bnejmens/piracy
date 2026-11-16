// Classements multiples : compatibilité avec les anciennes cartes.
export function getCardPaths(card) {
  if (Array.isArray(card?.category_paths) && card.category_paths.length) {
    return card.category_paths.filter(p => p && typeof p.category === 'string' && p.category.trim())
  }
  return card?.category ? [{
    category: card.category,
    subcategory: card.subcategory || null,
    sub_subcategory: card.sub_subcategory || null,
  }] : []
}

export function makeCategoryPath(catNode, subNode, level3Node) {
  if (!catNode || !subNode) return null
  return {
    category: catNode.label,
    subcategory: subNode.label,
    sub_subcategory: level3Node?.label || null,
  }
}

const normalize = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export function pathKey(p) {
  return [p?.category, p?.subcategory, p?.sub_subcategory].map(normalize).join('::')
}
export function pathLabel(p) {
  return [p.category, p.subcategory, p.sub_subcategory].filter(Boolean).join(' / ')
}
export function pathMatches(p, cat, sub, level3) {
  return (!cat || normalize(p.category) === normalize(cat.label)) &&
    (!sub || normalize(p.subcategory) === normalize(sub.label)) &&
    (!level3 || normalize(p.sub_subcategory) === normalize(level3.label))
}
