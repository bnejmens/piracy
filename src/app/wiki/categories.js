// Taxonomie du Wiki : sous-sous-catégories pertinentes par branche.
// Les labels restent identiques aux classements enregistrés dans les cartes.
const PLACE_OPTIONS = [
  { slug: 'londres', label: 'Londres' },
  { slug: 'ministere', label: 'Ministère' },
  { slug: 'godric-s', label: "Godric's" },
  { slug: 'poudlard', label: 'Poudlard' },
]

const NATURE_OPTIONS = [
  { slug: 'faune', label: 'Faune' },
  { slug: 'flore', label: 'Flore' },
]

// Export historique conservé pour les autres éventuels consommateurs.
export const LEVEL_3_OPTIONS = [...PLACE_OPTIONS, ...NATURE_OPTIONS]

function optionsForBranch(root, sub) {
  if (root.slug === 'univers' && sub.slug === 'faune-et-flore') return NATURE_OPTIONS
  if (root.slug === 'univers' && sub.slug === 'lieux') return PLACE_OPTIONS
  if (root.slug === 'personnages') return PLACE_OPTIONS
  // Historique et Jouabilité n'ont pas besoin de niveau 3.
  return []
}

export function seedTree() {
  const roots = [
    {
      id: 'cat-univers',
      slug: 'univers',
      label: 'Univers',
      color: '#0ea5e9',
      children: [
        { id: 'cat-univers-fauneetflore', slug: 'faune-et-flore', label: 'Faune et Flore', color: '#0ea5e9', children: [] },
        { id: 'cat-univers-lieux', slug: 'lieux', label: 'Lieux', color: '#0ea5e9', children: [] },
        { id: 'cat-univers-historique', slug: 'historique', label: 'Historique', color: '#0ea5e9', children: [] },
      ],
    },
    {
      id: 'cat-personnages',
      slug: 'personnages',
      label: 'Personnages',
      color: '#f59e0b',
      children: [
        { id: 'cat-personnages-pnj', slug: 'pnj', label: 'PNJ', color: '#f59e0b', children: [] },
        { id: 'cat-personnages-scenarii', slug: 'scenarii', label: 'Scenarii', color: '#f59e0b', children: [] },
      ],
    },
    {
      id: 'cat-jouabilite',
      slug: 'jouabilite',
      label: 'Jouabilité',
      color: '#8b5cf6',
      children: [
        { id: 'cat-jouabilite-regles', slug: 'regles-et-must-do', label: 'Règles et Must Do', color: '#8b5cf6', children: [] },
        { id: 'cat-jouabilite-zone-de-jeu', slug: 'zone-de-jeu', label: 'Zone de Jeu', color: '#8b5cf6', children: [] },
        { id: 'cat-jouabilite-intrigues', slug: 'intrigues', label: 'Intrigues', color: '#8b5cf6', children: [] },
      ],
    },
  ]

  // Préserver les identifiants et slugs utilisés pour la navigation.
  return roots.map(root => ({
    ...root,
    children: root.children.map(sub => ({
      ...sub,
      children: optionsForBranch(root, sub).map(option => ({
        id: `${sub.id}-${option.slug}`,
        slug: option.slug,
        label: option.label,
        color: root.color,
        children: [],
      })),
    })),
  }))
}
