-- A obra do Negócio na base, com os técnicos do RH (28/10/2026). Primeira entrega da Fase 3 (docs/14 e docs/17).
--
-- O problema: no /negocios (e no Pipeline) a obra, o plano e quem faz cada tarefa viviam só no motor da Emylia, em memória. Perdiam-se
-- ao recarregar, a agenda da equipa não via as obras de outro aparelho e o RH não sabia em que obra está cada técnico. As tarefas das
-- Operações (ops_obra_tarefa_pessoa, ops_ordem_pessoa) só se atribuem por utilizador_id (conta na app) e as pessoas do RH não têm conta.
--
-- Decidido pelo Rúben (28/10): o técnico liga-se à tarefa pela pessoa do RH (pessoa_id), numa tabela nova. O motor das Operações e as
-- tabelas por utilizador_id ficam como estão: quem tem conta continua a funcionar como hoje.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. ops_obra.negocio_id      a obra sabe de que negócio é (uma obra por negócio).
--      ops_obra.estado_emylia   a obra do motor tal como está (plano, execução, diário, imprevistos, auto…), para a ida e volta sem
--                               perder nada. As colunas e as tabelas ops_* são a projeção que os outros módulos leem.
--   2. ops_obra_tarefa_rh       a tarefa e a pessoa do RH que a faz. Lê-se com pessoas.view ou hr.pessoas.laborais.view. Escreve-se só
--                               pela função.
--   3. obra_guardar_negocio     grava a obra de um negócio: cria-a na primeira vez (código OB-<número>), atualiza o estado e as datas,
--                               as fases (ops_obra_fase), as tarefas (ops_obra_tarefa, pela chave) e quem as faz (ops_obra_tarefa_rh).
--                               Pede pessoas.edit (a mesma de neg_guardar_negocio). Um técnico que não é pessoa do RH desta
--                               organização não se grava (aviso). Sem cargo técnico ou sem o ofício da tarefa, grava-se com aviso.
--   4. obra_ler_negocios        a obra de cada negócio da organização (pessoas.view), para o motor.
--   5. rh_agenda_tecnicos       a agenda dos técnicos num intervalo: nome, ofícios, as tarefas (obra, negócio, morada, dias, horas por
--                               dia) e os dias indisponíveis (ausências aprovadas, sem o tipo). Pede pessoas.view ou
--                               hr.pessoas.laborais.view.
--
-- Erros: CT001 sem permissão (fn_cat_exigir); CT002 dados inválidos; NE003 negócio não encontrado nesta organização.
-- Depende de: 20261231900000 (ops_obra*), 20261231940000 (negocios.numero), 20261231998000 (fn_rh_pessoa_tecnica, fn_rh_oficios_efetivos).

SET lock_timeout = '5s';

-- ------------------------------------------------------------------ 1. a obra sabe de que negócio é
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS negocio_id uuid REFERENCES public.negocios(id);
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS estado_emylia jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_negocio_key ON public.ops_obra (negocio_id) WHERE negocio_id IS NOT NULL;
COMMENT ON COLUMN public.ops_obra.negocio_id IS 'O negócio de onde nasceu a obra (uma por negócio). Grava-se por obra_guardar_negocio.';
COMMENT ON COLUMN public.ops_obra.estado_emylia IS 'A obra do motor da Emylia como está (plano, execução, diário…). As colunas e as tabelas ops_obra_* são a projeção.';

-- ------------------------------------------------------------------ 2. quem faz cada tarefa (pessoa do RH)
CREATE TABLE IF NOT EXISTS public.ops_obra_tarefa_rh (
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  tarefa_id uuid NOT NULL REFERENCES public.ops_obra_tarefa(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL,
  atribuida_em timestamptz NOT NULL DEFAULT now(),
  atribuida_por uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT ops_obra_tarefa_rh_pkey PRIMARY KEY (tarefa_id, pessoa_id),
  CONSTRAINT ops_obra_tarefa_rh_pessoa_fkey FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_rh_pessoa_idx ON public.ops_obra_tarefa_rh (organization_id, pessoa_id);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_rh_obra_idx ON public.ops_obra_tarefa_rh (obra_id);
COMMENT ON TABLE public.ops_obra_tarefa_rh IS 'A tarefa da obra e a pessoa do RH que a faz (sem precisar de conta na app). Escreve-se só por obra_guardar_negocio.';

ALTER TABLE public.ops_obra_tarefa_rh ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_obra_tarefa_rh_ler ON public.ops_obra_tarefa_rh;
CREATE POLICY ops_obra_tarefa_rh_ler ON public.ops_obra_tarefa_rh FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id))
      OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id)));
-- sem políticas de escrita: grava-se só por obra_guardar_negocio
REVOKE ALL ON public.ops_obra_tarefa_rh FROM anon, authenticated;
GRANT SELECT ON public.ops_obra_tarefa_rh TO authenticated;
GRANT ALL ON public.ops_obra_tarefa_rh TO service_role;

-- ------------------------------------------------------------------ 3. gravar a obra de um negócio
-- p_obra: { estado, titulo, morada, inicio ('aaaa-mm-dd'), fases: [{ordem, nome}], tarefas: [{chave, ordem, nome, fase, perfil, minutos,
--          pessoas, inicio, fim, estado, pessoa}], emylia: {…} }. Sem `tarefas` (o motor não tem plano): a obra que já existir fica cancelada e
--          ninguém fica com a agenda ocupada; se não existir, não se cria.
CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'pessoas.edit');
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnica(p_org, v_pessoa) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem um cargo técnico de obra no RH.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $$;
REVOKE ALL ON FUNCTION public.obra_guardar_negocio(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obra_guardar_negocio(uuid, uuid, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------------ 4. ler as obras dos negócios
CREATE OR REPLACE FUNCTION public.obra_ler_negocios(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('negocio_id', o.negocio_id, 'obra_id', o.id, 'codigo', o.codigo, 'estado', o.estado,
                                        'emylia', o.estado_emylia) ORDER BY o.criada_em)
    FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL
    WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.obra_ler_negocios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obra_ler_negocios(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ 5. a agenda dos técnicos
-- Os técnicos: as pessoas técnicas (cargo técnico de obra) e quem tiver tarefas no intervalo. As horas por dia são os minutos da tarefa
-- repartidos pelas pessoas do ofício na tarefa (a equipa do orçamento) e pelos dias úteis (segunda a sexta) entre o início e o fim (um
-- feriado a meio conta como dia: a Emylia salta-o, por isso aí a base dá um pouco menos por dia). Os dias indisponíveis são as ausências aprovadas, sem o tipo.
CREATE OR REPLACE FUNCTION public.rh_agenda_tecnicos(p_org uuid, p_de date, p_ate date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_org IS NULL OR NOT (public.is_system_admin_user(auth.uid())
      OR public.has_anew_permission_in_org(auth.uid(), 'pessoas.view', p_org)
      OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.view', p_org)) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view ou hr.pessoas.laborais.view).' USING ERRCODE = 'CT001';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_ate - p_de > 400 THEN
    RAISE EXCEPTION 'Intervalo inválido (até 400 dias).' USING ERRCODE = 'CT002';
  END IF;

  RETURN coalesce((
    WITH tar AS (
      SELECT r.pessoa_id, t.id, t.nome, t.inicio_planeado AS inicio, coalesce(t.fim_planeado, t.inicio_planeado) AS fim,
             t.minutos_previstos, t.pessoas_previstas, t.estado, k.nome AS oficio, o.id AS obra_id, o.codigo, o.titulo, o.morada, o.estado AS obra_estado,
             n.numero AS negocio_numero
      FROM ops_obra_tarefa_rh r
      JOIN ops_obra_tarefa t ON t.id = r.tarefa_id
      JOIN ops_obra o ON o.id = r.obra_id AND o.organization_id = p_org
      LEFT JOIN negocios n ON n.id = o.negocio_id
      LEFT JOIN ops_skill k ON k.id = t.skill_id
      WHERE r.organization_id = p_org AND o.estado <> 'cancelada'
        AND t.inicio_planeado IS NOT NULL AND t.inicio_planeado <= p_ate AND coalesce(t.fim_planeado, t.inicio_planeado) >= p_de
    ),
    tec AS (
      SELECT p.id, p.nome_completo FROM pessoas p
      WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND public.fn_rh_pessoa_tecnica(p_org, p.id)
      UNION
      SELECT p.id, p.nome_completo FROM pessoas p WHERE p.id IN (SELECT pessoa_id FROM tar)
    )
    SELECT jsonb_agg(jsonb_build_object(
      'pessoa_id', tec.id,
      'nome', tec.nome_completo,
      'oficios', coalesce((SELECT jsonb_agg(k.nome ORDER BY k.nome) FROM public.fn_rh_oficios_efetivos(p_org, tec.id) e
                           JOIN ops_skill k ON k.id = e.skill_id), '[]'::jsonb),
      'tarefas', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'tarefa_id', x.id, 'nome', x.nome, 'oficio', x.oficio, 'inicio', x.inicio, 'fim', x.fim, 'estado', x.estado,
                    'minutos', x.minutos_previstos, 'pessoas', x.pessoas_previstas,
                    'horas_dia', round(x.minutos_previstos / 60.0 / greatest(1, x.pessoas_previstas) / greatest(1, (SELECT count(*) FROM generate_series(x.inicio, x.fim, interval '1 day') d
                                                                                  WHERE extract(isodow FROM d) < 6)), 2),
                    'obra_id', x.obra_id, 'obra_codigo', x.codigo, 'obra_titulo', x.titulo, 'morada', x.morada, 'obra_estado', x.obra_estado,
                    'negocio_numero', x.negocio_numero) ORDER BY x.inicio, x.nome)
                   FROM tar x WHERE x.pessoa_id = tec.id), '[]'::jsonb),
      'indisponivel', coalesce((SELECT jsonb_agg(jsonb_build_object('data', a.data, 'fraccao', a.fraccao_dia) ORDER BY a.data)
                                FROM pessoas_ausencias_dias a
                                WHERE a.organization_id = p_org AND a.pessoa_id = tec.id AND a.estado = 'aprovado'
                                  AND a.data BETWEEN p_de AND p_ate), '[]'::jsonb)
    ) ORDER BY tec.nome_completo)
    FROM tec), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.rh_agenda_tecnicos(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_agenda_tecnicos(uuid, date, date) TO authenticated, service_role;
