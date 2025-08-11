// src/app/api/img/route.js
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024 + 200 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const u = searchParams.get('u');
    if (!u) return Response.json({ error: 'Missing ?u' }, { status: 400 });

    let url;
    try { url = new URL(u); } catch { return Response.json({ error: 'Invalid URL' }, { status: 400 }); }
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      return Response.json({ error: 'Protocol not allowed' }, { status: 400 });
    }

    const upstream = await fetch(url.toString(), { redirect: 'follow' });
    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }

    const len = upstream.headers.get('content-length');
    if (len && Number(len) > MAX_BYTES) return new Response('Image too large', { status: 413 });

    const reader = upstream.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) return new Response('Image too large', { status: 413 });
      chunks.push(value);
    }

    const body = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { body.set(c, off); off += c.byteLength; }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return Response.json({ error: 'Proxy error' }, { status: 500 });
  }
}
