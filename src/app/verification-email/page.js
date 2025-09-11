// src/app/verification-email/page.js
export default function VerificationEmailPage() {
  return (
    <main className="fixed inset-0 flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-md text-center p-6 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20">
        <h1 className="text-2xl font-bold mb-4">Vérifie ta boîte mail 📩</h1>
        <p className="mb-4">
          Nous t’avons envoyé un lien de confirmation à ton adresse email.
          <br />
          Clique sur le lien reçu pour activer ton compte&nbsp;!<br />
          Ensuite, tu pourras aller sur :
        </p>
        <a
          href="https://mvp-rpg-platform.vercel.app/auth"
          className="text-amber-300 underline hover:text-amber-200"
        >
          https://piracy-seven.vercel.app/auth
        </a>
        <p className="mt-4 text-sm text-slate-400">
          Si tu ne vois pas le mail, vérifie aussi ton dossier de courriers indésirables.
        </p>
      </div>
    </main>
  );
}
