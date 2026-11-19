-- OffRecords v2 — à appliquer seulement lors de la publication conjointe du code.
-- Migration additive : 1 playlist et 4 morceaux existants conservés, playlists publiques par défaut.
-- ATTENTION : ne pas appliquer indépendamment du déploiement OffRecords/RP.

BEGIN;

ALTER TABLE public.off_playlists
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS off_playlists_visibility_created_idx
  ON public.off_playlists(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS off_playlists_character_id_idx
  ON public.off_playlists(character_id);

-- Un joueur ne peut pas attribuer sa playlist au personnage d'un autre compte.
CREATE OR REPLACE FUNCTION public.guard_off_playlist_character()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.character_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.characters ch
    WHERE ch.id = NEW.character_id AND ch.user_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Le personnage choisi doit appartenir au créateur de la playlist';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS off_playlist_character_owner ON public.off_playlists;
CREATE TRIGGER off_playlist_character_owner
BEFORE INSERT OR UPDATE OF character_id, owner_id ON public.off_playlists
FOR EACH ROW EXECUTE FUNCTION public.guard_off_playlist_character();

-- Reprendre la visibilité actuellement publique sans exposer les playlists privées.
DROP POLICY IF EXISTS "public select off_playlists" ON public.off_playlists;
DROP POLICY IF EXISTS "off_playlists_visibility" ON public.off_playlists;
CREATE POLICY "off_playlists_visibility" ON public.off_playlists
FOR SELECT TO authenticated
USING (is_public OR owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "owner update off_playlists" ON public.off_playlists;
CREATE POLICY "owner update off_playlists" ON public.off_playlists
FOR UPDATE TO authenticated
USING (owner_id = (SELECT auth.uid()))
WITH CHECK (owner_id = (SELECT auth.uid()));

-- Les titres d'une playlist privée ne doivent PAS être accessibles via off_tracks.
DROP POLICY IF EXISTS "public select off_tracks" ON public.off_tracks;
DROP POLICY IF EXISTS "off_tracks_visibility" ON public.off_tracks;
CREATE POLICY "off_tracks_visibility" ON public.off_tracks
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.off_playlists p
    WHERE p.id = playlist_id
      AND (p.is_public OR p.owner_id = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "owner update off_tracks" ON public.off_tracks;
CREATE POLICY "owner update off_tracks" ON public.off_tracks
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.off_playlists p WHERE p.id = playlist_id AND p.owner_id = (SELECT auth.uid()))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.off_playlists p WHERE p.id = playlist_id AND p.owner_id = (SELECT auth.uid()))
);

-- Favoris privés : une personne ne voit que SES favoris.
CREATE TABLE IF NOT EXISTS public.off_playlist_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id uuid NOT NULL REFERENCES public.off_playlists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, playlist_id)
);
CREATE INDEX IF NOT EXISTS off_playlist_favorites_playlist_id_idx
  ON public.off_playlist_favorites(playlist_id);

ALTER TABLE public.off_playlist_favorites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.off_playlist_favorites FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.off_playlist_favorites TO authenticated;

DROP POLICY IF EXISTS "favorites_own_select" ON public.off_playlist_favorites;
CREATE POLICY "favorites_own_select" ON public.off_playlist_favorites
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "favorites_own_insert" ON public.off_playlist_favorites;
CREATE POLICY "favorites_own_insert" ON public.off_playlist_favorites
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.off_playlists p
              WHERE p.id = playlist_id AND p.is_public)
);

DROP POLICY IF EXISTS "favorites_own_delete" ON public.off_playlist_favorites;
CREATE POLICY "favorites_own_delete" ON public.off_playlist_favorites
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Une scène peut référencer une playlist PUBLIQUE, sans copier ses morceaux.
ALTER TABLE public.rp_topics
  ADD COLUMN IF NOT EXISTS soundtrack_playlist_id uuid
    REFERENCES public.off_playlists(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rp_topics_soundtrack_playlist_idx
  ON public.rp_topics(soundtrack_playlist_id);

CREATE OR REPLACE FUNCTION public.guard_rp_soundtrack_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.soundtrack_playlist_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.off_playlists p
    WHERE p.id = NEW.soundtrack_playlist_id AND p.is_public
  ) THEN
    RAISE EXCEPTION 'La bande-son d''un RP doit être une playlist publique';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rp_soundtrack_public_only ON public.rp_topics;
CREATE TRIGGER rp_soundtrack_public_only
BEFORE INSERT OR UPDATE OF soundtrack_playlist_id ON public.rp_topics
FOR EACH ROW EXECUTE FUNCTION public.guard_rp_soundtrack_public();

-- Nouvelle fonction RP, sans modifier la fonction invitations existante.
-- Une erreur sur la playlist annule aussi la création du sujet et les invitations.
CREATE OR REPLACE FUNCTION public.create_rp_with_soundtrack(
  p_title text,
  p_location_id uuid,
  p_character_ids uuid[],
  p_playlist_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_topic_id uuid;
BEGIN
  v_topic_id := public.create_rp_with_invitations(
    p_title, p_location_id, p_character_ids
  );

  IF p_playlist_id IS NOT NULL THEN
    UPDATE public.rp_topics
    SET soundtrack_playlist_id = p_playlist_id
    WHERE id = v_topic_id;
  END IF;

  RETURN v_topic_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_rp_with_soundtrack(text, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rp_with_soundtrack(text, uuid, uuid[], uuid) TO authenticated;

COMMIT;

-- Contrôles de publication après application :
-- SELECT count(*) FROM public.off_playlists;     -- conserver les playlists existantes
-- SELECT count(*) FROM public.off_tracks;        -- conserver les titres existants
-- SELECT column_name FROM information_schema.columns WHERE table_name='rp_topics' AND column_name='soundtrack_playlist_id';
-- Test SQL RLS sous deux utilisateurs distincts : playlist privée + pistes invisibles au tiers ;
-- favori visible seulement à son propriétaire ; liaison RP uniquement à une playlist publique.
