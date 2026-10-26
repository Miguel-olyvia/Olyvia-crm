-- =============================================================================
-- teste-etapa.sql  -- teste REVERTIDO (BEGIN ... ROLLBACK) do rascunho
-- 20261231400000_etapa_pela_fase_do_negocio.  ESCRITO, NAO CORRIDO.
--
-- Onde e quando correr (ordem obrigatoria, regra do projecto):
--   1. ANTES do db push, contra o remoto RH ainda por corrigir: e o vermelho.
--      Esperado: falham E1 (nova), E2 (emContacto), E3 (visitaMarcada) e E5
--      (dois negocios), porque hoje a etapa de quem tem negocio aberto e
--      sempre «qualificada»; e falha a parte B (nif_ultimos3 nao existe).
--   2. db push da migration.
--   3. de novo, contra o remoto ja corrigido: tudo verde.
--   Nunca se volta a por a versao antiga na base para repetir o vermelho.
--
-- So na org nike (b6ffce4f-f630-4933-833a-008649757a33). Tudo o que se cria
-- fica dentro da transaccao e desaparece no ROLLBACK final. Corre como
-- postgres (cria as pessoas) e depois como authenticated, com o JWT de um
-- membro activo da nike que tenha leads.view com chave «nike:*» (escolhido em
-- tempo de execucao; o teste para se nao houver nenhum).
--
-- NAO VERIFICADO (so se sabe a correr): as validacoes internas de
-- neg_criar_negocio (se aceita dois negocios abertos para a mesma pessoa),
-- neg_registar_contacto, neg_guardar_visita (quadro, horas, recursos) e
-- neg_guardar_levantamento (que chaves exige em p_dados). Se alguma recusar,
-- ajustar os argumentos, nao a asserção.
-- =============================================================================

BEGIN;
SET LOCAL statement_timeout = '60s';

-- -----------------------------------------------------------------------------
-- 0. Contexto: utilizador de teste e quadro de visitas da nike (como postgres)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE t_ctx (k text PRIMARY KEY, v uuid NOT NULL) ON COMMIT DROP;

DO $ctx$
DECLARE
  k_org   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_uid   uuid;
  v_board uuid;
  r       record;
BEGIN
  FOR r IN
    SELECT m.user_id
    FROM public.anew_memberships m
    WHERE m.organization_id = k_org
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
    ORDER BY m.user_id
  LOOP
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    IF public.has_anew_permission(r.user_id, 'leads.view')
       AND public.has_anew_permission(r.user_id, 'pessoas.edit')
       AND (k_org::text || ':*') = ANY (public.crm_scope_keys('leads.view')) THEN
      v_uid := r.user_id;
      EXIT;
    END IF;
  END LOOP;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Teste: nenhum membro activo da nike com leads.view e chave nike:*.';
  END IF;

  SELECT b.id INTO v_board
  FROM public.schedule_boards b
  WHERE b.organization_id = k_org
    AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))
  ORDER BY b.id
  LIMIT 1;
  IF v_board IS NULL THEN
    RAISE EXCEPTION 'Teste: a nike nao tem quadro de visitas.';
  END IF;

  INSERT INTO t_ctx (k, v) VALUES ('org', k_org), ('uid', v_uid), ('board', v_board);
END
$ctx$;

-- -----------------------------------------------------------------------------
-- 1. Pessoas de teste (como postgres), na nike, com o utilizador como dono
--    E1 negocio vazio                     -> nova
--    E2 negocio + chamada ligada          -> emContacto
--    E3 negocio + visita ligada           -> visitaMarcada
--    E4 negocio + levantamento ligado     -> qualificada
--    E5 dois abertos: 1.o vazio, 2.o com chamada  -> nova (conta o primeiro)
--    E6 dois abertos: 1.o com levantamento, 2.o vazio -> qualificada
--    E7 sem negocio, com chamada solta    -> emContacto (como hoje)
--    E8 sem negocio, sem nada             -> nova (como hoje)
-- -----------------------------------------------------------------------------
INSERT INTO public.anew_entities (id, organization_id, type, display_name, assigned_to, created_by)
SELECT x.id, c_org.v, 'person', x.nome, c_uid.v, c_uid.v
FROM (VALUES
  ('e1000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E1'),
  ('e2000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E2'),
  ('e3000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E3'),
  ('e4000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E4'),
  ('e5000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E5'),
  ('e6000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E6'),
  ('e7000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E7'),
  ('e8000000-0000-4000-8000-000000000000'::uuid, 'TESTE etapa E8')
) AS x(id, nome)
CROSS JOIN (SELECT v FROM t_ctx WHERE k = 'org') c_org
CROSS JOIN (SELECT v FROM t_ctx WHERE k = 'uid') c_uid;

GRANT SELECT ON t_ctx TO authenticated;

-- a partir daqui, como o utilizador escolhido
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', (SELECT v FROM t_ctx WHERE k = 'uid'),
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- -----------------------------------------------------------------------------
-- 2. Negocios e registos ligados (pelas RPCs do Pipeline). Nos pares E5 e E6 o
--    primeiro negocio e criado antes e tem o id menor, por isso e o primeiro
--    tanto por created_at como pelo desempate por id.
-- -----------------------------------------------------------------------------
DO $dados$
DECLARE
  v_org   uuid := (SELECT v FROM t_ctx WHERE k = 'org');
  v_board uuid := (SELECT v FROM t_ctx WHERE k = 'board');
  v_ini   timestamptz := date_trunc('hour', now()) + interval '3 days';
BEGIN
  -- negocios
  PERFORM public.neg_criar_negocio(p_id => 'a1000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                   p_entity_id => 'e1000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E1');
  PERFORM public.neg_criar_negocio(p_id => 'a2000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                   p_entity_id => 'e2000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E2');
  PERFORM public.neg_criar_negocio(p_id => 'a3000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                   p_entity_id => 'e3000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E3');
  PERFORM public.neg_criar_negocio(p_id => 'a4000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                   p_entity_id => 'e4000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E4');
  PERFORM public.neg_criar_negocio(p_id => 'a5000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                   p_entity_id => 'e5000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E5 primeiro');
  PERFORM public.neg_criar_negocio(p_id => 'a5000000-0000-4000-8000-000000000002', p_organization_id => v_org,
                                   p_entity_id => 'e5000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E5 segundo');
  PERFORM public.neg_criar_negocio(p_id => 'a6000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                   p_entity_id => 'e6000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E6 primeiro');
  PERFORM public.neg_criar_negocio(p_id => 'a6000000-0000-4000-8000-000000000002', p_organization_id => v_org,
                                   p_entity_id => 'e6000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E6 segundo');

  -- E2: chamada ligada ao negocio
  PERFORM public.neg_registar_contacto(p_id => 'c2000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                       p_entity_id => 'e2000000-0000-4000-8000-000000000000',
                                       p_resultado => 'atendeuInteressado',
                                       p_negocio_id => 'a2000000-0000-4000-8000-000000000001');
  -- E3: visita ligada ao negocio (nao cancelada)
  PERFORM public.neg_guardar_visita(p_organization_id => v_org,
                                    p_entity_id => 'e3000000-0000-4000-8000-000000000000',
                                    p_board_id => v_board, p_inicio => v_ini, p_fim => v_ini + interval '1 hour',
                                    p_titulo => 'TESTE visita E3',
                                    p_negocio_id => 'a3000000-0000-4000-8000-000000000001');
  -- E4: levantamento ligado ao negocio
  PERFORM public.neg_guardar_levantamento(p_id => 'b4000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                          p_entity_id => 'e4000000-0000-4000-8000-000000000000',
                                          p_dados => jsonb_build_object('data_levantamento', current_date),
                                          p_linhas => '[]'::jsonb, p_respostas => '{}'::jsonb,
                                          p_negocio_id => 'a4000000-0000-4000-8000-000000000001');
  -- E5: chamada so no SEGUNDO negocio (o primeiro fica vazio)
  PERFORM public.neg_registar_contacto(p_id => 'c5000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                       p_entity_id => 'e5000000-0000-4000-8000-000000000000',
                                       p_resultado => 'atendeuInteressado',
                                       p_negocio_id => 'a5000000-0000-4000-8000-000000000002');
  -- E6: levantamento no PRIMEIRO negocio
  PERFORM public.neg_guardar_levantamento(p_id => 'b6000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                          p_entity_id => 'e6000000-0000-4000-8000-000000000000',
                                          p_dados => jsonb_build_object('data_levantamento', current_date),
                                          p_linhas => '[]'::jsonb, p_respostas => '{}'::jsonb,
                                          p_negocio_id => 'a6000000-0000-4000-8000-000000000001');
  -- E7: chamada solta (sem negocio)
  PERFORM public.neg_registar_contacto(p_id => 'c7000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                       p_entity_id => 'e7000000-0000-4000-8000-000000000000',
                                       p_resultado => 'atendeuMaisTarde');
END
$dados$;

-- -----------------------------------------------------------------------------
-- 3. Asserções: a etapa da lista, a etapa da ficha, e as duas iguais
-- -----------------------------------------------------------------------------
DO $etapa$
DECLARE
  v_org   uuid := (SELECT v FROM t_ctx WHERE k = 'org');
  v_lista text;
  v_ficha text;
  r       record;
BEGIN
  -- os pares E5/E6 tem mesmo dois negocios abertos (senao o teste nao prova nada)
  FOR r IN
    SELECT x.ent FROM (VALUES ('e5000000-0000-4000-8000-000000000000'::uuid),
                              ('e6000000-0000-4000-8000-000000000000'::uuid)) AS x(ent)
  LOOP
    IF (SELECT l.negocios_abertos FROM public.neg_resumo_pessoas(v_org, p_limite => 100) l
        WHERE l.entity_id = r.ent) IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'Teste: a pessoa % nao ficou com 2 negocios abertos.', r.ent;
    END IF;
  END LOOP;

  FOR r IN
    SELECT x.ent, x.caso, x.esperada FROM (VALUES
      ('e1000000-0000-4000-8000-000000000000'::uuid, 'E1 negocio vazio',                 'nova'),
      ('e2000000-0000-4000-8000-000000000000'::uuid, 'E2 com chamada',                   'emContacto'),
      ('e3000000-0000-4000-8000-000000000000'::uuid, 'E3 com visita',                    'visitaMarcada'),
      ('e4000000-0000-4000-8000-000000000000'::uuid, 'E4 com levantamento',              'qualificada'),
      ('e5000000-0000-4000-8000-000000000000'::uuid, 'E5 dois abertos, 1.o vazio',       'nova'),
      ('e6000000-0000-4000-8000-000000000000'::uuid, 'E6 dois abertos, 1.o levantamento','qualificada'),
      ('e7000000-0000-4000-8000-000000000000'::uuid, 'E7 sem negocio, com chamada',      'emContacto'),
      ('e8000000-0000-4000-8000-000000000000'::uuid, 'E8 sem negocio, sem nada',         'nova')
    ) AS x(ent, caso, esperada)
  LOOP
    SELECT l.etapa INTO v_lista
    FROM public.neg_resumo_pessoas(v_org, p_limite => 100) l
    WHERE l.entity_id = r.ent;
    v_ficha := public.neg_ficha_pessoa(v_org, r.ent, p_partes => ARRAY['base']) #>> '{pessoa,etapa}';

    IF v_lista IS DISTINCT FROM r.esperada THEN
      RAISE EXCEPTION 'Teste % (lista): etapa % (esperava %).', r.caso, COALESCE(v_lista, '(sem linha)'), r.esperada;
    END IF;
    IF v_ficha IS DISTINCT FROM r.esperada THEN
      RAISE EXCEPTION 'Teste % (ficha): etapa % (esperava %).', r.caso, COALESCE(v_ficha, '(nula)'), r.esperada;
    END IF;
  END LOOP;
END
$etapa$;

-- -----------------------------------------------------------------------------
-- 4. Filtro p_etapa: cada pessoa de teste aparece no filtro da sua etapa e
--    em nenhum outro
-- -----------------------------------------------------------------------------
DO $filtro$
DECLARE
  v_org uuid := (SELECT v FROM t_ctx WHERE k = 'org');
  v_n   bigint;
  r     record;
BEGIN
  FOR r IN
    SELECT x.ent, x.esperada FROM (VALUES
      ('e1000000-0000-4000-8000-000000000000'::uuid, 'nova'),
      ('e2000000-0000-4000-8000-000000000000'::uuid, 'emContacto'),
      ('e3000000-0000-4000-8000-000000000000'::uuid, 'visitaMarcada'),
      ('e4000000-0000-4000-8000-000000000000'::uuid, 'qualificada'),
      ('e5000000-0000-4000-8000-000000000000'::uuid, 'nova'),
      ('e6000000-0000-4000-8000-000000000000'::uuid, 'qualificada'),
      ('e7000000-0000-4000-8000-000000000000'::uuid, 'emContacto'),
      ('e8000000-0000-4000-8000-000000000000'::uuid, 'nova')
    ) AS x(ent, esperada)
  LOOP
    SELECT count(*) INTO v_n
    FROM unnest(ARRAY['nova', 'emContacto', 'visitaMarcada', 'qualificada', 'cliente']) AS f(etapa)
    CROSS JOIN LATERAL public.neg_resumo_pessoas(v_org, p_etapa => f.etapa, p_limite => 100) l
    WHERE l.entity_id = r.ent AND f.etapa = r.esperada;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Teste filtro: a pessoa % nao aparece no filtro % (% linhas).', r.ent, r.esperada, v_n;
    END IF;

    SELECT count(*) INTO v_n
    FROM unnest(ARRAY['nova', 'emContacto', 'visitaMarcada', 'qualificada', 'cliente']) AS f(etapa)
    CROSS JOIN LATERAL public.neg_resumo_pessoas(v_org, p_etapa => f.etapa, p_limite => 100) l
    WHERE l.entity_id = r.ent AND f.etapa <> r.esperada;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Teste filtro: a pessoa % aparece em % filtros alem de %.', r.ent, v_n, r.esperada;
    END IF;

    -- a linha devolvida pelo filtro traz a mesma etapa que se filtrou
    SELECT count(*) INTO v_n
    FROM public.neg_resumo_pessoas(v_org, p_etapa => r.esperada, p_limite => 100) l
    WHERE l.entity_id = r.ent AND l.etapa IS DISTINCT FROM r.esperada;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Teste filtro: a pessoa % veio no filtro % com outra etapa.', r.ent, r.esperada;
    END IF;
  END LOOP;
END
$filtro$;

-- -----------------------------------------------------------------------------
-- 5. Parte B: a ficha traz nif_ultimos3 (nulo, as pessoas de teste nao tem NIF)
--    e tem_nif falso; e nunca traz chaves com o NIF, o hash ou a cifra
-- -----------------------------------------------------------------------------
DO $nif$
DECLARE
  v_org uuid := (SELECT v FROM t_ctx WHERE k = 'org');
  v_p   jsonb;
BEGIN
  v_p := public.neg_ficha_pessoa(v_org, 'e1000000-0000-4000-8000-000000000000', p_partes => ARRAY['base']) -> 'pessoa';
  IF NOT (v_p ? 'nif_ultimos3') THEN
    RAISE EXCEPTION 'Teste B: a ficha nao traz a chave nif_ultimos3.';
  END IF;
  IF jsonb_typeof(v_p -> 'nif_ultimos3') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'Teste B: nif_ultimos3 devia ser nulo para uma pessoa sem NIF (veio %).', v_p ->> 'nif_ultimos3';
  END IF;
  IF (v_p -> 'tem_nif') IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'Teste B: tem_nif devia ser false (veio %).', v_p ->> 'tem_nif';
  END IF;
  IF v_p ?| ARRAY['nif_hash', 'nif_encrypted', 'nif_completo'] OR (v_p -> 'nif') IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Teste B: a ficha traz o NIF, o hash ou a cifra.';
  END IF;
  -- fora do ambito a auxiliar nao revela nada (pessoa inexistente na nike)
  IF public.fn_neg_pessoa_tem_nif(v_org, '00000000-0000-4000-8000-0000000000ff') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Teste B: fn_neg_pessoa_tem_nif devia dar false fora do ambito.';
  END IF;
END
$nif$;

-- tudo o que se criou desaparece aqui
ROLLBACK;
