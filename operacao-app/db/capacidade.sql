-- =============================================================================
-- Operações — Capacidade: a procura (obras + comercial) contra a equipa
--
-- Corre DEPOIS de db/obras.sql. Idempotente. Só LÊ o CRM; escreve uma linha
-- de cache em ops_capacidade_cache (tabela das Operações).
--
-- Para cada especialidade × semana (12 semanas a partir desta, por defeito):
--
--   OFERTA  = Σ pessoas ativas (técnico/operador) com a especialidade
--             × dias úteis da semana (sem feriados da organização nem
--               ausências aprovadas: resource_time_off e, quando existir, o RH
--               pessoas_ausencias_dias)
--             × minutos por dia (o horário da pessoa, ops_horario.horas_dia;
--               senão 480)
--             ÷ n.º de especialidades da pessoa (quem faz 3 ofícios conta
--               1/3 em cada — não se conta a mesma hora três vezes).
--
--   PROCURA = (pessoa × minuto, como minutos_previstos)
--     1. obras planeadas / em curso: as tarefas por fazer, rejeitadas e em
--        curso (estas só o que falta: previsto − real, mínimo 25 %),
--        espalhadas pelos dias úteis entre o início e o fim planeados. O que
--        já devia ter acabado e não acabou cai na semana atual ("atrasado").
--        Certeza: 100 %.
--     2. contratos assinados sem obra (início ≥ hoje − 30 dias, ou sem
--        data): expandidos pelos modelos dos serviços
--        (ops_obra_tarefas_do_orcamento — o mesmo motor da Nova obra).
--        Começam em max(data de início do contrato, hoje + 7). Certeza: 100 %.
--     3. orçamentos ACEITES sem contrato nem obra (últimos 120 dias):
--        × 90 %, começam 30 dias depois de aceites (nunca antes de hoje + 14).
--     4. orçamentos ENVIADOS (últimos 60 dias, um por proposta/negócio — o
--        mais recente; sem os de propostas rejeitadas/aceites):
--        × probabilidade (da proposta; senão do negócio; senão 50 %);
--        começam na data prevista de fecho do negócio + 21 dias, senão
--        45 dias depois de enviados (nunca antes de hoje + 14). No máximo
--        os 150 mais recentes.
--     Para 2–4 a duração é a do trabalho com uma equipa de 2 pessoas
--     (mín. 5 dias úteis), e as fases seguem-se pela ordem (demolições
--     primeiro, acabamentos no fim), cada uma com a sua parte do tempo.
--
-- Semáforo (no ecrã): ocupação = procura ÷ oferta — ≤ 85 % folga,
-- 85–100 % apertado, > 100 % falta gente ("faltam ~N pessoas").
--
-- O cálculo é pesado (expande dezenas de orçamentos), por isso fica em
-- cache 6 horas por organização; "Recalcular" força.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_capacidade_cache (
  organization_id uuid PRIMARY KEY,
  inicio          date NOT NULL,
  semanas         integer NOT NULL,
  calculado_em    timestamptz NOT NULL DEFAULT now(),
  calculado_por   uuid,
  dados           jsonb NOT NULL
);
ALTER TABLE public.ops_capacidade_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_capacidade_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ops_capacidade_cache TO service_role;


-- Dias de ausência aprovados por pessoa no intervalo (só os de Operações
-- desta organização). Dinâmico: instala numa base sem estas tabelas.
CREATE OR REPLACE FUNCTION public.ops_capacidade_ausencias(_org uuid, _ini date, _fim date)
RETURNS TABLE (utilizador_id uuid, dia date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF to_regclass('public.resource_time_off') IS NOT NULL AND to_regclass('public.schedule_resources') IS NOT NULL THEN
    RETURN QUERY EXECUTE $q$
      SELECT DISTINCT sr.user_id, g.d::date
        FROM public.resource_time_off o
        JOIN public.schedule_resources sr ON sr.id = o.resource_id
        JOIN public.ops_utilizador_perfil p ON p.utilizador_id = sr.user_id AND p.organization_id = $1
        CROSS JOIN LATERAL generate_series(GREATEST(o.start_date, $2), LEAST(o.end_date, $3), interval '1 day') g(d)
       WHERE sr.user_id IS NOT NULL AND COALESCE(o.approved, false)
         AND o.start_date <= $3 AND o.end_date >= $2
    $q$ USING _org, _ini, _fim;
  END IF;

  IF to_regclass('public.pessoas_ausencias_dias') IS NOT NULL AND to_regclass('public.pessoas_contas') IS NOT NULL THEN
    RETURN QUERY EXECUTE $q$
      SELECT DISTINCT pc.anew_user_id, d.data
        FROM public.pessoas_ausencias_dias d
        JOIN public.pessoas_contas pc
          ON pc.pessoa_id = d.pessoa_id AND pc.organization_id = d.organization_id AND pc.estado = 'activa'
       WHERE d.organization_id = $1 AND d.estado = 'aprovado' AND d.data BETWEEN $2 AND $3
    $q$ USING _org, _ini, _fim;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.ops_capacidade_ausencias(uuid, date, date) FROM PUBLIC, anon, authenticated;


-- O cálculo. Sem verificação de quem chama (é a RPC que verifica).
DROP FUNCTION IF EXISTS public.ops_capacidade_calcular(uuid, date, integer);
-- `_ms_max`: tempo máximo a expandir orçamentos (o pedido do ecrã tem 8 s no
-- Supabase); o que ficar por expandir conta em resumo.por_expandir. O cron
-- passa muito mais.
CREATE OR REPLACE FUNCTION public.ops_capacidade_calcular(_org uuid, _inicio date, _semanas integer,
                                                          _ms_max integer DEFAULT 4000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje    date := COALESCE(_inicio, (now() AT TIME ZONE 'Europe/Lisbon')::date);
  v_sem     integer := LEAST(GREATEST(COALESCE(_semanas, 12), 1), 26);
  v_w0      date;
  v_fim     date;
  v_dias    date[];
  v_q       record;
  v_tot     numeric;
  v_dur     integer;
  v_ini     date;
  v_lista   date[];
  v_erros   integer := 0;
  v_props_total integer := 0;
  v_props_usadas integer := 0;
  v_res     jsonb;
  v_t0      timestamptz := clock_timestamp();
  v_saltados integer := 0;
BEGIN
  v_w0  := date_trunc('week', v_hoje)::date;          -- segunda-feira
  v_fim := v_w0 + 7 * v_sem - 1;
  -- Os dias úteis da organização no horizonte (+ folga para as obras do
  -- comercial que começam no fim do horizonte não precisarem de outra leitura).
  v_dias := ARRAY(SELECT d FROM unnest(public.ops_obra_dias_uteis_lista(_org, v_w0, v_sem * 5 + 10)) d
                   WHERE d >= v_hoje AND d <= v_fim);

  DROP TABLE IF EXISTS pg_temp._cap_dia;
  CREATE TEMP TABLE _cap_dia (d date PRIMARY KEY, w integer NOT NULL);
  INSERT INTO _cap_dia SELECT d, ((d - v_w0) / 7)::integer FROM unnest(v_dias) d;

  -- Procura: uma linha por fonte × especialidade × dia (minutos já pesados).
  DROP TABLE IF EXISTS pg_temp._cap_proc;
  CREATE TEMP TABLE _cap_proc (
    tipo text, ref_id uuid, codigo text, titulo text, prob numeric,
    skill_id uuid, d date, minutos numeric, atrasado boolean DEFAULT false);

  -- ── 1. Obras ──────────────────────────────────────────────────────────
  INSERT INTO _cap_proc (tipo, ref_id, codigo, titulo, prob, skill_id, d, minutos, atrasado)
  SELECT 'obra', t.obra_id, o.codigo, o.titulo, 1, t.skill_id, x.d,
         t.resto / x.n, t.fim < v_hoje
    FROM (
      SELECT t.id, t.obra_id, t.skill_id,
             t.inicio_planeado AS ini, COALESCE(t.fim_planeado, t.inicio_planeado) AS fim,
             CASE WHEN t.estado = 'em_curso'
                  THEN GREATEST(t.minutos_previstos - public.ops_obra_minutos_reais(t.id), 0.25 * t.minutos_previstos)
                  ELSE t.minutos_previstos END::numeric AS resto
        FROM public.ops_obra_tarefa t
       WHERE t.organization_id = _org
         AND t.estado IN ('por_fazer','em_curso','rejeitada')
         AND t.inicio_planeado IS NOT NULL
         AND t.inicio_planeado <= v_fim
    ) t
    JOIN public.ops_obra o ON o.id = t.obra_id AND o.estado IN ('planeada','em_curso')
    CROSS JOIN LATERAL (
      -- Os dias úteis do horizonte em que a tarefa decorre; se já devia ter
      -- acabado (ou cai toda fora dos dias úteis), o 1.º dia do horizonte
      -- a partir de hoje.
      SELECT dd.d, count(*) OVER () AS n
        FROM (
          SELECT c.d FROM _cap_dia c
           WHERE c.d BETWEEN GREATEST(t.ini, v_hoje) AND GREATEST(t.fim, v_hoje)
          UNION ALL
          SELECT min(c.d) FROM _cap_dia c
           WHERE c.d >= v_hoje
             AND NOT EXISTS (SELECT 1 FROM _cap_dia c2
                              WHERE c2.d BETWEEN GREATEST(t.ini, v_hoje) AND GREATEST(t.fim, v_hoje))
          HAVING min(c.d) IS NOT NULL
        ) dd
    ) x
   WHERE t.resto > 0;

  -- ── 2–4. O comercial: orçamentos a expandir ───────────────────────────
  DROP TABLE IF EXISTS pg_temp._cap_orc;
  CREATE TEMP TABLE _cap_orc (
    tipo text, ref_id uuid, orc uuid, codigo text, titulo text, prob numeric, inicio date);

  IF to_regclass('public.client_contracts') IS NOT NULL THEN
    EXECUTE format($q$
      INSERT INTO _cap_orc (tipo, ref_id, orc, codigo, titulo, prob, inicio)
      SELECT 'contrato', c.id, public.ops_contrato_orcamento(c.id),
             COALESCE(c.contract_number, 'Contrato'), NULL::text, 1,
             GREATEST(COALESCE(%s, $2 + 14), $2 + 7)
        FROM public.client_contracts c
       WHERE c.organization_id = $1 AND c.deleted_at IS NULL AND c.status = 'signed'
         AND (%s IS NULL OR %s >= $2 - 30)
         AND NOT EXISTS (SELECT 1 FROM public.ops_obra ob
                          WHERE ob.contrato_id = c.id AND ob.estado <> 'cancelada')
    $q$,
      CASE WHEN public.ops_obra_crm_tem('client_contracts', ARRAY['start_date']) THEN 'c.start_date' ELSE 'NULL::date' END,
      CASE WHEN public.ops_obra_crm_tem('client_contracts', ARRAY['start_date']) THEN 'c.start_date' ELSE 'NULL::date' END,
      CASE WHEN public.ops_obra_crm_tem('client_contracts', ARRAY['start_date']) THEN 'c.start_date' ELSE 'NULL::date' END)
    USING _org, v_hoje;
    -- O contrato cuja obra nasceu do orçamento (e não do contrato) também já tem obra.
    DELETE FROM _cap_orc a
     WHERE a.tipo = 'contrato'
       AND (a.orc IS NULL OR EXISTS (SELECT 1 FROM public.ops_obra ob
                                      WHERE ob.orcamento_id = a.orc AND ob.estado <> 'cancelada'));
  END IF;

  IF public.ops_obra_crm_tem('quotes', ARRAY['id','organization_id','estado','created_at','deleted_at']) THEN
    -- 3. Aceites sem contrato nem obra (um por proposta).
    EXECUTE format($q$
      INSERT INTO _cap_orc (tipo, ref_id, orc, codigo, titulo, prob, inicio)
      SELECT DISTINCT ON (COALESCE(%1$s, q.id))
             'aceite', q.id, q.id, COALESCE(q.quote_number, 'Orçamento'), q.title, 0.9,
             GREATEST(COALESCE(q.accepted_at, q.created_at)::date + 30, $2 + 14)
        FROM public.quotes q
       WHERE q.organization_id = $1 AND q.deleted_at IS NULL AND q.estado = 'aceite'
         AND COALESCE(q.accepted_at, q.created_at) >= $2 - 120
         AND NOT EXISTS (SELECT 1 FROM public.ops_obra ob WHERE ob.orcamento_id = q.id AND ob.estado <> 'cancelada')
         AND NOT EXISTS (SELECT 1 FROM _cap_orc a WHERE a.orc = q.id)
         %2$s
       ORDER BY COALESCE(%1$s, q.id), COALESCE(q.accepted_at, q.created_at) DESC
    $q$,
      CASE WHEN public.ops_obra_crm_tem('quotes', ARRAY['proposal_id']) THEN 'q.proposal_id' ELSE 'NULL::uuid' END,
      CASE WHEN to_regclass('public.client_contracts') IS NOT NULL THEN
        'AND NOT EXISTS (SELECT 1 FROM public.client_contracts c WHERE c.deleted_at IS NULL
                           AND c.status NOT IN (''cancelled'',''draft'')
                           AND (c.quote_id = q.id' ||
        CASE WHEN public.ops_obra_crm_tem('quotes', ARRAY['proposal_id'])
              AND public.ops_obra_crm_tem('client_contracts', ARRAY['proposal_id'])
             THEN ' OR (q.proposal_id IS NOT NULL AND c.proposal_id = q.proposal_id)' ELSE '' END || '))'
      ELSE '' END)
    USING _org, v_hoje;

    -- 4. Enviados: oportunidades, pesadas pela probabilidade.
    EXECUTE format($q$
      WITH cand AS (
        SELECT DISTINCT ON (COALESCE(%1$s, %2$s, q.id))
               q.id, q.quote_number, q.title, q.created_at,
               %3$s AS prob, %4$s AS fecho
          FROM public.quotes q
          %5$s
         WHERE q.organization_id = $1 AND q.deleted_at IS NULL AND q.estado = 'enviado'
           AND q.created_at >= $2 - 60
           AND NOT EXISTS (SELECT 1 FROM public.ops_obra ob WHERE ob.orcamento_id = q.id AND ob.estado <> 'cancelada')
           AND NOT EXISTS (SELECT 1 FROM _cap_orc a WHERE a.orc = q.id)
           %6$s
         ORDER BY COALESCE(%1$s, %2$s, q.id), q.created_at DESC
      )
      INSERT INTO _cap_orc (tipo, ref_id, orc, codigo, titulo, prob, inicio)
      SELECT 'proposta', c.id, c.id, COALESCE(c.quote_number, 'Orçamento'), c.title,
             LEAST(GREATEST(COALESCE(c.prob, 50), 0), 100) / 100.0,
             GREATEST(CASE WHEN c.fecho IS NOT NULL AND c.fecho >= $2 THEN c.fecho + 21
                           ELSE c.created_at::date + 45 END, $2 + 14)
        FROM cand c
    $q$,
      CASE WHEN public.ops_obra_crm_tem('quotes', ARRAY['proposal_id']) THEN 'q.proposal_id' ELSE 'NULL::uuid' END,
      CASE WHEN public.ops_obra_crm_tem('quotes', ARRAY['deal_id']) THEN 'q.deal_id' ELSE 'NULL::uuid' END,
      -- probabilidade: proposta → negócio → 50
      'COALESCE(' ||
        CASE WHEN public.ops_obra_crm_tem('proposals', ARRAY['id','probability']) AND public.ops_obra_crm_tem('quotes', ARRAY['proposal_id'])
             THEN 'p.probability, ' ELSE '' END ||
        CASE WHEN public.ops_obra_crm_tem('deals', ARRAY['id','probability']) AND public.ops_obra_crm_tem('quotes', ARRAY['deal_id'])
             THEN 'dl.probability, ' ELSE '' END || '50)',
      CASE WHEN public.ops_obra_crm_tem('deals', ARRAY['id','expected_close_date']) AND public.ops_obra_crm_tem('quotes', ARRAY['deal_id'])
           THEN 'dl.expected_close_date' ELSE 'NULL::date' END,
      CASE WHEN public.ops_obra_crm_tem('proposals', ARRAY['id','probability']) AND public.ops_obra_crm_tem('quotes', ARRAY['proposal_id'])
           THEN 'LEFT JOIN public.proposals p ON p.id = q.proposal_id ' ELSE '' END ||
      CASE WHEN public.ops_obra_crm_tem('deals', ARRAY['id']) AND public.ops_obra_crm_tem('quotes', ARRAY['deal_id'])
           THEN 'LEFT JOIN public.deals dl ON dl.id = q.deal_id ' ELSE '' END,
      CASE WHEN public.ops_obra_crm_tem('proposals', ARRAY['id','status']) AND public.ops_obra_crm_tem('quotes', ARRAY['proposal_id'])
           THEN 'AND (p.id IS NULL OR p.status NOT IN (''rejected'',''accepted''))' ELSE '' END ||
      CASE WHEN public.ops_obra_crm_tem('deals', ARRAY['id','deleted_at']) AND public.ops_obra_crm_tem('quotes', ARRAY['deal_id'])
           THEN ' AND (dl.id IS NULL OR dl.deleted_at IS NULL)' ELSE '' END)
    USING _org, v_hoje;

    SELECT count(*) INTO v_props_total FROM _cap_orc WHERE tipo = 'proposta';
    -- Só as 150 mais recentes (cada uma é expandida pelo motor).
    DELETE FROM _cap_orc a
     WHERE a.tipo = 'proposta'
       AND a.ref_id NOT IN (SELECT o2.ref_id FROM _cap_orc o2
                              JOIN public.quotes q ON q.id = o2.ref_id
                             WHERE o2.tipo = 'proposta'
                             ORDER BY q.created_at DESC LIMIT 150);
    SELECT count(*) INTO v_props_usadas FROM _cap_orc WHERE tipo = 'proposta';
  END IF;

  -- Expandir cada orçamento pelo motor das obras e espalhar pelas fases.
  FOR v_q IN SELECT * FROM _cap_orc WHERE orc IS NOT NULL AND inicio <= v_fim
              ORDER BY CASE tipo WHEN 'contrato' THEN 1 WHEN 'aceite' THEN 2 ELSE 3 END, prob DESC, inicio LOOP
    IF extract(epoch FROM clock_timestamp() - v_t0) * 1000 > COALESCE(_ms_max, 4000) THEN
      v_saltados := v_saltados + 1;
      CONTINUE;
    END IF;
    BEGIN
      DROP TABLE IF EXISTS pg_temp._cap_exp;
      CREATE TEMP TABLE _cap_exp AS
        SELECT x.fase, x.skill_id, sum(x.minutos)::numeric AS minutos
          FROM public.ops_obra_tarefas_do_orcamento(v_q.orc) x
         GROUP BY x.fase, x.skill_id;
      SELECT COALESCE(sum(minutos), 0) INTO v_tot FROM _cap_exp;
      CONTINUE WHEN v_tot <= 0;
      -- Equipa de 2, 8 h/dia; pelo menos uma semana.
      v_dur := GREATEST(5, ceil(v_tot / (2 * 480.0))::integer);
      v_ini := v_q.inicio;
      v_lista := public.ops_obra_dias_uteis_lista(_org, v_ini, v_dur);

      -- Cada fase ocupa a sua fatia dos dias (proporcional ao tempo dela),
      -- pela ordem das fases; dentro da fatia, o tempo reparte-se por igual.
      INSERT INTO _cap_proc (tipo, ref_id, codigo, titulo, prob, skill_id, d, minutos)
      SELECT v_q.tipo, v_q.ref_id, v_q.codigo, v_q.titulo, v_q.prob, e.skill_id, v_lista[i],
             e.minutos * v_q.prob / (GREATEST(f.ate, f.de) - f.de + 1)
        FROM (
          SELECT fase,
                 GREATEST(1, LEAST(v_dur, floor(acum_antes / v_tot * v_dur)::integer + 1)) AS de,
                 GREATEST(1, LEAST(v_dur, ceil(acum / v_tot * v_dur)::integer)) AS ate
            FROM (
              SELECT fase, sum(minutos) AS m,
                     sum(sum(minutos)) OVER (ORDER BY fase) AS acum,
                     COALESCE(sum(sum(minutos)) OVER (ORDER BY fase ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS acum_antes
                FROM _cap_exp GROUP BY fase
            ) s
        ) f
        JOIN _cap_exp e ON e.fase = f.fase
        CROSS JOIN LATERAL generate_series(f.de, GREATEST(f.de, f.ate)) i
       WHERE v_lista[i] <= v_fim;
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros + 1;
    END;
  END LOOP;

  -- ── Oferta ────────────────────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._cap_ofe;
  CREATE TEMP TABLE _cap_ofe AS
  WITH pessoas AS (
    SELECT p.utilizador_id,
           COALESCE((SELECT h.horas_dia * 60 FROM public.ops_horario h WHERE h.id = p.horario_id), 480)::numeric AS mpd,
           ARRAY(SELECT us.skill_id FROM public.ops_utilizador_skill us
                   JOIN public.ops_skill k ON k.id = us.skill_id AND k.organization_id = _org AND k.ativo
                  WHERE us.utilizador_id = p.utilizador_id) AS skills
      FROM public.ops_utilizador_perfil p
     WHERE p.organization_id = _org AND p.ativo AND p.funcao IN ('tecnico','operador')
  ),
  aus AS (SELECT DISTINCT utilizador_id, dia FROM public.ops_capacidade_ausencias(_org, v_w0, v_fim))
  SELECT s.skill_id, c.w,
         sum(pp.mpd / cardinality(pp.skills)) AS minutos,
         count(DISTINCT pp.utilizador_id) AS pessoas
    FROM pessoas pp
    CROSS JOIN LATERAL unnest(pp.skills) s(skill_id)
    JOIN _cap_dia c ON true
   WHERE cardinality(pp.skills) > 0
     AND NOT EXISTS (SELECT 1 FROM aus a WHERE a.utilizador_id = pp.utilizador_id AND a.dia = c.d)
   GROUP BY s.skill_id, c.w;

  -- ── Resultado ─────────────────────────────────────────────────────────
  WITH semanas AS (
    SELECT k AS w, v_w0 + 7 * k AS ini,
           (SELECT count(*) FROM _cap_dia c WHERE c.w = k)::integer AS dias
      FROM generate_series(0, v_sem - 1) k
  ),
  skills AS (
    SELECT k.id, k.nome,
           (SELECT count(DISTINCT us.utilizador_id) FROM public.ops_utilizador_skill us
              JOIN public.ops_utilizador_perfil p ON p.utilizador_id = us.utilizador_id
                                                 AND p.organization_id = _org AND p.ativo
                                                 AND p.funcao IN ('tecnico','operador')
             WHERE us.skill_id = k.id) AS pessoas
      FROM public.ops_skill k
     WHERE k.organization_id = _org AND k.ativo
    UNION ALL
    SELECT NULL::uuid, 'Sem especialidade', 0
     WHERE EXISTS (SELECT 1 FROM _cap_proc WHERE skill_id IS NULL)
  ),
  proc AS (
    SELECT p.skill_id, c.w,
           sum(p.minutos) AS total,
           sum(p.minutos) FILTER (WHERE p.tipo IN ('obra','contrato')) AS certa,
           sum(p.minutos) FILTER (WHERE p.atrasado) AS atrasado
      FROM _cap_proc p JOIN _cap_dia c ON c.d = p.d
     GROUP BY p.skill_id, c.w
  ),
  celulas AS (
    SELECT sk.id AS skill_id, sm.w,
           round(COALESCE(o.minutos, 0))::integer AS oferta,
           round(COALESCE(pr.total, 0))::integer AS procura,
           round(COALESCE(pr.certa, 0))::integer AS certa,
           round(COALESCE(pr.atrasado, 0))::integer AS atrasado,
           CASE WHEN COALESCE(pr.total, 0) > COALESCE(o.minutos, 0) AND sm.dias > 0
                THEN ceil((pr.total - COALESCE(o.minutos, 0)) / (sm.dias * 480.0))::integer
                ELSE 0 END AS faltam
      FROM skills sk CROSS JOIN semanas sm
      LEFT JOIN _cap_ofe o ON o.skill_id IS NOT DISTINCT FROM sk.id AND o.w = sm.w
      LEFT JOIN proc pr ON pr.skill_id IS NOT DISTINCT FROM sk.id AND pr.w = sm.w
  ),
  fontes AS (
    SELECT p.tipo, p.ref_id, min(p.codigo) AS codigo, min(p.titulo) AS titulo, max(p.prob) AS prob,
           sum(p.m)::integer AS minutos,
           jsonb_agg(jsonb_build_object('s', p.skill_id, 'w', p.w, 'm', p.m) ORDER BY p.w) AS celulas
      FROM (SELECT p.tipo, p.ref_id, p.codigo, p.titulo, p.prob, p.skill_id, c.w, round(sum(p.minutos))::integer AS m
              FROM _cap_proc p JOIN _cap_dia c ON c.d = p.d
             GROUP BY 1,2,3,4,5,6,7 HAVING round(sum(p.minutos)) > 0) p
     GROUP BY p.tipo, p.ref_id
  )
  SELECT jsonb_build_object(
    'inicio', v_w0,
    'hoje', v_hoje,
    'semanas', (SELECT jsonb_agg(jsonb_build_object('w', w, 'inicio', ini, 'dias', dias) ORDER BY w) FROM semanas),
    'especialidades', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', sk.id, 'nome', sk.nome, 'pessoas', sk.pessoas,
               'celulas', (SELECT jsonb_agg(jsonb_build_object(
                                    'w', c.w, 'oferta', c.oferta, 'procura', c.procura, 'certa', c.certa,
                                    'atrasado', c.atrasado, 'faltam', c.faltam) ORDER BY c.w)
                             FROM celulas c WHERE c.skill_id IS NOT DISTINCT FROM sk.id))
             ORDER BY sk.id IS NULL, sk.nome), '[]'::jsonb)
        FROM skills sk),
    'fontes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'tipo', f.tipo, 'id', f.ref_id, 'codigo', f.codigo, 'titulo', f.titulo,
                 'prob', f.prob, 'minutos', f.minutos, 'celulas', f.celulas) ORDER BY f.minutos DESC)
               FROM fontes f), '[]'::jsonb),
    'resumo', jsonb_build_object(
      'obras', (SELECT count(DISTINCT ref_id) FROM _cap_proc WHERE tipo = 'obra'),
      'contratos', (SELECT count(*) FROM _cap_orc WHERE tipo = 'contrato'),
      'aceites', (SELECT count(*) FROM _cap_orc WHERE tipo = 'aceite'),
      'propostas', v_props_usadas,
      'propostas_total', v_props_total,
      'erros', v_erros,
      'por_expandir', v_saltados,
      'pessoas_sem_especialidade', (
        SELECT count(*) FROM public.ops_utilizador_perfil p
         WHERE p.organization_id = _org AND p.ativo AND p.funcao IN ('tecnico','operador')
           AND NOT EXISTS (SELECT 1 FROM public.ops_utilizador_skill us
                             JOIN public.ops_skill k ON k.id = us.skill_id AND k.organization_id = _org
                            WHERE us.utilizador_id = p.utilizador_id)))
  ) INTO v_res;

  DROP TABLE IF EXISTS pg_temp._cap_dia;
  DROP TABLE IF EXISTS pg_temp._cap_proc;
  DROP TABLE IF EXISTS pg_temp._cap_orc;
  DROP TABLE IF EXISTS pg_temp._cap_exp;
  DROP TABLE IF EXISTS pg_temp._cap_ofe;
  RETURN v_res;
END
$$;

REVOKE ALL ON FUNCTION public.ops_capacidade_calcular(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated;


-- A porta do ecrã: só gestor/admin (vê o comercial inteiro da organização).
-- Devolve a cache se tiver menos de 6 h e for desta semana; senão calcula.
CREATE OR REPLACE FUNCTION public.rpc_ops_capacidade(
  p_org        uuid,
  p_semanas    integer DEFAULT 12,
  p_recalcular boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem record;
  v_sem  integer := LEAST(GREATEST(COALESCE(p_semanas, 12), 1), 26);
  v_w0   date := date_trunc('week', (now() AT TIME ZONE 'Europe/Lisbon')::date)::date;
  v_c    record;
  v_res  jsonb;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.view_all', ARRAY['gestor'],
    'Só o gestor vê a capacidade da equipa.');

  SELECT * INTO v_c FROM public.ops_capacidade_cache WHERE organization_id = p_org;
  IF FOUND AND NOT COALESCE(p_recalcular, false)
     AND v_c.inicio = v_w0 AND v_c.semanas >= v_sem
     AND v_c.calculado_em > now() - interval '6 hours' THEN
    RETURN v_c.dados || jsonb_build_object('calculado_em', v_c.calculado_em, 'em_cache', true);
  END IF;

  v_res := public.ops_capacidade_calcular(p_org, NULL, v_sem);

  INSERT INTO public.ops_capacidade_cache (organization_id, inicio, semanas, calculado_em, calculado_por, dados)
  VALUES (p_org, v_w0, v_sem, now(), v_quem.o_utilizador, v_res)
  ON CONFLICT (organization_id) DO UPDATE
     SET inicio = EXCLUDED.inicio, semanas = EXCLUDED.semanas, calculado_em = EXCLUDED.calculado_em,
         calculado_por = EXCLUDED.calculado_por, dados = EXCLUDED.dados;

  RETURN v_res || jsonb_build_object('calculado_em', now(), 'em_cache', false);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_capacidade(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_capacidade(uuid, integer, boolean) TO authenticated, service_role;


-- Deixar a cache pronta: as organizações que já abriram a Capacidade são
-- recalculadas de 3 em 3 horas, sem o limite de 8 s do ecrã (pg_cron, se
-- existir). Quem abre o ecrã depois disso tem a resposta logo.
CREATE OR REPLACE FUNCTION public.ops_capacidade_atualizar_todas()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c record;
  v_n integer := 0;
  v_w0 date := date_trunc('week', (now() AT TIME ZONE 'Europe/Lisbon')::date)::date;
BEGIN
  FOR v_c IN SELECT organization_id, semanas FROM public.ops_capacidade_cache LOOP
    BEGIN
      UPDATE public.ops_capacidade_cache
         SET inicio = v_w0, calculado_em = now(), calculado_por = NULL,
             dados = public.ops_capacidade_calcular(v_c.organization_id, NULL, v_c.semanas, 600000)
       WHERE organization_id = v_c.organization_id;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'capacidade de % falhou: %', v_c.organization_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.ops_capacidade_atualizar_todas() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Com o mesmo nome, o pg_cron substitui o agendamento (não duplica).
    PERFORM cron.schedule('ops-capacidade', '17 */3 * * *', 'SELECT public.ops_capacidade_atualizar_todas()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Capacidade: não ficou agendada no pg_cron (%).', SQLERRM;
END
$cron$;
