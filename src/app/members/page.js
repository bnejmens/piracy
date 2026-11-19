"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SiteTopbar from "@/components/SiteTopbar";
import { displayExternalImage } from "@/lib/displayExternalImage";

export default function MembersPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Affiche des PERSONNAGES (pas seulement le profil actif)
  const [items, setItems] = useState([]); // Personnages + relations + pseudo du joueur
  const [search, setSearch] = useState("");
  const [modalChar, setModalChar] = useState(null);
  const [includeArchivedMine, setIncludeArchivedMine] = useState(false);


  const PAGE_SIZE = 16;
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth"); return; }
      setSession(session);

      try {
        // 1) Tous les personnages + nouveaux champs + relations (jointure)
   let query = supabase
  .from('characters')
  .select(`
    id, user_id, name, orientation, avatar_url, bio, created_at,
    age, occupation, traits, is_active, is_archived,
    companion_name, companion_avatar_url, wand_composition, wand_size, wand_image_url,
    character_relationships:character_relationships!character_id (
      id, type, other_character_id,
      other:other_character_id ( id, name, avatar_url )
    )
  `)
  .order('created_at', { ascending: false });

 // Par défaut : tout le monde voit les non-archivés ; toi tu vois aussi TES archivés
 query = query.or(`is_archived.eq.false,user_id.eq.${session.user.id}`);
 const { data: chars, error: e1 } = await query;
if (e1) throw e1;

        // 2) Profils -> nom joueur
        const { data: profs, error: e2 } = await supabase
          .from("profiles")
          .select("user_id, pseudo");
        if (e2) throw e2;

        const byUser = Object.fromEntries((profs || []).map(p => [p.user_id, p]));
        const list = (chars || []).map(c => {
          const owner = byUser[c.user_id];
          const ownerName = owner?.pseudo?.trim() || "Joueur";
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
  const term = search.trim().toLocaleLowerCase("fr");

  return items.filter(m => {
    // Les personnages archivés ne s'affichent que
    // s'ils m'appartiennent et que la case est cochée.
    const canDisplay =
      !m.is_archived ||
      (includeArchivedMine && m.user_id === session?.user?.id);

    if (!canDisplay) return false;

    if (!term) return true;

    return [m.name, m.ownerName]
      .some(value =>
        String(value || "")
          .toLocaleLowerCase("fr")
          .includes(term)
      );
  });
}, [items, search, includeArchivedMine, session?.user?.id]);

useEffect(() => {
  setPage(1);
}, [search, includeArchivedMine]);

useEffect(() => {
  if (!modalChar) return;
  const closeOnEscape = event => {
    if (event.key === 'Escape') setModalChar(null);
  };
  window.addEventListener('keydown', closeOnEscape);
  return () => window.removeEventListener('keydown', closeOnEscape);
}, [modalChar]);


  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

 
const avatarNode = (m) => (
  <button
    key={m.id}
    type="button"
    onClick={() => setModalChar(m)}
    title={`Voir la fiche de ${m.name}`}
    className="group flex w-full min-w-0 flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-amber-300"
  >
    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-[0_10px_35px_rgba(0,0,0,.3)] ring-2 ring-white/20 transition duration-300 group-hover:-translate-y-1 group-hover:ring-amber-300/70 group-hover:shadow-[0_10px_35px_rgba(255,190,90,.2)] sm:h-[136px] sm:w-[136px]">
      {m.avatar_url ? (
        <img
          src={m.avatar_url}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-700 to-slate-900 font-serif text-3xl text-white">
          {m.name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
    </div>

    <span className="w-full truncate font-serif text-base font-semibold text-white drop-shadow-md">
      {m.name}
    </span>

    <span className="w-full truncate text-xs text-white/75">
      Joueur : {m.ownerName}
    </span>

    {m.is_archived && (
      <span className="rounded-full border border-amber-200/30 bg-black/35 px-2 py-0.5 text-[10px] text-amber-100">
        Archivé
      </span>
    )}
  </button>
);

  if (loading) return <p className="p-8 text-white">Chargement…</p>;
  if (error)   return <p className="p-8 text-red-400">Erreur : {error}</p>;

  return (
    <main className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-[#100e17]">
      {/* Décor fixe couvrant toujours tout le viewport, indépendamment du scroll */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <Image src="/images/members-bg.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />
      </div>


{/* Halo chaleureux près de la lampe du décor */}
<div
  aria-hidden="true"
  className="members-lamp-glow pointer-events-none fixed left-[23%] top-[37%] z-0 hidden h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,185,91,.24)_0%,rgba(255,139,55,.10)_36%,transparent_72%)] blur-xl md:block"
/>


      {/* Barre commune : remplace l'ancien bouton Dashboard */}
      <SiteTopbar title="Membres" />

      {/* Carte centrale */}
      <div className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto overscroll-contain px-3 pb-6 pt-5 sm:px-6 sm:pb-8 sm:pt-6">
        <div className="w-full max-w-6xl rounded-3xl border border-white/30 bg-white/30 backdrop-blur-x1 ring-1 ring-white/30 p-3 sm:p-8 text-white shadow-[0_20px_80px_rgba(0,0,0,.45)]">
         
{/* En-tête et recherche */}
<div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="font-serif text-2xl font-semibold text-white">
      Personnages
    </h1>
    <p className="mt-1 text-sm text-white/75">
      {filtered.length} personnage{filtered.length > 1 ? "s" : ""}
    </p>
  </div>

  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
    <input
      type="search"
      value={search}
      onChange={e => setSearch(e.target.value)}
      placeholder="Rechercher un personnage ou un joueur…"
      className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-2.5 text-sm text-white placeholder-white/65 outline-none backdrop-blur-md focus:border-amber-300 sm:w-72"
    />

    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white/90">
      <input
        type="checkbox"
        checked={includeArchivedMine}
        onChange={e => setIncludeArchivedMine(e.target.checked)}
        className="h-4 w-4 accent-amber-400"
      />
      Mes archivés
    </label>
  </div>
</div>

{/* Grille responsive des personnages */}
<div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 sm:gap-x-3 sm:gap-y-5 lg:grid-cols-4">
  {pageItems.map(m => avatarNode(m))}
</div>

{filtered.length === 0 && (
  <div className="rounded-xl border border-white/20 bg-black/15 px-5 py-12 text-center text-white/80">
    Aucun personnage trouvé.
  </div>
)}


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

      {/* Fiche personnage — mêmes teintes prune, ivoire et or que le Profil. */}
      {modalChar && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#090610]/85 p-2 backdrop-blur-md sm:p-5"
          onMouseDown={event => { if (event.target === event.currentTarget) setModalChar(null); }}
        >
          <article
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-profile-title"
            className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1100px] min-w-0 flex-col overflow-hidden rounded-3xl border border-amber-200/25 bg-[#1b1525]/95 text-amber-50 shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:max-h-[94dvh]"
          >
            <header className="relative shrink-0 border-b border-amber-200/20 bg-gradient-to-r from-[#3b2948] via-[#271b32] to-[#19131f] p-3 pr-12 sm:p-5 sm:pr-14">
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <div className="grid h-[84px] w-[84px] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-amber-200/50 bg-black/25 ring-4 ring-white/5 sm:h-[120px] sm:w-[120px]">
                  {modalChar.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={modalChar.avatar_url}
                      alt={`Portrait de ${modalChar.name}`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-serif text-3xl text-amber-100">{modalChar.name?.[0]?.toUpperCase() || '?'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[11px] uppercase tracking-[0.17em] text-amber-200/75">Fiche de personnage</p>
                  <h2 id="member-profile-title" className="break-words font-serif text-xl font-semibold leading-tight text-amber-50 sm:text-3xl">{modalChar.name}</h2>
                  <p className="mt-1 text-xs text-white/65">Interprété par <span className="font-medium text-amber-100">{modalChar.ownerName}</span></p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {modalChar.age !== null && modalChar.age !== undefined && (
                      <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-white/85">{modalChar.age} ans</span>
                    )}
                    {modalChar.occupation && (
                      <span className="max-w-full break-words rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-white/85">{modalChar.occupation}</span>
                    )}
                    {modalChar.orientation?.trim() && (
                      <span className="max-w-full break-words rounded-full border border-amber-200/20 bg-amber-200/10 px-2.5 py-1 text-xs text-amber-100">
                        Orientation : {modalChar.orientation.trim()}
                      </span>
                    )}
                    {modalChar.is_archived && (
                      <span className="rounded-full border border-amber-200/20 px-2.5 py-1 text-xs text-amber-100">Archivé</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fermer la fiche"
                onClick={() => setModalChar(null)}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/25 text-xl text-white/85 transition hover:border-amber-200/50 hover:bg-white/10 sm:right-5 sm:top-5"
              >
                ×
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
                <div className="min-w-0 space-y-4">
                  <section className="rounded-2xl border border-white/15 bg-black/25 p-4">
                    <h3 className="mb-3 font-serif text-lg text-amber-100">Description et histoire</h3>
                    {modalChar.bio?.trim() ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/85">{modalChar.bio}</p>
                    ) : (
                      <p className="text-sm italic text-white/45">Aucune description renseignée.</p>
                    )}
                  </section>

                  <section className="rounded-2xl border border-white/15 bg-black/25 p-3 sm:p-4">
                    <h3 className="mb-4 font-serif text-lg text-amber-100">Traits de personnalité</h3>
                    <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="space-y-4">
                        <Bipolar leftLabel="Introverti" rightLabel="Extraverti" value={modalChar.traits?.intro_extro} />
                        <Bipolar leftLabel="Égoïste" rightLabel="Altruiste" value={modalChar.traits?.egoiste_altruiste} />
                        <Bipolar leftLabel="Prudent" rightLabel="Téméraire" value={modalChar.traits?.prudent_temer} />
                        <Bipolar leftLabel="Réfléchi" rightLabel="Impulsif" value={modalChar.traits?.reflechi_impulsif} />
                        <Bipolar leftLabel="Obéissant" rightLabel="Rebelle" value={modalChar.traits?.obeissant_rebelle} />
                      </div>
                      <div className="space-y-4">
                        <Bipolar leftLabel="Méthodique" rightLabel="Chaotique" value={modalChar.traits?.methodique_chaotique} />
                        <Bipolar leftLabel="Idéaliste" rightLabel="Cynique" value={modalChar.traits?.idealiste_cynique} />
                        <Bipolar leftLabel="Résilient" rightLabel="Vulnérable" value={modalChar.traits?.resil_vulnerable} />
                        <Bipolar leftLabel="Loyal" rightLabel="Opportuniste" value={modalChar.traits?.loyal_opportuniste} />
                        <Bipolar leftLabel="Créatif" rightLabel="Pragmatique" value={modalChar.traits?.creatif_pragmatique} />
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="min-w-0 space-y-4">
                  <section className="rounded-2xl border border-white/15 bg-black/25 p-4">
                    <h3 className="mb-3 font-serif text-lg text-amber-100">Compagnon</h3>
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-amber-200/30 bg-white/5">
                        {modalChar.companion_avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={modalChar.companion_avatar_url} alt={modalChar.companion_name || 'Compagnon'} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-2xl text-amber-200/45" aria-hidden="true">✧</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-base font-semibold text-white/90">{modalChar.companion_name?.trim() || 'Non renseigné'}</p>
                        <p className="mt-1 text-xs text-white/50">Compagnon du personnage</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/15 bg-black/25 p-4">
                    <h3 className="mb-3 font-serif text-lg text-amber-100">Baguette magique</h3>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-amber-200/30 bg-white/5">
                        <span className="px-2 text-center text-[10px] text-white/40">Baguette</span>
                        {displayExternalImage(modalChar.wand_image_url) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={displayExternalImage(modalChar.wand_image_url)}
                            alt="Baguette du personnage"
                            referrerPolicy="no-referrer"
                            onError={event => { event.currentTarget.style.display = 'none'; }}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words text-sm text-white/90">
                          <span className="text-white/55">Composition : </span>
                          {modalChar.wand_composition?.trim() || 'Non renseignée'}
                        </p>
                        <p className="break-words text-sm text-white/90">
                          <span className="text-white/55">Taille : </span>
                          {modalChar.wand_size?.trim() || 'Non renseignée'}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/15 bg-black/25 p-4">
                    <h3 className="mb-3 font-serif text-lg text-amber-100">Carnet de relations</h3>
                    <div className="max-h-64 overflow-y-auto overscroll-contain pr-1">
                      <RelationsList relations={modalChar.character_relationships} />
                    </div>
                  </section>
                </aside>
              </div>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-amber-200/15 bg-[#201726] px-3 py-3 sm:px-5">
              <span className="hidden text-xs text-white/45 sm:block">Piracy · Fiche personnage</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setModalChar(null)}
                  className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/15"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/messages?to=${encodeURIComponent(modalChar.user_id)}`)}
                  className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-[#251a2d] transition hover:bg-amber-200"
                >
                  Écrire en MP
                </button>
              </div>
            </footer>
          </article>
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
          <span className="text-amber-200/50">·</span>
          <span className="min-w-0 break-words text-amber-100/75">{relationLabel(rel.type)}</span>
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

// --- À ajouter tout en bas de MembersPage (avant export default si tu as une exportation nommée, sinon juste à la fin du fichier) ---
function Bipolar({ leftLabel, rightLabel, value=5, onChange, leftColor="#8c6ab8", rightColor="#e6d4a7" }) {
  const pct = (Math.max(0, Math.min(10, Number(value ?? 5))) / 10) * 100; // 0..100
  const gradient = `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} ${pct}%, ${rightColor} ${pct}%, ${rightColor} 100%)`;
  return (
    <div className="space-y-2 select-none">
      <div className="flex justify-between text-white/70 text-sm">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="relative h-4 rounded-full border border-white/10 bg-white/5">
        <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `calc(${pct}% - 6px)` }}
        >
          <div className="w-3 h-3 rounded-full bg-white shadow" />
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={`${leftLabel} ↔ ${rightLabel}`}
          disabled
        />
      </div>
    </div>
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
