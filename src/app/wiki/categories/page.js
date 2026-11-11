
export function seedTree() {
  return [
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
}
