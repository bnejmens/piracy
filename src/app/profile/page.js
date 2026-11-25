"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import SiteTopbar from "@/components/SiteTopbar";
import { optimizeAvatar } from "@/lib/optimizeAvatar";
import { supabase } from "@/lib/supabaseClient";
import { displayExternalImage } from "@/lib/displayExternalImage";
import Bipolar from "@/components/PersonalityTraitScale";

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

  const activeCharRef = useRef(charId);
  useEffect(() => { activeCharRef.current = charId; }, [charId]);

  const [form, setForm] = useState(baseForm());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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
        .select("id, user_id, name, bio, avatar_url, orientation, is_active, age, occupation, traits, companion_name, companion_avatar_url, companion_description, wand_composition, wand_size, wand_image_url, rp_search")
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
        .select("id, user_id, name, bio, avatar_url, orientation, is_active, age, occupation, traits, companion_name, companion_avatar_url, companion_description, wand_composition, wand_size, wand_image_url, rp_search")
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
          companion_description: c.companion_description || "",
          wand_description: [c.wand_composition?.trim(), c.wand_size?.trim()].filter(Boolean).join('\n'),
          wand_image_url: c.wand_image_url || "",
          rp_search: c.rp_search ?? "",
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
  const saveUploadedImage = async (field, url) => {
    const { data, error } = await supabase.from('characters')
      .update({ [field]: url })
      .eq('id', charId)
      .eq('user_id', me.id)
      .select('id')
      .single();
    if (error) throw error;
    setMyChars(list => list.map(c => c.id === data.id ? { ...c, [field]: url } : c));
    if (activeCharRef.current === data.id) {
      onChange(field, url);
      setImgBust(Date.now());
      setSavedMsg('Image enregistrée ✔');
    }
  };

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

  const saveCompanionDescription = async () => {
    if (!me?.id || !charId) return;
    const description = (form.companion_description || '').trim();
    const old = (myChars.find(c => c.id === charId)?.companion_description || '').trim();
    if (description === old) return;
    const { error } = await supabase.from('characters')
      .update({ companion_description: description || null })
      .eq('id', charId).eq('user_id', me.id);
    if (error) { setSavedMsg(error.message || 'Erreur description du compagnon'); return; }
    setMyChars(list => list.map(c => c.id === charId ? { ...c, companion_description: description || null } : c));
    setSavedMsg('Description du compagnon enregistrée ✔');
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
        .select('id, user_id, name, bio, avatar_url, orientation, is_active, age, occupation, traits, companion_name, companion_avatar_url, companion_description, wand_composition, wand_size, wand_image_url, rp_search')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) { setSavedMsg(error.message); return; }
      setMyChars(data || []);
      setCharId(chosenId);
    };
    window.addEventListener('piracy:active-character-changed', onCharacterChanged);
    return () => window.removeEventListener('piracy:active-character-changed', onCharacterChanged);
  }, []);

 const deleteCharacter = async () => {
   const character = myChars.find(c => c.id === charId && c.user_id === me?.id);
   if (!character || saving || deleting) return;
   if (!window.confirm(`Supprimer définitivement « ${character.name} » ? Ses messages et ses posts RP seront conservés avec la mention Missing.`)) return;

   setDeleting(true);
   setDeleteError("");
   const { error } = await supabase.from('characters')
     .delete()
     .eq('id', character.id)
     .eq('user_id', me.id)
     .select('id')
     .single();
   if (error) {
     setDeleteError(error.message || 'La suppression a échoué.');
     setDeleting(false);
     return;
   }
   window.location.reload();
 };

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

// companion_description
if ((form.companion_description ?? '').trim() !== (current.companion_description ?? '')) {
  const description = (form.companion_description ?? '').trim();
  payload.companion_description = description || null;
}

// Les anciennes dimensions restent affichées jusqu'à la première édition du texte.
const previousWandText = [current.wand_composition?.trim(), current.wand_size?.trim()].filter(Boolean).join('\n');
const wandText = form.wand_description.trim();
if (wandText !== previousWandText) {
  payload.wand_composition = wandText || null;
  payload.wand_size = null;
}

const searchText = form.rp_search.trim();
if (searchText !== (current.rp_search ?? '').trim()) {
  payload.rp_search = searchText || null;
}

for (const [field, label] of [
  ['avatar_url', 'Avatar'],
  ['companion_avatar_url', 'Compagnon'],
  ['wand_image_url', 'Baguette'],
]) {
  const url = (form[field] || '').trim();
  if (url === (current[field] || '').trim()) continue;
  if (url && !displayExternalImage(url)) {
    setSavedMsg(`${label} : indique une URL http:// ou https:// valide.`);
    setSaving(false);
    return;
  }
  payload[field] = url || null;
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
        {/* Avatar du personnage actif : changement uniquement dans la topbar */}
        <aside className="col-span-12 min-w-0 lg:col-span-2">
          <div className="flex min-w-0 flex-col items-center gap-4 lg:sticky lg:top-4">
            <HeroAvatar src={form.avatar_url} size={220} bust={imgBust} />

            {/* Compagnon (mini) */}
            <div className="mt-3 w-full flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-black/45 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,.35)] p-4">
              <div className="w-full">
                <label htmlFor="companion-name" className="mb-1 block text-center text-xs text-white/70">Compagnon</label>
                <input
                  id="companion-name"
                  type="text"
                  maxLength={100}
                  value={form.companion_name}
                  onChange={e => onChange('companion_name', e.target.value)}
                  onBlur={saveCompanionName}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  disabled={!charId || savingCompanion}
                  placeholder="Son nom…"
                  className="w-full rounded-full border border-white/20 bg-white/10 px-3 py-2 text-center text-sm text-white outline-none placeholder:text-white/55 focus:border-amber-300/60"
                />
                {savingCompanion && <p className="mt-1 text-center text-xs text-white/60">Enregistrement…</p>}
              </div>

              <HeroAvatar src={form.companion_avatar_url} size={120} bust={imgBust} />
              <div className="w-full">
                <label htmlFor="companion-description" className="mb-1 block text-center text-xs text-white/70">Description</label>
                <textarea
                  id="companion-description"
                  rows={3}
                  maxLength={500}
                  value={form.companion_description}
                  onChange={e => onChange('companion_description', e.target.value)}
                  onBlur={saveCompanionDescription}
                  disabled={!canEdit}
                  placeholder="Espèce, tempérament, particularités…"
                  className="min-h-[72px] w-full resize-y rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 text-xs leading-relaxed text-white outline-none placeholder:text-white/45 focus:border-amber-300/60"
                />
              </div>
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
  disabled={saving || deleting || !charId}
  className="rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-white hover:bg-white/15 disabled:opacity-50"
>
  {saving ? "Enregistrement…" : "Enregistrer"}
</button>

            {canEdit && (
              <button
                type="button"
                onClick={deleteCharacter}
                disabled={saving || deleting}
                className="rounded-lg border border-rose-300/30 px-4 py-2 text-sm text-rose-200 hover:bg-rose-300/10 disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : 'Supprimer ce personnage'}
              </button>
            )}
            {deleteError && <p role="alert" className="w-full text-sm text-rose-300">{deleteError}</p>}
            {savedMsg && <span className="text-green-300 text-sm">{savedMsg}</span>}
          </div>
          <section className="mt-5 space-y-3 border-t border-white/15 pt-4" aria-labelledby="character-images-title">
            <h3 id="character-images-title" className="font-semibold text-white/90">Images du personnage</h3>
            <p className="text-xs text-white/60">Colle un lien direct vers une image, puis clique sur Enregistrer.</p>
            {[
              ['avatar_url', 'Avatar', 'avatars'],
              ['companion_avatar_url', 'Compagnon', 'companions'],
              ['wand_image_url', 'Baguette', 'wands'],
            ].map(([field, label, prefix]) => (
              <div key={field} className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-sm text-white/80">
                  {label}
                  <input
                    type="url"
                    value={form[field]}
                    onChange={event => onChange(field, event.target.value)}
                    disabled={!canEdit || saving}
                    maxLength={2000}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/50"
                  />
                </label>
                <AvatarUploader
                  key={`${field}-${charId}`}
                  userId={me.id}
                  charId={charId}
                  prefix={prefix}
                  label={`Importer · ${label}`}
                  disabled={!canEdit || saving}
                  onUploaded={url => saveUploadedImage(field, url)}
                />
              </div>
            ))}
          </section>
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
            <div className="flex items-start gap-3">
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
              <textarea
                aria-label="Description de la baguette"
                value={form.wand_description}
                onChange={event => onChange('wand_description', event.target.value)}
                disabled={!canEdit}
                rows={4}
                placeholder="Décris la baguette…"
                className="min-w-0 flex-1 resize-y rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-amber-300/60"
              />
            </div>
          </div>

          <section className="rounded-2xl border border-white/15 bg-black/50 p-4 shadow-[0_18px_50px_rgba(0,0,0,.35)] backdrop-blur-xl">
            <h2 className="mb-2 text-lg font-semibold text-white/90">
              <label htmlFor="character-rp-search">Recherche</label>
            </h2>
            <p id="character-rp-search-help" className="mb-3 text-sm text-white/65">
              Décris les liens ou les RP que tu aimerais jouer. Le texte apparaîtra sur ta fiche dans Membres après enregistrement.
            </p>
            <textarea
              id="character-rp-search"
              aria-describedby="character-rp-search-help"
              value={form.rp_search}
              onChange={event => onChange('rp_search', event.target.value)}
              disabled={!canEdit}
              rows={5}
              placeholder="Ex. Une rivalité à Poudlard, un allié pour une enquête…"
              className="w-full resize-y rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-amber-300/60"
            />
          </section>
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
    companion_description: "",
    wand_description: "",
    wand_image_url: "",
    rp_search: "",
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

function AvatarUploader({
  userId,
  charId,
  onUploaded,
  prefix = "avatars",            // sous-dossier (ex: "companions")
  label,
  disabled,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !charId || disabled || busy) return;
    e.target.value = "";
    setBusy(true); setError("");
    try {
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
      <label className="inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-lg border border-white/20 bg-white/12 px-2.5 py-2 text-[11px] font-medium text-white hover:bg-white/18 sm:text-xs">
        {busy ? "Envoi…" : label}
        <input type="file" accept="image/*" className="hidden" disabled={disabled || busy} onChange={onPick} />
      </label>
      {error && <div className="text-red-300 text-xs">{error}</div>}
    </div>
  );
}
