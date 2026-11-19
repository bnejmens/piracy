"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import SiteTopbar from "@/components/SiteTopbar";
import { optimizeAvatar } from "@/lib/optimizeAvatar";
import { supabase } from "@/lib/supabaseClient";
import { displayExternalImage } from "@/lib/displayExternalImage";

/**
 * Profile Editor – full page
 * Layout: [Avatar aside] | [Identité large] | [Traits (haut) + Relations (bas)]
 * - Sélecteur de personnage au-dessus de l'avatar
 * - Upload avatar (Supabase Storage, bucket 'avatars') avec preview + anti-cache
 * - Enregistrement manuel (bouton) + autosave pour avatar et compagnon
 * - Traits bipolaires en 2×5
 * - Carnet de relations (add/delete)
 */

const AVATAR_BUCKET = "avatars"; // adapte si besoin

export default function ProfilePage() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const [myChars, setMyChars] = useState([]); // {id,name,...}
  const [charId, setCharId] = useState("");

  const [form, setForm] = useState(baseForm());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const [relations, setRelations] = useState([]);
  const [allChars, setAllChars] = useState([]); // pour le picker relations
  const [relBusy, setRelBusy] = useState(false);
  const [relMsg, setRelMsg] = useState("");

  const [imgBust, setImgBust] = useState(0); // anti-cache avatar

  const REL_TYPES = useMemo(() => ([
    { value: "love_interest", label: "Love interest" },
    { value: "ami(e)", label: "Ami(e)" },
    { value: "Affaires", label: "Affaires" },
    { value: "C'est compliqué", label: "C'est compliqué" },
    { value: "amour", label: "Amour" },
    { value: "amant(e)", label: "Amant(e)" },
    { value: "ennemi", label: "Ennemi" },
    { value: "indifferent", label: "Indifférent" },
    { value: "inconnu", label: "Inconnu" },
    { value: "Père/Mère", label: "Père/Mère" },
    { value: "Frère/soeur", label: "Frère/soeur" },
    { value: "fils/fille", label: "fils/fille" },
    { value: "Cousin(e)", label: "Cousin(e)" },
  ]), []);

// Helpers pour normaliser les valeurs
const toNullIfEmpty = (v) => (v === '' || v === undefined ? null : v);
const toIntOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toEnumOrNull = (v, allowed) => {
  if (!v || v === '') return null;
  return allowed.includes(v) ? v : null;
};

  // Initial load session + characters
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMe(null); setLoading(false); return; }
      setMe(session.user);

      // Mes personnages
      const { data: chars } = await supabase
        .from("characters")
        .select("id, user_id, name, bio, avatar_url, orientation, is_active, age, occupation, traits, companion_name, companion_avatar_url, wand_composition, wand_size, wand_image_url")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });
      setMyChars(chars || []);
      const active = (chars || []).find(c => c.is_active) || (chars || [])[0] || null;
      setCharId(active?.id || "");

// Tous les personnages visibles dans le picker (hors archivés)
const { data: all, error } = await supabase
  .from('characters')
  .select('id, name, avatar_url, user_id, is_archived')
  .eq('is_archived', false)
  .order('name', { ascending: true });

if (error) console.error('[characters]', error);
setAllChars(all || []);
// Dans le picker : characters={(allChars||[]).filter(c => c.id !== charId)}


      setLoading(false);
    })();
  }, []);

  // Charger le personnage sélectionné + ses relations
  useEffect(() => {
    if (!charId) { setForm(baseForm()); setRelations([]); return; }
    let cancelled = false;
    (async () => {
      const { data: c } = await supabase
        .from("characters")
        .select("id, user_id, name, bio, avatar_url, orientation, is_active, age, occupation, traits, companion_name, companion_avatar_url, wand_composition, wand_size, wand_image_url")
        .eq("id", charId)
        .maybeSingle();
      if (c && !cancelled) {
        setForm({
          user_id: c.user_id || "",
          name: c.name || "",
          orientation: c.orientation || "",
          bio: c.bio || "",
          avatar_url: c.avatar_url || "",
          age: c.age ?? "",
          occupation: c.occupation || "",
          traits: { ...baseTraits(), ...(c.traits || {}) },
          companion_name: c.companion_name || "",
          companion_avatar_url: c.companion_avatar_url || "",
          wand_composition: c.wand_composition || "",
          wand_size: c.wand_size || "",
          wand_image_url: c.wand_image_url || "",
        });
        setImgBust(Date.now());
      }
      const { data: rels } = await supabase
        .from("character_relationships")
        .select("id, other_character_id, type, created_at, other:other_character_id ( id, name, avatar_url )")
        .eq("character_id", charId)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRelations(rels || []);
        setRelMsg("");
      }
    })();
    return () => { cancelled = true; };
  }, [charId]);

  const onChange = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const onTrait = (k, v) => setForm(f => ({ ...f, traits: { ...f.traits, [k]: v } }));

  // Le nom se modifie directement dans l'encart Compagnon ; sortie de champ = enregistrement.
  const [savingCompanion, setSavingCompanion] = useState(false);
  const saveCompanionName = async () => {
    if (!me?.id || !charId || savingCompanion) return;
    const name = (form.companion_name || '').trim();
    const old = (myChars.find(c => c.id === charId)?.companion_name || '').trim();
    if (name === old) return;
    setSavingCompanion(true);
    const { error } = await supabase.from('characters')
      .update({ companion_name: name || null })
      .eq('id', charId)
      .eq('user_id', me.id);
    setSavingCompanion(false);
    if (error) {
      setSavedMsg(error.message || 'Erreur lors de la modification du compagnon');
      return;
    }
    setMyChars(list => list.map(c => c.id === charId ? { ...c, companion_name: name || null } : c));
    setSavedMsg('Nom du compagnon enregistré ✔');
  };

  // Le menu de personnage de la topbar synchronise aussi la fiche ouverte.
  useEffect(() => {
    const onCharacterChanged = async (event) => {
      const chosenId = event.detail?.characterId;
      if (!chosenId) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('characters')
        .select('id, user_id, name, bio, avatar_url, orientation, is_active, age, occupation, traits, companion_name, companion_avatar_url, wand_composition, wand_size, wand_image_url')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) { setSavedMsg(error.message); return; }
      setMyChars(data || []);
      setCharId(chosenId);
    };
    window.addEventListener('piracy:active-character-changed', onCharacterChanged);
    return () => window.removeEventListener('piracy:active-character-changed', onCharacterChanged);
  }, []);

 const onSave = async () => {
  if (!charId) return
  setSaving(true)
  setSavedMsg('')

// Récupère l'état actuel du perso sélectionné pour comparer
const current = (Array.isArray(myChars) ? myChars.find(c => c.id === charId) : null) || {};

const payload = {};

// name
if ((form.name ?? '').trim() !== (current.name ?? '')) {
  payload.name = (form.name ?? '').trim();
}

// Orientation : saisie libre et facultative, sans choix imposé.
if ((form.orientation ?? '').trim() !== (current.orientation ?? '')) {
  const orientation = (form.orientation ?? '').trim();
  payload.orientation = orientation || null;
}

// age (int ou null)
const formAgeStr = form.age === 0 ? '0' : (form.age ?? '').toString();
const currAgeStr = current.age === 0 ? '0' : (current.age ?? '').toString();
if (formAgeStr !== currAgeStr) {
  payload.age = form.age === '' || form.age === undefined || form.age === null
    ? null
    : Number(form.age);
}

// occupation
if ((form.occupation ?? '').trim() !== (current.occupation ?? '')) {
  const v = (form.occupation ?? '').trim();
  payload.occupation = v === '' ? null : v;
}

// bio / description
if ((form.bio ?? '').trim() !== (current.bio ?? '')) {
  const v = (form.bio ?? '').trim();
  payload.bio = v === '' ? null : v;
}

// traits (jsonb)
if (JSON.stringify(form.traits || {}) !== JSON.stringify(current.traits || {})) {
  payload.traits = form.traits && typeof form.traits === 'object' ? form.traits : {};
}

// companion_name
if ((form.companion_name ?? '').trim() !== (current.companion_name ?? '')) {
  const v = (form.companion_name ?? '').trim();
  payload.companion_name = v === '' ? null : v;
}

// companion_avatar_url
if ((form.companion_avatar_url ?? null) !== (current.companion_avatar_url ?? null)) {
  payload.companion_avatar_url = (form.companion_avatar_url ?? '') === '' ? null : form.companion_avatar_url;
}

// avatar_url
if ((form.avatar_url ?? null) !== (current.avatar_url ?? null)) {
  payload.avatar_url = (form.avatar_url ?? '') === '' ? null : form.avatar_url;
}

// Baguette : composition, taille libre (ex. 28 cm / 11 pouces), image.
for (const field of ['wand_composition', 'wand_size']) {
  const next = (form[field] ?? '').trim();
  const previous = (current[field] ?? '').trim();
  if (next !== previous) payload[field] = next || null;
}
const wandUrl = (form.wand_image_url || '').trim();
if (wandUrl && !displayExternalImage(wandUrl)) {
  setSavedMsg('Image de baguette : indique une URL http:// ou https:// valide.');
  setSaving(false);
  return;
}
if (wandUrl !== (current.wand_image_url || '')) {
  payload.wand_image_url = wandUrl || null;
}

// Rien à sauver ?
if (Object.keys(payload).length === 0) {
  // option: petit feedback
  // alert('Aucune modification détectée.');
  setSaving(false);
  return;
}

  const { error } = await supabase
    .from('characters')
    .update(payload)
    .eq('id', charId)
    .eq('user_id', me.id) // ← important pour matcher la policy RLS

  if (!error) {
    // miroir local
    setMyChars(list => list.map(c => (c.id === charId ? { ...c, ...payload } : c)))
    setSavedMsg('Enregistré ✔')
    setTimeout(() => setSavedMsg(''), 1500)
  } else {
    // feedback explicite si policy/erreur
    setSavedMsg(error.message || 'Échec de l’enregistrement')
    console.error('[characters.update] RLS/ERROR:', error)
  }

  setSaving(false)
}
;

  const onAddRelation = async (otherId, type) => {
    setRelMsg("");
    if (!charId) { setRelMsg("Aucun personnage sélectionné"); return; }
    if (!otherId || !type) { setRelMsg("Choisis un personnage et un type"); return; }
    setRelBusy(true);
    const { error } = await supabase.from("character_relationships").insert({
      character_id: charId,
      other_character_id: otherId,
      type,
    });
    if (error) {
      setRelMsg(error.message || "Erreur d'ajout");
    } else {
      const { data: rels } = await supabase
        .from("character_relationships")
        .select("id, other_character_id, type, created_at, other:other_character_id ( id, name, avatar_url )")
        .eq("character_id", charId)
        .order("created_at", { ascending: false });
      setRelations(rels || []);
      setRelMsg("Relation ajoutée ✔");
      setTimeout(() => setRelMsg(""), 1200);
    }
    setRelBusy(false);
  };

  const onRemoveRelation = async (id) => {
    await supabase.from("character_relationships").delete().eq("id", id);
    setRelations(rs => rs.filter(r => r.id !== id));
  };

  // L’utilisateur peut éditer s’il possède VRAIMENT le personnage sélectionné
const ownsCurrentChar = useMemo(() => {
  if (!me?.id || !charId) return false
  const c = myChars.find(x => x.id === charId)
  return !!c && c.user_id === me.id
}, [me?.id, charId, myChars])

const canEdit = !!me?.id && ownsCurrentChar

  if (loading) return <Loader label="Chargement…" />;
  if (!me) return <Centered label="Veuillez vous connecter." />;

  return (
    <main className="min-h-svh bg-[url('/images/profil-bg.webp')] bg-cover bg-center p-4">
      {/* Barre de navigation commune */}
      <div className="-mx-4 -mt-4 mb-6">
        <SiteTopbar title="Mon profil" />
      </div>

      {/* GRID: [Avatar] | [Identité large] | [Traits+Relations] */}
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-5 items-start">
        {/* Avatar + sélection personnage */}
        <aside className="col-span-12 min-w-0 lg:col-span-2">
          <div className="flex min-w-0 flex-col items-center gap-4 lg:sticky lg:top-4">
            <CharSwitcher chars={myChars} value={charId} onChange={setCharId} />
            <HeroAvatar src={form.avatar_url} size={220} bust={imgBust} />

            {/* Compagnon (mini) */}
            <div className="mt-6 w-full flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-black/45 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,.35)] p-4">
              <div className="w-full">
                <label htmlFor="companion-name" className="mb-1 block text-center text-xs text-white/70">Nom du compagnon</label>
                <input
                  id="companion-name"
                  type="text"
                  maxLength={100}
                  value={form.companion_name}
                  onChange={e => onChange('companion_name', e.target.value)}
                  onBlur={saveCompanionName}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  disabled={!charId || savingCompanion}
                  placeholder="Nom du compagnon"
                  className="w-full rounded-full border border-white/20 bg-white/10 px-3 py-2 text-center text-sm text-white outline-none placeholder:text-white/55 focus:border-amber-300/60"
                />
                {savingCompanion && <p className="mt-1 text-center text-xs text-white/60">Enregistrement…</p>}
              </div>

              <HeroAvatar src={form.companion_avatar_url} size={120} bust={imgBust} />
              <AvatarUploader
                key={`companion-${charId}`}
                userId={me.id}
                charId={charId}
                prefix="companions"
                label="Upload compagnon"
                onUploaded={async (url) => {
                  onChange("companion_avatar_url", url);
                  setImgBust(Date.now());
                  await supabase
  .from('characters')
  .update({ companion_avatar_url: url })
  .eq('id', charId)
  .eq('user_id', me.id)
;
                }}
              />
            </div>
          </div>
        </aside>

        {/* Identité – large */}
        <section className="col-span-12 min-w-0 lg:col-span-6 rounded-2xl bg-black/50 border border-white/15 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,.35)] p-4">
          <h2 className="text-white/90 text-lg font-semibold mb-3">Identité</h2>

          <Labeled label="Nom">
            <input value={form.name} onChange={(e)=>onChange("name", e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none" placeholder="Nom du personnage" />
          </Labeled>

          <Labeled label="Orientation (facultatif)">
            <input
              type="text"
              value={form.orientation}
              maxLength={120}
              onChange={(e) => onChange("orientation", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/40 focus:border-amber-300/50"
              placeholder="Saisie libre, ou laisser vide"
            />
            <span className="mt-1 block text-xs text-white/55">Visible par les autres membres uniquement si renseignée.</span>
          </Labeled>

          <Labeled label="Âge">
            <input type="number" inputMode="numeric" min={0} max={150} value={form.age} onChange={(e)=>onChange("age", e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white focus:outline-none" placeholder="ex: 28" />
          </Labeled>

          <Labeled label="Occupation">
            <input value={form.occupation} onChange={(e)=>onChange("occupation", e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white focus:outline-none" placeholder="Métier / activité" />
          </Labeled>

          <Labeled label="Description / histoire">
            <textarea value={form.bio} onChange={(e)=>onChange("bio", e.target.value)} rows={12} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none" placeholder="..." />
          </Labeled>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            

<button
  onClick={onSave}
  disabled={saving || !charId}
  className="rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-white hover:bg-white/15 disabled:opacity-50"
>
  {saving ? "Enregistrement…" : "Enregistrer"}
</button>

            {savedMsg && <span className="text-green-300 text-sm">{savedMsg}</span>}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AvatarUploader
                key={`main-${charId}`}
                userId={me.id}
                charId={charId}
                onUploaded={async (url) => {
                  onChange("avatar_url", url);
                  setImgBust(Date.now());
                  // autosave avatar
                  await supabase
  .from('characters')
  .update({ avatar_url: url })
  .eq('id', charId)
  .eq('user_id', me.id)
;
                }}
              />
              <input value={form.avatar_url} onChange={(e)=>onChange("avatar_url", e.target.value)} placeholder="URL avatar" className="w-full min-w-0 max-w-full rounded-lg sm:w-64 bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none" />
            </div>
          </div>
        </section>

        {/* Droite: Traits (haut) + Relations (bas) */}
        <section className="col-span-12 min-w-0 lg:col-span-4 flex flex-col gap-5">
          {/* TRAITS */}
          <div className="rounded-2xl bg-black/50 border border-white/15 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,.35)] p-4">
            <h2 className="text-white/90 text-lg font-semibold mb-3">Traits de personnalité</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <Bipolar leftLabel="Introverti" rightLabel="Extraverti" value={form.traits.intro_extro} onChange={(v)=>onTrait("intro_extro", v)} />
                <Bipolar leftLabel="Égoïste" rightLabel="Altruiste" value={form.traits.egoiste_altruiste} onChange={(v)=>onTrait("egoiste_altruiste", v)} />
                <Bipolar leftLabel="Prudent" rightLabel="Téméraire" value={form.traits.prudent_temer} onChange={(v)=>onTrait("prudent_temer", v)} />
                <Bipolar leftLabel="Réfléchi" rightLabel="Impulsif" value={form.traits.reflechi_impulsif} onChange={(v)=>onTrait("reflechi_impulsif", v)} />
                <Bipolar leftLabel="Obéissant" rightLabel="Rebelle" value={form.traits.obeissant_rebelle} onChange={(v)=>onTrait("obeissant_rebelle", v)} />
              </div>
              <div className="space-y-4">
                <Bipolar leftLabel="Méthodique" rightLabel="Chaotique" value={form.traits.methodique_chaotique} onChange={(v)=>onTrait("methodique_chaotique", v)} />
                <Bipolar leftLabel="Idéaliste" rightLabel="Cynique" value={form.traits.idealiste_cynique} onChange={(v)=>onTrait("idealiste_cynique", v)} />
                <Bipolar leftLabel="Résilient" rightLabel="Vulnérable" value={form.traits.resil_vulnerable} onChange={(v)=>onTrait("resil_vulnerable", v)} />
                <Bipolar leftLabel="Loyal" rightLabel="Opportuniste" value={form.traits.loyal_opportuniste} onChange={(v)=>onTrait("loyal_opportuniste", v)} />
                <Bipolar leftLabel="Créatif" rightLabel="Pragmatique" value={form.traits.creatif_pragmatique} onChange={(v)=>onTrait("creatif_pragmatique", v)} />
              </div>
            </div>
          </div>

          {/* RELATIONS */}
          <div className="rounded-2xl bg-black/50 border border-white/15 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,.35)] p-4">
            <h2 className="text-white/90 text-lg font-semibold mb-3">Carnet de relations</h2>
            {!charId && (
              <div className="text-white/70 text-sm mb-2">Aucun personnage sélectionné.</div>
            )}
            <RelationAdder
              characters={(allChars || []).filter(c => c.id !== charId)}
              types={REL_TYPES}
              onAdd={onAddRelation}
              busy={relBusy}
              msg={relMsg}
            />
            <ul className="max-h-[240px] min-h-0 divide-y divide-white/10 overflow-y-auto overscroll-contain pr-2 [scrollbar-width:thin] [scrollbar-color:rgba(230,212,167,0.5)_transparent]">
              {relations.map((rel) => (
                <li key={rel.id} className="py-2 flex items-center gap-3">
                  <MiniAvatar src={rel.other?.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="text-white/90 text-sm font-medium truncate">{rel.other?.name || rel.other_character_id}</div>
                    <div className="text-white/60 text-xs">{REL_TYPES.find((t)=>t.value===rel.type)?.label || rel.type}</div>
                  </div>
                  <button onClick={() => onRemoveRelation(rel.id)} className="text-white/60 hover:text-white text-sm">Supprimer</button>
                </li>
              ))}
              {relations.length === 0 && (
                <li className="py-4 text-white/60 text-sm">Aucune relation pour l’instant.</li>
              )}
            </ul>
          </div>

          {/* BAGUETTE */}
          <div className="rounded-2xl border border-white/15 bg-black/50 p-4 shadow-[0_18px_50px_rgba(0,0,0,.35)] backdrop-blur-xl">
            <h2 className="mb-3 text-lg font-semibold text-white/90">Baguette magique</h2>
            <div className="space-y-3">
              <Labeled label="Composition">
                <input
                  value={form.wand_composition}
                  onChange={e => onChange('wand_composition', e.target.value)}
                  disabled={!canEdit}
                  maxLength={500}
                  placeholder="Ex. bois de houx, plume de phénix"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/40 focus:border-amber-300/60"
                />
              </Labeled>
              <Labeled label="Taille">
                <input
                  value={form.wand_size}
                  onChange={e => onChange('wand_size', e.target.value)}
                  disabled={!canEdit}
                  maxLength={80}
                  placeholder="Ex. 28 cm ou 11 pouces"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/40 focus:border-amber-300/60"
                />
              </Labeled>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border border-amber-200/30 bg-black/25">
                  <span className="px-2 text-center text-[11px] text-white/45">Aperçu baguette</span>
                  {displayExternalImage(form.wand_image_url) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={form.wand_image_url}
                      src={displayExternalImage(form.wand_image_url)}
                      alt="Baguette du personnage"
                      referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <label htmlFor="wand-image-url" className="mb-1 block text-sm text-white/80">URL de l&apos;image</label>
                  <input
                    id="wand-image-url"
                    type="url"
                    value={form.wand_image_url}
                    onChange={e => onChange('wand_image_url', e.target.value)}
                    disabled={!canEdit}
                    maxLength={2000}
                    placeholder="https://i.pinimg.com/..."
                    className="w-full min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-amber-300/50"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-white/55">
                    Copie le lien direct vers l&apos;image (Pinterest, Imgur…). Les liens de pages Pinterest ne sont pas des fichiers image.
                    Aucun téléversement n&apos;est nécessaire.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !canEdit}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer la baguette'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function baseTraits() {
  return {
    intro_extro: 5,
    egoiste_altruiste: 5,
    prudent_temer: 5,
    reflechi_impulsif: 5,
    obeissant_rebelle: 5,
    methodique_chaotique: 5,
    idealiste_cynique: 5,
    resil_vulnerable: 5,
    loyal_opportuniste: 5,
    creatif_pragmatique: 5,
  };
}

function baseForm() {
  return {
    user_id: "",
    name: "",
    orientation: "",
    bio: "",
    avatar_url: "",
    age: "",
    occupation: "",
    traits: baseTraits(),
    companion_name: "",
    companion_avatar_url: "",
    wand_composition: "",
    wand_size: "",
    wand_image_url: "",
  };
}

function Loader({ label }) {
  return (
    <main className="min-h-svh grid place-items-center">
      <div className="text-white/70">{label}</div>
    </main>
  );
}
function Centered({ label }) { return <Loader label={label} />; }

function Labeled({ label, children }) {
  return (
    <label className="block text-white/80 text-sm mb-3">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

function CharSwitcher({ chars, value, onChange }) {
  if (!chars?.length) return null;
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-2 w-full">
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-800 text-white px-3 py-2 outline-none rounded-lg w-full"
        aria-label="Choisir un personnage"
      >
        {chars.map(c => (
          <option key={c.id} value={c.id} className="bg-neutral-900">
            {c.name || c.id}
          </option>
        ))}
      </select>
    </div>
  );
}

function HeroAvatar({ src, size = 200, bust = 0 }) {
  const S = size;
  const safeSrc = src ? `${src}${src.includes("?") ? "&" : "?"}v=${bust}` : null;
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-full border border-white/20 bg-white/5 shadow-xl" style={{ maxWidth: S }}>
      {safeSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={safeSrc} src={safeSrc} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-white/40">Avatar</div>
      )}
    </div>
  );
}

function MiniAvatar({ src, size = 40 }) {
  return (
    <div className="shrink-0 rounded-lg overflow-hidden border border-white/10 bg-white/5" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-white/40">—</div>
      )}
    </div>
  );
}

function RelationAdder({ characters, types, onAdd, busy, msg }) {
  const [otherId, setOtherId] = useState("");
  const [type, setType] = useState("");
  const canAdd = !!otherId && !!type && !busy;
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2 mb-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select value={otherId} onChange={(e)=>setOtherId(e.target.value)} className="rounded-lg bg-neutral-800 border border-white/10 px-3 py-2 text-white focus:outline-none">
          <option value="">Personnage…</option>
          {(characters||[]).map((c)=> (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <select value={type} onChange={(e)=>setType(e.target.value)} className="rounded-lg bg-neutral-800 border border-white/10 px-3 py-2 text-white focus:outline-none">
          <option value="">Relation…</option>
          {types.map((t)=> (<option key={t.value} value={t.value}>{t.label}</option>))}
        </select>
        <button
          onClick={() => canAdd && onAdd(otherId, type)}
          disabled={!canAdd}
          className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white hover:bg-white/15 disabled:opacity-50"
        >
          {busy ? "Ajout…" : "Ajouter"}
        </button>
      </div>
      {!!msg && <div className="text-xs text-white/70">{msg}</div>}
    </div>
  );
}

function Bipolar({ leftLabel, rightLabel, value=5, onChange, leftColor="#8c6ab8", rightColor="#e6d4a7" }) {
  const pct = (value / 10) * 100; // 0..100 → droite
  const gradient = `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} ${pct}%, ${rightColor} ${pct}%, ${rightColor} 100%)`;
  return (
    <div className="space-y-2 select-none">
      <div className="flex justify-between text-white/78 text-sm">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="relative h-4 rounded-full border border-white/15 bg-black/35 overflow-hidden">
        <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `calc(${pct}% - 6px)` }}
        >
          <div className="h-3 w-3 rounded-full border border-white/70 bg-white shadow-[0_0_10px_rgba(255,255,255,.35)]" />
        </div>
        <input type="range" min={0} max={10} step={1} value={value} onChange={(e) => onChange?.(Number(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label={`${leftLabel} ↔ ${rightLabel}`} />
      </div>
    </div>
  );
}

function AvatarUploader({
  userId,
  charId,
  onUploaded,
  prefix = "avatars",            // sous-dossier (ex: "companions")
  label = "Uploader un avatar",  // texte du bouton
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !charId) return;
    setBusy(true); setError("");
    try {
      // Preview locale instantanée
      const localURL = URL.createObjectURL(file);
      setPreview(localURL);

      // Réduire la taille avant l'envoi : le navigateur génère un WebP optimisé.
      const optimized = await optimizeAvatar(file, { maxDimension: 512, quality: 0.82 });
      // Chaque upload crée un chemin unique : un cache long ne masque jamais un nouvel avatar.
      const path = `${userId}/${charId}/${prefix}/${Date.now()}-${crypto.randomUUID()}.${optimized.extension}`;

      const { error: upErr } = await supabase
        .storage.from(AVATAR_BUCKET)
        .upload(path, optimized.file, {
          upsert: false,
          contentType: optimized.file.type,
          cacheControl: "31536000",
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const url = pub?.publicUrl || "";
      if (url) await onUploaded?.(url);
    } catch (e) {
      setError(e?.message || "Erreur d'upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {preview && (
        <div className="rounded-full overflow-hidden border border-white/20" style={{ width: 72, height: 72 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
        </div>
      )}
      <label className="inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-lg border border-white/20 bg-white/12 px-2.5 py-2 text-[11px] font-medium text-white hover:bg-white/18 sm:text-xs">
        {busy ? "Envoi…" : label}
        <input type="file" accept="image/*" className="hidden" onChange={onPick} />
      </label>
      {error && <div className="text-red-300 text-xs">{error}</div>}
    </div>
  );
}
