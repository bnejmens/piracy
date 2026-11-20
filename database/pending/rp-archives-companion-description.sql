-- Publication groupée (PR #7) : archivage des RP et description de compagnon.
-- À exécuter APRÈS database/pending/offrecords-community-rp-soundtracks.sql
-- et AVANT de fusionner la PR #7 dans main.
-- Migration additive : ni post, ni sujet, ni personnage existant n'est supprimé.

BEGIN;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS companion_description text;

ALTER TABLE public.rp_topics
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS rp_topics_location_archive_idx
  ON public.rp_topics(location_id, is_archived, created_at DESC);

-- RLS de rp_topics existe déjà : seul l'auteur ou un admin peut modifier
-- le sujet. Ce trigger maintient archived_at côté serveur.
CREATE OR REPLACE FUNCTION public.maintain_rp_archive_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Pas de nouveau sujet créé directement en mode archivé.
    NEW.is_archived := false;
    NEW.archived_at := NULL;
  ELSIF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    NEW.archived_at := CASE WHEN NEW.is_archived THEN now() ELSE NULL END;
  ELSE
    NEW.archived_at := OLD.archived_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintain_rp_archive_state ON public.rp_topics;
CREATE TRIGGER maintain_rp_archive_state
BEFORE INSERT OR UPDATE ON public.rp_topics
FOR EACH ROW EXECUTE FUNCTION public.maintain_rp_archive_state();

-- Une scène archivée devient réellement en lecture seule, même si le
-- client contourne le bouton grisé ou envoie directement une requête API.
CREATE OR REPLACE FUNCTION public.reject_edits_on_archived_rp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_old_archived boolean;
  v_new_archived boolean;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT t.is_archived INTO v_old_archived FROM public.rp_topics t
    WHERE t.id = OLD.topic_id;
    IF coalesce(v_old_archived, false) THEN
      RAISE EXCEPTION 'Ce RP est archivé : ses publications sont en lecture seule';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT t.is_archived INTO v_new_archived FROM public.rp_topics t
    WHERE t.id = NEW.topic_id;
    IF coalesce(v_new_archived, false) THEN
      RAISE EXCEPTION 'Ce RP est archivé : impossible d''y publier';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS reject_edits_on_archived_rp ON public.rp_posts;
CREATE TRIGGER reject_edits_on_archived_rp
BEFORE INSERT OR UPDATE OR DELETE ON public.rp_posts
FOR EACH ROW EXECUTE FUNCTION public.reject_edits_on_archived_rp();

COMMIT;

-- Tests à la publication : auteur peut archiver/réouvrir, tiers non ;
-- dans une scène archivée, INSERT/UPDATE/DELETE de rp_posts échouent ;
-- SELECT des sujets et posts archivés reste possible.
