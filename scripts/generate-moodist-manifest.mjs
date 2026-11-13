
import fs from 'node:fs'
import path from 'node:path'

const source = path.join(process.cwd(), 'public/audio/moodist')
const destination = path.join(
  process.cwd(),
  'src/components/audio/moodistSounds.json'
)

const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.webm']

function collect(dir) {
  const results = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      results.push(...collect(fullPath))
    } else if (
      extensions.includes(path.extname(entry.name).toLowerCase())
    ) {
      const relativePath = path
        .relative(source, fullPath)
        .split(path.sep)
        .join('/')

      const parts = relativePath.split('/')
      const filename = parts.at(-1)

      results.push({
        src: '/audio/moodist/' + relativePath,
        label: path
          .parse(filename)
          .name
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, letter => letter.toUpperCase()),
        category: parts.length > 1 ? parts[0] : 'Autres',
      })
    }
  }

  return results
}

if (!fs.existsSync(source)) {
  console.error('Dossier Moodist introuvable :', source)
  process.exit(1)
}

const sounds = collect(source).sort((a, b) =>
  a.category.localeCompare(b.category) ||
  a.label.localeCompare(b.label)
)

fs.mkdirSync(path.dirname(destination), { recursive: true })
fs.writeFileSync(
  destination,
  JSON.stringify(sounds, null, 2) + '\n',
  'utf8'
)

console.log(`${sounds.length} sons Moodist détectés.`)
console.log('Catalogue créé :', destination)
