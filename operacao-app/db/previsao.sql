-- ============================================================
--  Operações — Previsão: "e se todos estes orçamentos fossem aprovados?"
-- ============================================================
--  Correr DEPOIS de: obras.sql (usa o motor das obras) e orcamentos.sql
--  (ops_orcamento_contrato). Idempotente. SÓ LÊ — não cria obras, não
--  escreve no CRM nem nas Operações.
--
--  Duas RPCs, para o ecrã nunca esperar pelo cálculo pesado todo de uma vez:
--
--   1. rpc_ops_previsao_base(org, dias, horizonte) — rápida:
--        · os orçamentos em aberto sem obra (cabeçalhos: valor, custos das
--          linhas, comercial, contrato), dos últimos `dias`;
--        · a equipa de Operações (função, horas/dia do horário, custo/hora
--          só para quem vê custos, especialidades);
--        · as especialidades, os dias úteis do horizonte (com os feriados da
--          organização) e a carga das obras já planeadas, por especialidade ×
--          dia — para a fila não fingir que a equipa está livre.
--   2. rpc_ops_previsao_expandir(org, ids) — por lotes (máx. 20):
--        cada linha do orçamento cruzada com o modelo do seu serviço, pelo
--        MESMO motor que cria as obras (ops_obra_tarefas_do_orcamento): os
--        passos, minutos (pessoa × minuto), pessoas, especialidade, fase e
--        esperas. As linhas cujo serviço não tem modelo vêm marcadas — é o
--        cruzamento que falhou e há que corrigir em Modelos.
--
--  As contas (duração, pessoas por especialidade, obras em simultâneo, fila,
--  ocupação por semana/mês, margem) fazem-se no ecrã, em
--  src/domain/previsao.ts, a partir destes dados — e testam-se lá.
-- ============================================================


-- ============================================================
-- 0. Ajudas
-- ============================================================
-- Um uuid a partir de texto, sem rebentar (lixo → NULL).
CREATE OR REPLACE FUNCTION public.ops_uuid(_t text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN _t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN _t::uuid END
$$;

REVOKE ALL ON FUNCTION public.ops_uuid(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_uuid(text) TO authenticated, service_role;

-- O nome de um serviço do CRM (só se a tabela existir nesta base).
CREATE OR REPLACE FUNCTION public.ops_previsao_nome_servico(_servico uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v text;
BEGIN
  IF _servico IS NULL OR to_regclass('public.services') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT nullif(btrim(name), '''') FROM public.services WHERE id = $1' INTO v USING _servico;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.ops_previsao_nome_servico(uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 1. A base: orçamentos, equipa, especialidades, calendário, carga atual
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_ops_previsao_base(
  p_org       uuid,
  p_dias      integer DEFAULT 365,
  p_horizonte integer DEFAULT 260
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem     record;
  v_custos   boolean;
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_dias     date[];
  v_desde    date;
  v_media    numeric;
  v_orcs     jsonb;
  v_equipa   jsonb;
  v_skills   jsonb;
  v_carga    jsonb;
  v_horario  boolean;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.view', ARRAY['gestor'], 'Só quem planeia vê a previsão.');

  v_custos := public.ops_pode(p_org, 'operations.costs.view');
  v_desde  := v_hoje - LEAST(GREATEST(COALESCE(p_dias, 365), 7), 1095);
  v_dias   := public.ops_obra_dias_uteis_lista(p_org, v_hoje,
                LEAST(GREATEST(COALESCE(p_horizonte, 260), 20), 520));

  SELECT avg(custo_hora) INTO v_media FROM public.ops_utilizador_perfil
   WHERE organization_id = p_org AND ativo AND custo_hora IS NOT NULL;

  -- Os orçamentos em aberto e sem obra. Colunas do CRM que podem não existir
  -- nesta base (assigned_to, subtotal, …) leem-se por to_jsonb, sem rebentar.
  WITH q0 AS (
    SELECT q.id, q.organization_id, q.cliente_id, q.quote_number, q.title, q.estado,
           q.accepted_at, q.total, to_jsonb(q) AS j,
           COALESCE(q.accepted_at, (to_jsonb(q)->>'created_at')::timestamptz) AS data_ref
      FROM public.quotes q
     WHERE q.organization_id = p_org
       AND q.deleted_at IS NULL
       AND COALESCE(q.estado, 'rascunho') NOT IN ('rejeitado','perdido','cancelado','anulado')
       AND NOT EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.orcamento_id = q.id)
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra o
                        WHERE o.orcamento_id = q.id AND o.estado <> 'cancelada')
  ), q AS (
    -- Primeiro o período e o limite; só depois se procura o contrato de cada um.
    SELECT * FROM q0
     WHERE q0.data_ref IS NULL OR q0.data_ref::date >= v_desde
     ORDER BY q0.data_ref DESC NULLS LAST
     LIMIT 300
  ), q2 AS (
    SELECT q.*,
           ct.contrato_id, ct.numero AS contrato_numero, ct.estado AS contrato_estado,
           COALESCE(ct.assinado, false) AS contratado
      FROM q
      LEFT JOIN LATERAL public.ops_orcamento_contrato(q.id) ct ON true
     -- O contrato deste orçamento já deu obra (pela Nova obra → contrato)?
     WHERE ct.contrato_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.ops_obra o
                        WHERE o.contrato_id = ct.contrato_id AND o.estado <> 'cancelada')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'numero', COALESCE(x.quote_number, '—'),
           'titulo', COALESCE(nullif(btrim(x.title), ''), 'Sem título'),
           'estado', COALESCE(x.estado, 'rascunho'),
           'cliente_id', x.cliente_id,
           'data', x.data_ref,
           'aceite_em', x.accepted_at,
           'comercial_id', u.id,
           'comercial_nome', u.name,
           'total', x.total,
           -- Sem IVA: subtotal + taxas, se o CRM os tiver; senão a soma das linhas.
           'valor_sem_iva', COALESCE(
               public.ops_num(x.j->>'subtotal') + COALESCE(public.ops_num(x.j->>'total_fees'), 0),
               l.total_sem_iva),
           'custo_material', CASE WHEN v_custos THEN l.material END,
           'mao_obra_orcada', CASE WHEN v_custos THEN l.mao_obra END,
           'linhas', l.n,
           'contrato_id', x.contrato_id,
           'contrato_numero', x.contrato_numero,
           'contrato_estado', x.contrato_estado,
           'contratado', x.contratado)
         ORDER BY x.data_ref DESC NULLS LAST), '[]'::jsonb)
    INTO v_orcs
    FROM q2 x
    LEFT JOIN public.anew_users u
      ON u.id = COALESCE(public.ops_uuid(x.j->>'assigned_to'), public.ops_uuid(x.j->>'created_by'))
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n,
             round(COALESCE(sum(COALESCE(ql.custo_material_unit, 0) * COALESCE(ql.qt, 1)), 0), 2) AS material,
             round(COALESCE(sum(COALESCE(ql.custo_mao_obra_unit, 0) * COALESCE(ql.qt, 1)), 0), 2) AS mao_obra,
             round(COALESCE(sum(ql.total_sem_iva), 0), 2) AS total_sem_iva
        FROM public.quote_lines ql WHERE ql.quote_id = x.id
    ) l ON true;

  -- A equipa: perfis ativos de Operações nesta organização.
  v_horario := EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'ops_utilizador_perfil'
                          AND column_name = 'horario_id')
               AND to_regclass('public.ops_horario') IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'utilizador_id', p.utilizador_id,
           'nome', COALESCE(u.name, 'Sem nome'),
           'funcao', p.funcao,
           'horas_dia', COALESCE(h.horas_dia, 8),
           'custo_hora', CASE WHEN v_custos THEN p.custo_hora END,
           'skills', COALESCE((SELECT jsonb_agg(us.skill_id ORDER BY s.nome)
                                 FROM public.ops_utilizador_skill us
                                 JOIN public.ops_skill s ON s.id = us.skill_id
                                WHERE us.utilizador_id = p.utilizador_id
                                  AND s.organization_id = p_org AND s.ativo), '[]'::jsonb))
         ORDER BY u.name NULLS LAST), '[]'::jsonb)
    INTO v_equipa
    FROM public.ops_utilizador_perfil p
    LEFT JOIN public.anew_users u ON u.id = p.utilizador_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN v_horario THEN (
               SELECT hh.horas_dia FROM public.ops_horario hh
                WHERE hh.id = public.ops_uuid(to_jsonb(p)->>'horario_id')) END AS horas_dia
    ) h ON true
   WHERE p.organization_id = p_org AND p.ativo;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) ORDER BY s.nome), '[]'::jsonb)
    INTO v_skills
    FROM public.ops_skill s WHERE s.organization_id = p_org AND s.ativo;

  -- A carga das obras já planeadas: o que falta de cada tarefa, espalhado
  -- pelos dias úteis entre o início e o fim planeados (o que já devia ter
  -- acabado cai no 1.º dia). Mesma regra da página da capacidade.
  WITH t AS (
    SELECT t.skill_id,
           GREATEST(t.inicio_planeado, v_hoje) AS ini,
           GREATEST(COALESCE(t.fim_planeado, t.inicio_planeado), v_hoje) AS fim,
           CASE WHEN t.estado = 'em_curso'
                THEN GREATEST(t.minutos_previstos - public.ops_obra_minutos_reais(t.id),
                              0.25 * t.minutos_previstos)
                ELSE t.minutos_previstos END::numeric AS resto
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra o ON o.id = t.obra_id AND o.estado IN ('planeada','em_curso')
     WHERE t.organization_id = p_org
       AND t.estado IN ('por_fazer','em_curso','rejeitada')
       AND t.inicio_planeado IS NOT NULL
  ), d AS (
    SELECT t.skill_id, t.resto,
           COALESCE(NULLIF(ARRAY(SELECT x FROM unnest(v_dias) x WHERE x BETWEEN t.ini AND t.fim), '{}'),
                    ARRAY(SELECT x FROM unnest(v_dias) x WHERE x >= t.ini ORDER BY x LIMIT 1)) AS dias
      FROM t WHERE t.resto > 0
  ), e AS (
    SELECT d.skill_id, x AS dia, d.resto / cardinality(d.dias) AS minutos
      FROM d, unnest(d.dias) x
     WHERE cardinality(d.dias) > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('skill_id', s.skill_id, 'dia', s.dia,
                                               'minutos', round(s.minutos, 1))
                            ORDER BY s.dia), '[]'::jsonb)
    INTO v_carga
    FROM (SELECT skill_id, dia, sum(minutos) AS minutos FROM e GROUP BY skill_id, dia) s;

  RETURN jsonb_build_object(
    'hoje', v_hoje,
    've_custos', v_custos,
    'custo_hora_medio', CASE WHEN v_custos THEN round(v_media, 2) END,
    'orcamentos', v_orcs,
    'equipa', v_equipa,
    'skills', v_skills,
    'dias_uteis', to_jsonb(v_dias),
    'carga_atual', v_carga);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_previsao_base(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_previsao_base(uuid, integer, integer) TO authenticated, service_role;


-- ============================================================
-- 2. O cruzamento: linhas do orçamento × modelos dos serviços
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_ops_previsao_expandir(p_org uuid, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem record;
  v_id   uuid;
  v_res  jsonb := '[]'::jsonb;
  v_um   jsonb;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.view', ARRAY['gestor'], 'Só quem planeia vê a previsão.');

  IF cardinality(p_ids) > 20 THEN
    RAISE EXCEPTION 'No máximo 20 orçamentos de cada vez.';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_ids, '{}') LOOP
    -- Só orçamentos desta organização; os outros ignoram-se em silêncio
    -- (não se diz nada sobre orçamentos alheios).
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.quotes q
                               WHERE q.id = v_id AND q.organization_id = p_org AND q.deleted_at IS NULL);

    WITH t AS (
      SELECT * FROM public.ops_obra_tarefas_do_orcamento(v_id)
    ), l AS (
      SELECT ql.id, COALESCE(ql.ordem, 0) AS ordem, COALESCE(ql.qt, 1) AS qt, ql.unidade,
             COALESCE(nullif(btrim(ql.item_description), ''), nullif(btrim(ql.descricao_snapshot), ''),
                      'Linha sem descrição') AS descricao,
             public.ops_uuid(to_jsonb(ql)->>'service_id') AS servico_id
        FROM public.quote_lines ql WHERE ql.quote_id = v_id
    )
    SELECT jsonb_build_object(
             'id', v_id,
             'linhas', COALESCE(jsonb_agg(jsonb_build_object(
               'id', l.id,
               'ordem', l.ordem,
               'descricao', l.descricao,
               'qt', l.qt,
               'unidade', l.unidade,
               'servico_id', l.servico_id,
               'servico_nome', public.ops_previsao_nome_servico(l.servico_id),
               -- Como a linha cruzou com os modelos:
               --   modelo      = o serviço tem modelo de tarefas (passos)
               --   ficha       = sem modelo; tempo da ficha técnica do serviço
               --   sem_ficha   = sem modelo nem horas na ficha (60 min por defeito)
               --   nao_planeia = o serviço não é trabalho no local, ou só dá medidas
               --   sem_servico = produto ou linha livre: não é trabalho, não cruza
               'cruzamento', CASE
                   WHEN l.servico_id IS NULL THEN 'sem_servico'
                   WHEN p.com_modelo THEN 'modelo'
                   WHEN p.sem_ficha THEN 'sem_ficha'
                   WHEN p.n > 0 THEN 'ficha'
                   ELSE 'nao_planeia' END,
               'passos', p.passos)
               ORDER BY l.ordem, l.id), '[]'::jsonb))
      INTO v_um
      FROM l
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS n,
               COALESCE(bool_or(x.com_modelo), false) AS com_modelo,
               COALESCE(bool_or(x.sem_ficha), false) AS sem_ficha,
               COALESCE(jsonb_agg(jsonb_build_object(
                          'fase', x.fase, 'nome', x.nome, 'minutos', x.minutos,
                          'pessoas', x.pessoas, 'skill_id', x.skill_id,
                          'espera_antes_horas', COALESCE(x.espera_antes_horas, 0),
                          'origem', x.minutos_origem)
                        ORDER BY x.fase, x.ordem), '[]'::jsonb) AS passos
          FROM t x WHERE x.orcamento_linha_id = l.id
      ) p;

    v_res := v_res || jsonb_build_array(COALESCE(v_um, jsonb_build_object('id', v_id, 'linhas', '[]'::jsonb)));
  END LOOP;

  RETURN jsonb_build_object('orcamentos', v_res);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_previsao_expandir(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_previsao_expandir(uuid, uuid[]) TO authenticated, service_role;
