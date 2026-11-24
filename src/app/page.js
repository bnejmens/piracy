import HomePage from './HomePage'

const title = "Always | Forum RP Harry Potter francophone"
const description = "Always est un forum RP Harry Potter francophone. Crée ton personnage et écris à plusieurs dans le monde sorcier de 2026, entre Poudlard, Londres et Godric’s Hollow."
const url = 'https://piracy-seven.vercel.app/'

export const metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, siteName: 'Always', locale: 'fr_FR', type: 'website' },
}

export default function Page() {
  return <HomePage />
}
