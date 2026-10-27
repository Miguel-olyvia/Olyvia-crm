-- =============================================================================
-- teste-etapa.sql  -- teste REVERTIDO (BEGIN ... ROLLBACK) da migration
-- 20261231700000_etapa_pela_fase_do_negocio (antigo rascunho 20261231400000).
-- ESCRITO, NAO CORRIDO.
--
-- Estado da RH (lido a 26/10, so catalogo): o conteudo desta migration ja esta
-- na base (md5 de neg_resumo_pessoas, neg_ficha_pessoa e fn_neg_pessoa_tem_nif
-- iguais aos do ficheiro), e a 700000 nao muda nada na RH. Por isso este teste
-- deve dar VERDE antes e depois do db push; o vermelho contra a versao antiga
-- ja nao e possivel na RH e NAO se repoe a versao antiga para o mostrar. Se
-- der vermelho antes do push, o defeito e real e a 700000 nao o corrige.
--
-- NAO CORRER sem autorizacao explicita para escritas REVERTIDAS na org nike.
-- So base RH (uetjghdkwbywbftedtth). Nunca a principal, nunca a Mudelar.
-- So na org nike (b6ffce4f-f630-4933-833a-008649757a33). Tudo o que se cria
-- fica dentro da transaccao e desaparece no ROLLBACK final.
--
-- Identidades (correccao H1 da revisao): anew_memberships.user_id e
-- anew_users.id; o «sub» do JWT, auth.uid(), has_anew_permission e
-- crm_scope_keys usam anew_users.auth_user_id. O teste guarda os dois: 'uid'
-- (anew_users.id, para assigned_to/created_by) e 'auth' (auth_user_id, para o
-- JWT e as permissoes).
--
-- Desempate (correccao M2): neg_criar_negocio e o gatilho de insercao poem
-- created_at := now(), que e o mesmo em toda a transaccao; o desempate por id
-- decidiria sozinho e o teste nao provava a regra «o mais antigo por
-- created_at». Por isso, depois de criados, os negocios de E5/E6 recebem
-- created_at diferentes (como postgres, com session_replication_role =
-- replica, porque o gatilho trg_00_negocios_guardar_alteracao repoe o
-- created_at antigo em qualquer UPDATE), e de proposito ao CONTRARIO da ordem
-- dos ids: o negocio mais antigo tem o id MAIOR. Uma implementacao que
-- ordenasse so por id falha E5 e E6.
--
-- Ramo verdadeiro de tem_nif (correccao M1): a pessoa E2 recebe um NIF falso
-- (hash e cifra com a forma certa, sem segredo) como postgres, e a ficha tem
-- de dar tem_nif true e nif_ultimos3 = '321', e fn_neg_pessoa_tem_nif true.
--
-- NAO VERIFICADO (so se sabe a correr):
--   * as validacoes internas de neg_criar_negocio (se aceita dois negocios
--     abertos para a mesma pessoa), neg_registar_contacto, neg_guardar_visita
--     (quadro, horas, recursos) e neg_guardar_levantamento (que chaves exige em
--     p_dados). Se alguma recusar, ajustar os argumentos, nao a assercao;
--   * que o role postgres do Supabase pode fazer SET LOCAL
--     session_replication_role (se nao puder, o passo 2b falha logo e o teste
--     para sem gravar nada).
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
  v_uid   uuid;   -- anew_users.id
  v_auth  uuid;   -- anew_users.auth_user_id (sub do JWT)
  v_board uuid;
  r       record;
BEGIN
  FOR r IN
    SELECT m.user_id, au.auth_user_id
    FROM public.anew_memberships m
    JOIN public.anew_users au ON au.id = m.user_id
    WHERE m.organization_id = k_org
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
      AND au.auth_user_id IS NOT NULL
    ORDER BY m.user_id
  LOOP
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF public.has_anew_permission(r.auth_user_id, 'leads.view')
       AND public.has_anew_permission(r.auth_user_id, 'pessoas.view')
       AND public.has_anew_permission(r.auth_user_id, 'pessoas.edit')
       AND (k_org::text || ':*') = ANY (public.crm_scope_keys('leads.view')) THEN
      v_uid  := r.user_id;
      v_auth := r.auth_user_id;
      EXIT;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Teste: nenhum membro activo da nike com leads.view, pessoas.edit e chave nike:*.';
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

  INSERT INTO t_ctx (k, v) VALUES ('org', k_org), ('uid', v_uid), ('auth', v_auth), ('board', v_board);
END
$ctx$;

-- -----------------------------------------------------------------------------
-- 1. Pessoas de teste (como postgres), na nike, com o utilizador como dono
--    E1 negocio vazio                     -> nova
--    E2 negocio + chamada ligada          -> emContacto   (e tem NIF: M1)
--    E3 negocio + visita ligada           -> visitaMarcada
--    E4 negocio + levantamento ligado     -> qualificada
--    E5 dois abertos: o MAIS ANTIGO vazio (id maior), o outro com chamada -> nova
--    E6 dois abertos: o MAIS ANTIGO com levantamento (id maior), o outro vazio
--       -> qualificada
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

-- M1: E2 com NIF falso (forma certa; hash aleatorio para nao colidir com o
-- indice unico uq_anew_entities_org_nif_hash). Como postgres: authenticated ja
-- nao actualiza nif_* depois da 20261231600000.
UPDATE public.anew_entities e
SET nif_hash      = md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
    nif_encrypted = encode(convert_to(repeat('x', 37), 'UTF8'), 'base64'),
    nif_last3     = '321'
WHERE e.id = 'e2000000-0000-4000-8000-000000000000'
  AND e.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33';

GRANT SELECT ON t_ctx TO authenticated;

-- a partir daqui, como o utilizador escolhido (sub = auth_user_id)
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', (SELECT v FROM t_ctx WHERE k = 'auth'),
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- -----------------------------------------------------------------------------
-- 2. Negocios e registos ligados (pelas RPCs do Pipeline)
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
                                   p_entity_id => 'e5000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E5 recente');
  PERFORM public.neg_criar_negocio(p_id => 'a5000000-0000-4000-8000-000000000002', p_organization_id => v_org,
                                   p_entity_id => 'e5000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E5 antigo');
  PERFORM public.neg_criar_negocio(p_id => 'a6000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                   p_entity_id => 'e6000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E6 recente');
  PERFORM public.neg_criar_negocio(p_id => 'a6000000-0000-4000-8000-000000000002', p_organization_id => v_org,
                                   p_entity_id => 'e6000000-0000-4000-8000-000000000000', p_titulo => 'TESTE E6 antigo');

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
  -- E5: chamada so no negocio RECENTE (...001, id menor); o antigo (...002)
  --     fica vazio
  PERFORM public.neg_registar_contacto(p_id => 'c5000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                       p_entity_id => 'e5000000-0000-4000-8000-000000000000',
                                       p_resultado => 'atendeuInteressado',
                                       p_negocio_id => 'a5000000-0000-4000-8000-000000000001');
  -- E6: levantamento so no negocio ANTIGO (...002, id maior); o recente
  --     (...001) fica vazio
  PERFORM public.neg_guardar_levantamento(p_id => 'b6000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                          p_entity_id => 'e6000000-0000-4000-8000-000000000000',
                                          p_dados => jsonb_build_object('data_levantamento', current_date),
                                          p_linhas => '[]'::jsonb, p_respostas => '{}'::jsonb,
                                          p_negocio_id => 'a6000000-0000-4000-8000-000000000002');
  -- E7: chamada solta (sem negocio)
  PERFORM public.neg_registar_contacto(p_id => 'c7000000-0000-4000-8000-000000000001', p_organization_id => v_org,
                                       p_entity_id => 'e7000000-0000-4000-8000-000000000000',
                                       p_resultado => 'atendeuMaisTarde');
END
$dados$;

-- -----------------------------------------------------------------------------
-- 2b. M2: o negocio de id MAIOR passa a ser o mais antigo (como postgres; o
--     gatilho de UPDATE de negocios repoe created_at, por isso desligam-se os
--     gatilhos so para este UPDATE, dentro da transaccao)
-- -----------------------------------------------------------------------------
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.negocios n
SET created_at = n.created_at - interval '2 days'
WHERE n.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
  AND n.id IN ('a5000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000002');
SET LOCAL session_replication_role = origin;

DO $m2$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT x.antigo, x.recente FROM (VALUES
      ('a5000000-0000-4000-8000-000000000002'::uuid, 'a5000000-0000-4000-8000-000000000001'::uuid),
      ('a6000000-0000-4000-8000-000000000002'::uuid, 'a6000000-0000-4000-8000-000000000001'::uuid)
    ) AS x(antigo, recente)
  LOOP
    IF NOT ((SELECT n.created_at FROM public.negocios n WHERE n.id = r.antigo)
            < (SELECT n.created_at FROM public.negocios n WHERE n.id = r.recente)) THEN
      RAISE EXCEPTION 'Teste M2: o negocio % nao ficou mais antigo que % (o teste nao provaria o desempate).',
        r.antigo, r.recente;
    END IF;
  END LOOP;
END
$m2$;

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', (SELECT v FROM t_ctx WHERE k = 'auth'),
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- -----------------------------------------------------------------------------
-- 3. Assercoes: a etapa da lista, a etapa da ficha, e as duas iguais
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
      ('e1000000-0000-4000-8000-000000000000'::uuid, 'E1 negocio vazio',                     'nova'),
      ('e2000000-0000-4000-8000-000000000000'::uuid, 'E2 com chamada',                       'emContacto'),
      ('e3000000-0000-4000-8000-000000000000'::uuid, 'E3 com visita',                        'visitaMarcada'),
      ('e4000000-0000-4000-8000-000000000000'::uuid, 'E4 com levantamento',                  'qualificada'),
      ('e5000000-0000-4000-8000-000000000000'::uuid, 'E5 dois abertos, o antigo vazio',      'nova'),
      ('e6000000-0000-4000-8000-000000000000'::uuid, 'E6 dois abertos, o antigo levantamento','qualificada'),
      ('e7000000-0000-4000-8000-000000000000'::uuid, 'E7 sem negocio, com chamada',          'emContacto'),
      ('e8000000-0000-4000-8000-000000000000'::uuid, 'E8 sem negocio, sem nada',             'nova')
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
-- 5. Parte B: nif_ultimos3 e tem_nif nos dois ramos, e nunca o NIF, o hash ou
--    a cifra
-- -----------------------------------------------------------------------------
DO $nif$
DECLARE
  v_org uuid := (SELECT v FROM t_ctx WHERE k = 'org');
  v_p   jsonb;
BEGIN
  -- ramo falso: E1 sem NIF
  v_p := public.neg_ficha_pessoa(v_org, 'e1000000-0000-4000-8000-000000000000', p_partes => ARRAY['base']) -> 'pessoa';
  IF NOT (v_p ? 'nif_ultimos3') THEN
    RAISE EXCEPTION 'Teste B: a ficha nao traz a chave nif_ultimos3.';
  END IF;
  IF jsonb_typeof(v_p -> 'nif_ultimos3') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'Teste B: nif_ultimos3 devia ser nulo para uma pessoa sem NIF (veio %).', v_p ->> 'nif_ultimos3';
  END IF;
  IF (v_p -> 'tem_nif') IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'Teste B: tem_nif devia ser false sem NIF (veio %).', v_p ->> 'tem_nif';
  END IF;
  IF public.fn_neg_pessoa_tem_nif(v_org, 'e1000000-0000-4000-8000-000000000000') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Teste B: fn_neg_pessoa_tem_nif devia dar false para E1.';
  END IF;

  -- ramo verdadeiro (M1): E2 com NIF
  v_p := public.neg_ficha_pessoa(v_org, 'e2000000-0000-4000-8000-000000000000', p_partes => ARRAY['base']) -> 'pessoa';
  IF (v_p ->> 'nif_ultimos3') IS DISTINCT FROM '321' THEN
    RAISE EXCEPTION 'Teste B: nif_ultimos3 de E2 devia ser 321 (veio %).', COALESCE(v_p ->> 'nif_ultimos3', '(nulo)');
  END IF;
  IF (v_p -> 'tem_nif') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'Teste B: tem_nif devia ser true para E2 (veio %).', COALESCE(v_p ->> 'tem_nif', '(nulo)');
  END IF;
  IF public.fn_neg_pessoa_tem_nif(v_org, 'e2000000-0000-4000-8000-000000000000') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Teste B: fn_neg_pessoa_tem_nif devia dar true para E2.';
  END IF;
  IF v_p ?| ARRAY['nif_hash', 'nif_encrypted', 'nif_completo']
     OR (v_p -> 'nif') IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Teste B: a ficha de E2 traz o NIF, o hash ou a cifra.';
  END IF;
  IF v_p::text ~ '[0-9a-f]{64}' THEN
    RAISE EXCEPTION 'Teste B: a ficha de E2 traz um valor com a forma do hash.';
  END IF;

  -- fora do ambito a auxiliar nao revela nada (pessoa inexistente na nike)
  IF public.fn_neg_pessoa_tem_nif(v_org, '00000000-0000-4000-8000-0000000000ff') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Teste B: fn_neg_pessoa_tem_nif devia dar false fora do ambito.';
  END IF;
END
$nif$;

-- tudo o que se criou desaparece aqui
ROLLBACK;
