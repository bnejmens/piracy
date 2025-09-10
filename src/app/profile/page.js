"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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
        .select("id, user_id, name, bio, avatar_url, gender, is_active, age, occupation, traits, companion_name, companion_avatar_url")
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
    (async () => {
      const { data: c } = await supabase
        .from("characters")
        .select("id, user_id, name, bio, avatar_url, gender, is_active, age, occupation, traits, companion_name, companion_avatar_url")
        .eq("id", charId)
        .maybeSingle();
      if (c) {
        setForm({
          user_id: c.user_id || "",
          name: c.name || "",
          gender: c.gender || "",
          bio: c.bio || "",
          avatar_url: c.avatar_url || "",
          age: c.age ?? "",
          occupation: c.occupation || "",
          traits: { ...baseTraits(), ...(c.traits || {}) },
          companion_name: c.companion_name || "",
          companion_avatar_url: c.companion_avatar_url || "",
        });
        setImgBust(Date.now());
      }
      const { data: rels } = await supabase
        .from("character_relationships")
        .select("id, other_character_id, type, created_at, other:other_character_id ( id, name, avatar_url )")
        .eq("character_id", charId)
        .order("created_at", { ascending: false });
      setRelations(rels || []);
      setRelMsg("");
    })();
  }, [charId]);

  const onChange = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const onTrait = (k, v) => setForm(f => ({ ...f, traits: { ...f.traits, [k]: v } }));

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

// gender (enum masculin/féminin, sinon null)
if ((form.gender ?? null) !== (current.gender ?? null)) {
  const allowed = ['masculin', 'féminin'];
  payload.gender = form.gender && allowed.includes(form.gender) ? form.gender : null;
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
      {/* Topbar */}
      <div className="max-w-7xl mx-auto flex items-center gap-3 mb-4">
        <Link href="/dashboard" className="rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white hover:bg-white/15">← Dashboard</Link>
        <div className="ml-auto" />
      </div>

      {/* GRID: [Avatar] | [Identité large] | [Traits+Relations] */}
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-5 items-start">
        {/* Avatar + sélection personnage */}
        <aside className="col-span-12 sm:col-span-3 lg:col-span-2">
          <div className="sticky top-4 flex flex-col items-center gap-3">
            <CharSwitcher chars={myChars} value={charId} onChange={setCharId} />
            <HeroAvatar src={form.avatar_url} size={220} bust={imgBust} />

            {/* Compagnon (mini) */}
            <div className="mt-8 w-full flex flex-col items-center gap-2 rounded-xl bg-white/0 border border-white/0 p-3">
              <div
  className="text-white text-lg bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1 shadow-md"
>
  {form?.companion_name?.trim() || 'Compagnon'}
</div>

              <HeroAvatar src={form.companion_avatar_url} size={120} bust={imgBust} />
              <AvatarUploader
                userId={me.id}
                charId={charId}
                prefix="companions"
                label="Upload companion"
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
{/* Création de personnage si aucun n'existe */}
  <CreateCharacterInline
    userId={me?.id}
    setMyChars={setMyChars}
    setCharId={setCharId}
  />

          </div>
        </aside>

        {/* Identité – large */}
        <section className="col-span-12 sm:col-span-9 lg:col-span-6 rounded-2xl bg-black/35 border border-white/10 backdrop-blur p-4">
          <h2 className="text-white/90 text-lg font-semibold mb-3">Identité</h2>

          <Labeled label="Nom">
            <input value={form.name} onChange={(e)=>onChange("name", e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none" placeholder="Nom du personnage" />
          </Labeled>

          <Labeled label="Genre">
            <select value={form.gender} onChange={(e)=>onChange("gender", e.target.value)} className="w-full rounded-lg bg-neutral-800 border border-white/10 px-3 py-2 text-white focus:outline-none">
              <option value="">—</option>
              <option value="masculin">Masculin</option>
              <option value="féminin">Féminin</option>
            </select>
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

          <Labeled label="Nom du compagnon">
            <input
              value={form.companion_name}
              onChange={(e)=>onChange("companion_name", e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none"
              placeholder="Nom de la créature / plante / esprit…"
            />
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
            <div className="flex gap-2 items-center">
              <AvatarUploader
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
              <input value={form.avatar_url} onChange={(e)=>onChange("avatar_url", e.target.value)} placeholder="URL avatar" className="w-64 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none" />
            </div>
          </div>
        </section>

        {/* Droite: Traits (haut) + Relations (bas) */}
        <section className="col-span-12 lg:col-span-4 grid grid-rows-[auto,1fr] gap-5">
          {/* TRAITS */}
          <div className="rounded-2xl bg-black/35 border border-white/10 backdrop-blur p-4">
            <h2 className="text-white/90 text-lg font-semibold mb-3">Traits de personnalité</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <Bipolar leftLabel="Introverti" rightLabel="Extraverti" leftColor="#5b9bff" rightColor="#f6d24a" value={form.traits.intro_extro} onChange={(v)=>onTrait("intro_extro", v)} />
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
          <div className="rounded-2xl bg-black/35 border border-white/10 backdrop-blur p-4">
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
            <ul className="divide-y divide-white/10 max-h-[40svh] overflow-y-auto">
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
    gender: "",
    bio: "",
    avatar_url: "",
    age: "",
    occupation: "",
    traits: baseTraits(),
    companion_name: "",
    companion_avatar_url: "",
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
    <div className="relative rounded-full border border-white/20 shadow-xl overflow-hidden bg-white/5" style={{ width: S, height: S }}>
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

function CreateCharacterInline({ userId, setMyChars, setCharId }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = !!userId && name.trim().length > 1;

  const onCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    const payload = {
      user_id: userId,
      name: name.trim(),
      is_active: true, // optionnel si ta colonne existe
    };

    const { data, error } = await supabase
      .from('characters')
      .insert(payload)
      .select('id, user_id, name, avatar_url, is_active')
      .single();

    if (error) {
      console.error('[characters.insert]', error);
      alert(error.message || 'Création impossible (RLS ?)');
    } else {
      setMyChars(prev => ([...(prev || []), data]));
      setCharId(data.id);     // bascule tout de suite sur ce perso
      setName('');
    }
    setCreating(false);
  };

  return (
    <div className="mt-4 p-3 rounded border border-white/15 bg-white/5">
      <p className="text-sm mb-2">Créer un nouveau personnage</p>
      <div className="flex flex-col gap-2 w-full">
  <input
    type="text"
    value={name}
    placeholder="Nom du personnage"
    onChange={(e) => setName(e.target.value)}
    className="w-full border p-2 rounded bg-black/20"
  />

  <button
    onClick={onCreate}
    disabled={!canCreate || creating}
    className={`w-full px-3 py-2 rounded text-white text-center ${
      !canCreate || creating ? 'bg-gray-500' : 'bg-emerald-600 hover:bg-emerald-700'
    }`}
  >
    {creating ? 'Création…' : 'Créer'}
  </button>
</div>
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

function Bipolar({ leftLabel, rightLabel, value=5, onChange, leftColor="#6ea8ff", rightColor="#f6d24a" }) {
  const pct = (value / 10) * 100; // 0..100 → droite
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

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // ➜ on range dans /<user>/<char>/<prefix>/
      const path = `${userId}/${charId}/${prefix}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase
        .storage.from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const raw = pub?.publicUrl;
      const url = raw ? `${raw}?v=${Date.now()}` : ""; // anti-cache CDN
      if (url) onUploaded?.(url);
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
      <label className="cursor-pointer rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white hover:bg-white/15">
        {busy ? "Envoi…" : label}
        <input type="file" accept="image/*" className="hidden" onChange={onPick} />
      </label>
      {error && <div className="text-red-300 text-xs">{error}</div>}
    </div>
  );
}
