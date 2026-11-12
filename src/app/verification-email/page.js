
export default function VerificationEmailPage() {
  return (
    <main className="fixed inset-0 flex items-center justify-center bg-slate-900 text-slate-100 p-4">
      <div className="w-full max-w-md text-center p-8 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">

        <div className="text-5xl mb-6">✉️</div>

        <h1 className="text-2xl font-bold mb-4">
          Une dernière étape avant l&apos;aventure !
        </h1>

        <p className="text-slate-200 mb-6 leading-relaxed">
          Ton inscription a bien été enregistrée.
          <br /><br />
          Un <strong>email de confirmation</strong> t&apos;a été envoyé
          à l&apos;adresse renseignée lors de ton inscription.
          <br /><br />
          Consulte ta boîte mail et clique sur le lien reçu
          pour <strong>activer ton compte</strong>.
        </p>

        <div className="rounded-xl bg-amber-300/10 border border-amber-300/30 p-4 mb-6">
          <p className="text-amber-200 text-sm">
            Tu ne trouves pas notre message ?
            Pense à vérifier tes courriers indésirables (spams).
          </p>
        </div>

        <a
          href="/auth"
          className="inline-block rounded-lg bg-cyan-300 px-6 py-3 text-slate-900 font-semibold hover:bg-cyan-200 transition-colors"
        >
          Retour à la connexion
        </a>

      </div>
    </main>
  );
}
