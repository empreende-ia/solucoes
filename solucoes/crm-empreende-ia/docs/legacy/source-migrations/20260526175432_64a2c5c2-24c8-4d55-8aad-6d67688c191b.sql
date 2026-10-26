
-- ====== Tabelas ======
CREATE TABLE public.distribution_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  name          text NOT NULL,
  source        text NOT NULL DEFAULT 'all', -- meta_ads | inbound_webhook | manual | all
  priority      int  NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  match_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  strategy      text NOT NULL DEFAULT 'round_robin', -- round_robin | weighted | team_then_round_robin
  scope_type    text NOT NULL DEFAULT 'org',         -- org | directorate | team | custom
  scope_id      uuid,
  fallback_owner_id uuid,
  state         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_rules TO authenticated;
GRANT ALL ON public.distribution_rules TO service_role;

ALTER TABLE public.distribution_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view distribution rules"
  ON public.distribution_rules FOR SELECT
  USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Admins manage distribution rules ins"
  ON public.distribution_rules FOR INSERT
  WITH CHECK (has_role(auth.uid(), org_id, 'owner'::app_role) OR has_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins manage distribution rules upd"
  ON public.distribution_rules FOR UPDATE
  USING (has_role(auth.uid(), org_id, 'owner'::app_role) OR has_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins manage distribution rules del"
  ON public.distribution_rules FOR DELETE
  USING (has_role(auth.uid(), org_id, 'owner'::app_role) OR has_role(auth.uid(), org_id, 'admin'::app_role));


CREATE TABLE public.distribution_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid NOT NULL REFERENCES public.distribution_rules(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  weight        int  NOT NULL DEFAULT 1,
  is_paused     boolean NOT NULL DEFAULT false,
  position      int  NOT NULL DEFAULT 0,
  last_assigned_at timestamptz,
  assigned_count int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, user_id)
);

CREATE INDEX idx_dist_participants_rule ON public.distribution_participants(rule_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_participants TO authenticated;
GRANT ALL ON public.distribution_participants TO service_role;

ALTER TABLE public.distribution_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view distribution participants"
  ON public.distribution_participants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.distribution_rules r
    WHERE r.id = distribution_participants.rule_id
      AND user_belongs_to_org(auth.uid(), r.org_id)
  ));

CREATE POLICY "Admins manage distribution participants ins"
  ON public.distribution_participants FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.distribution_rules r
    WHERE r.id = distribution_participants.rule_id
      AND (has_role(auth.uid(), r.org_id, 'owner'::app_role) OR has_role(auth.uid(), r.org_id, 'admin'::app_role))
  ));

CREATE POLICY "Admins manage distribution participants upd"
  ON public.distribution_participants FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.distribution_rules r
    WHERE r.id = distribution_participants.rule_id
      AND (has_role(auth.uid(), r.org_id, 'owner'::app_role) OR has_role(auth.uid(), r.org_id, 'admin'::app_role))
  ));

CREATE POLICY "Admins manage distribution participants del"
  ON public.distribution_participants FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.distribution_rules r
    WHERE r.id = distribution_participants.rule_id
      AND (has_role(auth.uid(), r.org_id, 'owner'::app_role) OR has_role(auth.uid(), r.org_id, 'admin'::app_role))
  ));

CREATE TRIGGER trg_distribution_rules_updated_at
  BEFORE UPDATE ON public.distribution_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ====== Função: escolhe próximo participante ======
CREATE OR REPLACE FUNCTION public._pick_next_participant(_rule_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_strategy text;
  v_cursor   uuid;
  v_pick     uuid;
  v_min_ratio numeric;
BEGIN
  SELECT strategy, (state->>'cursor')::uuid
  INTO v_strategy, v_cursor
  FROM public.distribution_rules WHERE id = _rule_id;

  IF v_strategy = 'weighted' THEN
    -- Escolhe quem tem menor (assigned_count / weight) entre ativos
    SELECT user_id INTO v_pick
    FROM public.distribution_participants
    WHERE rule_id = _rule_id AND is_paused = false AND weight > 0
    ORDER BY (assigned_count::numeric / GREATEST(weight,1)) ASC, last_assigned_at ASC NULLS FIRST, position ASC
    LIMIT 1;
  ELSE
    -- round_robin (também usado como base para team_then_round_robin neste MVP):
    -- próximo na ordem após o cursor; se não houver, volta ao primeiro.
    WITH ordered AS (
      SELECT user_id, position,
             row_number() OVER (ORDER BY position ASC, user_id ASC) AS rn
      FROM public.distribution_participants
      WHERE rule_id = _rule_id AND is_paused = false
    ),
    cursor_pos AS (
      SELECT rn FROM ordered WHERE user_id = v_cursor LIMIT 1
    )
    SELECT user_id INTO v_pick
    FROM ordered
    WHERE rn > COALESCE((SELECT rn FROM cursor_pos), 0)
    ORDER BY rn ASC
    LIMIT 1;

    IF v_pick IS NULL THEN
      SELECT user_id INTO v_pick
      FROM public.distribution_participants
      WHERE rule_id = _rule_id AND is_paused = false
      ORDER BY position ASC, user_id ASC
      LIMIT 1;
    END IF;
  END IF;

  RETURN v_pick;
END;
$$;


-- ====== Função pública: atribuir lead ======
CREATE OR REPLACE FUNCTION public.assign_lead_owner(_org_id uuid, _source text, _context jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_pick uuid;
BEGIN
  -- Itera regras ativas por prioridade até encontrar um match
  FOR v_rule IN
    SELECT *
    FROM public.distribution_rules
    WHERE org_id = _org_id
      AND is_active = true
      AND (source = _source OR source = 'all')
    ORDER BY priority ASC, created_at ASC
  LOOP
    -- Avalia match_conditions: cada chave do match_conditions deve estar contida em _context (valores como array de candidatos)
    -- Se vazio, sempre bate.
    IF v_rule.match_conditions <> '{}'::jsonb THEN
      DECLARE
        v_ok boolean := true;
        v_key text;
        v_allowed jsonb;
        v_val text;
      BEGIN
        FOR v_key IN SELECT jsonb_object_keys(v_rule.match_conditions) LOOP
          v_allowed := v_rule.match_conditions -> v_key;
          v_val := _context ->> v_key;
          IF v_val IS NULL OR NOT (v_allowed ? v_val) THEN
            v_ok := false;
            EXIT;
          END IF;
        END LOOP;
        IF NOT v_ok THEN CONTINUE; END IF;
      END;
    END IF;

    v_pick := public._pick_next_participant(v_rule.id);

    IF v_pick IS NOT NULL THEN
      UPDATE public.distribution_rules
      SET state = jsonb_set(state, '{cursor}', to_jsonb(v_pick::text), true),
          updated_at = now()
      WHERE id = v_rule.id;

      UPDATE public.distribution_participants
      SET last_assigned_at = now(),
          assigned_count = assigned_count + 1
      WHERE rule_id = v_rule.id AND user_id = v_pick;

      RETURN v_pick;
    ELSIF v_rule.fallback_owner_id IS NOT NULL THEN
      RETURN v_rule.fallback_owner_id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_lead_owner(uuid, text, jsonb) TO authenticated, service_role;


-- ====== Função: simular distribuição (dry-run) ======
CREATE OR REPLACE FUNCTION public.simulate_distribution(_rule_id uuid, _count int DEFAULT 10)
RETURNS TABLE(step int, user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_strategy text;
  v_participants RECORD;
  v_cursor_idx int := 0;
  v_total int;
  v_i int;
  v_weights int[];
  v_counts int[];
  v_users uuid[];
  v_pick uuid;
  v_min_ratio numeric;
  v_min_idx int;
  v_j int;
BEGIN
  SELECT org_id, strategy INTO v_org, v_strategy
  FROM public.distribution_rules WHERE id = _rule_id;

  IF NOT (has_role(auth.uid(), v_org, 'owner'::app_role)
       OR has_role(auth.uid(), v_org, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT array_agg(user_id ORDER BY position, user_id),
         array_agg(weight   ORDER BY position, user_id)
  INTO v_users, v_weights
  FROM public.distribution_participants
  WHERE rule_id = _rule_id AND is_paused = false AND weight > 0;

  IF v_users IS NULL OR array_length(v_users, 1) = 0 THEN
    RETURN;
  END IF;

  v_total := array_length(v_users, 1);
  v_counts := array_fill(0, ARRAY[v_total]);

  FOR v_i IN 1.._count LOOP
    IF v_strategy = 'weighted' THEN
      -- pick smallest counts/weights ratio
      v_min_idx := 1;
      v_min_ratio := v_counts[1]::numeric / GREATEST(v_weights[1],1);
      FOR v_j IN 2..v_total LOOP
        IF (v_counts[v_j]::numeric / GREATEST(v_weights[v_j],1)) < v_min_ratio THEN
          v_min_ratio := v_counts[v_j]::numeric / GREATEST(v_weights[v_j],1);
          v_min_idx := v_j;
        END IF;
      END LOOP;
      v_pick := v_users[v_min_idx];
      v_counts[v_min_idx] := v_counts[v_min_idx] + 1;
    ELSE
      v_cursor_idx := (v_cursor_idx % v_total) + 1;
      v_pick := v_users[v_cursor_idx];
    END IF;

    step := v_i;
    user_id := v_pick;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulate_distribution(uuid, int) TO authenticated;


-- ====== Trigger em contacts: roda RR quando owner_id é nulo ======
CREATE OR REPLACE FUNCTION public.contacts_apply_round_robin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_owner uuid;
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_source := COALESCE(NEW.fonte, 'manual');
  -- Normaliza fontes conhecidas
  IF v_source = 'meta_ads' THEN v_source := 'meta_ads';
  ELSIF v_source IN ('webhook','inbound','site') THEN v_source := 'inbound_webhook';
  ELSIF v_source IS NULL THEN v_source := 'manual';
  END IF;

  v_owner := public.assign_lead_owner(
    NEW.org_id,
    v_source,
    jsonb_build_object(
      'campaign_id', NEW.fonte_campanha_id,
      'ad_id', NEW.fonte_ad_id,
      'bairro', NEW.bairro_desejado,
      'tipologia', NEW.tipologia_interesse
    )
  );

  IF v_owner IS NOT NULL THEN
    NEW.owner_id := v_owner;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contacts_round_robin
  BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_apply_round_robin();
