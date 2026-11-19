// src/app/api/img/route.js
// Open proxy for remote card illustrations, with network and payload safeguards.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024 + 200 * 1024
const MAX_REDIRECTS = 4
const TIMEOUT_MS = 10000

function safeAddress(address) {
  if (!address) return false
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') ||
      lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('ff')) return false
  if (lower.startsWith('::ffff:')) return safeAddress(lower.slice(7))
  if (isIP(lower) === 6) return true
  if (isIP(lower) !== 4) return false
  const [a,b] = lower.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)))
}

async function validateUrl(target) {
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL not allowed')
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Port not allowed')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' ||
      ['.localhost', '.local', '.internal', '.home.arpa'].some(t => host.endsWith(t))) {
    throw new Error('Host not allowed')
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addresses.length || addresses.some(x => !safeAddress(x.address))) {
    throw new Error('Unsafe network address')
  }
  return url
}

function imageMime(bytes, remoteType) {
  const type = (remoteType || '').split(';')[0].trim().toLowerCase()
  const mime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
  if (mime.includes(type)) return type
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp'
  return null
}

export async function GET(req) {
  const input = new URL(req.url).searchParams.get('u')
  if (!input) return Response.json({ error: 'Missing ?u' }, { status: 400 })
  try {
    let target = input
    for (let n = 0; n <= MAX_REDIRECTS; n++) {
      const safe = await validateUrl(target)
      const upstream = await fetch(safe, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8' },
      })
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const location = upstream.headers.get('location')
        if (!location) return new Response('Invalid redirect', { status: 502 })
        target = new URL(location, safe).href
        continue
      }
      if (!upstream.ok || !upstream.body) {
        return new Response('Remote image unavailable', { status: 502 })
      }
      const length = Number(upstream.headers.get('content-length'))
      if (Number.isFinite(length) && length > MAX_BYTES) {
        await upstream.body.cancel()
        return new Response('Image too large', { status: 413 })
      }
      const reader = upstream.body.getReader()
      const chunks = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_BYTES) {
          await reader.cancel()
          return new Response('Image too large', { status: 413 })
        }
        chunks.push(value)
      }
      const body = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
      const mime = imageMime(body, upstream.headers.get('content-type'))
      if (!mime) return new Response('Unsupported image', { status: 415 })
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': mime,
          'x-content-type-options': 'nosniff',
          'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      })
    }
    return new Response('Too many redirects', { status: 502 })
  } catch {
    return new Response('Unable to retrieve image', { status: 502 })
  }
}
