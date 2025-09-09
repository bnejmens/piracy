'use client'

export default function Error({ error, reset }) {
  return (
    <div className="p-10 text-white">
      <h2 className="text-xl font-semibold mb-2">Oups… une erreur est survenue</h2>
      {error?.message && (
        <pre className="text-sm opacity-80 whitespace-pre-wrap">
          {String(error.message)}
        </pre>
      )}
      <button
        onClick={() => reset()}
        className="mt-4 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 hover:bg-white/15"
      >
        Réessayer
      </button>
    </div>
  )
}
