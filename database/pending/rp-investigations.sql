CREATE TABLE public.rp_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.rp_topics(id) ON DELETE CASCADE,
  post_id uuid UNIQUE REFERENCES public.rp_posts(id) ON DELETE SET NULL,
  gm_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  intro text NOT NULL,
  paths jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'published')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rp_investigations_topic_idx ON public.rp_investigations (topic_id, created_at);

CREATE TABLE public.rp_investigation_progress (
  investigation_id uuid NOT NULL REFERENCES public.rp_investigations(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path_index integer NOT NULL,
  PRIMARY KEY (investigation_id, player_id)
);

CREATE TABLE public.rp_investigation_clues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.rp_investigations(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path_index integer,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investigation_id, shared_by, path_index)
);

ALTER TABLE public.rp_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rp_investigation_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rp_investigation_clues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rp_investigations, public.rp_investigation_progress,
  public.rp_investigation_clues FROM PUBLIC, anon, authenticated;

-- Keep unchosen paths server-side and authorize every action against the scene.
CREATE FUNCTION public.rp_investigation_action(
  p_topic uuid, p_action text DEFAULT 'list', p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  topic public.rp_topics%ROWTYPE;
  investigation public.rp_investigations%ROWTYPE;
  is_host boolean;
  is_participant boolean;
  anchor uuid;
  choice integer;
  title_text text;
  intro_text text;
  clue_text text;
  paths_json jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  SELECT * INTO topic FROM public.rp_topics WHERE id = p_topic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scène introuvable.'; END IF;

  is_host := actor IS NOT DISTINCT FROM topic.author_id
    OR actor IS NOT DISTINCT FROM topic.created_by
    OR coalesce(public.is_admin(), false);
  is_participant := is_host OR EXISTS (
    SELECT FROM public.rp_posts
    WHERE topic_id = p_topic AND (author_id = actor OR author_user_id = actor)
  ) OR EXISTS (
    SELECT FROM public.rp_invitations
    WHERE topic_id = p_topic AND invited_user_id = actor AND status = 'accepted'
  );

  IF p_action <> 'list' THEN
    -- Serialize with scene archival and between investigation writes in the same scene.
    SELECT * INTO topic FROM public.rp_topics WHERE id = p_topic FOR SHARE;
    IF NOT FOUND OR topic.is_archived THEN RAISE EXCEPTION 'Cette scène est en lecture seule.'; END IF;

    IF p_action <> 'propose' THEN
      SELECT * INTO investigation FROM public.rp_investigations
        WHERE id = (p_data->>'id')::uuid AND topic_id = p_topic FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Enquête introuvable.'; END IF;
    END IF;

    IF p_action IN ('propose', 'edit') THEN
      title_text := btrim(p_data->>'title');
      intro_text := btrim(p_data->>'intro');
      paths_json := p_data->'paths';
      IF coalesce(length(title_text), 0) NOT BETWEEN 1 AND 100
         OR coalesce(length(intro_text), 0) NOT BETWEEN 1 AND 1500
         OR jsonb_typeof(paths_json) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Renseigne un titre, une introduction et les pistes.';
      END IF;
      IF jsonb_array_length(paths_json) NOT BETWEEN 2 AND 6 OR EXISTS (
        SELECT FROM jsonb_array_elements(paths_json) AS path
        WHERE coalesce(length(btrim(path->>'label')), 0) NOT BETWEEN 1 AND 120
           OR coalesce(length(btrim(path->>'clue')), 0) NOT BETWEEN 1 AND 1500
      ) THEN RAISE EXCEPTION 'Prévois entre deux et six pistes, chacune avec un choix et un indice.'; END IF;
    END IF;

    CASE p_action
      WHEN 'propose' THEN
        anchor := (p_data->>'postId')::uuid;
        PERFORM FROM public.rp_posts
          WHERE id = anchor AND topic_id = p_topic AND (author_id = actor OR author_user_id = actor)
          FOR KEY SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Propose l’enquête depuis une de tes réponses.'; END IF;
        INSERT INTO public.rp_investigations(topic_id, post_id, gm_id, title, intro, paths, status)
        VALUES (p_topic, anchor, actor, title_text, intro_text, paths_json,
          CASE WHEN is_host THEN 'approved' ELSE 'pending' END);
      WHEN 'edit' THEN
        IF investigation.gm_id <> actor OR investigation.status = 'published' THEN
          RAISE EXCEPTION 'Seul le MJ peut modifier le brouillon.'; END IF;
        UPDATE public.rp_investigations SET title = title_text, intro = intro_text, paths = paths_json
          WHERE id = investigation.id;
      WHEN 'approve' THEN
        IF NOT is_host OR investigation.status <> 'pending' THEN RAISE EXCEPTION 'Validation indisponible.'; END IF;
        UPDATE public.rp_investigations SET status = 'approved' WHERE id = investigation.id;
      WHEN 'reject' THEN
        IF NOT is_host OR investigation.status <> 'pending' THEN RAISE EXCEPTION 'Refus indisponible.'; END IF;
        DELETE FROM public.rp_investigations WHERE id = investigation.id;
      WHEN 'publish' THEN
        IF investigation.gm_id <> actor OR investigation.status <> 'approved' THEN
          RAISE EXCEPTION 'Seul le MJ peut publier une enquête approuvée.'; END IF;
        UPDATE public.rp_investigations SET status = 'published' WHERE id = investigation.id;
      WHEN 'choose' THEN
        IF investigation.status <> 'published' OR NOT is_participant THEN
          RAISE EXCEPTION 'Cette enquête est réservée aux participants de la scène.'; END IF;
        choice := (p_data->>'index')::integer;
        IF choice IS NULL OR choice < 0 OR choice >= jsonb_array_length(investigation.paths) THEN
          RAISE EXCEPTION 'Piste inconnue.'; END IF;
        INSERT INTO public.rp_investigation_progress VALUES (investigation.id, actor, choice)
          ON CONFLICT DO NOTHING;
      WHEN 'share' THEN
        IF investigation.status <> 'published' OR NOT is_participant THEN RAISE EXCEPTION 'Partage indisponible.'; END IF;
        SELECT path_index INTO choice FROM public.rp_investigation_progress
          WHERE investigation_id = investigation.id AND player_id = actor;
        IF NOT FOUND THEN RAISE EXCEPTION 'Découvre un indice avant de le partager.'; END IF;
        INSERT INTO public.rp_investigation_clues(investigation_id, shared_by, path_index, body)
          VALUES (investigation.id, actor, choice, investigation.paths->choice->>'clue')
          ON CONFLICT DO NOTHING;
      WHEN 'pin' THEN
        IF investigation.gm_id <> actor OR investigation.status <> 'published' THEN
          RAISE EXCEPTION 'Seul le MJ peut épingler un indice.'; END IF;
        clue_text := btrim(p_data->>'body');
        IF coalesce(length(clue_text), 0) NOT BETWEEN 1 AND 1500 THEN RAISE EXCEPTION 'Indice invalide.'; END IF;
        INSERT INTO public.rp_investigation_clues(investigation_id, shared_by, body)
          VALUES (investigation.id, actor, clue_text);
      WHEN 'remove_clue' THEN
        IF investigation.gm_id <> actor THEN RAISE EXCEPTION 'Seul le MJ peut retirer un indice.'; END IF;
        DELETE FROM public.rp_investigation_clues
          WHERE investigation_id = investigation.id AND id = (p_data->>'clueId')::uuid;
      ELSE RAISE EXCEPTION 'Action inconnue.';
    END CASE;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'postId', i.post_id, 'title', i.title, 'intro', i.intro, 'status', i.status,
      'gmName', coalesce(nullif(btrim(p.pseudo), ''), 'MJ'),
      'isGm', i.gm_id = actor, 'canApprove', is_host,
      'canPlay', is_participant,
      'draft', CASE WHEN i.gm_id = actor AND i.status <> 'published' THEN i.paths END,
      'choices', CASE WHEN i.status = 'published' AND is_participant THEN
        (SELECT jsonb_agg(path->>'label' ORDER BY ord)
         FROM jsonb_array_elements(i.paths) WITH ORDINALITY AS t(path, ord)) END,
      'progress', CASE WHEN progress.path_index IS NOT NULL THEN jsonb_build_object(
        'clue', i.paths->progress.path_index->>'clue',
        'shared', EXISTS (
          SELECT FROM public.rp_investigation_clues c WHERE c.investigation_id = i.id
            AND c.shared_by = actor AND c.path_index = progress.path_index
        )
      ) END,
      'clues', CASE WHEN is_participant OR i.gm_id = actor THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body,
          'pinned', c.path_index IS NULL) ORDER BY (c.path_index IS NULL) DESC, c.created_at)
        FROM public.rp_investigation_clues c WHERE c.investigation_id = i.id
      ), '[]'::jsonb) END
    ) ORDER BY i.created_at)
    FROM public.rp_investigations i
    LEFT JOIN public.profiles p ON p.user_id = i.gm_id
    LEFT JOIN public.rp_investigation_progress progress ON progress.investigation_id = i.id AND progress.player_id = actor
    WHERE i.topic_id = p_topic AND (i.status = 'published' OR i.gm_id = actor OR is_host)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rp_investigation_action(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rp_investigation_action(uuid, text, jsonb) TO authenticated;
