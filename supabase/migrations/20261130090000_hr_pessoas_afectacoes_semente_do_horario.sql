-- ==============================================================================
-- Semente das afectacoes a partir do horario ja existente. Prepara os dados
-- ANTES de 20261130100000 activar o invariante "horario exige afectacao" --
-- sem esta semente, todo o horario planeado existente violaria o invariante
-- no primeiro UPDATE, porque hoje nao existe afectacao nenhuma.
--
-- POR APLICAR. Migracao de DADOS, forward-only, idempotente (guarda de
-- "ja ha afectacoes -- nao repete").
--
--
-- -- A REGRA --------------------------------------------------------------------
--
-- Para cada pessoa VIVA:
--
--   1. TEM horario planeado vivo (qualquer linha, recorrente ou excepcao):
--      agrupa-se por LOCAL RESOLVIDO -- coalesce(h.local_id, p.local_id), pois
--      um intervalo sem local_id usa o local predefinido da pessoa -- e cria-se
--      UMA afectacao por (pessoa, local resolvido), com origem='do_horario', a
--      cobrir do inicio mais cedo ao fim mais tardio observados no grupo (sem
--      inicio/fim declarado nalguma regra recorrente do grupo = sem
--      inicio/fim na afectacao tambem, i.e. aberta ou desde sempre).
--
--      Quando NEM h.local_id NEM p.local_id existem, o intervalo nao tem local
--      nenhum a que se agarrar: NAO SE INVENTA um. Fica por resolver e conta-se
--      no relatorio final -- para ficar registado, nao escondido.
--
--   2. NAO TEM horario planeado nenhum, mas TEM pessoas.local_id: cria-se UMA
--      afectacao, origem='inferida', local_id = pessoas.local_id, a comecar na
--      data_inicio do vinculo EM VIGOR (activo ou suspenso). Sem vinculo em
--      vigor, fica por resolver e conta-se tambem.
--
--   3. NAO TEM horario nem pessoas.local_id: nada a semear, legitimo (quem
--      trabalha sempre em casa de clientes diferentes nunca teve local
--      predefinido).
--
-- O inicio de uma afectacao SEM inicio recuperavel do proprio horario usa,
-- por ordem, o inicio do vinculo mais antigo da pessoa e, na sua ausencia, a
-- data de criacao da ficha -- nunca uma data inventada arbitrariamente.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se atribui vinculo_id nenhum as afectacoes semeadas: adivinhar QUAL
--   vinculo corresponde a um bloco de horario historico e mais risco do que
--   valor, e a coluna e opcional.
-- - Nao se confirma (confirmada_por/confirmada_em) nada semeado aqui -- e
--   dado inferido da maquina, nao validado por ninguem ainda.
--
--
-- Prerequisitos:
--   20261120150000  pessoas_horario_planeado
--   20261130060000  pessoas_afectacoes
-- ==============================================================================

DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_afectacoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_afectacoes nao existe. Aplicar 20261130060000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_horario_planeado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_planeado nao existe.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pessoas_afectacoes) THEN
    RAISE NOTICE 'pessoas_afectacoes ja tem linhas -- semente ignorada (idempotente; esta migracao so semeia uma tabela vazia).';
  END IF;
END;
$guardas$;

-- ---- Tabelas temporarias de relatorio, so para esta transaccao -------------
CREATE TEMP TABLE _hr_semente_afectacoes_criadas (
  organization_id uuid NOT NULL,
  origem          text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE _hr_semente_afectacoes_por_resolver (
  organization_id uuid NOT NULL,
  pessoa_id       uuid NOT NULL,
  motivo          text NOT NULL
) ON COMMIT DROP;

-- ---- Passo 1: pessoas COM horario planeado vivo -----------------------------
DO $passo1$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pessoas_afectacoes) THEN
    RETURN;
  END IF;

  -- Blocos de horario cujo local resolvido (proprio, ou o predefinido da
  -- pessoa) nao se consegue apurar: registados, nunca inventados.
  INSERT INTO _hr_semente_afectacoes_por_resolver (organization_id, pessoa_id, motivo)
  SELECT DISTINCT h.organization_id, h.pessoa_id,
         'Bloco(s) de horario sem local_id proprio e sem pessoas.local_id -- sem local a que agarrar a afectacao.'
    FROM public.pessoas_horario_planeado h
    JOIN public.pessoas p ON p.id = h.pessoa_id AND p.organization_id = h.organization_id
   WHERE h.deleted_at IS NULL
     AND p.deleted_at IS NULL
     AND h.local_id IS NULL
     AND p.local_id IS NULL;

  -- Uma afectacao 'do_horario' por (pessoa, local resolvido).
  INSERT INTO public.pessoas_afectacoes
    (pessoa_id, organization_id, local_id, valido_de, valido_ate, origem, motivo)
  SELECT
    g.pessoa_id,
    g.organization_id,
    g.local_id,
    coalesce(
      g.v_inicio,
      (SELECT min(v.data_inicio) FROM public.pessoas_vinculos v
        WHERE v.pessoa_id = g.pessoa_id AND v.deleted_at IS NULL),
      (SELECT p2.created_at::date FROM public.pessoas p2 WHERE p2.id = g.pessoa_id)
    ),
    g.v_fim,
    'do_horario',
    'Semente automatica (20261130090000): derivada dos blocos de horario planeado existentes para este local.'
  FROM (
    SELECT
      h.pessoa_id,
      h.organization_id,
      coalesce(h.local_id, p.local_id) AS local_id,
      CASE WHEN bool_or(h.dia_semana IS NOT NULL AND h.valido_de IS NULL) THEN NULL
           ELSE min(coalesce(h.valido_de, h.data)) END AS v_inicio,
      CASE WHEN bool_or(h.dia_semana IS NOT NULL AND h.valido_ate IS NULL) THEN NULL
           ELSE max(coalesce(h.valido_ate, h.data)) END AS v_fim
    FROM public.pessoas_horario_planeado h
    JOIN public.pessoas p ON p.id = h.pessoa_id AND p.organization_id = h.organization_id
   WHERE h.deleted_at IS NULL
     AND p.deleted_at IS NULL
     AND coalesce(h.local_id, p.local_id) IS NOT NULL
   GROUP BY h.pessoa_id, h.organization_id, coalesce(h.local_id, p.local_id)
  ) g;

  INSERT INTO _hr_semente_afectacoes_criadas (organization_id, origem)
  SELECT organization_id, origem FROM public.pessoas_afectacoes WHERE origem = 'do_horario';
END;
$passo1$;

-- ---- Passo 2: pessoas SEM horario planeado nenhum, mas COM pessoas.local_id -
DO $passo2$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pessoas_afectacoes WHERE origem <> 'do_horario') THEN
    -- Ja foi corrida noutra tentativa desta mesma migracao (nao devia
    -- acontecer numa aplicacao normal, mas fecha a idempotencia).
    RETURN;
  END IF;

  INSERT INTO _hr_semente_afectacoes_por_resolver (organization_id, pessoa_id, motivo)
  SELECT p.organization_id, p.id,
         'Sem horario planeado e sem vinculo em vigor -- pessoas.local_id fica sem afectacao correspondente.'
    FROM public.pessoas p
   WHERE p.deleted_at IS NULL
     AND p.local_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_horario_planeado h
        WHERE h.pessoa_id = p.id AND h.deleted_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_vinculos v
        WHERE v.pessoa_id = p.id AND v.deleted_at IS NULL AND v.estado IN ('activo', 'suspenso')
     );

  INSERT INTO public.pessoas_afectacoes
    (pessoa_id, organization_id, local_id, valido_de, valido_ate, origem, motivo)
  SELECT
    p.id,
    p.organization_id,
    p.local_id,
    v.data_inicio,
    NULL,
    'inferida',
    'Semente automatica (20261130090000): sem horario planeado, local predefinido da ficha usado como afectacao inferida a partir do vinculo em vigor.'
  FROM public.pessoas p
  JOIN public.pessoas_vinculos v
    ON v.pessoa_id = p.id AND v.organization_id = p.organization_id
   AND v.deleted_at IS NULL AND v.estado IN ('activo', 'suspenso')
 WHERE p.deleted_at IS NULL
   AND p.local_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.pessoas_horario_planeado h
      WHERE h.pessoa_id = p.id AND h.deleted_at IS NULL
   );

  INSERT INTO _hr_semente_afectacoes_criadas (organization_id, origem)
  SELECT organization_id, origem FROM public.pessoas_afectacoes WHERE origem = 'inferida';
END;
$passo2$;

-- ---- Relatorio, por organizacao ---------------------------------------------
DO $relatorio$
DECLARE
  r record;
  v_total_criadas   bigint;
  v_total_por_resolver bigint;
BEGIN
  SELECT count(*) INTO v_total_criadas FROM _hr_semente_afectacoes_criadas;
  SELECT count(*) INTO v_total_por_resolver FROM _hr_semente_afectacoes_por_resolver;

  IF v_total_criadas = 0 AND v_total_por_resolver = 0 THEN
    RAISE NOTICE 'Semente: nada por fazer (pessoas_afectacoes ja tinha linhas, ou nao ha pessoas com horario/local_id a semear).';
    RETURN;
  END IF;

  FOR r IN
    SELECT
      coalesce(c.organization_id, x.organization_id) AS organization_id,
      coalesce(c.do_horario, 0) AS do_horario,
      coalesce(c.inferida, 0) AS inferida,
      coalesce(x.por_resolver, 0) AS por_resolver
    FROM (
      SELECT organization_id,
             count(*) FILTER (WHERE origem = 'do_horario') AS do_horario,
             count(*) FILTER (WHERE origem = 'inferida')   AS inferida
        FROM _hr_semente_afectacoes_criadas
       GROUP BY organization_id
    ) c
    FULL OUTER JOIN (
      SELECT organization_id, count(*) AS por_resolver
        FROM _hr_semente_afectacoes_por_resolver
       GROUP BY organization_id
    ) x ON x.organization_id = c.organization_id
    ORDER BY 1
  LOOP
    RAISE NOTICE
      'Semente de afectacoes -- organizacao %: % criada(s) do_horario, % criada(s) inferida, % pessoa(s) por resolver (sem local a que agarrar).',
      r.organization_id, r.do_horario, r.inferida, r.por_resolver;
  END LOOP;

  RAISE NOTICE
    'Semente de afectacoes concluida: % linha(s) criada(s) no total, % pessoa(s) ficaram por resolver (registadas acima, nao inventadas).',
    v_total_criadas, v_total_por_resolver;
END;
$relatorio$;

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_sem_local integer;
BEGIN
  -- Nenhuma afectacao semeada pode ter ficado sem local_id (a coluna e
  -- NOT NULL, mas confirma-se de qualquer forma que a promessa do cabecalho
  -- -- nunca inventar um local -- nao foi quebrada por um DEFAULT escondido).
  SELECT count(*) INTO v_sem_local
    FROM public.pessoas_afectacoes
   WHERE origem IN ('do_horario', 'inferida') AND local_id IS NULL;

  IF v_sem_local > 0 THEN
    RAISE EXCEPTION 'Semente criou % afectacao(oes) sem local_id -- nao devia ser possivel (a coluna e NOT NULL).', v_sem_local;
  END IF;

  RAISE NOTICE 'OK: semente conferida, nenhuma afectacao ficou sem local.';
END;
$conferir$;
