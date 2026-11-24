import HomePage from './HomePage'

const title = "Always | Forum RP Harry Potter francophone"
const description = "Always, forum RP Harry Potter francophone. Crée ton personnage, écris des scènes et mène des enquêtes dans le monde sorcier de 2026."
const url = 'https://always-rp.vercel.app/'

export const metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, siteName: 'Always', locale: 'fr_FR', type: 'website' },
}

export default function Page() {
  const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Always', alternateName: 'Always RP', url }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(site) }} />
      <HomePage />
    </>
  )
}
