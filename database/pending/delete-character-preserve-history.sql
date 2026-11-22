-- Keep player history when a character is deleted.
ALTER TABLE public.messages
  DROP CONSTRAINT messages_sender_character_id_fkey,
  ADD CONSTRAINT messages_sender_character_id_fkey
    FOREIGN KEY (sender_character_id) REFERENCES public.characters(id) ON DELETE SET NULL;

ALTER TABLE public.rp_posts
  DROP CONSTRAINT rp_posts_author_character_id_fkey,
  ADD CONSTRAINT rp_posts_author_character_id_fkey
    FOREIGN KEY (author_character_id) REFERENCES public.characters(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_active_character_id_fkey,
  ADD CONSTRAINT profiles_active_character_id_fkey
    FOREIGN KEY (active_character_id) REFERENCES public.characters(id) ON DELETE SET NULL;

ALTER TABLE public.rp_invitations
  ALTER COLUMN invited_character_id DROP NOT NULL,
  DROP CONSTRAINT rp_invitations_invited_character_id_fkey,
  ADD CONSTRAINT rp_invitations_invited_character_id_fkey
    FOREIGN KEY (invited_character_id) REFERENCES public.characters(id) ON DELETE SET NULL;

CREATE POLICY characters_delete_own ON public.characters
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT DELETE ON public.characters TO authenticated;

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
  -- Permit the foreign key's nested update to detach a deleted character.
  IF TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() > 1
       AND OLD.author_character_id IS NOT NULL
       AND NEW.author_character_id IS NULL
       AND (to_jsonb(NEW) - 'author_character_id') = (to_jsonb(OLD) - 'author_character_id')
       AND NOT EXISTS (
         SELECT 1 FROM public.characters WHERE id = OLD.author_character_id
       ) THEN
      RETURN NEW;
    END IF;
  END IF;

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
