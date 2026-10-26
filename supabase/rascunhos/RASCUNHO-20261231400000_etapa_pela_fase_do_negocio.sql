-- =============================================================================
-- 20261231400000_etapa_pela_fase_do_negocio.sql  (base RH)  -- RASCUNHO, NAO APLICAR
--
-- Duas coisas para o Pipeline (comGuia); a pagina de Pessoas antiga nao muda:
--   A. A ETAPA da pessoa (nova, emContacto, visitaMarcada, qualificada,
--      cliente) em neg_resumo_pessoas e em neg_ficha_pessoa. Hoje «qualificada»
--      quer dizer «tem um negocio aberto». Regra nova, igual a da coluna do
--      Quadro (neg_resumo_quadro):
--        * cliente (client_since) -> cliente, como hoje;
--        * com negocio aberto -> conta o PRIMEIRO negocio aberto (o mais antigo:
--          created_at, id):
--            - levantamento, orcamento, proposta ou contrato ligado -> qualificada
--            - senao, visita ligada nao cancelada                    -> visitaMarcada
--            - senao, chamada ligada (entity_interactions.negocio_id) -> emContacto
--            - senao (nada ligado)                                  -> nova
--        * sem negocio aberto -> como hoje (visitas, chamadas da pessoa).
--      O filtro p_etapa de neg_resumo_pessoas usa a mesma regra (mesmo CASE,
--      mesmos predicados). As contagens (negocios_abertos, ganhos, perdidos)
--      nao mudam.
--   B. neg_ficha_pessoa devolve pessoa.nif_ultimos3 (anew_entities.nif_last3, so
--      os 3 digitos) e pessoa.tem_nif passa a ser verdadeiro se a entidade tem
--      nif_hash OU se existe a ligacao fiscal principal em vigor (modelo antigo).
--      Nunca o NIF completo, o hash nem a cifra.
--
-- SO RH (uetjghdkwbywbftedtth). Nao toca na Mudelar nem na base principal.
--
-- DESVIO AO PEDIDO (B), A DECIDIR NA REVISAO: authenticated NAO tem SELECT na
--   coluna anew_entities.nif_hash (lido a 26/10: has_column_privilege = false;
--   tem SELECT em nif_last3). neg_ficha_pessoa e SECURITY INVOKER, por isso
--   «e.nif_hash IS NOT NULL» no corpo dela daria «permission denied for column
--   nif_hash» e partia a ficha inteira. Usar nif_last3 em vez do hash tambem
--   nao serve: ha 13 funcoes vivas que escrevem nif_hash e so execute_entity_erasure
--   menciona nif_last3. Por isso esta migration cria UMA funcao nova,
--   fn_neg_pessoa_tem_nif(org, pessoa) -> boolean, SECURITY DEFINER, que so
--   devolve o booleano e so a quem passa o mesmo ambito de leitura de
--   fn_neg_exigir_pessoa (senao devolve false). Nao devolve o hash.
--
-- Custo esperado (caminho quente: a lista de Pessoas):
--   * por linha da pagina (ate p_limite + 1 = 101 linhas): uma leitura de
--     negocios por idx_negocios_entity_org (entity_id, organization_id), ordena
--     os abertos da pessoa (poucos) e LIMIT 1; depois ate 6 EXISTS, cada um uma
--     sonda de indice por negocio_id (levantamentos_negocio_id_key,
--     idx_quotes_negocio_id, idx_proposals_negocio_id,
--     idx_client_contracts_negocio_id, idx_schedule_items_negocio_id,
--     idx_entity_interactions_negocio_id). O CASE para no primeiro verdadeiro.
--     Clientes e pessoas sem negocio aberto nao fazem nenhuma sonda.
--     Ordem de grandeza: < 1 ms por linha, poucos ms por pagina de 50.
--   * filtro p_etapa: uma passagem pelos negocios abertos da organizacao
--     (DISTINCT ON por pessoa) e ate 6 sondas por pessoa com negocio aberto.
--   * sem pesquisas ao catalogo nem funcoes por linha. So se prova a correr
--     (EXPLAIN ANALYZE) na nike com massa: hoje a nike tem 3 negocios abertos
--     vivos e 8 pessoas vivas (contado a 26/10), o que nao mede nada.
--
-- RLS: as duas funcoes sao INVOKER; um documento que a RLS esconda a quem
--   chama nao conta para a fase (o mesmo que ja acontece no Quadro).
--
-- Corpos de referencia lidos de pg_get_functiondef no remoto RH a 26/10; as
-- guardas conferem o md5 de cada um. Nao depende do rascunho 20261231300000
-- (nao mexem nas mesmas funcoes).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas (falham antes de mudar o que quer que seja)
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  v_n    bigint;
  v_nome text;
  v_txt  text;
  r      record;
BEGIN
  -- 0a. uma so assinatura das funcoes que se reescrevem, que se chamam ou de
  --     onde vem a regra
  FOREACH v_nome IN ARRAY ARRAY['neg_resumo_pessoas', 'neg_ficha_pessoa', 'neg_resumo_quadro',
                                'fn_neg_exigir_config', 'fn_neg_exigir_pessoa',
                                'fn_neg_pessoa_no_ambito', 'fn_neg_pessoa_por_negocio',
                                'fn_neg_ficha_seccao']
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Guarda: a funcao public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
  END LOOP;

  -- 0b. as funcoes ainda sao a versao lida (md5 de pg_get_functiondef). Se
  --     alguem as mudou, reler antes de aplicar.
  FOR r IN
    SELECT x.nome, x.h FROM (VALUES
      -- as duas que se reescrevem (copia do corpo vivo)
      ('neg_resumo_pessoas',        '4334e2925ce8f61f31e64a8517b01c19'),
      ('neg_ficha_pessoa',          '82d4dee3fd7e83a6ac9dd74b1200e02c'),
      -- a regra da coluna do Quadro, que se copia
      ('neg_resumo_quadro',         '7aeb2a2299404bc381ae448c877987e5'),
      -- o ambito de leitura que fn_neg_pessoa_tem_nif repete
      ('fn_neg_exigir_pessoa',      '6442d6f7782f82fa76b6908d1487cf79'),
      ('fn_neg_pessoa_no_ambito',   'c7a7be70424773fad627a460dd0e7030'),
      ('fn_neg_pessoa_por_negocio', 'fb6fc66605bd2ff923d9f60fa8ae7e8a'),
      ('fn_neg_exigir_config',      '566f127b4f3cea295f04c916e366cd5d'),
      ('fn_neg_ficha_seccao',       '6f6f3d0fc0bf6da76a624292477403e1')
    ) AS x(nome, h)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Guarda: public.% no remoto ja nao e a versao lida (md5 %, esperado %).',
        r.nome, v_txt, r.h;
    END IF;
  END LOOP;

  -- 0c. as duas que se reescrevem: INVOKER, STABLE, configuracao, resultado e
  --     ACL como lidos (o conferir compara depois com estes mesmos valores)
  FOR r IN
    SELECT x.nome, x.args, x.res FROM (VALUES
      ('neg_resumo_pessoas',
       'p_organization_id uuid, p_papel text, p_etapa text, p_pesquisa text, p_ordem text, p_depois_de_chave text, p_depois_de_id uuid, p_limite integer, p_atribuido_a uuid, p_formulario_id uuid, p_ultimo_resultado text, p_voltou boolean, p_atrasada boolean',
       '2f95ec0bb42fd3a5c19e121d298cfba0'),
      ('neg_ficha_pessoa',
       'p_organization_id uuid, p_entity_id uuid, p_limite integer, p_depois jsonb, p_partes text[]',
       'cd8a1292080b231b3e9a85d440b02023')
    ) AS x(nome, args, res)
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome
      AND pg_get_function_identity_arguments(p.oid)::text = r.args
      AND md5(pg_get_function_result(p.oid))::text = r.res
      AND NOT p.prosecdef
      AND p.provolatile::text = 's'
      AND p.proconfig::text = '{"search_path=public, pg_temp",statement_timeout=5s}'
      AND p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Guarda: public.% nao tem a assinatura, o resultado, a configuracao ou a ACL lidos.', r.nome;
    END IF;
  END LOOP;

  -- 0d. nome novo ainda inexistente
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_neg_pessoa_tem_nif';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existem % funcoes public.fn_neg_pessoa_tem_nif.', v_n;
  END IF;

  -- 0e. colunas que se usam, com o tipo esperado
  FOR r IN
    SELECT x.tab, x.col, x.tipo FROM (VALUES
      ('negocios',            'id',              'uuid'),
      ('negocios',            'entity_id',       'uuid'),
      ('negocios',            'organization_id', 'uuid'),
      ('negocios',            'estado',          'text'),
      ('negocios',            'created_at',      'timestamp with time zone'),
      ('negocios',            'deleted_at',      'timestamp with time zone'),
      ('levantamentos',       'negocio_id',      'uuid'),
      ('levantamentos',       'deleted_at',      'timestamp with time zone'),
      ('quotes',              'negocio_id',      'uuid'),
      ('quotes',              'deleted_at',      'timestamp with time zone'),
      ('proposals',           'negocio_id',      'uuid'),
      ('proposals',           'deleted_at',      'timestamp with time zone'),
      ('proposals',           'is_deleted',      'boolean'),
      ('client_contracts',    'negocio_id',      'uuid'),
      ('client_contracts',    'deleted_at',      'timestamp with time zone'),
      ('schedule_items',      'negocio_id',      'uuid'),
      ('schedule_items',      'organization_id', 'uuid'),
      ('schedule_items',      'status',          'USER-DEFINED'),
      ('schedule_items',      'time_off_type',   'text'),
      ('schedule_items',      'vacation_id',     'uuid'),
      ('entity_interactions', 'negocio_id',      'uuid'),
      ('entity_interactions', 'organization_id', 'uuid'),
      ('entity_interactions', 'interaction_type','text'),
      ('anew_entities',       'nif_hash',        'text'),
      ('anew_entities',       'nif_last3',       'text'),
      ('anew_entities',       'client_since',    'timestamp with time zone')
    ) AS x(tab, col, tipo)
  LOOP
    SELECT c.data_type::text INTO v_txt
    FROM information_schema.columns c
    WHERE c.table_schema::text = 'public' AND c.table_name::text = r.tab
      AND c.column_name::text = r.col;
    IF v_txt IS DISTINCT FROM r.tipo THEN
      RAISE EXCEPTION 'Guarda: public.%.% e % (esperava %).', r.tab, r.col, COALESCE(v_txt, '(nao existe)'), r.tipo;
    END IF;
  END LOOP;

  -- 0f. as funcoes sao INVOKER: authenticated tem de poder ler cada coluna nova
  --     que o corpo passa a ler (senao a lista e a ficha partem para toda a gente)
  FOR r IN
    SELECT x.tab, x.col FROM (VALUES
      ('negocios', 'id'), ('negocios', 'entity_id'), ('negocios', 'organization_id'),
      ('negocios', 'estado'), ('negocios', 'created_at'), ('negocios', 'deleted_at'),
      ('levantamentos', 'negocio_id'), ('levantamentos', 'deleted_at'),
      ('quotes', 'negocio_id'), ('quotes', 'deleted_at'),
      ('proposals', 'negocio_id'), ('proposals', 'deleted_at'), ('proposals', 'is_deleted'),
      ('client_contracts', 'negocio_id'), ('client_contracts', 'deleted_at'),
      ('schedule_items', 'negocio_id'), ('schedule_items', 'organization_id'),
      ('schedule_items', 'status'), ('schedule_items', 'time_off_type'), ('schedule_items', 'vacation_id'),
      ('entity_interactions', 'negocio_id'), ('entity_interactions', 'organization_id'),
      ('entity_interactions', 'interaction_type'),
      ('anew_entities', 'nif_last3'), ('anew_entities', 'client_since')
    ) AS x(tab, col)
  LOOP
    IF NOT has_column_privilege('authenticated', ('public.' || r.tab)::text, r.col::text, 'SELECT') THEN
      RAISE EXCEPTION 'Guarda: authenticated nao le public.%.% (as funcoes sao INVOKER).', r.tab, r.col;
    END IF;
  END LOOP;
  -- e a razao de fn_neg_pessoa_tem_nif existir: authenticated nao le nif_hash.
  -- Se isto mudar, reler o desenho de B antes de aplicar.
  IF has_column_privilege('authenticated', 'public.anew_entities'::text, 'nif_hash'::text, 'SELECT') THEN
    RAISE EXCEPTION 'Guarda: authenticated passou a ler anew_entities.nif_hash; reler o desenho de tem_nif.';
  END IF;

  -- 0g. os indices por negocio_id (e o da pessoa) em que o custo assenta
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_index x
  JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
  WHERE i.relnamespace = 'public'::regnamespace AND x.indisvalid
    AND (i.relname::text, pg_get_indexdef(x.indexrelid)::text) IN (
      ('idx_negocios_entity_org',            'CREATE INDEX idx_negocios_entity_org ON public.negocios USING btree (entity_id, organization_id)'),
      ('levantamentos_negocio_id_key',       'CREATE UNIQUE INDEX levantamentos_negocio_id_key ON public.levantamentos USING btree (negocio_id)'),
      ('idx_quotes_negocio_id',              'CREATE INDEX idx_quotes_negocio_id ON public.quotes USING btree (negocio_id)'),
      ('idx_proposals_negocio_id',           'CREATE INDEX idx_proposals_negocio_id ON public.proposals USING btree (negocio_id)'),
      ('idx_client_contracts_negocio_id',    'CREATE INDEX idx_client_contracts_negocio_id ON public.client_contracts USING btree (negocio_id)'),
      ('idx_schedule_items_negocio_id',      'CREATE INDEX idx_schedule_items_negocio_id ON public.schedule_items USING btree (negocio_id)'),
      ('idx_entity_interactions_negocio_id', 'CREATE INDEX idx_entity_interactions_negocio_id ON public.entity_interactions USING btree (negocio_id)'));
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'Guarda: faltam indices por negocio_id (% de 7 como esperado).', v_n;
  END IF;

  -- 0h. o estado 'cancelled' da visita existe
  SELECT count(*) INTO v_n FROM pg_catalog.pg_enum e
  WHERE e.enumtypid = 'public.schedule_item_status'::regtype AND e.enumlabel::text = 'cancelled';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Guarda: schedule_item_status sem o valor cancelled (% linhas).', v_n;
  END IF;
END
$guarda$;

-- -----------------------------------------------------------------------------
-- A. neg_resumo_pessoas: a etapa pela fase do primeiro negocio aberto
--    (mesma assinatura, INVOKER, STABLE, search_path e statement_timeout 5s;
--    CREATE OR REPLACE mantem a ACL viva)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_resumo_pessoas(p_organization_id uuid, p_papel text DEFAULT NULL::text, p_etapa text DEFAULT NULL::text, p_pesquisa text DEFAULT NULL::text, p_ordem text DEFAULT 'recentes'::text, p_depois_de_chave text DEFAULT NULL::text, p_depois_de_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 50, p_atribuido_a uuid DEFAULT NULL::uuid, p_formulario_id uuid DEFAULT NULL::uuid, p_ultimo_resultado text DEFAULT NULL::text, p_voltou boolean DEFAULT NULL::boolean, p_atrasada boolean DEFAULT NULL::boolean)
 RETURNS TABLE(entity_id uuid, nome text, papel text, lead_id uuid, client_id uuid, assigned_to uuid, lead_status text, closure_result text, etapa text, negocios_abertos integer, negocios_ganhos integer, negocios_perdidos integer, fase_mais_avancada text, pronto_a_ganhar boolean, valor_em_jogo numeric, ultimo_contacto_em timestamp with time zone, proxima_visita_em timestamp with time zone, ultima_visita_feita_em timestamp with time zone, ultimo_negocio_em timestamp with time zone, por_ligar_contactos integer, por_ligar_visitas integer, por_ligar_levantamentos integer, chave_ordem text, ha_mais boolean, criado_em timestamp with time zone, qualificacao_tipo text, ultima_atividade_em timestamp with time zone, ultimo_contacto_lead_em timestamp with time zone, voltou_a_contactar boolean, origem text, origem_detalhe text, campanha_id uuid, campanha text, formulario_id uuid, formulario text, ultimo_resultado text, atrasada boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
#variable_conflict use_column
DECLARE
  v_ordem    text := COALESCE(p_ordem, 'recentes');
  v_pesquisa text := NULLIF(btrim(p_pesquisa), '');
  v_padrao   text;
  v_depois   timestamptz;
  v_momento  text;
  v_ents     uuid[];
  v_pesq     uuid[];
  v_filtro   uuid[];
  v_filtrar  boolean;
  v_conjunto boolean;
  v_uid      uuid := auth.uid();
  v_org      text := p_organization_id::text;
  v_kl       text[];
  v_kc       text[];
  -- «hoje» da regra de atraso: o dia civil de Lisboa
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF p_organization_id IS NULL
     OR v_ordem NOT IN ('recentes', 'nome')
     OR (p_papel IS NOT NULL AND p_papel NOT IN ('lead', 'cliente'))
     OR (p_etapa IS NOT NULL AND p_etapa NOT IN ('nova', 'emContacto', 'visitaMarcada', 'qualificada', 'cliente'))
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois_de_chave IS NULL) <> (p_depois_de_id IS NULL)
     OR char_length(v_pesquisa) < 2 OR char_length(v_pesquisa) > 200
     OR (p_ultimo_resultado IS NOT NULL AND p_ultimo_resultado NOT IN
           ('atendeuInteressado', 'atendeuMaisTarde', 'naoAtendeu', 'semInteresse', 'numeroErrado', 'semContacto')) THEN
    RAISE EXCEPTION 'Valor inválido: organização, ordem, papel, etapa, limite (1 a 100), página, pesquisa (2 a 200 caracteres) ou resultado.'
      USING ERRCODE = 'NG009';
  END IF;

  -- D1: sem linha de configuração visível, lista vazia.
  SELECT c.momento_ganho INTO v_momento
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Âmbito em vigor: leads.view para as entidades lead, clients.view para as
  -- clientes (as mesmas chaves das políticas antigas de leads e de clientes).
  v_kl := CASE WHEN public.has_anew_permission(v_uid, 'leads.view')
               THEN public.crm_scope_keys('leads.view') ELSE ARRAY[]::text[] END;
  v_kc := CASE WHEN public.has_anew_permission(v_uid, 'clients.view')
               THEN public.crm_scope_keys('clients.view') ELSE ARRAY[]::text[] END;
  IF cardinality(v_kl) + cardinality(v_kc) = 0 THEN
    RETURN;
  END IF;

  IF v_pesquisa IS NOT NULL THEN
    v_padrao := '%' || replace(replace(replace(v_pesquisa, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- nome, email e telefone: uma vez, pela auxiliar
    v_pesq := ARRAY(SELECT x.entity_id FROM public.fn_neg_pesquisa_pessoas(p_organization_id, v_pesquisa) x);
  END IF;
  IF v_ordem = 'recentes' AND p_depois_de_chave IS NOT NULL THEN
    BEGIN
      v_depois := p_depois_de_chave::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Valor inválido: chave da página.' USING ERRCODE = 'NG009';
    END;
  END IF;

  -- Filtro de etapa: uma vez, por conjunto, para a organização.
  IF p_etapa IS NOT NULL THEN
    v_ents := ARRAY(
      SELECT e.id
      FROM public.anew_entities e
      LEFT JOIN (
        -- 20261231400000: o PRIMEIRO negócio aberto de cada pessoa (o mais
        -- antigo: created_at, id), numa passagem pelos abertos da organização
        SELECT DISTINCT ON (n.entity_id) n.entity_id AS ent, n.id AS neg
        FROM public.negocios n
        WHERE n.organization_id = p_organization_id AND n.estado = 'aberto' AND n.deleted_at IS NULL
        ORDER BY n.entity_id, n.created_at, n.id
      ) na ON na.ent = e.id
      LEFT JOIN LATERAL (
        -- 20261231400000: a fase desse negócio, pela regra da coluna do Quadro;
        -- só para quem tem negócio aberto e não é cliente (EXISTS por negocio_id)
        SELECT CASE
                 WHEN EXISTS (SELECT 1 FROM public.levantamentos lt
                             WHERE lt.negocio_id = na.neg AND lt.deleted_at IS NULL)
                   OR EXISTS (SELECT 1 FROM public.quotes q
                             WHERE q.negocio_id = na.neg AND q.deleted_at IS NULL)
                   OR EXISTS (SELECT 1 FROM public.proposals pr
                             WHERE pr.negocio_id = na.neg AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
                   OR EXISTS (SELECT 1 FROM public.client_contracts cc
                             WHERE cc.negocio_id = na.neg AND cc.deleted_at IS NULL) THEN 'qualificada'
                 WHEN EXISTS (SELECT 1 FROM public.schedule_items s
                             WHERE s.negocio_id = na.neg
                               AND s.organization_id = p_organization_id
                               AND s.status <> 'cancelled'::public.schedule_item_status
                               AND s.time_off_type IS NULL AND s.vacation_id IS NULL) THEN 'visitaMarcada'
                 WHEN EXISTS (SELECT 1 FROM public.entity_interactions i
                             WHERE i.negocio_id = na.neg
                               AND i.organization_id = p_organization_id
                               AND i.interaction_type = 'call') THEN 'emContacto'
                 ELSE 'nova'
               END AS etapa_neg
        WHERE na.neg IS NOT NULL AND e.client_since IS NULL
      ) nf ON true
      LEFT JOIN (
        SELECT DISTINCT s.entity_id AS ent
        FROM public.schedule_items s
        WHERE s.organization_id = p_organization_id AND s.entity_id IS NOT NULL
          AND s.status <> 'cancelled'::public.schedule_item_status
          AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      ) vi ON vi.ent = e.id
      LEFT JOIN (
        SELECT DISTINCT i.entity_id AS ent
        FROM public.entity_interactions i
        WHERE i.organization_id = p_organization_id AND i.interaction_type = 'call'
      ) co ON co.ent = e.id
      WHERE e.organization_id = p_organization_id AND e.deleted_at IS NULL
        AND CASE
              WHEN e.client_since IS NOT NULL THEN 'cliente'
              WHEN na.ent IS NOT NULL THEN COALESCE(nf.etapa_neg, 'qualificada')
              WHEN vi.ent IS NOT NULL THEN 'visitaMarcada'
              WHEN co.ent IS NOT NULL THEN 'emContacto'
              ELSE 'nova'
            END = p_etapa);
  END IF;

  -- Filtros (responsável, formulário, último resultado, voltou, atrasada):
  -- um conjunto, calculado uma vez para a organização, com as MESMAS
  -- expressões das colunas devolvidas abaixo.
  v_filtrar := p_atribuido_a IS NOT NULL OR p_formulario_id IS NOT NULL OR p_ultimo_resultado IS NOT NULL
               OR p_voltou IS NOT NULL OR p_atrasada IS NOT NULL;
  IF v_filtrar THEN
    v_filtro := ARRAY(
      SELECT e.id
      FROM public.anew_entities e
      LEFT JOIN (
        -- chamadas: uma passagem agrupada pelas da organização
        SELECT i.entity_id AS ent, max(i.interaction_at) AS ultimo,
               (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
        FROM public.entity_interactions i
        WHERE (p_ultimo_resultado IS NOT NULL OR p_voltou IS NOT NULL)
          AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
        GROUP BY i.entity_id
      ) ct ON ct.ent = e.id
      LEFT JOIN (
        -- formulário da campanha da entidade
        SELECT ca.id AS camp, ca.form_id AS fid
        FROM public.campaigns ca
        WHERE p_formulario_id IS NOT NULL AND ca.form_id IS NOT NULL
      ) fc ON fc.camp = e.campaign_id
      LEFT JOIN (
        -- sem campanha: o formulário da primeira submissão da pessoa
        SELECT DISTINCT ON (fs.entity_id) fs.entity_id AS ent, fs.form_id AS fid
        FROM public.form_submissions fs
        WHERE p_formulario_id IS NOT NULL
          AND fs.organization_id = p_organization_id AND fs.form_id IS NOT NULL
          AND fs.deleted_at IS NULL
        ORDER BY fs.entity_id, fs.created_at, fs.id
      ) f1 ON f1.ent = e.id
      LEFT JOIN (
        -- a visita por fazer mais antiga ainda por ligar a um negócio, por
        -- pessoa, depois do último negócio (as mesmas de vs, abaixo)
        SELECT si.entity_id AS ent, min(si.start_datetime) AS por_fazer_desde
        FROM public.schedule_items si
        LEFT JOIN (
          SELECT n.entity_id AS ent, max(n.created_at) AS ultimo_em
          FROM public.negocios n
          WHERE p_atrasada IS NOT NULL AND n.organization_id = p_organization_id AND n.deleted_at IS NULL
          GROUP BY n.entity_id
        ) un ON un.ent = si.entity_id
        WHERE p_atrasada IS NOT NULL
          AND si.organization_id = p_organization_id AND si.entity_id IS NOT NULL
          AND si.time_off_type IS NULL AND si.vacation_id IS NULL
          AND si.negocio_id IS NULL
          AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
          AND si.start_datetime > COALESCE(un.ultimo_em, '-infinity'::timestamptz)
        GROUP BY si.entity_id
      ) vf ON vf.ent = e.id
      WHERE e.organization_id = p_organization_id AND e.deleted_at IS NULL
        AND (p_atribuido_a IS NULL OR e.assigned_to = p_atribuido_a)
        AND (p_formulario_id IS NULL OR COALESCE(fc.fid, f1.fid) = p_formulario_id)
        AND (p_ultimo_resultado IS NULL
             OR (CASE WHEN ct.ultimo IS NULL THEN 'semContacto' ELSE ct.resultado END) = p_ultimo_resultado)
        AND (p_voltou IS NULL
             OR (e.last_activity_at IS NOT NULL
                 AND (ct.ultimo IS NULL OR e.last_activity_at > ct.ultimo)) = p_voltou)
        AND (CASE WHEN p_atrasada IS NULL THEN true
                  ELSE COALESCE(CASE WHEN e.client_since IS NULL AND e.closure_result IS NULL THEN
                                  (LEAST(public.fn_neg_proximo_contacto(p_organization_id, e.id), vf.por_fazer_desde)
                                   AT TIME ZONE 'Europe/Lisbon')::date < v_hoje END, false) = p_atrasada
             END));
    v_ents := CASE WHEN p_etapa IS NULL THEN v_filtro
                   ELSE ARRAY(SELECT unnest(v_ents) INTERSECT SELECT unnest(v_filtro)) END;
  END IF;
  v_conjunto := p_etapa IS NOT NULL OR v_filtrar;

  RETURN QUERY
  WITH cand_r AS (
    -- recentes: pelo índice (organization_id, GREATEST(created_at,
    -- last_activity_at) DESC, id DESC), com LIMIT antes dos agregados
    SELECT e.id AS ent, GREATEST(e.created_at, e.last_activity_at) AS k, NULL::text AS nm
    FROM public.anew_entities e
    WHERE v_ordem = 'recentes'
      AND e.organization_id = p_organization_id AND e.deleted_at IS NULL
      AND (p_papel IS NULL OR (p_papel = 'cliente') = (e.client_since IS NOT NULL))
      AND CASE WHEN e.client_since IS NULL THEN
                 (v_org || ':*' = ANY (v_kl)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kl)
                  OR v_org || ':' || e.created_by::text = ANY (v_kl))
               ELSE
                 (v_org || ':*' = ANY (v_kc)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kc)
                  OR v_org || ':' || e.created_by::text = ANY (v_kc))
          END
      AND (NOT v_conjunto OR e.id = ANY (v_ents))
      AND (v_padrao IS NULL OR e.id = ANY (v_pesq))
      AND (p_depois_de_id IS NULL
           OR (GREATEST(e.created_at, e.last_activity_at), e.id) < (v_depois, p_depois_de_id))
    ORDER BY GREATEST(e.created_at, e.last_activity_at) DESC, e.id DESC
    LIMIT p_limite + 1
  ), cand_n AS (
    -- nome: pelo índice (organization_id, COALESCE(lower(display_name), ''), id)
    SELECT e.id AS ent, NULL::timestamptz AS k, COALESCE(lower(e.display_name), '') AS nm
    FROM public.anew_entities e
    WHERE v_ordem = 'nome'
      AND e.organization_id = p_organization_id AND e.deleted_at IS NULL
      AND (p_papel IS NULL OR (p_papel = 'cliente') = (e.client_since IS NOT NULL))
      AND CASE WHEN e.client_since IS NULL THEN
                 (v_org || ':*' = ANY (v_kl)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kl)
                  OR v_org || ':' || e.created_by::text = ANY (v_kl))
               ELSE
                 (v_org || ':*' = ANY (v_kc)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kc)
                  OR v_org || ':' || e.created_by::text = ANY (v_kc))
          END
      AND (NOT v_conjunto OR e.id = ANY (v_ents))
      AND (v_padrao IS NULL OR e.id = ANY (v_pesq))
      AND (p_depois_de_id IS NULL
           OR (COALESCE(lower(e.display_name), ''), e.id) > (p_depois_de_chave, p_depois_de_id))
    ORDER BY COALESCE(lower(e.display_name), ''), e.id
    LIMIT p_limite + 1
  ), pagina AS (
    SELECT cd.ent, cd.k, cd.nm,
           row_number() OVER (ORDER BY
             CASE WHEN v_ordem = 'recentes' THEN cd.k END DESC,
             CASE WHEN v_ordem = 'recentes' THEN cd.ent END DESC,
             CASE WHEN v_ordem = 'nome' THEN cd.nm END ASC,
             CASE WHEN v_ordem = 'nome' THEN cd.ent END ASC) AS rn,
           count(*) OVER () AS lidas
    FROM (SELECT * FROM cand_r UNION ALL SELECT * FROM cand_n) cd
  )
  SELECT
    pg.ent::uuid,
    e2.display_name::text,
    (CASE WHEN e2.client_since IS NOT NULL THEN 'cliente' ELSE 'lead' END)::text,
    NULL::uuid,
    NULL::uuid,
    e2.assigned_to::uuid,
    NULL::text,
    -- a abordagem encerrada da entidade (semInteresse | obraInviavel), que a
    -- Lista mostra como estado à parte da etapa
    e2.closure_result::text,
    (CASE
       WHEN e2.client_since IS NOT NULL THEN 'cliente'
       WHEN COALESCE(ng.abertos, 0) > 0 THEN COALESCE(nf.etapa_neg, 'qualificada')
       WHEN COALESCE(vs.visitas, 0) > 0 THEN 'visitaMarcada'
       WHEN ct.ultimo IS NOT NULL THEN 'emContacto'
       ELSE 'nova'
     END)::text,
    COALESCE(ng.abertos, 0)::integer,
    COALESCE(ng.ganhos, 0)::integer,
    COALESCE(ng.perdidos, 0)::integer,
    fs.fase::text,
    COALESCE(vl.pronto, false)::boolean,
    vl.valor::numeric,
    ct.ultimo::timestamptz,
    vs.proxima::timestamptz,
    vs.ultima_feita::timestamptz,
    ng.ultimo_em::timestamptz,
    COALESCE(ct.por_ligar, 0)::integer,
    COALESCE(vs.por_ligar, 0)::integer,
    COALESCE(lv.por_ligar, 0)::integer,
    (CASE WHEN v_ordem = 'nome' THEN COALESCE(pg.nm, '')
          ELSE to_char(pg.k AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END)::text,
    (pg.lidas > p_limite)::boolean,
    e2.created_at::timestamptz,
    NULL::text,
    e2.last_activity_at::timestamptz,
    NULL::timestamptz,
    (e2.last_activity_at IS NOT NULL
     AND (ct.ultimo IS NULL OR e2.last_activity_at > ct.ultimo))::boolean,
    og.onome::text,
    NULL::text,
    e2.campaign_id::uuid,
    cp.cnome::text,
    COALESCE(cp.fid, f1.fid)::uuid,
    (CASE WHEN cp.fid IS NOT NULL THEN cp.fnome ELSE f1.fnome END)::text,
    -- resultado da chamada mais recente (entity_interactions 'call'); nulo
    -- sem chamada (a UI diz «Sem contacto») ou com uma chamada sem resultado
    ct.resultado::text,
    -- atrasada: lead não encerrada cujo próximo contacto (a chamada agendada,
    -- fn_neg_proximo_contacto, ou a visita por fazer mais antiga ainda por
    -- ligar) é anterior a hoje em Lisboa. Cliente ou encerrada: nunca.
    COALESCE(CASE WHEN e2.client_since IS NULL AND e2.closure_result IS NULL THEN
               (LEAST(public.fn_neg_proximo_contacto(p_organization_id, pg.ent), vs.por_fazer_desde)
                AT TIME ZONE 'Europe/Lisbon')::date < v_hoje END, false)::boolean
  FROM pagina pg
  JOIN public.anew_entities e2 ON e2.id = pg.ent
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE n.estado = 'aberto')  AS abertos,
           count(*) FILTER (WHERE n.estado = 'ganho')   AS ganhos,
           count(*) FILTER (WHERE n.estado = 'perdido') AS perdidos,
           max(n.created_at) AS ultimo_em
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent AND n.deleted_at IS NULL
  ) ng ON true
  LEFT JOIN LATERAL (
    -- 20261231400000: a etapa de quem tem negócio aberto é a fase do PRIMEIRO
    -- negócio aberto (o mais antigo: created_at, id), pela regra da coluna do
    -- Quadro. Uma leitura por (entity_id, organization_id) e EXISTS por
    -- negocio_id; nada para clientes nem para quem não tem negócio aberto.
    SELECT CASE
             WHEN EXISTS (SELECT 1 FROM public.levantamentos lt
                         WHERE lt.negocio_id = n1.neg AND lt.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM public.quotes q
                         WHERE q.negocio_id = n1.neg AND q.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM public.proposals pr
                         WHERE pr.negocio_id = n1.neg AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
               OR EXISTS (SELECT 1 FROM public.client_contracts cc
                         WHERE cc.negocio_id = n1.neg AND cc.deleted_at IS NULL) THEN 'qualificada'
             WHEN EXISTS (SELECT 1 FROM public.schedule_items s
                         WHERE s.negocio_id = n1.neg
                           AND s.organization_id = p_organization_id
                           AND s.status <> 'cancelled'::public.schedule_item_status
                           AND s.time_off_type IS NULL AND s.vacation_id IS NULL) THEN 'visitaMarcada'
             WHEN EXISTS (SELECT 1 FROM public.entity_interactions i
                         WHERE i.negocio_id = n1.neg
                           AND i.organization_id = p_organization_id
                           AND i.interaction_type = 'call') THEN 'emContacto'
             ELSE 'nova'
           END AS etapa_neg
    FROM (SELECT n.id AS neg
          FROM public.negocios n
          WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
            AND n.estado = 'aberto' AND n.deleted_at IS NULL
          ORDER BY n.created_at, n.id
          LIMIT 1) n1
    WHERE e2.client_since IS NULL
  ) nf ON true
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM public.client_contracts cc JOIN public.negocios n ON n.id = cc.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL AND cc.deleted_at IS NULL) THEN 'contrato'
      WHEN EXISTS (SELECT 1 FROM public.proposals pr JOIN public.negocios n ON n.id = pr.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL
                     AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) THEN 'proposta'
      WHEN EXISTS (SELECT 1 FROM public.quotes q JOIN public.negocios n ON n.id = q.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL AND q.deleted_at IS NULL) THEN 'orcamento'
    END AS fase
  ) fs ON true
  LEFT JOIN LATERAL (
    SELECT sum(public.fn_neg_valor_negocio(n.id)) AS valor,
           bool_or(CASE
             WHEN v_momento = 'proposta_aceite' THEN EXISTS (
               SELECT 1 FROM public.proposals pr
               WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                 AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
             WHEN v_momento = 'contrato_assinado' THEN EXISTS (
               SELECT 1 FROM public.client_contracts cc
               WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado') AND cc.deleted_at IS NULL)
             ELSE false
           END) AS pronto
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
      AND n.estado = 'aberto' AND n.deleted_at IS NULL
  ) vl ON true
  LEFT JOIN LATERAL (
    SELECT max(i.interaction_at) AS ultimo,
           count(*) FILTER (WHERE i.negocio_id IS NULL
                              AND i.interaction_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
    FROM public.entity_interactions i
    WHERE i.entity_id = pg.ent AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
  ) ct ON true
  LEFT JOIN LATERAL (
    -- visitas da entidade (índice entity_id, organization_id)
    SELECT min(si.start_datetime) FILTER (
             WHERE si.start_datetime >= now()
               AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(si.start_datetime) FILTER (WHERE si.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE si.status <> 'cancelled'::public.schedule_item_status) AS visitas,
           count(*) FILTER (WHERE si.negocio_id IS NULL
                              AND si.status <> 'cancelled'::public.schedule_item_status
                              AND si.start_datetime > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           min(si.start_datetime) FILTER (
             WHERE si.negocio_id IS NULL
               AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
               AND si.start_datetime > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_fazer_desde
    FROM public.schedule_items si
    WHERE si.entity_id = pg.ent
      AND si.organization_id = p_organization_id
      AND si.time_off_type IS NULL AND si.vacation_id IS NULL
  ) vs ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS por_ligar
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = pg.ent
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)
  ) lv ON true
  LEFT JOIN LATERAL (
    -- campanha da entidade e o seu formulário
    SELECT ca.name AS cnome, f.id AS fid, f.name AS fnome
    FROM public.campaigns ca
    LEFT JOIN public.forms f ON f.id = ca.form_id
    WHERE ca.id = e2.campaign_id
  ) cp ON true
  LEFT JOIN LATERAL (
    -- sem formulário de campanha: o da primeira submissão da pessoa
    SELECT f.id AS fid, f.name AS fnome
    FROM public.form_submissions fsb
    JOIN public.forms f ON f.id = fsb.form_id
    WHERE fsb.entity_id = pg.ent AND fsb.organization_id = p_organization_id
      AND fsb.deleted_at IS NULL
    ORDER BY fsb.created_at, fsb.id
    LIMIT 1
  ) f1 ON true
  LEFT JOIN LATERAL (
    SELECT ls.name AS onome
    FROM public.lead_sources ls
    WHERE ls.id = e2.origin_id
  ) og ON true
  WHERE pg.rn <= p_limite
  ORDER BY pg.rn;
END;
$function$;

-- -----------------------------------------------------------------------------
-- B0. fn_neg_pessoa_tem_nif: so o booleano «a entidade tem nif_hash», para
--     neg_ficha_pessoa (INVOKER, sem SELECT em nif_hash). DEFINER, com o mesmo
--     ambito de leitura de fn_neg_exigir_pessoa: fora dele devolve false, para
--     nao revelar se uma pessoa de fora do ambito tem NIF. Nunca devolve o hash.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.fn_neg_pessoa_tem_nif(p_organization_id uuid, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_organization_id IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT COALESCE(public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'view'), false)
     AND NOT COALESCE(public.fn_neg_pessoa_por_negocio(p_organization_id, p_entity_id), false) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.anew_entities e
                 WHERE e.id = p_entity_id
                   AND e.organization_id = p_organization_id
                   AND e.deleted_at IS NULL
                   AND e.nif_hash IS NOT NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_pessoa_tem_nif(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_pessoa_tem_nif(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_neg_pessoa_tem_nif(uuid, uuid) IS
  'Pipeline: true se a pessoa (no ambito de leitura de quem chama) tem NIF gravado (anew_entities.nif_hash). Fora do ambito, false. Nunca devolve o hash. Usada por neg_ficha_pessoa (tem_nif).';

-- -----------------------------------------------------------------------------
-- B. neg_ficha_pessoa: a mesma etapa, nif_ultimos3 e tem_nif pelo nif_hash
--    (mesma assinatura, INVOKER, STABLE, search_path e statement_timeout 5s)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_ficha_pessoa(p_organization_id uuid, p_entity_id uuid, p_limite integer DEFAULT 30, p_depois jsonb DEFAULT NULL::jsonb, p_partes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_momento   text;
  v_conv      text;
  v_base      boolean;
  v_ent       record;
  v_pessoa    jsonb;
  v_lead_j    jsonb;
  v_abertas   jsonb;
  v_agreg     jsonb;
  v_perm      jsonb;
  v_negocios  jsonb;
  v_docs      jsonb;
  v_ng        record;
  v_ct        record;
  v_vs        record;
  v_lv_por    bigint;
  v_etapa     text;
  v_res       jsonb;
  v_uid       uuid;
  v_ch_editar text[];
  v_ch_apagar text[];
  v_q_titulo  text;   -- 20261231100000: título da secção Qualificação
  v_neg1      uuid;   -- 20261231400000: o primeiro negócio aberto da pessoa
BEGIN
  -- 1. Valores
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_partes IS NOT NULL AND (cardinality(p_partes) = 0 OR EXISTS (
           SELECT 1 FROM unnest(p_partes) AS x(parte)
           WHERE x.parte IS NULL
              OR x.parte NOT IN ('base', 'contactos', 'visitas', 'levantamentos', 'atividade'))))
     OR (p_depois IS NOT NULL AND jsonb_typeof(p_depois) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'Valor inválido: limite (1 a 100), partes ou páginas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_depois) = 'object' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_depois) AS k(chave)
               WHERE k.chave NOT IN ('contactos', 'visitas', 'levantamentos', 'atividade')) THEN
      RAISE EXCEPTION 'Valor inválido: páginas.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- 2. Guardas, antes de qualquer leitura de registos; as secções não as
  --    repetem para esta organização e pessoa nesta transacção.
  v_momento := public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  PERFORM set_config('app.neg_ficha_verificada',
                     p_organization_id::text || ':' || p_entity_id::text, true);

  v_base := p_partes IS NULL OR 'base' = ANY (p_partes);

  IF v_base THEN
    -- 20261228200000: a pessoa é a entidade, como no quadro e na lista
    -- (papel por client_since, responsável, origem, campanha, atividade e
    -- abordagem da entidade); já não se leem as tabelas de leads nem de clientes.
    SELECT e.client_since, e.assigned_to, e.origin_id, e.campaign_id,
           e.last_activity_at, e.created_at, e.closure_result
      INTO v_ent
    FROM public.anew_entities e
    WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL;

    -- Agregados: os mesmos predicados de neg_resumo_pessoas.
    SELECT count(*) FILTER (WHERE n.estado = 'aberto')  AS abertos,
           count(*) FILTER (WHERE n.estado = 'ganho')   AS ganhos,
           count(*) FILTER (WHERE n.estado = 'perdido') AS perdidos,
           count(*) AS total,
           max(n.created_at) AS ultimo_em
      INTO v_ng
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id AND n.deleted_at IS NULL;

    SELECT max(i.interaction_at) AS ultimo,
           count(*) FILTER (WHERE i.negocio_id IS NULL
                              AND i.interaction_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           count(*) AS total
      INTO v_ct
    FROM public.entity_interactions i
    WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id AND i.interaction_type = 'call';

    SELECT min(s.start_datetime) FILTER (
             WHERE s.start_datetime >= now()
               AND s.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(s.start_datetime) FILTER (WHERE s.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
      INTO v_vs
    FROM (
      -- 20261228200000: as visitas da entidade (schedule_items.entity_id)
      SELECT si.start_datetime, si.status, si.negocio_id
      FROM public.schedule_items si
      WHERE si.entity_id = p_entity_id
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
    ) s;

    SELECT count(*) INTO v_lv_por
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = p_entity_id
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz);

    -- 20261231400000: com negócio aberto, a etapa é a fase do PRIMEIRO negócio
    -- aberto (o mais antigo: created_at, id), pela regra da coluna do Quadro
    -- (os mesmos predicados de neg_resumo_pessoas).
    IF v_ent.client_since IS NULL AND v_ng.abertos > 0 THEN
      SELECT n.id INTO v_neg1
      FROM public.negocios n
      WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id
        AND n.estado = 'aberto' AND n.deleted_at IS NULL
      ORDER BY n.created_at, n.id
      LIMIT 1;
    END IF;

    v_etapa := CASE
      WHEN v_ent.client_since IS NOT NULL THEN 'cliente'
      WHEN v_ng.abertos > 0 AND v_neg1 IS NULL THEN 'qualificada'
      WHEN v_ng.abertos > 0 THEN CASE
        WHEN EXISTS (SELECT 1 FROM public.levantamentos lt
                    WHERE lt.negocio_id = v_neg1 AND lt.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.quotes q
                    WHERE q.negocio_id = v_neg1 AND q.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.proposals pr
                    WHERE pr.negocio_id = v_neg1 AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
          OR EXISTS (SELECT 1 FROM public.client_contracts cc
                    WHERE cc.negocio_id = v_neg1 AND cc.deleted_at IS NULL) THEN 'qualificada'
        WHEN EXISTS (SELECT 1 FROM public.schedule_items s
                    WHERE s.negocio_id = v_neg1
                      AND s.organization_id = p_organization_id
                      AND s.status <> 'cancelled'::public.schedule_item_status
                      AND s.time_off_type IS NULL AND s.vacation_id IS NULL) THEN 'visitaMarcada'
        WHEN EXISTS (SELECT 1 FROM public.entity_interactions i
                    WHERE i.negocio_id = v_neg1
                      AND i.organization_id = p_organization_id
                      AND i.interaction_type = 'call') THEN 'emContacto'
        ELSE 'nova'
      END
      WHEN v_vs.visitas_lead > 0 THEN 'visitaMarcada'
      WHEN v_ct.ultimo IS NOT NULL THEN 'emContacto'
      ELSE 'nova'
    END;

    v_agreg := jsonb_build_object(
      'ultimo_contacto_em', v_ct.ultimo,
      'ultimo_resultado', (SELECT i.result FROM public.entity_interactions i
                           WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
                             AND i.interaction_type = 'call'
                           ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1),
      'proximo_contacto_em', public.fn_neg_proximo_contacto(p_organization_id, p_entity_id),
      -- O contacto EFECTIVO, a regra da Lista (ultimo_resultado). 20261228200000:
      -- sem lead, é a última chamada (entity_interactions 'call').
      'ultimo_contacto_efetivo_em', v_ct.ultimo,
      'ultimo_resultado_efetivo', (SELECT i.result FROM public.entity_interactions i
                                   WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
                                     AND i.interaction_type = 'call'
                                   ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1),
      'ultima_visita_feita_em', v_vs.ultima_feita,
      'proxima_visita_em', v_vs.proxima,
      'por_ligar', jsonb_build_object('contactos', v_ct.por_ligar, 'visitas', v_vs.por_ligar,
                                      'levantamentos', v_lv_por),
      'negocios', jsonb_build_object('abertos', v_ng.abertos, 'ganhos', v_ng.ganhos,
                                     'perdidos', v_ng.perdidos),
      'total_contactos', v_ct.total,
      'total_visitas', (SELECT count(*)
                        FROM (SELECT si.id FROM public.schedule_items si
                              WHERE si.entity_id = p_entity_id AND si.organization_id = p_organization_id) ids
                        JOIN public.schedule_items s ON s.id = ids.id
                        LEFT JOIN public.schedule_boards b ON b.id = s.board_id
                        WHERE s.time_off_type IS NULL AND s.vacation_id IS NULL
                          AND s.status <> 'cancelled'::public.schedule_item_status
                          AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))),
      'total_levantamentos', (SELECT count(*) FROM public.levantamentos lt
                              WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
                                AND lt.deleted_at IS NULL),
      'total_atividade', (SELECT count(*) FROM public.entity_interactions i
                          WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id));

    v_q_titulo := (SELECT s.titulo FROM public.levantamento_seccoes s
                   WHERE s.organization_id = p_organization_id AND s.chave = 'qualificacao'
                   ORDER BY s.apagada_em NULLS FIRST LIMIT 1);

    -- Pessoa
    SELECT jsonb_build_object(
      'id', p_entity_id,
      'nome', e.display_name,
      -- 20261226100000: o nome em partes (anew_entities), para o ecrã não ter de
      -- partir display_name; NULL quando a entidade não as tem.
      'first_name', e.first_name,
      'last_name', e.last_name,
      -- 20261228200000: papel, responsável e «desde» da entidade (como a lista);
      -- lead_id e client_id vêm a NULL.
      'papel', CASE WHEN v_ent.client_since IS NOT NULL THEN 'cliente' ELSE 'lead' END,
      'lead_id', NULL,
      'client_id', NULL,
      'cliente_desde', v_ent.client_since,
      'responsavel_id', v_ent.assigned_to,
      'responsavel_nome', (SELECT u.name FROM public.anew_users u
                           WHERE u.id = v_ent.assigned_to),
      'etapa', v_etapa,
      'desde', v_ent.created_at,
      'contacto', jsonb_build_object(
        'telefone', (SELECT ph.phone_number FROM public.anew_entity_phones ph
                     WHERE ph.entity_id = p_entity_id
                     ORDER BY ph.is_primary IS TRUE DESC, ph.created_at DESC, ph.id DESC LIMIT 1),
        'email', (SELECT em.email FROM public.anew_entity_emails em
                  WHERE em.entity_id = p_entity_id
                  ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC LIMIT 1)),
      'morada', (SELECT jsonb_build_object(
                          'rua', NULLIF(btrim(concat_ws(' ', a.street, a.number)), ''),
                          'codigo_postal', a.postal_code, 'localidade', a.city,
                          'andar', a.floor, 'distrito', a.district)
                 FROM public.anew_entity_addresses ea
                 JOIN public.anew_addresses a ON a.id = ea.address_id
                 WHERE ea.entity_id = p_entity_id
                   AND (ea.valid_to IS NULL OR ea.valid_to > now())
                 ORDER BY ea.is_primary IS TRUE DESC, ea.created_at DESC, ea.id DESC
                 LIMIT 1),
      -- 20261231100000: as respostas da Qualificação vêm do NEGÓCIO vivo mais
      -- recente que as tenha (ql, abaixo), e já não do levantamento. 'qualificacao'
      -- fica {pergunta: chave} só com as de escolha única; 'qualificacao_respostas'
      -- traz as mesmas com o snapshot (mesma forma de antes).
      'qualificacao', (SELECT jsonb_object_agg(qr.pergunta, qr.resposta) FILTER (WHERE qr.resposta IS NOT NULL)
                       FROM public.negocio_qualificacao_respostas qr
                       WHERE qr.qualificacao_id = ql.id),
      'qualificacao_respostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                   'seccao', 'qualificacao', 'pergunta', qr.pergunta, 'resposta', qr.resposta,
                                   'tipo', qr.tipo, 'pergunta_texto', qr.pergunta_texto,
                                   'seccao_titulo', v_q_titulo, 'bloco', qr.bloco, 'ordem', qr.ordem,
                                   'escolhas', qr.escolhas, 'escolhas_texto', qr.escolhas_texto,
                                   'valor_texto', qr.valor_texto, 'valor_numero', qr.valor_numero)
                                   ORDER BY qr.ordem, qr.pergunta), '[]'::jsonb)
                                 FROM public.negocio_qualificacao_respostas qr
                                 WHERE qr.qualificacao_id = ql.id),
      -- 20261228200000: origem e campanha da entidade (do primeiro contacto),
      -- como a lista: origem = nome em lead_sources; formulário = o da
      -- campanha ou, sem campanha, o da primeira submissão da pessoa. A
      -- campanha é opcional. NULL só sem origem, campanha nem formulário.
      'origem', CASE WHEN v_ent.origin_id IS NULL AND v_ent.campaign_id IS NULL AND fm.fid IS NULL
                     THEN NULL ELSE jsonb_build_object(
                  'origem_id', v_ent.origin_id,
                  'origin', (SELECT ls.name FROM public.lead_sources ls WHERE ls.id = v_ent.origin_id),
                  'source', NULL,
                  'campanha_id', v_ent.campaign_id,
                  'campanha', (SELECT ca.name FROM public.campaigns ca WHERE ca.id = v_ent.campaign_id),
                  'formulario_id', fm.fid,
                  'formulario', fm.fnome) END,
      'nif', NULL,
      -- 20261231400000: só os 3 últimos dígitos (anew_entities.nif_last3);
      -- nunca o NIF completo, o hash nem a cifra.
      'nif_ultimos3', CASE WHEN e.nif_last3 ~ '^[0-9]{3}$' THEN e.nif_last3 END,
      'empresa', NULL,
      -- MQL/SQL era da lead: NULL (como na lista). As respostas da aba
      -- Qualificação continuam na chave 'qualificacao', acima.
      'qualificacao_tipo', NULL,
      -- «Voltou a contactar»: a regra da lista (atividade da entidade depois
      -- da última chamada registada).
      'ultima_atividade_em', v_ent.last_activity_at,
      'ultimo_contacto_lead_em', NULL,
      'voltou_a_contactar', (v_ent.last_activity_at IS NOT NULL
                             AND (v_ct.ultimo IS NULL OR v_ent.last_activity_at > v_ct.ultimo)),
      -- Identidade: tipo da entidade, nome da empresa (organização) e se há
      -- NIF, só em leitura. O NIF nunca sai daqui, nem o id da entidade
      -- fiscal: só se há uma ligação fiscal PRINCIPAL em vigor.
      'tipo', e.type,
      'empresa_nome', CASE WHEN e.type = 'organization' THEN e.display_name END,
      -- 20261231400000: há NIF se a entidade tem o hash do NIF gravado (modelo
      -- novo; lido por fn_neg_pessoa_tem_nif, porque authenticated não lê essa
      -- coluna e esta função é INVOKER) OU se há a ligação fiscal principal em
      -- vigor (modelo antigo, fe).
      'tem_nif', fe.fid IS NOT NULL
                 OR COALESCE(public.fn_neg_pessoa_tem_nif(p_organization_id, p_entity_id), false),
      -- 20261231100000: preferências de contacto e tipo de cliente.
      'preferred_contact', e.preferred_contact,
      'preferred_time', e.preferred_time,
      'locale', e.locale,
      'organization_kind', e.organization_kind,
      'tipo_cliente', CASE WHEN e.type IS NULL THEN NULL
                           WHEN e.type = 'organization' AND e.organization_kind = 'condominio' THEN 'condominio'
                           WHEN e.type = 'organization' THEN 'empresa'
                           ELSE 'particular' END)
      INTO v_pessoa
    FROM (SELECT 1) AS um
    LEFT JOIN public.anew_entities e ON e.id = p_entity_id
    LEFT JOIN LATERAL (
      SELECT aef.fiscal_entity_id AS fid
      FROM public.anew_entity_fiscal_entities aef
      WHERE aef.entity_id = p_entity_id AND aef.is_primary IS TRUE
        AND (aef.valid_to IS NULL OR aef.valid_to > now())
      ORDER BY aef.created_at DESC, aef.id DESC
      LIMIT 1
    ) fe ON true
    LEFT JOIN LATERAL (
      -- 20261231100000: a qualificação do negócio vivo mais recente com respostas.
      SELECT q.id FROM public.negocio_qualificacoes q
      JOIN public.negocios n ON n.id = q.negocio_id
      WHERE n.entity_id = p_entity_id AND n.organization_id = p_organization_id
        AND n.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.negocio_qualificacao_respostas r
                    WHERE r.qualificacao_id = q.id)
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 1
    ) ql ON true
    LEFT JOIN LATERAL (
      -- formulário: o da campanha da entidade, senão o da primeira submissão
      SELECT COALESCE(cf.id, f1.id) AS fid,
             CASE WHEN cf.id IS NOT NULL THEN cf.name ELSE f1.name END AS fnome
      FROM (SELECT 1) AS um2
      LEFT JOIN LATERAL (
        SELECT f.id, f.name FROM public.campaigns ca
        JOIN public.forms f ON f.id = ca.form_id
        WHERE ca.id = v_ent.campaign_id
      ) cf ON true
      LEFT JOIN LATERAL (
        SELECT f.id, f.name
        FROM public.form_submissions fsb
        JOIN public.forms f ON f.id = fsb.form_id
        WHERE fsb.entity_id = p_entity_id AND fsb.organization_id = p_organization_id
          AND fsb.deleted_at IS NULL
        ORDER BY fsb.created_at, fsb.id
        LIMIT 1
      ) f1 ON true
    ) fm ON true;

    -- Abordagem (lead) e encerramento: 20261228200000, da entidade
    -- (anew_entities.closure_result) e da nota 'Abordagem encerrada' mais
    -- recente. Só para entidades lead; 'id' vem a NULL (não há linha de lead).
    IF v_ent.client_since IS NULL THEN
      SELECT jsonb_build_object(
        'id', NULL,
        'entity_id', p_entity_id,
        'estado', NULL,
        'aberta', v_ent.closure_result IS NULL,
        'encerramento', CASE WHEN v_ent.closure_result IS NULL THEN NULL ELSE jsonb_build_object(
          'resultado', v_ent.closure_result,
          'motivo', nt.result,
          'motivo_outro', CASE WHEN nt.result = 'outro' THEN nt.notes END,
          'em', nt.interaction_at) END)
        INTO v_lead_j
      FROM (SELECT 1) AS um
      LEFT JOIN LATERAL (
        SELECT i.result, i.notes, i.interaction_at
        FROM public.entity_interactions i
        WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
          AND i.interaction_type = 'note' AND i.subject = 'Abordagem encerrada'
        ORDER BY i.interaction_at DESC, i.id DESC
        LIMIT 1
      ) nt ON true;
    END IF;

    -- 20261228200000: sem linhas de lead, não há leads abertas a listar (a
    -- abordagem é a da entidade, em 'lead').
    v_abertas := '[]'::jsonb;

    -- 20261226170000: a conversão ao ganhar (uma leitura por chave), para
    -- dizer se um ganho tem a conversão em cliente por fazer.
    v_conv := (SELECT c.conversao_ao_ganhar FROM public.negocio_workflow_config c
               WHERE c.organization_id = p_organization_id);

    v_perm := jsonb_build_object(
      'editar', public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit'),
      'criar',  public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create'));

    -- 20261226190000: as chaves de âmbito de quem chama, lidas UMA vez (não
    -- por negócio). Editar: a regra de fn_neg_pode_editar e da política
    -- negocios_update (sessão, organização CRM do utilizador, pessoas.edit e
    -- a chave da organização inteira, do comercial ou de quem criou; a
    -- equipa entra pelas chaves de crm_scope_keys). Apagar e restaurar: a
    -- regra de fn_negocios_exigir_permissao_lixo (pessoas.delete com o mesmo
    -- tipo de chave).
    v_uid := auth.uid();
    v_ch_editar := CASE WHEN v_uid IS NOT NULL
                          AND p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid))
                          AND public.has_anew_permission(v_uid, 'pessoas.edit')
                        THEN public.crm_scope_keys('pessoas.edit')
                        ELSE ARRAY[]::text[] END;
    v_ch_apagar := CASE WHEN v_uid IS NOT NULL
                          AND public.has_anew_permission(v_uid, 'pessoas.delete')
                        THEN public.crm_scope_keys('pessoas.delete')
                        ELSE ARRAY[]::text[] END;

    -- Negócios (até 50, recentes primeiro), com documentos e os últimos 30 eventos.
    -- 20261226170000: o fecho v4 (tipo de fecho, alerta em aberto com o texto,
    -- origem da decisão com prova e canal, perda automática, conversão por
    -- fazer) e os eventos com detalhe, origem, canal e prova.
    v_negocios := jsonb_build_object(
      'total', v_ng.total,
      'itens', (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
                FROM (
                  SELECT n.id, n.created_at,
                    jsonb_build_object(
                      'id', n.id, 'titulo', n.titulo, 'notas', n.notas, 'estado', n.estado,
                      'criado_em', n.created_at, 'ganho_em', n.ganho_em, 'perdido_em', n.perdido_em,
                      'fase_perda', n.fase_perda, 'motivo_perda', n.motivo_perda,
                      'responsavel_id', n.assigned_to,
                      'responsavel_nome', (SELECT u.name FROM public.anew_users u WHERE u.id = n.assigned_to),
                      'valor', public.fn_neg_valor_negocio(n.id),
                      'pronto_a_ganhar', n.estado = 'aberto' AND CASE
                        WHEN v_momento = 'proposta_aceite' THEN EXISTS (
                          SELECT 1 FROM public.proposals pr
                          WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                            AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
                        WHEN v_momento = 'contrato_assinado' THEN EXISTS (
                          SELECT 1 FROM public.client_contracts cc
                          WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado')
                            AND cc.deleted_at IS NULL)
                        ELSE false END,
                      'parado_desde', CASE WHEN n.estado = 'aberto'
                                           THEN public.fn_neg_parado_desde(n.id) END,
                      'levantamento_id', (SELECT lt.id FROM public.levantamentos lt
                                          WHERE lt.negocio_id = n.id AND lt.deleted_at IS NULL LIMIT 1),
                      'fecho', n.fecho,
                      -- 20261226190000: o que quem chama pode fazer a ESTE negócio.
                      -- pode_editar: a política negocios_update (só a permissão e o
                      -- âmbito; o estado do negócio é à parte, em 'estado').
                      -- pode_apagar e pode_restaurar: o lixo é um UPDATE de deleted_at,
                      -- por isso exige a política de edição E a permissão própria do
                      -- lixo (pessoas.delete com âmbito), que o gatilho verifica.
                      'pode_editar', pm.editar,
                      'pode_apagar', pm.editar AND pm.apagar,
                      'pode_restaurar', pm.editar AND pm.apagar,
                      'alerta_codigo', n.alerta_codigo,
                      'alerta_em', n.alerta_em,
                      -- O texto do alerta em aberto: o detalhe do evento 'alerta' mais
                      -- recente desde que o código ficou (mesma transacção, mesmo instante).
                      'alerta_texto', CASE WHEN n.alerta_codigo IS NOT NULL THEN (
                                        SELECT ea.detalhe FROM public.negocio_eventos ea
                                        WHERE ea.negocio_id = n.id AND ea.tipo = 'alerta'
                                          AND ea.created_at >= n.alerta_em
                                        ORDER BY ea.created_at DESC, ea.id DESC LIMIT 1) END,
                      -- A origem da decisão (nula numa decisão manual): o documento, o
                      -- número dele, o instante do ganho ou da perda, e a prova e o canal
                      -- do evento que a registou.
                      'decisao_origem_tipo', n.decisao_origem_tipo,
                      'decisao_origem_id', n.decisao_origem_id,
                      'decisao_origem_numero', CASE n.decisao_origem_tipo
                        WHEN 'proposta' THEN (SELECT po.proposal_number FROM public.proposals po
                                              WHERE po.id = n.decisao_origem_id)
                        WHEN 'contrato' THEN (SELECT co.contract_number FROM public.client_contracts co
                                              WHERE co.id = n.decisao_origem_id) END,
                      'decisao_origem_em', CASE WHEN n.decisao_origem_id IS NOT NULL THEN
                        CASE n.estado WHEN 'ganho' THEN n.ganho_em WHEN 'perdido' THEN n.perdido_em END END,
                      'decisao_origem_prova', dv.prova,
                      'decisao_origem_canal', dv.canal,
                      'perda_automatica', CASE WHEN n.estado = 'perdido' THEN n.decisao_origem_id IS NOT NULL END,
                      -- Ganho com a conversão em cliente por fazer: 20261228200000, a
                      -- entidade ainda não é cliente (client_since nulo) e a
                      -- configuração converte.
                      'conversao_pendente', CASE WHEN n.estado = 'ganho' THEN
                        v_ent.client_since IS NULL
                        AND COALESCE(v_conv, 'nao_alterar') IS DISTINCT FROM 'nao_alterar' END,
                      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                                       'total', q.total, 'criado_em', q.created_at)
                                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                                     FROM public.quotes q
                                     WHERE q.negocio_id = n.id AND q.deleted_at IS NULL),
                      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                                      'criado_em', pr.created_at)
                                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                                    FROM public.proposals pr
                                    WHERE pr.negocio_id = n.id AND pr.deleted_at IS NULL
                                      AND pr.is_deleted IS NOT TRUE),
                      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                                      'criado_em', cc.created_at,
                                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                                    FROM public.client_contracts cc
                                    WHERE cc.negocio_id = n.id AND cc.deleted_at IS NULL),
                      'eventos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                    'id', ev.id, 'tipo', ev.tipo, 'fase', ev.fase, 'motivo', ev.motivo,
                                    'motivo_reabertura', ev.motivo_reabertura, 'criado_em', ev.created_at,
                                    'criado_por_nome', (SELECT u.name FROM public.anew_users u
                                                        WHERE u.id = ev.created_by),
                                    'detalhe', ev.detalhe, 'origem_tipo', ev.origem_tipo,
                                    'origem_id', ev.origem_id, 'origem_estado', ev.origem_estado,
                                    'canal', ev.canal, 'prova', ev.prova)
                                    ORDER BY ev.created_at DESC, ev.id DESC), '[]'::jsonb)
                                  FROM (SELECT e1.* FROM public.negocio_eventos e1
                                        WHERE e1.negocio_id = n.id
                                        ORDER BY e1.created_at DESC, e1.id DESC
                                        LIMIT 30) ev),
                      -- Há mais de 30 eventos (a ficha mostra os 30 mais recentes).
                      'eventos_tem_mais', EXISTS (SELECT 1 FROM public.negocio_eventos e2
                                                  WHERE e2.negocio_id = n.id
                                                  ORDER BY e2.created_at DESC, e2.id DESC
                                                  OFFSET 30 LIMIT 1),
                      -- 20261231100000: o que o cliente pediu e a qualificação do negócio.
                      'pedido_cliente', n.pedido_cliente,
                      'versao_questionario', nq.versao_questionario,
                      'qualificacao', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                         'seccao', 'qualificacao', 'pergunta', r.pergunta,
                                         'resposta', r.resposta, 'tipo', r.tipo,
                                         'pergunta_texto', r.pergunta_texto, 'seccao_titulo', v_q_titulo,
                                         'bloco', r.bloco, 'ordem', r.ordem, 'escolhas', r.escolhas,
                                         'escolhas_texto', r.escolhas_texto, 'valor_texto', r.valor_texto,
                                         'valor_numero', r.valor_numero)
                                         ORDER BY r.ordem, r.pergunta), '[]'::jsonb)
                                       FROM public.negocio_qualificacao_respostas r
                                       WHERE r.qualificacao_id = nq.id)
                    ) AS item
                  FROM (SELECT n1.* FROM public.negocios n1
                        WHERE n1.organization_id = p_organization_id AND n1.entity_id = p_entity_id
                          AND n1.deleted_at IS NULL
                        ORDER BY n1.created_at DESC, n1.id DESC
                        LIMIT 50) n
                  -- 20261226170000: o evento que registou a decisão (índice
                  -- idx_negocio_eventos_origem), para a prova e o canal.
                  LEFT JOIN LATERAL (
                    SELECT ed.prova, ed.canal FROM public.negocio_eventos ed
                    WHERE n.decisao_origem_id IS NOT NULL
                      AND ed.negocio_id = n.id AND ed.origem_id = n.decisao_origem_id
                      AND ed.tipo = CASE n.estado WHEN 'ganho' THEN 'ganhou' WHEN 'perdido' THEN 'perdeu' END
                    ORDER BY ed.created_at DESC, ed.id DESC
                    LIMIT 1
                  ) dv ON true
                  LEFT JOIN public.negocio_qualificacoes nq ON nq.negocio_id = n.id
                  -- 20261226190000: as permissões deste negócio, contra as chaves
                  -- lidas acima (só memória; nenhuma leitura de tabela por negócio).
                  CROSS JOIN LATERAL (
                    SELECT EXISTS (SELECT 1 FROM unnest(v_ch_editar) AS k(chave)
                                   WHERE k.chave = n.organization_id::text || ':*'
                                      OR k.chave = n.organization_id::text || ':' || n.assigned_to::text
                                      OR k.chave = n.organization_id::text || ':' || n.created_by::text) AS editar,
                           EXISTS (SELECT 1 FROM unnest(v_ch_apagar) AS k(chave)
                                   WHERE k.chave = n.organization_id::text || ':*'
                                      OR k.chave = n.organization_id::text || ':' || n.assigned_to::text
                                      OR k.chave = n.organization_id::text || ':' || n.created_by::text) AS apagar
                  ) pm
                ) x));

    -- Documentos da pessoa ainda sem negócio (até 50 de cada).
    v_docs := jsonb_build_object(
      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                       'total', q.total, 'criado_em', q.created_at)
                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                     FROM (SELECT q1.* FROM public.quotes q1
                           WHERE q1.entity_id = p_entity_id AND q1.organization_id = p_organization_id
                             AND q1.deleted_at IS NULL AND q1.negocio_id IS NULL
                           ORDER BY q1.created_at DESC, q1.id DESC LIMIT 50) q),
      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                      'criado_em', pr.created_at)
                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                    FROM (SELECT p1.* FROM public.proposals p1
                          WHERE p1.entity_id = p_entity_id AND p1.organization_id = p_organization_id
                            AND p1.deleted_at IS NULL AND p1.is_deleted IS NOT TRUE AND p1.negocio_id IS NULL
                          ORDER BY p1.created_at DESC, p1.id DESC LIMIT 50) pr),
      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                      'criado_em', cc.created_at,
                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                    FROM (SELECT c1.* FROM public.client_contracts c1
                          WHERE c1.entity_id = p_entity_id AND c1.organization_id = p_organization_id
                            AND c1.deleted_at IS NULL AND c1.negocio_id IS NULL
                          ORDER BY c1.created_at DESC, c1.id DESC LIMIT 50) cc));
  END IF;

  v_res := jsonb_build_object(
    'pessoa', v_pessoa,
    'lead', v_lead_j,
    'leads_abertas', v_abertas,
    'agregados', v_agreg,
    'permissoes', v_perm,
    'negocios', v_negocios,
    'documentos_por_ligar', v_docs,
    'contactos', CASE WHEN p_partes IS NULL OR 'contactos' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'contactos', p_limite,
                                              p_depois -> 'contactos') END,
    'visitas', CASE WHEN p_partes IS NULL OR 'visitas' = ANY (p_partes) THEN
                 public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'visitas', p_limite,
                                            p_depois -> 'visitas') END,
    'levantamentos', CASE WHEN p_partes IS NULL OR 'levantamentos' = ANY (p_partes) THEN
                       public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'levantamentos', p_limite,
                                                  p_depois -> 'levantamentos') END,
    'atividade', CASE WHEN p_partes IS NULL OR 'atividade' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'atividade', p_limite,
                                              p_depois -> 'atividade') END);

  -- Repõe a marca: as guardas só ficam dispensadas durante esta chamada.
  PERFORM set_config('app.neg_ficha_verificada', '', true);
  RETURN v_res;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 9. Conferir (falha a migration se o resultado nao for o esperado)
-- -----------------------------------------------------------------------------
DO $conferir$
DECLARE
  v_n   bigint;
  v_txt text;
  r     record;
BEGIN
  -- 9a. uma so assinatura, a mesma; INVOKER, STABLE, mesma configuracao, mesmo
  --     resultado e mesma ACL (por proacl) que antes
  FOR r IN
    SELECT x.nome, x.args, x.res FROM (VALUES
      ('neg_resumo_pessoas',
       'p_organization_id uuid, p_papel text, p_etapa text, p_pesquisa text, p_ordem text, p_depois_de_chave text, p_depois_de_id uuid, p_limite integer, p_atribuido_a uuid, p_formulario_id uuid, p_ultimo_resultado text, p_voltou boolean, p_atrasada boolean',
       '2f95ec0bb42fd3a5c19e121d298cfba0'),
      ('neg_ficha_pessoa',
       'p_organization_id uuid, p_entity_id uuid, p_limite integer, p_depois jsonb, p_partes text[]',
       'cd8a1292080b231b3e9a85d440b02023')
    ) AS x(nome, args, res)
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: public.% tem % assinaturas (esperava 1).', r.nome, v_n;
    END IF;
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome
      AND pg_get_function_identity_arguments(p.oid)::text = r.args
      AND md5(pg_get_function_result(p.oid))::text = r.res
      AND NOT p.prosecdef
      AND p.provolatile::text = 's'
      AND p.proconfig::text = '{"search_path=public, pg_temp",statement_timeout=5s}'
      AND p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: public.% mudou de assinatura, resultado, configuracao ou ACL.', r.nome;
    END IF;
  END LOOP;

  -- 9b. o texto novo esta nos corpos e o antigo saiu
  SELECT p.prosrc::text INTO v_txt FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_resumo_pessoas';
  IF v_txt NOT LIKE '%SELECT DISTINCT ON (n.entity_id) n.entity_id AS ent, n.id AS neg%'
     OR v_txt NOT LIKE '%THEN COALESCE(nf.etapa_neg, ''qualificada'')%'
     OR v_txt NOT LIKE '%WHEN COALESCE(ng.abertos, 0) > 0 THEN COALESCE(nf.etapa_neg, ''qualificada'')%'
     OR v_txt LIKE '%WHEN na.ent IS NOT NULL THEN ''qualificada''%'
     OR v_txt LIKE '%WHEN COALESCE(ng.abertos, 0) > 0 THEN ''qualificada''%' THEN
    RAISE EXCEPTION 'Conferir: neg_resumo_pessoas nao tem a regra nova da etapa.';
  END IF;

  SELECT p.prosrc::text INTO v_txt FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_ficha_pessoa';
  IF v_txt NOT LIKE '%SELECT n.id INTO v_neg1%'
     OR v_txt NOT LIKE '%''nif_ultimos3'', CASE WHEN e.nif_last3 ~ ''^[0-9]{3}$'' THEN e.nif_last3 END%'
     OR v_txt NOT LIKE '%public.fn_neg_pessoa_tem_nif(p_organization_id, p_entity_id)%'
     OR v_txt LIKE '%WHEN v_ng.abertos > 0 THEN ''qualificada''%'
     OR v_txt LIKE '%''tem_nif'', fe.fid IS NOT NULL,%' THEN
    RAISE EXCEPTION 'Conferir: neg_ficha_pessoa nao tem a etapa nova, nif_ultimos3 ou tem_nif novo.';
  END IF;
  -- nenhuma das duas devolve o hash nem a cifra
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('neg_resumo_pessoas', 'neg_ficha_pessoa')
    AND (p.prosrc ~ 'nif_hash' OR p.prosrc ~ 'nif_encrypted');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % das funcoes INVOKER le nif_hash ou nif_encrypted.', v_n;
  END IF;

  -- 9c. fn_neg_pessoa_tem_nif: uma assinatura, DEFINER, search_path fixo,
  --     EXECUTE so para authenticated e service_role (sem PUBLIC nem anon)
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_neg_pessoa_tem_nif'
    AND pg_get_function_identity_arguments(p.oid)::text = 'p_organization_id uuid, p_entity_id uuid'
    AND pg_get_function_result(p.oid)::text = 'boolean'
    AND p.prosecdef
    AND array_to_string(p.proconfig, ';')::text = 'search_path=public, pg_temp';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: fn_neg_pessoa_tem_nif nao esta como esperado (% de 1).', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_neg_pessoa_tem_nif'
    AND a.privilege_type::text = 'EXECUTE'
    AND (a.grantee = 0 OR a.grantee = 'anon'::regrole::oid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: fn_neg_pessoa_tem_nif executavel por PUBLIC ou anon (% entradas).', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_neg_pessoa_tem_nif'
    AND a.privilege_type::text = 'EXECUTE'
    AND a.grantee IN ('authenticated'::regrole::oid, 'service_role'::regrole::oid);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: fn_neg_pessoa_tem_nif sem EXECUTE para authenticated e service_role (% de 2).', v_n;
  END IF;

  -- 9d. as funcoes de referencia nao mudaram com esta migration
  FOR r IN
    SELECT x.nome, x.h FROM (VALUES
      ('neg_resumo_quadro',         '7aeb2a2299404bc381ae448c877987e5'),
      ('fn_neg_exigir_pessoa',      '6442d6f7782f82fa76b6908d1487cf79'),
      ('fn_neg_pessoa_no_ambito',   'c7a7be70424773fad627a460dd0e7030'),
      ('fn_neg_pessoa_por_negocio', 'fb6fc66605bd2ff923d9f60fa8ae7e8a'),
      ('fn_neg_exigir_config',      '566f127b4f3cea295f04c916e366cd5d'),
      ('fn_neg_ficha_seccao',       '6f6f3d0fc0bf6da76a624292477403e1')
    ) AS x(nome, h)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Conferir: public.% mudou (md5 %, esperado %).', r.nome, v_txt, r.h;
    END IF;
  END LOOP;
END
$conferir$;
