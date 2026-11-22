import SiteTopbar from "@/components/SiteTopbar"

export default function VerificationEmailPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-slate-900 text-slate-100">
      <SiteTopbar title="Vérification de l’adresse e-mail" />
      <div className="flex flex-1 items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-4 text-center shadow-2xl backdrop-blur-xl sm:p-8">

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
      </div>
    </main>
  );
}
