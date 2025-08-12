"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function MembersPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Affiche des PERSONNAGES (pas seulement le profil actif)
  const [items, setItems] = useState([]); // [{ id, user_id, name, genre, avatar_url, bio, age, occupation, traits, relationships, ownerName }]
  const [filter, setFilter] = useState("tous"); // 'tous' | 'féminin' | 'masculin'
  const [modalChar, setModalChar] = useState(null);

  const PAGE_SIZE = 16;
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth"); return; }
      setSession(session);

      try {
        // 1) Tous les personnages + nouveaux champs + relations (jointure)
         const { data: chars, error: e1 } = await supabase
  .from('characters')
  .select(`
    id, user_id, name, genre, avatar_url, bio, created_at,
    age, occupation, traits,
    character_relationships:character_relationships!character_id (
      id, type, other_character_id,
      other:other_character_id ( id, name, avatar_url )
    )
  `)
  .order('created_at', { ascending: false });

        // 2) Profils -> nom joueur
        const { data: profs, error: e2 } = await supabase
          .from("profiles")
          .select("user_id, pseudo, email");
        if (e2) throw e2;

        const byUser = Object.fromEntries((profs || []).map(p => [p.user_id, p]));
        const list = (chars || []).map(c => {
          const owner = byUser[c.user_id];
          const ownerName = owner?.pseudo?.trim() || owner?.email?.split("@")[0] || "Joueur";
          return { ...c, ownerName };
        });

        setItems(list);
        setLoading(false);
      } catch (err) {
        setError(err.message || "Erreur inconnue");
        setLoading(false);
      }
    })();
  }, [router]);

  const filtered = useMemo(() => {
    const f = filter === "tous" ? items : items.filter(m => m.genre === filter);
    setPage(1);
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, items]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const avatarNode = (m, size = 136) => (
    <div
      key={m.id}
      onClick={() => setModalChar(m)}
      title={`${m.name} — ${m.ownerName}`}
      style={{ width: size, height: size }}
      className="group cursor-pointer rounded-full overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,.35)] hover:ring-amber-300/50 transition"
    >
      {m.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-3xl">
          {m.name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
    </div>
  );

  if (loading) return <p className="p-8 text-white">Chargement…</p>;
  if (error)   return <p className="p-8 text-red-400">Erreur : {error}</p>;

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/dashboard-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Retour */}
      <button
        onClick={() => router.push("/dashboard")}
        className="fixed left-[24px] top-[24px] z-40 rounded-full border border-white/30 bg-white/15 backdrop-blur-md px-3 py-1.5 text-white text-sm hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80"
      >
        ← Tableau de bord
      </button>

      {/* Carte centrale */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-6xl rounded-2xl border border-white/15 bg-white/10 backdrop-blur-x2 ring-1 ring-white/10 p-6 sm:p-8 text-white shadow-[0_20px_80px_rgba(0,0,0,.45)]">
          {/* Header + filtres */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h1 className="text-xl font-semibold">Personnages</h1>
            <div className="inline-flex items-center gap-2">
              <FilterBtn active={filter === "tous"} onClick={() => setFilter("tous")}>Tous</FilterBtn>
              <FilterBtn active={filter === "féminin"} onClick={() => setFilter("féminin")}>
                Féminin
              </FilterBtn>
              <FilterBtn active={filter === "masculin"} onClick={() => setFilter("masculin")}>
                Masculin
              </FilterBtn>
            </div>
          </div>

          {/* Grille */}
          <div className="grid grid-cols-4 grid-rows-4 gap-6 place-items-center">
            {pageItems.map(m => avatarNode(m))}
            {Array.from({ length: Math.max(0, PAGE_SIZE - pageItems.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="rounded-full w-[136px] h-[136px] border border-white/10 ring-2 ring-white/10 bg-white/5 opacity-30"
              />
            ))}
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded-full px-3 py-1.5 border border-white/20 bg-white/10 hover:bg-white/15"
                disabled={page === 1}
              >
                ← Précédent
              </button>
              <span className="text-white/80">Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="rounded-full px-3 py-1.5 border border-white/20 bg-white/10 hover:bg-white/15"
                disabled={page === totalPages}
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL détails personnage */}
{modalChar && (
  <div
    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
    onClick={() => setModalChar(null)}
  >
    <div
  className="w-[min(96vw,980px)] rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-6 sm:p-8 text-white shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain"
  onClick={(e) => e.stopPropagation()}
>
      {/* Header identité */}
<div className="flex items-center gap-5 pb-5 border-b border-white/10">
  <div className="relative w-[144px] h-[144px] rounded-2xl overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5">
    {modalChar.avatar_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={modalChar.avatar_url}
        alt=""
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
    ) : (
      <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-3xl">
        {modalChar.name?.[0]?.toUpperCase() || "?"}
      </div>
    )}
  </div>

  <div className="min-w-0">
    <h3 className="text-2xl sm:text-3xl font-semibold leading-tight truncate">{modalChar.name}</h3>
    <p className="text-xs text-white/60">
      {modalChar.genre || "Genre non renseigné"} • Joueur : {modalChar.ownerName}
    </p>
    <div className="mt-1 text-xs text-white/70 space-x-3">
      {modalChar.age ? <span>Âge : {modalChar.age}</span> : null}
      {modalChar.occupation ? <span>Occupation : {modalChar.occupation}</span> : null}
    </div>
  </div>
</div>

{/* Contenu : on ne garde PLUS la carte Avatar à gauche */}
<div className="mt-6 grid gap-6 lg:grid-cols-[300px,1fr]">
  {/* Colonne gauche : uniquement Compagnon */}
<aside className="flex flex-col gap-4">
  <div className="roproblème sur ce code, lorsque la descrunded-xl border border-white/10 bg-white/5 p-4">
    
    {/* Titre Compagnon */}
    <div className="mb-3">
      <div className="inline-flex items-center text-white text-sm font-bold bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1">
        {modalChar?.companion_name?.trim() || "Compagnon"}
      </div>
    </div>

    {/* Avatar + texte */}
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 rounded-lg overflow-hidden ring-1 ring-white/15 bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={modalChar?.companion_avatar_url || "/images/profile-icon.png"}
          alt={modalChar?.companion_name || "Compagnon"}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="text-sm text-white/70">
        Companion that walks with{" "}
        <span className="text-white/90 font-medium">{modalChar?.name}</span>
      </div>
    </div>

  </div>
</aside>
        {/* Colonne droite : Description scrollable */}
{/* Traits + Relations en deux colonnes */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h4 className="text-sm font-semibold mb-2">Traits marquants</h4>
          <TraitsSummary traits={modalChar.traits} />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h4 className="text-sm font-semibold mb-2">Relations</h4>
          <RelationsList relations={modalChar.character_relationships} />
        </div>
      </div>

         <section className="rounded-xl border border-white/10 bg-white/5 p-4">
    <div className="mb-3 text-sm font-semibold text-white/80">Description</div>
    <div className="custom-scroll pr-2 text-[0.97rem] leading-relaxed text-white/90">
            {modalChar.bio ? (
              <p className="whitespace-pre-wrap">{modalChar.bio}</p>
            ) : (
              <div className="text-white/50">Aucune bio.</div>
            )}
          </div>
        </section>
      </div>

      

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={() => setModalChar(null)}
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 hover:bg-white/15"
        >
          Fermer
        </button>
        <button
          onClick={() => router.push(`/messages?to=${encodeURIComponent(modalChar.user_id)}`)}
          className="rounded-lg bg-violet-300 text-slate-900 font-medium px-4 py-2 hover:bg-violet-200"
        >
          Écrire en MP
        </button>
      </div>

      {/* Scrollbar fine pour la description */}
      <style jsx>{`
        .custom-scroll::-webkit-scrollbar { width: 8px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 8px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  </div>
)}

    </main>
  );
}

function FilterBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm border ${active ? "bg-white/20 border-white/40" : "bg-white/10 border-white/20 hover:bg-white/15"}`}
    >
      {children}
    </button>
  );
}

// ----- UI helpers -----
function RelationsList({ relations }) {
  if (!relations || relations.length === 0) {
    return <p className="text-white/60 text-sm">Aucune relation connue.</p>;
  }
  return (
    <ul className="space-y-2">
      {relations.map((rel) => (
        <li key={rel.id} className="flex items-center gap-2 text-sm">
          {rel.other?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rel.other.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[10px]">?
            </div>
          )}
          <span className="truncate">{rel.other?.name || rel.other_character_id}</span>
          <span className="text-white/50">·</span>
          <span className="text-white/70">{relationLabel(rel.type)}</span>
        </li>
      ))}
    </ul>
  );
}

function TraitsSummary({ traits }) {
  if (!traits || typeof traits !== "object") {
    return <p className="text-white/60 text-sm">—</p>;
  }
  const pairs = [
    ["intro_extro", "Introverti", "Extraverti"],
    ["egoiste_altruiste", "Égoïste", "Altruiste"],
    ["prudent_temer", "Prudent", "Téméraire"],
    ["reflechi_impulsif", "Réfléchi", "Impulsif"],
    ["obeissant_rebelle", "Obéissant", "Rebelle"],
    ["methodique_chaotique", "Méthodique", "Chaotique"],
    ["idealiste_cynique", "Idéaliste", "Cynique"],
    ["resil_vulnerable", "Résilient", "Vulnérable"],
    ["loyal_opportuniste", "Loyal", "Opportuniste"],
    ["creatif_pragmatique", "Créatif", "Pragmatique"],
  ];
  // calc dominance
  const scored = pairs.map(([k, L, R]) => {
    const v = Number(traits?.[k] ?? 5); // 0..10
    const delta = Math.abs(v - 5); // 0..5
    const side = v < 5 ? R : v > 5 ? L : null;
    return { k, label: side, score: delta };
  }).filter(x => x.label);
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  if (top.length === 0) return <p className="text-white/60 text-sm">Équilibré.</p>;
  return (
    <ul className="text-sm text-white/80 list-disc pl-5 space-y-1">
      {top.map(t => (
        <li key={t.k}>{t.label}</li>
      ))}
    </ul>
  );
}

function relationLabel(type) {
  const map = {
    love_interest: "Love interest",
    ami: "Ami",
    ennemi: "Ennemi",
    indifferent: "Indifférent",
    nemesis: "Némésis",
    inconnu: "Inconnu",
  };
  return map[type] || type;
}
