-- =============================================================================
-- Catálogo — MICROTAREFAS DE CADA SERVIÇO (estrutura e funções, SEM DADOS).
-- Base de RH (uetjghdkwbywbftedtth). Cópia para colar à mão: Downloads «SQL 19 - Microtarefas dos servicos 2026-11-25.sql».
-- =============================================================================
--
-- Pedido do Rúben (25/11): «queremos estes serviços e microtarefas na Olyvia, e substituir em todo o lado». As microtarefas (a lista
-- de verificação que o técnico marca na obra) passam a ser dados do Catálogo de cada organização, na ficha de cada serviço.
-- A app propõe-as a partir das tarefas reais da Mudelar no Infraspeak (src/emylia/dados/infraspeakMudelar.ts) e o gestor confirma;
-- depois editam-se na ficha do serviço (separador «Microtarefas»). As obras guardam a sua cópia no plano (estado_emylia), como até aqui.
--
-- O que cria:
--   1. Tabela cat_servico_microtarefas (fechada: RLS ligada, nenhum privilégio para anon nem authenticated; só as funções escrevem):
--        id, organization_id, service_id, ordem (0..), nome, horas, quem, checklist (lista de textos), ref (a tarefa do Infraspeak),
--        created_at, updated_at. Única por (service_id, ordem). Apagar o serviço de vez apaga as microtarefas dele.
--   2. Duas funções SECURITY DEFINER (search_path fixo, filtro por organização dentro de cada uma):
--        cat_ler_microtarefas(p_org)  → {servicos:[{service_id, chave, microtarefas:[{nome,horas,quem,checklist,ref}]}]}
--            Leitura: services.view, ou quem gere ou executa obras (negocios.obra.planear / negocios.obra.executar).
--        cat_guardar_microtarefas(p_org, p_servico, p_lista) → o número de microtarefas gravadas
--            Substitui a lista do serviço (p_lista = [{nome, horas?, quem?, checklist?, ref?}] pela ordem). Lista vazia = sem
--            microtarefas próprias (a app volta à proposta). Escrita: services.edit.
--      Erros: CT001 sem permissão; CT002 dados inválidos; CT003 serviço não encontrado.
--      Tetos: 80 microtarefas por serviço; nome até 200; quem até 80; checklist até 40 pontos de até 1000 caracteres; horas 0..999.
--   3. Nenhum INSERT de dados.
--
-- Impacto: só uma tabela e duas funções novas. Nenhuma tabela, função ou ecrã existente muda. Pode correr-se mais de uma vez.
-- =============================================================================

SET lock_timeout = '5s';

DO $g$
DECLARE v_falta text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Faltam funções (%): esta migration assenta no Catálogo.', v_falta; END IF;
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.services', 'public.anew_organizations']) s
  WHERE to_regclass(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Faltam tabelas (%).', v_falta; END IF;
END $g$;

-- ─── 1. A tabela ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cat_servico_microtarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem >= 0 AND ordem < 80),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 200),
  horas numeric(6,2) CHECK (horas IS NULL OR (horas >= 0 AND horas <= 999)),
  quem text CHECK (quem IS NULL OR char_length(quem) <= 80),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array'),
  ref text CHECK (ref IS NULL OR char_length(ref) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, ordem)
);
CREATE INDEX IF NOT EXISTS cat_servico_microtarefas_org_idx ON public.cat_servico_microtarefas (organization_id, service_id);
ALTER TABLE public.cat_servico_microtarefas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cat_servico_microtarefas FROM anon, authenticated;

-- ─── 2. Ler ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_microtarefas(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['services.view', 'negocios.obra.planear', 'negocios.obra.executar']);
  RETURN jsonb_build_object('servicos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('service_id', s.id, 'chave', s.chave, 'microtarefas', m.lista) ORDER BY s.id)
    FROM public.services s
    JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('nome', x.nome, 'horas', x.horas, 'quem', x.quem, 'checklist', x.checklist, 'ref', x.ref) ORDER BY x.ordem) AS lista
      FROM public.cat_servico_microtarefas x WHERE x.service_id = s.id AND x.organization_id = p_org
    ) m ON m.lista IS NOT NULL
    WHERE s.organization_id = p_org AND NOT s.is_deleted
  ), '[]'::jsonb));
END $$;

-- ─── 3. Gravar (substitui a lista do serviço) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_microtarefas(p_org uuid, p_servico uuid, p_lista jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer := 0; x jsonb; v_nome text; v_horas numeric; v_quem text; v_check jsonb; v_ref text;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.edit');
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_servico AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Serviço não encontrado nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  IF p_lista IS NULL OR jsonb_typeof(p_lista) <> 'array' THEN RAISE EXCEPTION 'A lista de microtarefas tem de ser uma lista.' USING ERRCODE = 'CT002'; END IF;
  IF jsonb_array_length(p_lista) > 80 THEN RAISE EXCEPTION 'No máximo 80 microtarefas por serviço.' USING ERRCODE = 'CT002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cat_microtarefas:' || p_servico::text));
  DELETE FROM public.cat_servico_microtarefas WHERE service_id = p_servico AND organization_id = p_org;
  FOR x IN SELECT value FROM jsonb_array_elements(p_lista) LOOP
    v_nome := btrim(coalesce(x->>'nome', ''));
    IF v_nome = '' OR char_length(v_nome) > 200 THEN RAISE EXCEPTION 'Cada microtarefa precisa de um nome (até 200 caracteres).' USING ERRCODE = 'CT002'; END IF;
    v_horas := CASE WHEN jsonb_typeof(x->'horas') = 'number' THEN (x->>'horas')::numeric END;
    IF v_horas IS NOT NULL AND (v_horas < 0 OR v_horas > 999) THEN RAISE EXCEPTION 'Horas inválidas em «%».', v_nome USING ERRCODE = 'CT002'; END IF;
    v_quem := nullif(btrim(coalesce(x->>'quem', '')), '');
    IF v_quem IS NOT NULL AND char_length(v_quem) > 80 THEN RAISE EXCEPTION 'Quem faz: até 80 caracteres.' USING ERRCODE = 'CT002'; END IF;
    v_check := coalesce(x->'checklist', '[]'::jsonb);
    IF jsonb_typeof(v_check) <> 'array' OR jsonb_array_length(v_check) > 40
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_check) c WHERE jsonb_typeof(c) <> 'string' OR char_length(c #>> '{}') > 1000) THEN
      RAISE EXCEPTION 'A checklist de «%» tem de ser uma lista de até 40 textos.', v_nome USING ERRCODE = 'CT002';
    END IF;
    v_ref := nullif(btrim(coalesce(x->>'ref', '')), '');
    IF v_ref IS NOT NULL AND char_length(v_ref) > 40 THEN RAISE EXCEPTION 'Referência inválida.' USING ERRCODE = 'CT002'; END IF;
    INSERT INTO public.cat_servico_microtarefas (organization_id, service_id, ordem, nome, horas, quem, checklist, ref)
    VALUES (p_org, p_servico, v_n, v_nome, v_horas, v_quem, v_check, v_ref);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.cat_ler_microtarefas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cat_guardar_microtarefas(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_microtarefas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cat_guardar_microtarefas(uuid, uuid, jsonb) TO authenticated;

-- ─── 4. Conferir ───────────────────────────────────────────────────────────────
SELECT 'cat_servico_microtarefas' AS tabela, to_regclass('public.cat_servico_microtarefas') IS NOT NULL AS existe,
       to_regprocedure('public.cat_ler_microtarefas(uuid)') IS NOT NULL AS ler,
       to_regprocedure('public.cat_guardar_microtarefas(uuid,uuid,jsonb)') IS NOT NULL AS gravar;
