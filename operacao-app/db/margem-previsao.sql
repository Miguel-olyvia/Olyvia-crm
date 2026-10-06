-- =============================================================================
-- Operações — Margem da obra em tempo real, e fim provável com "e se…"
--
-- Corre DEPOIS de db/obras.sql. Idempotente: pode correr-se as vezes que se
-- quiser. Só LÊ o CRM (quotes, quote_lines, client_contracts). Escreve só em
-- ops_obra_margem_config (pelo gestor) e no sino (avisos de margem baixa).
--
-- MARGEM (por obra)
--   receita   = o vendido SEM IVA (orçamento da obra, ou o do contrato):
--               subtotal × (1 − desconto global) + taxas; sem essas colunas,
--               a soma das linhas (total_sem_iva) — mais os extras
--               aprovados/enviados ao cliente (ops_obra_extra.valor_estimado).
--   custo     = materiais do orçamento (custo, não preço) + mão de obra.
--               No CRM a mão de obra vem em linhas de serviço ("Modelo de Mão
--               de Obra", "Extras Mão de Obra…") com o custo na coluna de
--               material, ou na coluna custo_mao_obra_unit. As duas contam
--               como mão de obra orçada.
--   custo/hora = o do perfil de quem trabalhou; sem ele, o que o orçamento
--               implica (mão de obra orçada ÷ horas previstas); sem
--               orçamento, a média da equipa; sem nada, o padrão da
--               organização (ops_obra_margem_config, 20 €/h por defeito).
--   prevista  = receita − (materiais + mão de obra orçada/prevista)
--   a esta data = sobre o trabalho feito: receita × progresso − (mão de obra
--               real + materiais × progresso). progresso = minutos previstos
--               das tarefas feitas ÷ todos.
--   projetada = receita − (materiais + mão de obra real + o que falta × ritmo)
--               ritmo = real ÷ previsto das tarefas já feitas DESTA obra (com
--               pelo menos 1 h feita); senão o histórico da organização (P50,
--               com ≥ 5 tarefas); senão 1.
--   semáforo  = verde ≥ limiar · amarelo ≥ metade do limiar · vermelho abaixo
--               (limiar por organização, 20 % por defeito).
--   Valores só para quem tem operations.costs.view nesta organização (que,
--   pelo ops_pode, exige função admin/gestor). Quem não tem recebe
--   {ve_custos:false} e nada mais — nem o semáforo.
--
-- FIM PROVÁVEL
--   Os fatores real ÷ previsto das tarefas terminadas da organização (P50 e
--   P80, global e por especialidade) e os dias úteis com feriados. A conta do
--   plano ("e se…") faz-se no ecrã (src/domain/previsao.ts) e NÃO grava nada.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_obra_margem_config (
  organization_id   uuid PRIMARY KEY,
  limiar_percent    numeric(5,2) NOT NULL DEFAULT 20 CHECK (limiar_percent BETWEEN 0 AND 90),
  custo_hora_padrao numeric(8,2) NOT NULL DEFAULT 20 CHECK (custo_hora_padrao >= 0),
  atualizado_por    uuid,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ops_obra_margem_config ENABLE ROW LEVEL SECURITY;
-- Sem policies: só pelas RPCs de baixo.
REVOKE ALL ON public.ops_obra_margem_config FROM anon, authenticated;

-- Os registos de tempo de uma obra (a margem soma-os por obra).
CREATE INDEX IF NOT EXISTS ops_obra_registo_obra_idx ON public.ops_obra_registo (obra_id);


-- ── O orçamento: receita sem IVA e custo (mão de obra / materiais) ─────────
-- Dinâmico: instala e corre numa base sem estas colunas (devolve nada).
CREATE OR REPLACE FUNCTION public.ops_obra_margem_orcamento(_quote uuid)
RETURNS TABLE (receita numeric, custo_mao_obra numeric, custo_materiais numeric, fonte text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cond  text;
  v_sql   text;
  v_soma  numeric;
  v_rec   numeric;
  v_fonte text;
BEGIN
  IF _quote IS NULL
     OR NOT public.ops_obra_crm_tem('quote_lines', ARRAY['quote_id','qt','custo_material_unit','custo_mao_obra_unit'])
     OR NOT public.ops_obra_crm_tem('quotes', ARRAY['id']) THEN
    RETURN;
  END IF;

  -- Uma linha É mão de obra se for um serviço, ou se a categoria o disser.
  v_cond := '(' ||
    CASE WHEN public.ops_obra_crm_tem('quote_lines', ARRAY['service_id']) THEN 'l.service_id IS NOT NULL' ELSE 'false' END
    || ' OR ' ||
    CASE WHEN public.ops_obra_crm_tem('quote_lines', ARRAY['categoria'])
         THEN 'COALESCE(l.categoria, '''') ~* ''m[ãa]o.{0,3}de.{0,3}obra''' ELSE 'false' END
    || ')';

  v_sql := 'SELECT COALESCE(sum(COALESCE(l.qt, 1) * (COALESCE(l.custo_mao_obra_unit, 0)
                     + CASE WHEN ' || v_cond || ' THEN COALESCE(l.custo_material_unit, 0) ELSE 0 END)), 0),
                   COALESCE(sum(COALESCE(l.qt, 1) * CASE WHEN ' || v_cond || ' THEN 0
                                                       ELSE COALESCE(l.custo_material_unit, 0) END), 0),
                   ' || CASE WHEN public.ops_obra_crm_tem('quote_lines', ARRAY['total_sem_iva'])
                             THEN 'sum(l.total_sem_iva)' ELSE 'NULL::numeric' END || '
              FROM public.quote_lines l WHERE l.quote_id = $1';
  EXECUTE v_sql INTO custo_mao_obra, custo_materiais, v_soma USING _quote;

  IF public.ops_obra_crm_tem('quotes', ARRAY['subtotal']) THEN
    EXECUTE 'SELECT q.subtotal * (1 - ' ||
              CASE WHEN public.ops_obra_crm_tem('quotes', ARRAY['desconto_global_percent'])
                   THEN 'COALESCE(q.desconto_global_percent, 0)' ELSE '0' END || ' / 100.0) + ' ||
              CASE WHEN public.ops_obra_crm_tem('quotes', ARRAY['total_fees'])
                   THEN 'COALESCE(q.total_fees, 0)' ELSE '0' END ||
            ' FROM public.quotes q WHERE q.id = $1'
       INTO v_rec USING _quote;
    v_fonte := 'orcamento';
  END IF;
  IF v_rec IS NULL AND v_soma IS NOT NULL AND v_soma > 0 THEN
    v_rec := v_soma;
    v_fonte := 'linhas';
  END IF;
  IF v_rec IS NULL AND public.ops_obra_crm_tem('quotes', ARRAY['total']) THEN
    -- Último recurso: o total (pode trazer IVA). Diz-se em `fonte`.
    EXECUTE 'SELECT NULLIF(q.total, 0) FROM public.quotes q WHERE q.id = $1' INTO v_rec USING _quote;
    v_fonte := 'total_com_iva';
  END IF;

  receita := round(v_rec, 2);
  custo_mao_obra := round(custo_mao_obra, 2);
  custo_materiais := round(custo_materiais, 2);
  fonte := v_fonte;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_margem_orcamento(uuid) FROM PUBLIC, anon, authenticated;


-- ── O ritmo aprendido: real ÷ previsto das tarefas terminadas ──────────────
-- Uma linha global (skill_id NULL, sempre presente) e uma por especialidade.
-- Rácio por tarefa entre 0,3 e 4 (um registo esquecido aberto não estraga
-- tudo); tira os minutos de extras encaixados (minutos_juntos).
CREATE OR REPLACE FUNCTION public.ops_obra_ritmo_fatores(_org uuid)
RETURNS TABLE (skill_id uuid, n integer, p50 numeric, p80 numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH reg AS (
    SELECT r.tarefa_id, sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0 AS m
      FROM public.ops_obra_registo r
     WHERE r.organization_id = _org
     GROUP BY r.tarefa_id
  ),
  x AS (
    SELECT t.skill_id,
           LEAST(4.0, GREATEST(0.3, GREATEST(reg.m - COALESCE(t.minutos_juntos, 0), 1) / t.minutos_previstos)) AS r
      FROM public.ops_obra_tarefa t
      JOIN reg ON reg.tarefa_id = t.id
     WHERE t.organization_id = _org
       AND t.estado IN ('feita','validada')
       AND t.minutos_previstos > 0
  )
  SELECT NULL::uuid, count(*)::integer,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r)::numeric, 3),
         round(percentile_cont(0.8) WITHIN GROUP (ORDER BY r)::numeric, 3)
    FROM x
  UNION ALL
  SELECT x.skill_id, count(*)::integer,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r)::numeric, 3),
         round(percentile_cont(0.8) WITHIN GROUP (ORDER BY r)::numeric, 3)
    FROM x WHERE x.skill_id IS NOT NULL
   GROUP BY x.skill_id
$$;

REVOKE ALL ON FUNCTION public.ops_obra_ritmo_fatores(uuid) FROM PUBLIC, anon, authenticated;


-- ── A margem de todas as obras de uma organização (ou de uma) ──────────────
-- SEM verificação de quem pergunta: é interna. As portas são as RPCs.
-- Uma passagem por obra (poucas dezenas), sem RLS por linha.
CREATE OR REPLACE FUNCTION public.ops_obra_margem_lista(_org uuid, _obra uuid DEFAULT NULL)
RETURNS TABLE (
  obra_id              uuid,
  codigo               text,
  estado               text,
  receita              numeric,
  receita_fonte        text,
  extras               numeric,
  receita_total        numeric,
  custo_materiais      numeric,
  mo_orcada            numeric,
  mo_prevista          numeric,
  custo_previsto       numeric,
  margem_prevista      numeric,
  margem_prevista_pct  numeric,
  progresso            numeric,
  mo_real              numeric,
  custo_a_data         numeric,
  margem_a_data        numeric,
  margem_a_data_pct    numeric,
  mo_projetada         numeric,
  custo_projetado      numeric,
  margem_projetada     numeric,
  margem_projetada_pct numeric,
  ritmo                numeric,
  ritmo_fonte          text,
  custo_hora           numeric,
  custo_hora_fonte     text,
  sem_tarifa           integer,
  minutos_previstos    numeric,
  minutos_reais        numeric,
  limiar               numeric,
  semaforo             text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_cfg     record;
  v_media   numeric;
  v_hist    record;
  o         record;
  q         record;
  v_quote   uuid;
  t         record;
  v_taxa    numeric;
  v_fonte_t text;
  v_rit     numeric;
  v_rit_f   text;
  v_resto   numeric;
  v_mo_real numeric;
  v_semt    integer;
BEGIN
  SELECT COALESCE(c.limiar_percent, 20) AS limiar, COALESCE(c.custo_hora_padrao, 20) AS padrao
    INTO v_cfg
    FROM (SELECT 1) um LEFT JOIN public.ops_obra_margem_config c ON c.organization_id = _org;

  SELECT avg(p.custo_hora) INTO v_media FROM public.ops_utilizador_perfil p
   WHERE p.organization_id = _org AND p.ativo AND p.custo_hora IS NOT NULL;

  SELECT f.n, f.p50 INTO v_hist FROM public.ops_obra_ritmo_fatores(_org) f WHERE f.skill_id IS NULL;

  FOR o IN
    SELECT ob.id, ob.codigo, ob.estado, ob.orcamento_id, ob.contrato_id
      FROM public.ops_obra ob
     WHERE ob.organization_id = _org
       AND (_obra IS NULL OR ob.id = _obra)
       AND ob.estado <> 'cancelada'
     ORDER BY ob.codigo
  LOOP
    v_quote := COALESCE(o.orcamento_id, public.ops_contrato_orcamento(o.contrato_id));
    SELECT * INTO q FROM public.ops_obra_margem_orcamento(v_quote);

    -- Tempo: previsto, feito, real, e o que falta (sem ritmo).
    SELECT COALESCE(sum(x.prev), 0) AS prev,
           COALESCE(sum(x.prev) FILTER (WHERE x.estado IN ('feita','validada')), 0) AS prev_feito,
           COALESCE(sum(x.real) FILTER (WHERE x.estado IN ('feita','validada')), 0) AS real_feito,
           COALESCE(sum(x.real), 0) AS real,
           COALESCE(sum(CASE WHEN x.estado IN ('feita','validada') THEN 0
                             WHEN x.estado = 'por_fazer' THEN x.base
                             ELSE NULL END), 0) AS falta_por_fazer,
           -- em curso / rejeitada: (base, real) para o ritmo entrar depois
           COALESCE(array_agg(x.base) FILTER (WHERE x.estado IN ('em_curso','rejeitada')), '{}') AS curso_base,
           COALESCE(array_agg(x.real) FILTER (WHERE x.estado IN ('em_curso','rejeitada')), '{}') AS curso_real
      INTO t
      FROM (
        SELECT tt.estado, tt.minutos_previstos::numeric AS prev,
               COALESCE(tt.minutos_estimativa, tt.minutos_previstos)::numeric AS base,
               COALESCE((SELECT sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0
                           FROM public.ops_obra_registo r WHERE r.tarefa_id = tt.id), 0) AS real
          FROM public.ops_obra_tarefa tt WHERE tt.obra_id = o.id
      ) x;

    -- Custo/hora de base (para o tempo sem pessoa com tarifa).
    IF COALESCE(q.custo_mao_obra, 0) > 0 AND t.prev > 0 THEN
      v_taxa := q.custo_mao_obra / (t.prev / 60.0);  v_fonte_t := 'orcamento';
    ELSIF v_media IS NOT NULL THEN
      v_taxa := v_media;                              v_fonte_t := 'equipa';
    ELSE
      v_taxa := v_cfg.padrao;                         v_fonte_t := 'padrao';
    END IF;

    -- Mão de obra real: cada pessoa ao seu custo/hora (ou à base).
    SELECT COALESCE(sum(y.m / 60.0 * COALESCE(y.custo_hora, v_taxa)), 0),
           count(*) FILTER (WHERE y.custo_hora IS NULL AND y.m > 0)::integer
      INTO v_mo_real, v_semt
      FROM (
        SELECT r.utilizador_id,
               sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0 AS m,
               max(p.custo_hora) AS custo_hora
          FROM public.ops_obra_registo r
          LEFT JOIN public.ops_utilizador_perfil p
            ON p.utilizador_id = r.utilizador_id AND p.organization_id = _org
         WHERE r.obra_id = o.id
         GROUP BY r.utilizador_id
      ) y;

    -- Ritmo: o desta obra (≥ 1 h feita), senão o histórico (≥ 5), senão 1.
    IF t.prev_feito >= 60 THEN
      v_rit := LEAST(3.0, GREATEST(0.5, t.real_feito / t.prev_feito));  v_rit_f := 'obra';
    ELSIF COALESCE(v_hist.n, 0) >= 5 AND v_hist.p50 IS NOT NULL THEN
      v_rit := v_hist.p50;                                               v_rit_f := 'historico';
    ELSE
      v_rit := 1;                                                        v_rit_f := 'sem_dados';
    END IF;

    v_resto := t.falta_por_fazer * v_rit
             + COALESCE((SELECT sum(GREATEST(b * v_rit - r, 0))
                           FROM unnest(t.curso_base, t.curso_real) AS u(b, r)), 0);

    obra_id := o.id;
    codigo := o.codigo;
    estado := o.estado;
    receita := q.receita;
    receita_fonte := q.fonte;
    extras := COALESCE((SELECT round(sum(e.valor_estimado), 2) FROM public.ops_obra_extra e
                         WHERE e.obra_id = o.id AND e.estado IN ('aprovado','enviado')), 0);
    receita_total := CASE WHEN q.receita IS NULL THEN NULL ELSE q.receita + extras END;
    custo_materiais := COALESCE(q.custo_materiais, 0);
    mo_orcada := COALESCE(q.custo_mao_obra, 0);
    mo_prevista := round(CASE WHEN mo_orcada > 0 THEN mo_orcada ELSE t.prev / 60.0 * v_taxa END, 2);
    custo_previsto := custo_materiais + mo_prevista;
    margem_prevista := receita_total - custo_previsto;
    progresso := CASE WHEN t.prev > 0 THEN round(t.prev_feito / t.prev, 4) ELSE 0 END;
    mo_real := round(v_mo_real, 2);
    custo_a_data := CASE WHEN progresso > 0 OR mo_real > 0
                         THEN round(mo_real + custo_materiais * progresso, 2) END;
    margem_a_data := CASE WHEN progresso > 0 THEN round(receita_total * progresso - custo_a_data, 2) END;
    mo_projetada := round(v_mo_real + v_resto / 60.0 * v_taxa, 2);
    custo_projetado := custo_materiais + mo_projetada;
    margem_projetada := receita_total - custo_projetado;
    margem_prevista_pct := CASE WHEN receita_total > 0 THEN round(margem_prevista / receita_total * 100, 1) END;
    margem_a_data_pct := CASE WHEN receita_total > 0 AND progresso > 0
                              THEN round(margem_a_data / (receita_total * progresso) * 100, 1) END;
    margem_projetada_pct := CASE WHEN receita_total > 0 THEN round(margem_projetada / receita_total * 100, 1) END;
    ritmo := round(v_rit, 2);
    ritmo_fonte := v_rit_f;
    custo_hora := round(v_taxa, 2);
    custo_hora_fonte := v_fonte_t;
    sem_tarifa := v_semt;
    minutos_previstos := t.prev;
    minutos_reais := round(t.real, 1);
    limiar := v_cfg.limiar;
    semaforo := CASE
      WHEN receita_total IS NULL OR receita_total <= 0 THEN 'sem_dados'
      WHEN margem_projetada_pct >= v_cfg.limiar THEN 'verde'
      WHEN margem_projetada_pct >= v_cfg.limiar / 2 THEN 'amarelo'
      ELSE 'vermelho' END;
    RETURN NEXT;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_margem_lista(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- ── RPC: a margem de uma obra (ficha da obra) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_margem(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org  uuid;
  v_r    jsonb;
  v_fun  text;
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_obra WHERE id = p_obra_id;
  IF v_org IS NULL OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada, ou sem permissão para a ver.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.ops_pode(v_org, 'operations.costs.view') THEN
    RETURN jsonb_build_object('ve_custos', false);
  END IF;

  SELECT to_jsonb(m) INTO v_r FROM public.ops_obra_margem_lista(v_org, p_obra_id) m;
  SELECT p.funcao INTO v_fun FROM public.ops_utilizador_perfil p
   WHERE p.organization_id = v_org AND p.utilizador_id = public.current_business_user_id() AND p.ativo;

  RETURN COALESCE(v_r, '{}'::jsonb)
         || jsonb_build_object('ve_custos', true,
                               'pode_configurar', COALESCE(v_fun IN ('admin','gestor'), false),
                               'custo_hora_padrao', COALESCE((SELECT c.custo_hora_padrao FROM public.ops_obra_margem_config c
                                                               WHERE c.organization_id = v_org), 20));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_margem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_margem(uuid) TO authenticated, service_role;


-- ── RPC: o semáforo de todas as obras (lista das Obras), numa só chamada ───
CREATE OR REPLACE FUNCTION public.rpc_ops_obras_margem(p_org uuid)
RETURNS TABLE (
  obra_id              uuid,
  semaforo             text,
  margem_prevista_pct  numeric,
  margem_projetada_pct numeric,
  limiar               numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.ops_pode(p_org, 'operations.costs.view') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT m.obra_id, m.semaforo, m.margem_prevista_pct, m.margem_projetada_pct, m.limiar
    FROM public.ops_obra_margem_lista(p_org, NULL) m
   WHERE public.ops_pode_ver_obra(m.obra_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obras_margem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obras_margem(uuid) TO authenticated, service_role;


-- ── RPC: o limiar e o custo/hora padrão (o gestor) ─────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_margem_config(
  p_org uuid, p_limiar_percent numeric, p_custo_hora_padrao numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem record;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.costs.view', ARRAY['gestor'],
    'Só o gestor muda o limiar da margem.');
  IF p_limiar_percent IS NULL OR p_limiar_percent < 0 OR p_limiar_percent > 90 THEN
    RAISE EXCEPTION 'O limiar da margem tem de estar entre 0 e 90 %%.';
  END IF;
  IF p_custo_hora_padrao IS NOT NULL AND p_custo_hora_padrao < 0 THEN
    RAISE EXCEPTION 'O custo/hora não pode ser negativo.';
  END IF;

  INSERT INTO public.ops_obra_margem_config AS c (organization_id, limiar_percent, custo_hora_padrao, atualizado_por)
  VALUES (p_org, p_limiar_percent, COALESCE(p_custo_hora_padrao, 20), v_quem.o_utilizador)
  ON CONFLICT (organization_id) DO UPDATE
     SET limiar_percent = EXCLUDED.limiar_percent,
         custo_hora_padrao = COALESCE(p_custo_hora_padrao, c.custo_hora_padrao),
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em = now();
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_margem_config(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_margem_config(uuid, numeric, numeric) TO authenticated, service_role;


-- ── Aviso no sino quando a margem projetada desce do limiar ────────────────
-- Só obras EM CURSO (antes de começar ainda não há ritmo que diga nada) e
-- só a quem vê custos: perfis ativos admin/gestor da organização. Um aviso
-- por obra; volta a "por ler" quando o semáforo piora; resolve-se sozinho
-- quando volta acima do limiar. Sem _org: todas.
CREATE OR REPLACE FUNCTION public.ops_obra_margem_avisar(_org uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g         uuid;
  m         record;
  p         uuid;
  v_manter  uuid[];
  v_n       integer := 0;
  v_res     integer := 0;
  v_tit     text;
  v_msg     text;
BEGIN
  IF to_regproc('public.ops_obra_notificar') IS NULL THEN
    RETURN jsonb_build_object('avisos', 0, 'motivo', 'sem ops_obra_notificar');
  END IF;

  FOR g IN
    SELECT DISTINCT o.organization_id FROM public.ops_obra o
     WHERE o.estado = 'em_curso' AND (_org IS NULL OR o.organization_id = _org)
  LOOP
    v_manter := '{}';
    FOR m IN
      SELECT * FROM public.ops_obra_margem_lista(g, NULL) x
       WHERE x.estado = 'em_curso' AND x.semaforo IN ('amarelo','vermelho')
    LOOP
      v_manter := v_manter || m.obra_id;
      v_tit := m.codigo || ': margem projetada ' || replace(to_char(m.margem_projetada_pct, 'FM990.0'), '.', ',') || ' %'
               || ' (abaixo de ' || to_char(m.limiar, 'FM990') || ' %)';
      v_msg := 'Vendido ' || replace(to_char(m.receita_total, 'FM999G999G990'), ',', ' ') || ' € sem IVA · custo projetado '
               || replace(to_char(m.custo_projetado, 'FM999G999G990'), ',', ' ') || ' €'
               || CASE WHEN m.ritmo_fonte = 'obra' AND m.ritmo <> 1
                       THEN ' · a obra está a ' || replace(to_char(m.ritmo, 'FM990.00'), '.', ',') || '× o tempo previsto' ELSE '' END
               || '. Na venda, a margem era ' || COALESCE(replace(to_char(m.margem_prevista_pct, 'FM990.0'), '.', ',') || ' %', '—') || '.';
      FOR p IN
        SELECT pf.utilizador_id FROM public.ops_utilizador_perfil pf
         WHERE pf.organization_id = g AND pf.ativo AND pf.funcao IN ('admin','gestor')
      LOOP
        IF public.ops_obra_notificar(g, p, 'operacoes_obra_margem', m.obra_id, v_tit, v_msg,
             '/operacao/obras/' || m.codigo,
             CASE WHEN m.semaforo = 'vermelho' THEN 'high' ELSE 'medium' END,
             ARRAY['margem:' || m.semaforo],
             jsonb_build_object('codigo', m.codigo, 'semaforo', m.semaforo,
                                'margem_projetada_pct', m.margem_projetada_pct)) IN ('novo','de_novo') THEN
          v_n := v_n + 1;
        END IF;
      END LOOP;
    END LOOP;
    v_res := v_res + public.ops_obra_notificacoes_resolver(g, 'operacoes_obra_margem', v_manter, NULL, 'margem_recuperada');
  END LOOP;

  RETURN jsonb_build_object('avisos', v_n, 'resolvidos', v_res);
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_margem_avisar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_obra_margem_avisar(uuid) TO service_role;


-- ── RPC: os números para o fim provável e o "e se…" ────────────────────────
-- Não grava nada. Devolve os fatores (P50/P80, global e por especialidade),
-- o ritmo desta obra, os dias úteis com feriados (do mais cedo entre hoje e
-- o início da obra, 400 dias úteis) e os minutos por dia.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_previsao(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o     record;
  v_hoje  date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_ini   date;
  v_glob  record;
  v_prev  numeric;
  v_real  numeric;
  v_p50   numeric;
  v_p80   numeric;
  v_fonte text;
  v_n     integer;
BEGIN
  SELECT id, organization_id, minutos_por_dia INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada, ou sem permissão para a ver.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT f.n, f.p50, f.p80 INTO v_glob FROM public.ops_obra_ritmo_fatores(v_o.organization_id) f
   WHERE f.skill_id IS NULL;

  -- O ritmo desta obra (tarefas feitas, com o tempo dos extras tirado).
  SELECT COALESCE(sum(t.minutos_previstos), 0),
         COALESCE(sum(GREATEST(COALESCE((SELECT sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0
                                           FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id), 0)
                               - COALESCE(t.minutos_juntos, 0), 0)), 0),
         count(*)::integer
    INTO v_prev, v_real, v_n
    FROM public.ops_obra_tarefa t
   WHERE t.obra_id = p_obra_id AND t.estado IN ('feita','validada') AND t.minutos_previstos > 0;

  IF v_prev >= 60 THEN
    v_p50 := LEAST(3.0, GREATEST(0.5, v_real / v_prev));
    -- A dispersão vem do histórico (P80 ÷ P50); sem histórico, +20 %.
    v_p80 := v_p50 * CASE WHEN COALESCE(v_glob.n, 0) >= 5 AND v_glob.p50 > 0
                          THEN GREATEST(v_glob.p80 / v_glob.p50, 1.05) ELSE 1.2 END;
    v_fonte := 'obra';
  ELSIF COALESCE(v_glob.n, 0) >= 5 THEN
    v_p50 := v_glob.p50;  v_p80 := GREATEST(v_glob.p80, v_glob.p50);  v_fonte := 'historico';
  ELSE
    v_p50 := 1;  v_p80 := 1.2;  v_fonte := 'sem_dados';
  END IF;

  SELECT LEAST(v_hoje, COALESCE(min(t.inicio_planeado), v_hoje)) - 7 INTO v_ini
    FROM public.ops_obra_tarefa t WHERE t.obra_id = p_obra_id;

  RETURN jsonb_build_object(
    'hoje', v_hoje,
    'minutos_por_dia', v_o.minutos_por_dia,
    'p50', round(v_p50, 3),
    'p80', round(v_p80, 3),
    'fonte', v_fonte,
    'n_obra', v_n,
    'n_historico', COALESCE(v_glob.n, 0),
    'por_especialidade', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('skill_id', f.skill_id, 'n', f.n, 'p50', f.p50, 'p80', f.p80,
                                          'nome', (SELECT k.nome FROM public.ops_skill k WHERE k.id = f.skill_id)))
        FROM public.ops_obra_ritmo_fatores(v_o.organization_id) f
       WHERE f.skill_id IS NOT NULL AND f.n >= 5), '[]'::jsonb),
    'dias_uteis', to_jsonb(public.ops_obra_dias_uteis_lista(v_o.organization_id, v_ini, 400))
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_previsao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_previsao(uuid) TO authenticated, service_role;

COMMIT;

-- O aviso de margem corre de hora a hora, se houver pg_cron (o Supabase tem).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('ops-obras-margem', '7 * * * *', 'SELECT public.ops_obra_margem_avisar()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Margem: não ficou agendado no pg_cron (%).', SQLERRM;
END
$cron$;
