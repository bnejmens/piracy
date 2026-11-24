ALTER TABLE public.messages ADD COLUMN edited_at timestamptz;

REVOKE UPDATE ON public.messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (content) ON public.messages TO authenticated;

CREATE POLICY messages_edit_own_character ON public.messages
FOR UPDATE TO authenticated
USING (
  sender_id = (SELECT auth.uid())
  AND (SELECT piracy_internal.can_access_conversation(conversation_id))
  AND EXISTS (
    SELECT 1 FROM public.characters ch
    WHERE ch.id = messages.sender_character_id AND ch.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND (SELECT piracy_internal.can_access_conversation(conversation_id))
  AND EXISTS (
    SELECT 1 FROM public.characters ch
    WHERE ch.id = messages.sender_character_id AND ch.user_id = (SELECT auth.uid())
  )
);

CREATE FUNCTION piracy_internal.stamp_message_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF NEW.content IS NULL OR btrim(NEW.content) = '' THEN
      RAISE EXCEPTION 'Le message ne peut pas être vide.';
    END IF;
    NEW.edited_at := statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stamp_message_edit
BEFORE UPDATE OF content ON public.messages
FOR EACH ROW EXECUTE FUNCTION piracy_internal.stamp_message_edit();

CREATE POLICY messages_insert_as_participating_character ON public.messages
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  sender_character_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversation_participants p
    WHERE p.conversation_id = messages.conversation_id
      AND p.character_id = messages.sender_character_id
      AND p.user_id = (SELECT auth.uid())
  )
);

CREATE FUNCTION piracy_internal.can_join_conversation_as_character(p_conversation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text || ':' || actor::text, 0));
  RETURN NOT EXISTS (
    SELECT 1 FROM public.conversation_participants p
    WHERE p.conversation_id = p_conversation_id AND p.user_id = actor
  );
END;
$$;
REVOKE ALL ON FUNCTION piracy_internal.can_join_conversation_as_character(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION piracy_internal.can_join_conversation_as_character(uuid) TO authenticated;

CREATE POLICY participants_join_first_character ON public.conversation_participants
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (piracy_internal.can_join_conversation_as_character(conversation_id));
