-- =============================================================================
-- 20261231100000_qualificacao_negocio_e_contacto.sql  (base RH)
--
-- Qualificação passa a viver no NEGÓCIO (negocio_qualificacoes e
-- negocio_qualificacao_respostas), «o que o cliente pediu» no negócio, origem
-- da morada da obra no levantamento, preferências de contacto da pessoa e o
-- tipo de cliente Condomínio.
--
-- ATENÇÃO, EXIGE CÓDIGO NOVO NO FRONTEND, NO MESMO ENVIO:
--   * neg_guardar_levantamento passa a RECUSAR (NG009) respostas a perguntas da
--     secção com aba 'qualificacao'. O ecrã da aba Qualificação tem de deixar
--     de as enviar no levantamento e passar a chamar neg_guardar_qualificacao.
--   * neg_ficha_pessoa passa a ler a qualificação de negocio_qualificacao_respostas
--     (as respostas antigas em levantamento_respostas deixam de aparecer; hoje há 0).
--   * Os tipos (src/integrations/supabase/types.ts) têm de ser regenerados.
-- O resto é compatível com o código actual (morada_origem é derivada quando não vem).
--
-- Recriadas também (mesma assinatura, a partir da versão do remoto):
--   * fn_form_criar_entidade: a língua que os formulários públicos mandam
--     (create-lead, book-slot) só se grava se tiver o formato de código de
--     língua; senão fica 'pt'. Sem isto o CHECK de locale fazia perder a lead.
--   * neg_guardar_questionario: a guarda D4 (o tipo de uma pergunta só muda
--     sem respostas) passa a contar também as respostas da qualificação do
--     negócio (negocio_qualificacao_respostas).
--
-- Escritas de dados: só a semente do questionário na org nike
-- (b6ffce4f-f630-4933-833a-008649757a33). Nenhuma outra organização é tocada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas (falham antes de mudar o que quer que seja)
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  v_n    bigint;
  v_nome text;
BEGIN
  -- uma só assinatura das funções que se recriam ou que se usam
  FOREACH v_nome IN ARRAY ARRAY['neg_guardar_levantamento', 'neg_ficha_pessoa',
                                'neg_guardar_identidade_pessoa', 'fn_neg_ficha_seccao',
                                'fn_negocios_fechado_so_leitura', 'fn_neg_semear_questionario',
                                'fn_neg_negocio_editavel', 'fn_negocios_actor',
                                'fn_negocios_ref_utilizador_apagado', 'resolve_root_organization_id',
                                'update_updated_at_column', 'fn_form_criar_entidade',
                                'neg_guardar_questionario']
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Guarda: a função public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
  END LOOP;

  -- as duas funções que se copiam do remoto (pontos 6g e 6h) ainda são a versão
  -- que se copiou: se alguém as mudou entretanto, recopiar antes de aplicar.
  SELECT pg_get_functiondef(p.oid)::text INTO v_nome FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_form_criar_entidade';
  IF position('v_locale  text := COALESCE(NULLIF(btrim(p_locale), ''''), ''pt'');' IN v_nome) = 0 THEN
    RAISE EXCEPTION 'Guarda: fn_form_criar_entidade no remoto já não é a versão copiada.';
  END IF;
  SELECT pg_get_functiondef(p.oid)::text INTO v_nome FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_questionario';
  IF position('D4 (20/10): o tipo só muda enquanto a pergunta não tiver respostas.' IN v_nome) = 0
     OR position('negocio_qualificacao_respostas' IN v_nome) > 0 THEN
    RAISE EXCEPTION 'Guarda: neg_guardar_questionario no remoto já não é a versão copiada.';
  END IF;

  -- as funções novas ainda não existem
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('neg_guardar_qualificacao', 'neg_guardar_contacto_pessoa',
                            'fn_neg_validar_respostas', 'fn_negocio_qualificacao_pai',
                            'fn_negocio_qualificacao_exigir_rpc',
                            'fn_negocio_qualificacoes_preparar_insercao',
                            'fn_negocio_qualificacoes_guardar_alteracao',
                            'fn_negocio_qualificacao_respostas_guardar');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já existem % funções com os nomes novos.', v_n;
  END IF;

  -- as tabelas e as colunas novas ainda não existem
  IF to_regclass('public.negocio_qualificacoes') IS NOT NULL
     OR to_regclass('public.negocio_qualificacao_respostas') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: as tabelas da qualificação do negócio já existem.';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
    AND ((c.relname::text = 'anew_entities' AND a.attname::text = 'organization_kind')
      OR (c.relname::text = 'negocios'      AND a.attname::text = 'pedido_cliente')
      OR (c.relname::text = 'levantamentos' AND a.attname::text = 'morada_origem'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % das colunas novas já existem.', v_n;
  END IF;

  -- negocios NÃO tem UNIQUE (id, organization_id): a coerência da organização
  -- fica nos gatilhos (não se acrescenta o UNIQUE só para isto).
  -- O gatilho de negócio fechado existe com este nome (é recriado no ponto 5).
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                 WHERE t.tgrelid = to_regclass('public.negocios')
                   AND t.tgname::text = 'trg_01_negocios_fechado_so_leitura') THEN
    RAISE EXCEPTION 'Guarda: falta o gatilho trg_01_negocios_fechado_so_leitura.';
  END IF;

  -- dados que os CHECKs novos não podem rejeitar
  SELECT count(*) INTO v_n FROM public.anew_entities e
  WHERE e.preferred_time IS NOT NULL AND e.preferred_time NOT IN ('manha', 'tarde', 'fim_do_dia');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % entidades com preferred_time fora de manha, tarde, fim_do_dia.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_entities e
  WHERE e.locale IS NULL OR e.locale !~ '^[a-z]{2}(-[a-z]{2,4})?$';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % entidades com locale fora do formato de código de língua.', v_n;
  END IF;

  -- morada_coerente: um levantamento com morada e sem origem violaria o CHECK
  -- (e um levantamento ligado não se pode actualizar para a preencher).
  SELECT count(*) INTO v_n FROM public.levantamentos l
  WHERE l.morada_rua IS NOT NULL OR l.morada_codigo_postal IS NOT NULL
     OR l.morada_localidade IS NOT NULL OR l.morada_andar IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % levantamentos já têm morada; é preciso decidir a origem antes.', v_n;
  END IF;

  -- respostas de qualificação no levantamento deixariam de aparecer na ficha
  SELECT count(*) INTO v_n FROM public.levantamento_respostas r WHERE r.seccao = 'qualificacao';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % respostas de qualificação em levantamento_respostas; migrar antes.', v_n;
  END IF;

  -- a nike existe e tem a página Pessoas configurada
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o
                 WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid) THEN
    RAISE EXCEPTION 'Guarda: a organização nike não existe ou não tem negocio_workflow_config.';
  END IF;
END;
$guarda$;

-- -----------------------------------------------------------------------------
-- 1. Colunas e CHECKs nas tabelas existentes
-- -----------------------------------------------------------------------------

-- 1a. Pessoa: tipo de cliente Condomínio (type fica person | organization).
--     Leitura: person = Particular; organization com kind nulo ou 'empresa' =
--     Empresa; organization com kind 'condominio' = Condomínio.
--     Locale: CHECK de FORMATO e não de lista fechada, porque os formulários
--     públicos gravam a língua da página (create-lead, book-slot ->
--     form_criar_entidade) e podem ter es, de, it, ... configurados; uma lista
--     fechada faria perder leads. A lista pt/en/fr fica na RPC da ficha.
--     Mesmo o formato podia rejeitar uma língua mal escrita vinda da página
--     (pt-PT, PT, vazio...): por isso fn_form_criar_entidade é recriada no
--     ponto 6g para gravar 'pt' quando a língua não casa com o formato.
ALTER TABLE public.anew_entities
  ADD COLUMN organization_kind text NULL,
  ADD CONSTRAINT anew_entities_organization_kind_check
    CHECK (organization_kind IS NULL OR organization_kind IN ('empresa', 'condominio')),
  ADD CONSTRAINT anew_entities_organization_kind_tipo_check
    CHECK (organization_kind IS NULL OR type = 'organization'),
  ADD CONSTRAINT anew_entities_preferred_time_check
    CHECK (preferred_time IS NULL OR preferred_time IN ('manha', 'tarde', 'fim_do_dia')),
  ADD CONSTRAINT anew_entities_locale_check
    CHECK (locale ~ '^[a-z]{2}(-[a-z]{2,4})?$');

COMMENT ON COLUMN public.anew_entities.organization_kind IS
  'Só para type = organization: empresa ou condominio (nulo lê-se como empresa). Na ficha muda-se por neg_guardar_identidade_pessoa; o INSERT directo na tabela (authenticated tem INSERT de tabela) também a pode definir, limitado pelos CHECKs de valor e de tipo/kind (só com type = organization).';

-- anew_entities concede SELECT e UPDATE coluna a coluna (o direito de tabela
-- de authenticated é só INSERT e DELETE): sem isto, neg_ficha_pessoa (SECURITY
-- INVOKER) dava «permission denied for column» em todas as chamadas.
-- Só leitura no UPDATE: a alteração é pela RPC SECURITY DEFINER (o INSERT de
-- tabela de authenticated cobre todas as colunas, esta incluída).
GRANT SELECT (organization_kind) ON public.anew_entities TO authenticated;

-- 1b. Negócio: o que o cliente pediu.
ALTER TABLE public.negocios
  ADD COLUMN pedido_cliente text NULL,
  ADD CONSTRAINT negocios_pedido_cliente_check
    CHECK (pedido_cliente IS NULL OR (btrim(pedido_cliente) <> '' AND char_length(pedido_cliente) <= 2000));

COMMENT ON COLUMN public.negocios.pedido_cliente IS
  'O que o cliente pediu (texto livre, até 2000). Escreve-se por neg_guardar_qualificacao.';

-- 1c. Levantamento: de onde veio a morada da obra.
ALTER TABLE public.levantamentos
  ADD COLUMN morada_origem text NULL,
  ADD CONSTRAINT levantamentos_morada_origem_check
    CHECK (morada_origem IS NULL OR morada_origem IN ('entidade', 'manual', 'localizacao')),
  ADD CONSTRAINT levantamentos_morada_coerente
    CHECK ((morada_origem IS NULL) = (morada_rua IS NULL AND morada_codigo_postal IS NULL
                                      AND morada_localidade IS NULL AND morada_andar IS NULL));

COMMENT ON COLUMN public.levantamentos.morada_origem IS
  'entidade = igual à morada principal da pessoa no momento em que se gravou; manual = escrita ou alterada à mão; localizacao = preenchida com a localização do dispositivo (só a morada, sem coordenadas). Derivada por neg_guardar_levantamento, salvo quando o ecrã manda manual ou localizacao.';

-- -----------------------------------------------------------------------------
-- 2. Tabelas novas
-- -----------------------------------------------------------------------------
CREATE TABLE public.negocio_qualificacoes (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  root_organization_id uuid        NULL,
  negocio_id           uuid        NOT NULL,
  versao_questionario  integer     NULL,
  preenchida_por       uuid        NULL,
  created_by           uuid        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT negocio_qualificacoes_pkey PRIMARY KEY (id),
  CONSTRAINT negocio_qualificacoes_negocio_id_key UNIQUE (negocio_id),
  CONSTRAINT negocio_qualificacoes_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT negocio_qualificacoes_negocio_id_fkey
    FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE RESTRICT,
  CONSTRAINT negocio_qualificacoes_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  CONSTRAINT negocio_qualificacoes_root_organization_id_fkey
    FOREIGN KEY (root_organization_id) REFERENCES public.anew_organizations(id),
  CONSTRAINT negocio_qualificacoes_preenchida_por_fkey
    FOREIGN KEY (preenchida_por) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT negocio_qualificacoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT negocio_qualificacoes_versao_check
    CHECK (versao_questionario IS NULL OR versao_questionario >= 0)
);

COMMENT ON TABLE public.negocio_qualificacoes IS
  'Cabeçalho da qualificação de um negócio (uma por negócio). Escreve-se só por neg_guardar_qualificacao.';

CREATE INDEX idx_negocio_qualificacoes_organization_id ON public.negocio_qualificacoes (organization_id);
CREATE INDEX idx_negocio_qualificacoes_created_by ON public.negocio_qualificacoes (created_by);
CREATE INDEX idx_negocio_qualificacoes_preenchida_por ON public.negocio_qualificacoes (preenchida_por);

CREATE TABLE public.negocio_qualificacao_respostas (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  qualificacao_id  uuid          NOT NULL,
  organization_id  uuid          NOT NULL,
  pergunta         text          NOT NULL,
  tipo             text          NOT NULL,
  pergunta_texto   text          NOT NULL,
  bloco            text          NULL,
  ordem            integer       NOT NULL,
  escolhas         text[]        NULL,
  escolhas_texto   text[]        NULL,
  valor_texto      text          NULL,
  valor_numero     numeric(14,3) NULL,
  resposta         text          NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT negocio_qualificacao_respostas_pkey PRIMARY KEY (id),
  CONSTRAINT negocio_qualificacao_respostas_qualificacao_pergunta_key UNIQUE (qualificacao_id, pergunta),
  -- FK composta: a organização da resposta é sempre a do cabeçalho
  CONSTRAINT negocio_qualificacao_respostas_qualificacao_fkey
    FOREIGN KEY (qualificacao_id, organization_id)
    REFERENCES public.negocio_qualificacoes(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT negocio_qualificacao_respostas_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  CONSTRAINT negocio_qualificacao_respostas_pergunta_check
    CHECK (pergunta ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  CONSTRAINT negocio_qualificacao_respostas_resposta_check
    CHECK (resposta IS NULL OR resposta ~ '^[a-z0-9][A-Za-z0-9]{0,39}$'),
  CONSTRAINT negocio_qualificacao_respostas_tipo_check
    CHECK (tipo IN ('escolha_unica', 'escolha_multipla', 'texto', 'numero')),
  CONSTRAINT negocio_qualificacao_respostas_snapshot_textos_check
    CHECK (char_length(pergunta_texto) BETWEEN 1 AND 200
           AND (bloco IS NULL OR char_length(bloco) BETWEEN 1 AND 80)
           AND (valor_texto IS NULL OR char_length(valor_texto) BETWEEN 1 AND 2000)
           AND ordem >= 0),
  CONSTRAINT negocio_qualificacao_respostas_escolhas_limites_check
    CHECK ((escolhas IS NULL
            OR (array_ndims(escolhas) = 1 AND cardinality(escolhas) BETWEEN 1 AND 30
                AND array_position(escolhas, NULL::text) IS NULL
                AND strpos(array_to_string(escolhas, ''), ',') = 0
                AND array_to_string(escolhas, ',') ~ '^[a-z0-9][A-Za-z0-9]{0,39}(,[a-z0-9][A-Za-z0-9]{0,39})*$'))
           AND (escolhas_texto IS NULL
            OR (array_ndims(escolhas_texto) = 1 AND cardinality(escolhas_texto) BETWEEN 1 AND 30
                AND array_position(escolhas_texto, NULL::text) IS NULL
                AND '' <> ALL (escolhas_texto)
                AND strpos(array_to_string(escolhas_texto, ''), chr(1)) = 0
                AND array_to_string(escolhas_texto, chr(1)) !~ '[^\x01]{81}'))),
  -- coerência tipo/valor (como levantamento_respostas_snapshot_check, sem o caso legado)
  CONSTRAINT negocio_qualificacao_respostas_snapshot_check
    CHECK (COALESCE(CASE
      WHEN tipo = 'escolha_unica' THEN
        escolhas IS NOT NULL AND escolhas_texto IS NOT NULL
        AND array_ndims(escolhas) = 1 AND cardinality(escolhas) = 1
        AND array_ndims(escolhas_texto) = 1 AND cardinality(escolhas_texto) = 1
        AND escolhas[1] IS NOT NULL AND escolhas_texto[1] IS NOT NULL
        AND resposta IS NOT NULL AND resposta = escolhas[1]
        AND valor_texto IS NULL AND valor_numero IS NULL
      WHEN tipo = 'escolha_multipla' THEN
        escolhas IS NOT NULL AND escolhas_texto IS NOT NULL
        AND array_ndims(escolhas) = 1 AND cardinality(escolhas) BETWEEN 1 AND 30
        AND array_ndims(escolhas_texto) = 1 AND cardinality(escolhas_texto) = cardinality(escolhas)
        AND array_position(escolhas, NULL::text) IS NULL
        AND array_position(escolhas_texto, NULL::text) IS NULL
        AND resposta IS NULL AND valor_texto IS NULL AND valor_numero IS NULL
      WHEN tipo = 'texto' THEN
        valor_texto IS NOT NULL AND resposta IS NULL AND escolhas IS NULL
        AND escolhas_texto IS NULL AND valor_numero IS NULL
      WHEN tipo = 'numero' THEN
        valor_numero IS NOT NULL AND resposta IS NULL AND escolhas IS NULL
        AND escolhas_texto IS NULL AND valor_texto IS NULL
      ELSE false
    END, false))
);

COMMENT ON TABLE public.negocio_qualificacao_respostas IS
  'Respostas da qualificação de um negócio, com o snapshot do que foi perguntado. Escreve-se só por neg_guardar_qualificacao.';

-- (organization_id, pergunta) cobre também as leituras só por organização;
-- o UNIQUE (qualificacao_id, pergunta) cobre a FK e a RLS.
CREATE INDEX idx_negocio_qualificacao_respostas_org_pergunta
  ON public.negocio_qualificacao_respostas (organization_id, pergunta);

-- -----------------------------------------------------------------------------
-- 3. Gatilhos das tabelas novas (guardas)
--    As duas tabelas só se escrevem por neg_guardar_qualificacao: a RPC marca a
--    transacção com a variável local app.neg_qualificacao_via_rpc (que a API não
--    escreve). Assim um INSERT/UPDATE directo pelo PostgREST não grava snapshots
--    que não passaram pela validação. A organização vem sempre do negócio pai;
--    id, negocio_id, qualificacao_id, organization_id e pergunta são imutáveis;
--    e só se escreve com o negócio aberto e fora do lixo.
-- -----------------------------------------------------------------------------

-- Só a RPC (ou um processo de servidor sem sessão de utilizador) escreve.
CREATE FUNCTION public.fn_negocio_qualificacao_exigir_rpc()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role     text := COALESCE(current_setting('role', true), '');
  v_jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF COALESCE(current_setting('app.neg_qualificacao_via_rpc', true), '') = 'on' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL
     AND v_role NOT IN ('authenticated', 'anon')
     AND v_jwt_role NOT IN ('authenticated', 'anon') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'A qualificação do negócio só se grava pela página Pessoas.'
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

-- Organização do negócio pai, com a guarda de organização (antes de bloquear),
-- e o negócio aberto e fora do lixo. p_apagar: o pai já não existe (cascata).
CREATE FUNCTION public.fn_negocio_qualificacao_pai(p_negocio_id uuid, p_apagar boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text := COALESCE(current_setting('role', true), '');
  v_jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_org      uuid;
  v_estado   text;
  v_lixo     timestamptz;
BEGIN
  -- 1. Organização do pai, sem bloquear, só para a guarda.
  SELECT n.organization_id INTO v_org FROM public.negocios n WHERE n.id = p_negocio_id;
  IF NOT FOUND THEN
    IF p_apagar THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  -- 2. Guarda de organização (mesma mensagem que «não existe»).
  IF v_uid IS NULL THEN
    IF v_role IN ('authenticated', 'anon') OR v_jwt_role IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
  ELSIF v_org IS NULL OR v_org NOT IN (SELECT public.get_user_crm_org_ids(v_uid)) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  -- 3. Só agora o FOR SHARE (nunca sobre linhas de outra organização).
  SELECT n.estado, n.deleted_at INTO v_estado, v_lixo
  FROM public.negocios n WHERE n.id = p_negocio_id
  FOR SHARE;
  IF NOT FOUND OR v_lixo IS NOT NULL THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  IF v_estado <> 'aberto' THEN
    RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_estado USING ERRCODE = 'NG002';
  END IF;
  RETURN v_org;
END;
$function$;

CREATE FUNCTION public.fn_negocio_qualificacoes_preparar_insercao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_negocio_qualificacao_exigir_rpc();
  -- a organização é a do negócio, ignorando o que o cliente mande
  NEW.organization_id      := public.fn_negocio_qualificacao_pai(NEW.negocio_id, false);
  NEW.root_organization_id := public.resolve_root_organization_id(NEW.organization_id);
  NEW.created_by           := public.fn_negocios_actor();
  NEW.preenchida_por       := NEW.created_by;
  NEW.created_at           := now();
  NEW.updated_at           := now();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.fn_negocio_qualificacoes_guardar_alteracao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limpa_criador boolean := public.fn_negocios_ref_utilizador_apagado(OLD.created_by, NEW.created_by);
  v_limpa_autor   boolean := public.fn_negocios_ref_utilizador_apagado(OLD.preenchida_por, NEW.preenchida_por);
  v_ignorar       text[]  := ARRAY['created_by', 'preenchida_por', 'updated_at'];
BEGIN
  -- 1. Imutáveis (created_by só pode ir a NULL se o utilizador foi apagado)
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é possível mudar o identificador de uma qualificação.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar a organização de uma qualificação.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.negocio_id IS DISTINCT FROM OLD.negocio_id THEN
    RAISE EXCEPTION 'Não é possível passar uma qualificação para outro negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT v_limpa_criador THEN
    RAISE EXCEPTION 'Não é possível mudar quem criou uma qualificação.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. UPDATE interno das chaves estrangeiras ON DELETE SET NULL (utilizador
  --    apagado): passa sempre, desde que nada mais mude.
  IF (v_limpa_criador OR v_limpa_autor)
     AND (NEW.preenchida_por IS NOT DISTINCT FROM OLD.preenchida_por OR v_limpa_autor)
     AND (to_jsonb(NEW) - v_ignorar) = (to_jsonb(OLD) - v_ignorar) THEN
    RETURN NEW;
  END IF;

  -- 3. Escrita normal: só pela RPC, com o negócio aberto e fora do lixo.
  PERFORM public.fn_negocio_qualificacao_exigir_rpc();
  PERFORM public.fn_negocio_qualificacao_pai(OLD.negocio_id, false);

  -- 4. Fixos e derivados
  NEW.root_organization_id := OLD.root_organization_id;
  NEW.created_at           := OLD.created_at;
  NEW.preenchida_por       := COALESCE(public.fn_negocios_actor(), OLD.preenchida_por);
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.fn_negocio_qualificacao_respostas_guardar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_negocio uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT q.negocio_id INTO v_negocio
    FROM public.negocio_qualificacoes q WHERE q.id = OLD.qualificacao_id;
    IF NOT FOUND THEN
      -- DELETE em cascata: o cabeçalho já foi apagado; deixa passar.
      RETURN OLD;
    END IF;
    PERFORM public.fn_negocio_qualificacao_exigir_rpc();
    PERFORM public.fn_negocio_qualificacao_pai(v_negocio, true);
    RETURN OLD;
  END IF;

  PERFORM public.fn_negocio_qualificacao_exigir_rpc();

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Não é possível mudar o identificador de uma resposta da qualificação.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.qualificacao_id IS DISTINCT FROM OLD.qualificacao_id THEN
      RAISE EXCEPTION 'Não é possível passar uma resposta para outra qualificação.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Não é possível mudar a organização de uma resposta da qualificação.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.pergunta IS DISTINCT FROM OLD.pergunta THEN
      RAISE EXCEPTION 'Não é possível mudar a pergunta de uma resposta; apague-a e registe outra.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT q.negocio_id INTO v_negocio
    FROM public.negocio_qualificacoes q WHERE q.id = OLD.qualificacao_id;
    PERFORM public.fn_negocio_qualificacao_pai(v_negocio, false);
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  -- INSERT: a organização é a do negócio pai, ignorando o que o cliente mande.
  SELECT q.negocio_id INTO v_negocio
  FROM public.negocio_qualificacoes q WHERE q.id = NEW.qualificacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  NEW.organization_id := public.fn_negocio_qualificacao_pai(v_negocio, false);
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocio_qualificacao_exigir_rpc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocio_qualificacao_pai(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocio_qualificacoes_preparar_insercao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocio_qualificacoes_guardar_alteracao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocio_qualificacao_respostas_guardar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_00_negocio_qualificacoes_preparar_insercao
  BEFORE INSERT ON public.negocio_qualificacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocio_qualificacoes_preparar_insercao();
CREATE TRIGGER trg_00_negocio_qualificacoes_guardar_alteracao
  BEFORE UPDATE ON public.negocio_qualificacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocio_qualificacoes_guardar_alteracao();
CREATE TRIGGER trg_negocio_qualificacoes_updated_at
  BEFORE UPDATE ON public.negocio_qualificacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_00_negocio_qualificacao_respostas_guardar
  BEFORE INSERT OR UPDATE OR DELETE ON public.negocio_qualificacao_respostas
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocio_qualificacao_respostas_guardar();
CREATE TRIGGER trg_negocio_qualificacao_respostas_updated_at
  BEFORE UPDATE ON public.negocio_qualificacao_respostas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- (Sem gatilho de auditoria, como levantamentos e negocios: fn_generic_entity_audit
--  gravaria com um entity_id que não é uma entidade.)

-- -----------------------------------------------------------------------------
-- 4. RLS e privilégios
--    Âmbito do negócio pai igual ao de negocios: org:*, org:assigned_to,
--    org:created_by (crm_scope_keys). Escrita exige pessoas.edit COM âmbito de
--    edição sobre a linha de negocios e o negócio fora do lixo (um EXISTS sobre
--    negocios só aplica a RLS de SELECT, que é pessoas.view).
-- -----------------------------------------------------------------------------
ALTER TABLE public.negocio_qualificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negocio_qualificacao_respostas ENABLE ROW LEVEL SECURITY;

-- Os privilégios por omissão dão arwdDxtm a anon e authenticated em tabelas
-- novas; TRUNCATE não passa pela RLS. Revoga-se tudo e concede-se o mínimo.
REVOKE ALL ON TABLE public.negocio_qualificacoes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.negocio_qualificacao_respostas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.negocio_qualificacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.negocio_qualificacao_respostas TO authenticated;
GRANT ALL ON TABLE public.negocio_qualificacoes TO service_role;
GRANT ALL ON TABLE public.negocio_qualificacao_respostas TO service_role;

-- 4a. Cabeçalho: select, insert, update, no_delete, system_admin_pii_default_deny
CREATE POLICY negocio_qualificacoes_select ON public.negocio_qualificacoes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocios n
                WHERE n.id = negocio_qualificacoes.negocio_id));

CREATE POLICY negocio_qualificacoes_insert ON public.negocio_qualificacoes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocios n
                WHERE n.id = negocio_qualificacoes.negocio_id
                  AND n.organization_id = negocio_qualificacoes.organization_id
                  AND n.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
                              WHERE k.scope_key = n.organization_id::text || ':*'
                                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)));

CREATE POLICY negocio_qualificacoes_update ON public.negocio_qualificacoes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocios n
                WHERE n.id = negocio_qualificacoes.negocio_id
                  AND n.organization_id = negocio_qualificacoes.organization_id
                  AND n.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
                              WHERE k.scope_key = n.organization_id::text || ':*'
                                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)))
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocios n
                WHERE n.id = negocio_qualificacoes.negocio_id
                  AND n.organization_id = negocio_qualificacoes.organization_id
                  AND n.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
                              WHERE k.scope_key = n.organization_id::text || ':*'
                                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)));

CREATE POLICY negocio_qualificacoes_no_delete ON public.negocio_qualificacoes
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

CREATE POLICY system_admin_pii_default_deny ON public.negocio_qualificacoes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT public.is_system_admin((SELECT auth.uid())))
         OR organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
         OR (public.is_system_admin((SELECT auth.uid())) AND public.has_active_support_access(organization_id)))
  WITH CHECK ((NOT public.is_system_admin((SELECT auth.uid())))
              OR organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))));

-- 4b. Respostas: select, insert, update, delete, system_admin_pii_default_deny
CREATE POLICY negocio_qualificacao_respostas_select ON public.negocio_qualificacao_respostas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocio_qualificacoes q
                WHERE q.id = negocio_qualificacao_respostas.qualificacao_id));

CREATE POLICY negocio_qualificacao_respostas_insert ON public.negocio_qualificacao_respostas
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocio_qualificacoes q
                JOIN public.negocios n ON n.id = q.negocio_id
                WHERE q.id = negocio_qualificacao_respostas.qualificacao_id
                  AND n.organization_id = negocio_qualificacao_respostas.organization_id
                  AND n.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
                              WHERE k.scope_key = n.organization_id::text || ':*'
                                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)));

CREATE POLICY negocio_qualificacao_respostas_update ON public.negocio_qualificacao_respostas
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocio_qualificacoes q
                JOIN public.negocios n ON n.id = q.negocio_id
                WHERE q.id = negocio_qualificacao_respostas.qualificacao_id
                  AND n.organization_id = negocio_qualificacao_respostas.organization_id
                  AND n.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
                              WHERE k.scope_key = n.organization_id::text || ':*'
                                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)))
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocio_qualificacoes q
                JOIN public.negocios n ON n.id = q.negocio_id
                WHERE q.id = negocio_qualificacao_respostas.qualificacao_id
                  AND n.organization_id = negocio_qualificacao_respostas.organization_id
                  AND n.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
                              WHERE k.scope_key = n.organization_id::text || ':*'
                                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)));

CREATE POLICY negocio_qualificacao_respostas_delete ON public.negocio_qualificacao_respostas
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1 FROM public.negocio_qualificacoes q
                JOIN public.negocios n ON n.id = q.negocio_id
                WHERE q.id = negocio_qualificacao_respostas.qualificacao_id
                  AND n.organization_id = negocio_qualificacao_respostas.organization_id
                  AND n.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
                              WHERE k.scope_key = n.organization_id::text || ':*'
                                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)));

CREATE POLICY system_admin_pii_default_deny ON public.negocio_qualificacao_respostas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT public.is_system_admin((SELECT auth.uid())))
         OR organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
         OR (public.is_system_admin((SELECT auth.uid())) AND public.has_active_support_access(organization_id)))
  WITH CHECK ((NOT public.is_system_admin((SELECT auth.uid())))
              OR organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))));

-- -----------------------------------------------------------------------------
-- 5. Negócio fechado: pedido_cliente também fica só de leitura
--    (antes o gatilho só disparava para titulo, notas e assigned_to; um UPDATE
--    directo de pedido_cliente num negócio ganho ou perdido passava).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_negocios_fechado_so_leitura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- As funções neg_* e os gatilhos de decisão do fecho escrevem com a variável.
  IF COALESCE(current_setting('app.neg_via_funcao', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Só a limpeza do comercial de um utilizador apagado passa (ON DELETE SET NULL).
  IF NEW.titulo IS NOT DISTINCT FROM OLD.titulo
     AND NEW.notas IS NOT DISTINCT FROM OLD.notas
     AND NEW.pedido_cliente IS NOT DISTINCT FROM OLD.pedido_cliente
     AND (NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to
          OR public.fn_negocios_ref_utilizador_apagado(OLD.assigned_to, NEW.assigned_to)) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Este negócio está %: o título, as notas, o comercial e o pedido do cliente já não se alteram. Reabra-o primeiro.',
    OLD.estado
    USING ERRCODE = 'NG028';
END;
$function$;

DROP TRIGGER trg_01_negocios_fechado_so_leitura ON public.negocios;
CREATE TRIGGER trg_01_negocios_fechado_so_leitura
  BEFORE UPDATE OF titulo, notas, assigned_to, pedido_cliente ON public.negocios
  FOR EACH ROW
  WHEN ((old.estado = ANY (ARRAY['ganho'::text, 'perdido'::text]))
        AND ((new.titulo IS DISTINCT FROM old.titulo)
          OR (new.notas IS DISTINCT FROM old.notas)
          OR (new.assigned_to IS DISTINCT FROM old.assigned_to)
          OR (new.pedido_cliente IS DISTINCT FROM old.pedido_cliente)))
  EXECUTE FUNCTION public.fn_negocios_fechado_so_leitura();

-- -----------------------------------------------------------------------------
-- 6. Funções
-- -----------------------------------------------------------------------------

-- 6a (9a). Validação e snapshot das respostas, filtrada pela aba da secção.
--     Extraída de neg_guardar_levantamento (20261226090000), sem mudar as regras:
--     forma de cada resposta, pergunta desconhecida, tipo do valor, opções e
--     limites -> NG009. Pergunta de outra aba -> NG009. SECURITY INVOKER: lê o
--     questionário sob a RLS de quem chama. Quem chama tem de ter o bloqueio
--     partilhado do questionário.
CREATE FUNCTION public.fn_neg_validar_respostas(p_organization_id uuid, p_respostas jsonb, p_aba text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_respostas jsonb := COALESCE(p_respostas, '{}'::jsonb);
  v_norm      jsonb;
  v_res       jsonb;
  v_erro      text;
BEGIN
  IF p_organization_id IS NULL OR p_aba IS NULL OR p_aba NOT IN ('visita', 'qualificacao')
     OR jsonb_typeof(v_respostas) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: respostas.' USING ERRCODE = 'NG009';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_respostas)) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: até 200 respostas.' USING ERRCODE = 'NG009';
  END IF;

  -- Forma (de neg_guardar_levantamento, 20261226090000): cada resposta é
  -- {"escolhas": [chaves]}, {"texto": "..."} ou {"numero": n}; a forma antiga
  -- {"seccao": "...", "resposta": "chave"} vale como {"escolhas": [chave]}.
  v_erro := (SELECT r.pergunta
             FROM jsonb_each(v_respostas) AS r(pergunta, valor)
             WHERE CASE
               WHEN r.pergunta !~ '^[a-z][A-Za-z0-9]{0,39}$' THEN true
               WHEN jsonb_typeof(r.valor) <> 'object' THEN true
               WHEN EXISTS (SELECT 1 FROM jsonb_object_keys(r.valor) AS k(chave)
                            WHERE k.chave NOT IN ('escolhas', 'texto', 'numero', 'resposta', 'seccao')) THEN true
               WHEN (r.valor ? 'escolhas')::integer + (r.valor ? 'texto')::integer
                    + (r.valor ? 'numero')::integer + (r.valor ? 'resposta')::integer <> 1 THEN true
               WHEN r.valor ? 'seccao' AND NOT (r.valor ? 'resposta') THEN true
               WHEN r.valor ? 'escolhas' THEN
                 CASE WHEN jsonb_typeof(r.valor -> 'escolhas') <> 'array' THEN true
                      WHEN jsonb_array_length(r.valor -> 'escolhas') NOT BETWEEN 1 AND 30 THEN true
                      ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(r.valor -> 'escolhas') AS x(v)
                                   WHERE jsonb_typeof(x.v) <> 'string')
                 END
               WHEN r.valor ? 'texto' THEN jsonb_typeof(r.valor -> 'texto') <> 'string'
               WHEN r.valor ? 'numero' THEN jsonb_typeof(r.valor -> 'numero') <> 'number'
               ELSE jsonb_typeof(r.valor -> 'resposta') <> 'string'
                    OR COALESCE(jsonb_typeof(r.valor -> 'seccao'), 'null') NOT IN ('string', 'null')
             END
             ORDER BY r.pergunta
             LIMIT 1);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Valor inválido: resposta à pergunta %.', left(v_erro, 40) USING ERRCODE = 'NG009';
  END IF;
  v_norm := (SELECT COALESCE(jsonb_object_agg(r.pergunta,
                       CASE WHEN r.valor ? 'resposta'
                            THEN jsonb_build_object('escolhas', jsonb_build_array(r.valor -> 'resposta'))
                            ELSE r.valor END), '{}'::jsonb)
             FROM jsonb_each(v_respostas) AS r(pergunta, valor));

  IF v_norm = '{}'::jsonb THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Contra o questionário da organização (sob RLS), só a aba pedida.
  -- Perguntas e opções inactivas ou apagadas aceitam-se (D5).
  v_res := (
    SELECT jsonb_agg(jsonb_build_object(
             'pergunta', z.pergunta, 'valido', z.valido, 'seccao', z.seccao, 'tipo', z.tipo,
             'pergunta_texto', z.texto, 'seccao_titulo', z.s_titulo, 'bloco', z.bloco,
             'ordem', z.s_ordem * 1000 + z.p_ordem,
             'escolhas', CASE WHEN z.tipo IN ('escolha_unica', 'escolha_multipla') THEN to_jsonb(z.esc) END,
             'escolhas_texto', CASE WHEN z.tipo IN ('escolha_unica', 'escolha_multipla') THEN to_jsonb(z.esc_txt) END,
             'resposta', CASE WHEN z.tipo = 'escolha_unica' THEN z.esc[1] END,
             'valor_texto', CASE WHEN z.tipo = 'texto' THEN z.txt END,
             'valor_numero', CASE WHEN z.tipo = 'numero' THEN z.num END))
    FROM (
      SELECT y.*,
             CASE
               WHEN y.pid IS NULL OR y.aba IS DISTINCT FROM p_aba THEN false
               WHEN y.valor ? 'escolhas' THEN
                 y.tipo IN ('escolha_unica', 'escolha_multipla')
                 AND y.n_ok = y.n_env AND y.n_dist = y.n_env
                 AND (y.tipo = 'escolha_multipla' OR y.n_env = 1)
               WHEN y.valor ? 'texto' THEN
                 y.tipo = 'texto' AND char_length(y.txt) BETWEEN 1 AND COALESCE(y.texto_max, 2000)
               WHEN y.valor ? 'numero' THEN
                 y.tipo = 'numero' AND abs(y.num) <= 99999999999.999
                 AND y.num = round(y.num, COALESCE(y.numero_casas, 3))
                 AND (y.numero_min IS NULL OR y.num >= y.numero_min)
                 AND (y.numero_max IS NULL OR y.num <= y.numero_max)
               ELSE false
             END AS valido
      FROM (
        SELECT n.pergunta, n.valor, p.id AS pid, p.tipo, p.texto, p.bloco, p.ordem AS p_ordem,
               p.texto_max, p.numero_min, p.numero_max, p.numero_casas,
               s.chave AS seccao, s.titulo AS s_titulo, s.ordem AS s_ordem, s.aba AS aba,
               CASE WHEN n.valor ? 'texto' THEN btrim(n.valor ->> 'texto') END AS txt,
               CASE WHEN n.valor ? 'numero' THEN (n.valor ->> 'numero')::numeric END AS num,
               x.n_env, x.n_dist, x.n_ok, x.esc, x.esc_txt
        FROM jsonb_each(v_norm) AS n(pergunta, valor)
        LEFT JOIN public.levantamento_perguntas p
          ON p.organization_id = p_organization_id AND p.chave = n.pergunta
        LEFT JOIN public.levantamento_seccoes s ON s.id = p.seccao_id
        LEFT JOIN LATERAL (
          SELECT count(*)::integer AS n_env, count(DISTINCT c.chave)::integer AS n_dist,
                 count(o.id)::integer AS n_ok,
                 array_agg(c.chave ORDER BY o.ordem, c.chave) FILTER (WHERE o.id IS NOT NULL) AS esc,
                 array_agg(o.texto ORDER BY o.ordem, c.chave) FILTER (WHERE o.id IS NOT NULL) AS esc_txt
          FROM jsonb_array_elements_text(CASE WHEN n.valor ? 'escolhas' THEN n.valor -> 'escolhas'
                                              ELSE '[]'::jsonb END) AS c(chave)
          LEFT JOIN public.levantamento_opcoes o ON o.pergunta_id = p.id AND o.chave = c.chave
        ) x ON true
      ) y
    ) z);
  v_erro := (SELECT x.e ->> 'pergunta'
             FROM jsonb_array_elements(v_res) AS x(e)
             WHERE NOT (x.e ->> 'valido')::boolean
             ORDER BY 1
             LIMIT 1);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Valor inválido: resposta à pergunta %.', left(v_erro, 40) USING ERRCODE = 'NG009';
  END IF;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_validar_respostas(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_validar_respostas(uuid, jsonb, text) TO authenticated, service_role;

-- 6b (9b). neg_guardar_levantamento: mesma assinatura. A validação passa pelo
--     helper com a aba 'visita' (respostas da Qualificação -> NG009: a
--     Qualificação vive só no negócio). morada_origem: sem morada -> NULL; se o
--     ecrã manda 'manual' ou 'localizacao', fica essa; senão (nada ou
--     'entidade') é derivada: 'entidade' se os 4 campos forem iguais à morada
--     principal da pessoa, caso contrário 'manual'. Numa alteração sem mudar
--     a morada e sem origem explícita, a origem guardada mantém-se.
CREATE OR REPLACE FUNCTION public.neg_guardar_levantamento(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_dados jsonb, p_linhas jsonb, p_respostas jsonb, p_negocio_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg       public.negocios;
  v_lev       public.levantamentos;
  v_dados     jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_linhas    jsonb := COALESCE(p_linhas, '[]'::jsonb);
  v_respostas jsonb := COALESCE(p_respostas, '{}'::jsonb);
  v_data      date;
  v_visita    uuid;
  v_feito_por uuid;
  v_criado    boolean;
  v_ligado    uuid;
  v_n         int;
  -- 20261226090000: questionário configurável.
  v_versao    integer;
  v_versao_cl integer;
  v_res       jsonb;
  v_erro      text;
  -- 20261231100000: morada da obra e a sua origem.
  v_rua       text;
  v_cp        text;
  v_loc       text;
  v_andar     text;
  v_origem_cl text;
  v_origem    text;
  v_igual_ent boolean;
BEGIN
  IF p_id IS NULL
     OR jsonb_typeof(v_dados) <> 'object'
     OR jsonb_typeof(v_linhas) <> 'array'
     OR jsonb_typeof(v_respostas) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: identificador, dados, linhas ou respostas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_linhas) > 200
     OR (SELECT count(*) FROM jsonb_object_keys(v_respostas)) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: até 200 linhas e 200 respostas.' USING ERRCODE = 'NG009';
  END IF;
  BEGIN
    v_data      := (v_dados ->> 'data_levantamento')::date;
    v_visita    := (v_dados ->> 'visita_id')::uuid;
    v_feito_por := (v_dados ->> 'feito_por')::uuid;
    v_versao_cl := (v_dados ->> 'versao_questionario')::integer;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
              OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: data, visita, autor ou versão do questionário.' USING ERRCODE = 'NG009';
  END;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: falta a data do levantamento.' USING ERRCODE = 'NG009';
  END IF;

  -- 20261231100000: morada da obra; a origem pode vir do ecrã ('entidade',
  -- 'manual' ou 'localizacao'); 'entidade' ou nada é a base que decide (abaixo).
  v_rua       := NULLIF(btrim(v_dados ->> 'morada_rua'), '');
  v_cp        := NULLIF(btrim(v_dados ->> 'morada_codigo_postal'), '');
  v_loc       := NULLIF(btrim(v_dados ->> 'morada_localidade'), '');
  v_andar     := NULLIF(btrim(v_dados ->> 'morada_andar'), '');
  v_origem_cl := NULLIF(btrim(v_dados ->> 'morada_origem'), '');
  IF v_origem_cl IS NOT NULL AND v_origem_cl NOT IN ('entidade', 'manual', 'localizacao') THEN
    RAISE EXCEPTION 'Valor inválido: origem da morada (entidade, manual ou localizacao).' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 20261226090000: o questionário da organização. Bloqueio PARTILHADO, o mesmo
  -- que neg_guardar_questionario toma em exclusivo: as respostas validam-se e
  -- gravam-se contra uma configuração que não muda a meio (e o tipo de uma
  -- pergunta não muda enquanto se grava uma resposta a ela).
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('levantamento_questionario:' || p_organization_id::text, 0));
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = p_organization_id;
  IF v_versao IS NULL AND v_respostas <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- Validação e snapshot das respostas (sob RLS), ANTES de escrever.
  -- 20261231100000: pelo helper e só a aba 'visita'; uma resposta a uma pergunta
  -- da aba Qualificação é NG009 (a Qualificação grava-se no negócio, por
  -- neg_guardar_qualificacao).
  v_res := public.fn_neg_validar_respostas(p_organization_id, v_respostas, 'visita');

  -- Ordem de bloqueio: negócio primeiro (ligação feita no fim).
  IF p_negocio_id IS NOT NULL THEN
    SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
    IF v_neg.organization_id <> p_organization_id OR v_neg.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = p_negocio_id AND o.id <> p_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
  END IF;

  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- 20261231100000: origem da morada. Sem morada: NULL. 'manual' ou
  -- 'localizacao' enviados pelo ecrã ficam como vieram. Senão (nada ou
  -- 'entidade'), derivação pura: 'entidade' se os 4 campos forem iguais à
  -- morada principal em vigor da pessoa (como a ficha a mostra), senão 'manual'.
  IF v_rua IS NULL AND v_cp IS NULL AND v_loc IS NULL AND v_andar IS NULL THEN
    v_origem := NULL;
  ELSIF v_origem_cl IN ('manual', 'localizacao') THEN
    v_origem := v_origem_cl;
  ELSE
    v_igual_ent := EXISTS (
      SELECT 1
      FROM (SELECT NULLIF(btrim(concat_ws(' ', a.street, a.number)), '') AS rua,
                   NULLIF(btrim(a.postal_code), '') AS cp,
                   NULLIF(btrim(a.city), '') AS loc,
                   NULLIF(btrim(a.floor), '') AS andar
            FROM public.anew_entity_addresses ea
            JOIN public.anew_addresses a ON a.id = ea.address_id
            WHERE ea.entity_id = p_entity_id
              AND (ea.valid_to IS NULL OR ea.valid_to > now())
            ORDER BY ea.is_primary IS TRUE DESC, ea.created_at DESC, ea.id DESC
            LIMIT 1) m
      WHERE m.rua IS NOT DISTINCT FROM v_rua AND m.cp IS NOT DISTINCT FROM v_cp
        AND m.loc IS NOT DISTINCT FROM v_loc AND m.andar IS NOT DISTINCT FROM v_andar);
    v_origem := CASE WHEN v_igual_ent THEN 'entidade' ELSE 'manual' END;
  END IF;

  -- 1. CRIAR (sem negocio_id) ou alterar o existente.
  INSERT INTO public.levantamentos
    (id, organization_id, entity_id, visita_id, feito_por, data_levantamento, estado, notas,
     morada_rua, morada_codigo_postal, morada_localidade, morada_andar, morada_origem)
  VALUES
    (p_id, p_organization_id, p_entity_id, v_visita, v_feito_por, v_data,
     COALESCE(NULLIF(v_dados ->> 'estado', ''), 'por_fazer'),
     NULLIF(btrim(v_dados ->> 'notas'), ''),
     v_rua, v_cp, v_loc, v_andar, v_origem)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_criado := v_n > 0;

  IF NOT v_criado THEN
    SELECT lv.* INTO v_lev FROM public.levantamentos lv WHERE lv.id = p_id;
    IF NOT FOUND OR v_lev.organization_id <> p_organization_id OR v_lev.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF v_lev.negocio_id IS NOT NULL THEN
      IF v_lev.negocio_id = p_negocio_id THEN
        RETURN jsonb_build_object('levantamento_id', p_id, 'criado', false, 'mudou', false,
                                  'ligado_a', v_lev.negocio_id,
                                  'versao_questionario', v_versao,
                                  'questionario_mudou', v_versao_cl IS NOT NULL
                                                        AND v_versao_cl IS DISTINCT FROM v_versao);
      END IF;
      RAISE EXCEPTION 'Este levantamento já está ligado a um negócio e não se altera; registe um novo.'
        USING ERRCODE = 'NG005';
    END IF;

    UPDATE public.levantamentos lv
    SET visita_id            = v_visita,
        feito_por            = COALESCE(v_feito_por, lv.feito_por),
        data_levantamento    = v_data,
        estado               = COALESCE(NULLIF(v_dados ->> 'estado', ''), lv.estado),
        notas                = NULLIF(btrim(v_dados ->> 'notas'), ''),
        morada_rua           = v_rua,
        morada_codigo_postal = v_cp,
        morada_localidade    = v_loc,
        morada_andar         = v_andar,
        -- a morada não mudou e o ecrã não mandou origem: mantém a guardada
        -- (assim um levantamento 'localizacao' não passa a 'manual' só por se
        -- gravarem as notas); origem explícita ganha sempre.
        morada_origem        = CASE
          WHEN v_origem IS NULL THEN NULL
          WHEN v_origem_cl IS NULL
               AND lv.morada_origem IS NOT NULL
               AND lv.morada_rua IS NOT DISTINCT FROM v_rua
               AND lv.morada_codigo_postal IS NOT DISTINCT FROM v_cp
               AND lv.morada_localidade IS NOT DISTINCT FROM v_loc
               AND lv.morada_andar IS NOT DISTINCT FROM v_andar THEN lv.morada_origem
          ELSE v_origem END
    WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar o levantamento.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. PREENCHER: linhas por substituição completa, na ordem recebida.
  DELETE FROM public.levantamento_linhas ll WHERE ll.levantamento_id = p_id;
  BEGIN
    INSERT INTO public.levantamento_linhas
      (levantamento_id, organization_id, divisao, trabalho, trabalho_outro, medida, unidade,
       observacoes, ordem)
    SELECT p_id, p_organization_id,
           e.valor ->> 'divisao',
           e.valor ->> 'trabalho',
           NULLIF(btrim(e.valor ->> 'trabalho_outro'), ''),
           (e.valor ->> 'medida')::numeric,
           COALESCE(NULLIF(e.valor ->> 'unidade', ''), 'm2'),
           NULLIF(btrim(e.valor ->> 'observacoes'), ''),
           (e.posicao - 1)::int
    FROM jsonb_array_elements(v_linhas) WITH ORDINALITY AS e(valor, posicao);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: medida de uma linha do levantamento.' USING ERRCODE = 'NG009';
  END;

  -- Respostas: as enviadas (upsert, sem id no payload) e apagar as que deixaram de vir.
  -- 20261226090000: validadas acima; o snapshot (tipo, textos, secção, ordem) só
  -- se escreve quando a resposta é nova ou o valor mudou, para que mudar a
  -- configuração não altere o que já foi respondido.
  INSERT INTO public.levantamento_respostas AS lr
    (levantamento_id, organization_id, seccao, pergunta, resposta, tipo, pergunta_texto,
     seccao_titulo, bloco, ordem, escolhas, escolhas_texto, valor_texto, valor_numero)
  SELECT p_id, p_organization_id, x.seccao, x.pergunta, x.resposta, x.tipo, x.pergunta_texto,
         x.seccao_titulo, x.bloco, x.ordem, x.escolhas, x.escolhas_texto, x.valor_texto, x.valor_numero
  FROM jsonb_to_recordset(v_res) AS x(pergunta text, seccao text, resposta text, tipo text,
         pergunta_texto text, seccao_titulo text, bloco text, ordem integer, escolhas text[],
         escolhas_texto text[], valor_texto text, valor_numero numeric)
  LEFT JOIN public.levantamento_respostas a
    ON a.levantamento_id = p_id AND a.pergunta = x.pergunta
  WHERE a.id IS NULL
     OR a.tipo IS DISTINCT FROM x.tipo
     OR a.resposta IS DISTINCT FROM x.resposta
     OR a.valor_texto IS DISTINCT FROM x.valor_texto
     OR a.valor_numero IS DISTINCT FROM x.valor_numero
     OR ARRAY(SELECT u.c FROM unnest(a.escolhas) AS u(c) ORDER BY u.c)
        IS DISTINCT FROM ARRAY(SELECT u.c FROM unnest(x.escolhas) AS u(c) ORDER BY u.c)
  ON CONFLICT (levantamento_id, pergunta)
  DO UPDATE SET seccao = EXCLUDED.seccao, resposta = EXCLUDED.resposta, tipo = EXCLUDED.tipo,
                pergunta_texto = EXCLUDED.pergunta_texto, seccao_titulo = EXCLUDED.seccao_titulo,
                bloco = EXCLUDED.bloco, ordem = EXCLUDED.ordem, escolhas = EXCLUDED.escolhas,
                escolhas_texto = EXCLUDED.escolhas_texto, valor_texto = EXCLUDED.valor_texto,
                valor_numero = EXCLUDED.valor_numero;

  DELETE FROM public.levantamento_respostas lr
  WHERE lr.levantamento_id = p_id
    AND NOT (v_respostas ? lr.pergunta);

  -- 3. LIGAR (o trigger valida um por negócio e a permissão).
  IF p_negocio_id IS NOT NULL THEN
    UPDATE public.levantamentos lv SET negocio_id = p_negocio_id WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN
      v_ligado := p_negocio_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('levantamento_id', p_id, 'criado', v_criado, 'mudou', true,
                            'ligado_a', v_ligado,
                            'versao_questionario', v_versao,
                            'questionario_mudou', v_versao_cl IS NOT NULL
                                                  AND v_versao_cl IS DISTINCT FROM v_versao);
END;
$function$;

-- 6c (9c). Nova RPC: gravar a qualificação de um negócio aberto.
--     p_respostas NULL = não mexe nas respostas; '{}' = apaga todas.
--     p_pedido_cliente NULL = não mexe; '' (ou só espaços) = limpa.
--     Ordem de bloqueio igual a neg_guardar_levantamento: primeiro o bloqueio
--     partilhado do questionário, depois o negócio (FOR NO KEY UPDATE, que
--     exige o âmbito de edição de negocios).
--     Erros: NG009 valor inválido; NG001 negócio indisponível; NG002 negócio
--     não aberto; NG008 organização sem questionário. Versão do questionário
--     desactualizada não é erro: devolve questionario_mudou (como o levantamento).
CREATE FUNCTION public.neg_guardar_qualificacao(
  p_negocio_id uuid,
  p_respostas jsonb,
  p_pedido_cliente text DEFAULT NULL::text,
  p_versao_questionario integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org         uuid;
  v_neg         public.negocios;
  v_versao      integer;
  v_res         jsonb := '[]'::jsonb;
  v_qid         uuid;
  v_criado      boolean := false;
  v_mudou       boolean := false;
  v_mudou_resp  boolean := false;
  v_n           int;
  v_mexe_pedido boolean := p_pedido_cliente IS NOT NULL;
  v_pedido      text;
BEGIN
  -- 1. Valores
  IF p_negocio_id IS NULL
     OR (p_respostas IS NOT NULL AND jsonb_typeof(p_respostas) <> 'object')
     OR (p_respostas IS NULL AND p_pedido_cliente IS NULL)
     OR (p_versao_questionario IS NOT NULL AND p_versao_questionario < 0) THEN
    RAISE EXCEPTION 'Valor inválido: negócio, respostas, pedido do cliente ou versão do questionário.'
      USING ERRCODE = 'NG009';
  END IF;
  IF v_mexe_pedido THEN
    v_pedido := NULLIF(btrim(p_pedido_cliente), '');
    IF char_length(v_pedido) > 2000 THEN
      RAISE EXCEPTION 'Valor inválido: o pedido do cliente tem até 2000 caracteres.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- 2. Organização do negócio (sem bloquear, sob a RLS de leitura).
  SELECT n.organization_id INTO v_org
  FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM public.fn_neg_exigir_config(v_org);

  -- 3. Bloqueio PARTILHADO do questionário (a mesma chave que
  --    neg_guardar_questionario toma em exclusivo), antes do negócio.
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('levantamento_questionario:' || v_org::text, 0));

  -- 4. Negócio aberto, bloqueado (NG001 / NG002).
  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
  IF v_neg.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  -- 5. Questionário e validação (antes de escrever).
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = v_org;
  IF p_respostas IS NOT NULL THEN
    IF v_versao IS NULL AND p_respostas <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
    END IF;
    v_res := public.fn_neg_validar_respostas(v_org, p_respostas, 'qualificacao');
  END IF;

  -- 6. Escrever (os gatilhos das tabelas novas só aceitam com esta marca).
  PERFORM set_config('app.neg_qualificacao_via_rpc', 'on', true);

  IF p_respostas IS NOT NULL THEN
    SELECT q.id INTO v_qid FROM public.negocio_qualificacoes q WHERE q.negocio_id = p_negocio_id;

    IF v_qid IS NULL AND jsonb_array_length(v_res) > 0 THEN
      INSERT INTO public.negocio_qualificacoes (organization_id, negocio_id, versao_questionario)
      VALUES (v_org, p_negocio_id, v_versao)
      ON CONFLICT (negocio_id) DO NOTHING
      RETURNING id INTO v_qid;
      IF v_qid IS NOT NULL THEN
        v_criado := true;
        v_mudou  := true;
      ELSE
        SELECT q.id INTO v_qid FROM public.negocio_qualificacoes q WHERE q.negocio_id = p_negocio_id;
        IF v_qid IS NULL THEN
          RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
        END IF;
      END IF;
    END IF;

    IF v_qid IS NOT NULL THEN
      -- Respostas enviadas: o snapshot só se regrava quando a resposta é nova
      -- ou o valor mudou (mudar a configuração não altera o que já foi respondido).
      INSERT INTO public.negocio_qualificacao_respostas AS nr
        (qualificacao_id, organization_id, pergunta, resposta, tipo, pergunta_texto,
         bloco, ordem, escolhas, escolhas_texto, valor_texto, valor_numero)
      SELECT v_qid, v_org, x.pergunta, x.resposta, x.tipo, x.pergunta_texto,
             x.bloco, x.ordem, x.escolhas, x.escolhas_texto, x.valor_texto, x.valor_numero
      FROM jsonb_to_recordset(v_res) AS x(pergunta text, resposta text, tipo text,
             pergunta_texto text, bloco text, ordem integer, escolhas text[],
             escolhas_texto text[], valor_texto text, valor_numero numeric)
      LEFT JOIN public.negocio_qualificacao_respostas a
        ON a.qualificacao_id = v_qid AND a.pergunta = x.pergunta
      WHERE a.id IS NULL
         OR a.tipo IS DISTINCT FROM x.tipo
         OR a.resposta IS DISTINCT FROM x.resposta
         OR a.valor_texto IS DISTINCT FROM x.valor_texto
         OR a.valor_numero IS DISTINCT FROM x.valor_numero
         OR ARRAY(SELECT u.c FROM unnest(a.escolhas) AS u(c) ORDER BY u.c)
            IS DISTINCT FROM ARRAY(SELECT u.c FROM unnest(x.escolhas) AS u(c) ORDER BY u.c)
      ON CONFLICT (qualificacao_id, pergunta)
      DO UPDATE SET resposta = EXCLUDED.resposta, tipo = EXCLUDED.tipo,
                    pergunta_texto = EXCLUDED.pergunta_texto, bloco = EXCLUDED.bloco,
                    ordem = EXCLUDED.ordem, escolhas = EXCLUDED.escolhas,
                    escolhas_texto = EXCLUDED.escolhas_texto, valor_texto = EXCLUDED.valor_texto,
                    valor_numero = EXCLUDED.valor_numero;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_mudou_resp := v_n > 0;

      -- As que deixaram de vir.
      DELETE FROM public.negocio_qualificacao_respostas nr
      WHERE nr.qualificacao_id = v_qid
        AND NOT (p_respostas ? nr.pergunta);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_mudou_resp := v_mudou_resp OR v_n > 0;

      -- Cabeçalho: versão e quem preencheu (o gatilho escreve preenchida_por).
      IF v_mudou_resp AND NOT v_criado THEN
        UPDATE public.negocio_qualificacoes q
        SET versao_questionario = v_versao
        WHERE q.id = v_qid;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          RAISE EXCEPTION 'Sem permissão para alterar a qualificação.' USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      v_mudou := v_mudou OR v_mudou_resp;
    END IF;
  END IF;

  -- 7. O que o cliente pediu.
  IF v_mexe_pedido AND v_pedido IS DISTINCT FROM v_neg.pedido_cliente THEN
    UPDATE public.negocios n SET pedido_cliente = v_pedido WHERE n.id = p_negocio_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar o negócio.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_mudou := true;
  END IF;

  PERFORM set_config('app.neg_qualificacao_via_rpc', '', true);

  RETURN jsonb_build_object(
    'qualificacao_id', v_qid,
    'criado', v_criado,
    'mudou', v_mudou,
    'versao_questionario', v_versao,
    'questionario_mudou', p_versao_questionario IS NOT NULL
                          AND p_versao_questionario IS DISTINCT FROM v_versao);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_qualificacao(uuid, jsonb, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_qualificacao(uuid, jsonb, text, integer) TO authenticated, service_role;

-- 6d (9d). Nova RPC: preferências de contacto da pessoa.
--     NULL = não mexe; '' = limpa (só contacto e hora; a língua é obrigatória).
--     Valores: contacto telefone|email|whatsapp|sms; hora manha|tarde|fim_do_dia;
--     língua pt|en|fr. Fora da lista -> NG009, salvo a língua igual à já
--     guardada (ex.: es de um formulário), que se aceita sem mudar nada.
--     A auditoria é a do gatilho
--     trg_audit_anew_entities. SECURITY DEFINER no padrão de
--     neg_guardar_identidade_pessoa: organização, pessoas.edit e âmbito de
--     edição sobre a entidade verificados aqui.
CREATE FUNCTION public.neg_guardar_contacto_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_preferred_contact text DEFAULT NULL::text,
  p_preferred_time text DEFAULT NULL::text,
  p_locale text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_keys_pes text[];
  v_ent      public.anew_entities;
  v_contacto text;
  v_hora     text;
  v_lingua   text;
  v_mudou    boolean := false;
BEGIN
  -- 1. Valores
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR (p_preferred_contact IS NOT NULL AND btrim(p_preferred_contact) <> ''
         AND btrim(p_preferred_contact) NOT IN ('telefone', 'email', 'whatsapp', 'sms'))
     OR (p_preferred_time IS NOT NULL AND btrim(p_preferred_time) <> ''
         AND btrim(p_preferred_time) NOT IN ('manha', 'tarde', 'fim_do_dia')) THEN
    RAISE EXCEPTION 'Valor inválido: contacto preferido, hora preferida ou língua.'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração.
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Pessoa: entidade viva desta organização, no âmbito de leitura, e que
  --    não é a ficha de uma organização do sistema.
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Editar: pessoas.edit na organização e âmbito de edição sobre a entidade.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5b. (como neg_guardar_identidade_pessoa) Não muda os dados de uma entidade que aparece noutra organização
  --     (ligação, lead viva, cliente vivo, papel vivo, ou linha viva de uma tabela
  --     com chave estrangeira para anew_entities; ver PARTILHADA).
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
             WHERE lk.entity_id = p_entity_id AND lk.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.anew_leads l
                WHERE l.entity_id = p_entity_id AND l.organization_id <> p_organization_id
                  AND l.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_clients c
                WHERE c.entity_id = p_entity_id AND c.organization_id <> p_organization_id
                  AND c.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_entity_roles er
                WHERE er.entity_id = p_entity_id AND er.organization_id <> p_organization_id
                  AND er.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_contacts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_contracts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_portal_users t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.contact_tags t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.data_erasure_requests t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.deals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.direct_sales t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.entity_interactions t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.form_submissions t
                WHERE (t.entity_id = p_entity_id OR t.conflicting_entity_id = p_entity_id)
                  AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.levantamentos t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.negocios t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.organization_counted_entities t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.proposals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.quotes t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     -- a ficha de um utilizador do sistema não é uma pessoa da página
     OR EXISTS (SELECT 1 FROM public.anew_users u
                WHERE u.entity_id = p_entity_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;


  -- 6. Bloqueio: uma alteração de cada vez por pessoa.
  SELECT e.* INTO v_ent FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 6b. Língua: só se valida quando muda. A guardada (ex.: es, vinda de um
  --     formulário público) aceita-se de volta tal como está, para que gravar
  --     o contacto ou a hora não falhe por causa dela; mudar é só para pt|en|fr.
  IF p_locale IS NOT NULL AND btrim(p_locale) IS DISTINCT FROM v_ent.locale
     AND btrim(p_locale) NOT IN ('pt', 'en', 'fr') THEN
    RAISE EXCEPTION 'Valor inválido: contacto preferido, hora preferida ou língua.'
      USING ERRCODE = 'NG009';
  END IF;

  -- 7. Só escreve o que muda.
  v_contacto := CASE WHEN p_preferred_contact IS NULL THEN v_ent.preferred_contact
                     ELSE NULLIF(btrim(p_preferred_contact), '') END;
  v_hora     := CASE WHEN p_preferred_time IS NULL THEN v_ent.preferred_time
                     ELSE NULLIF(btrim(p_preferred_time), '') END;
  v_lingua   := CASE WHEN p_locale IS NULL THEN v_ent.locale ELSE btrim(p_locale) END;

  IF v_contacto IS DISTINCT FROM v_ent.preferred_contact
     OR v_hora IS DISTINCT FROM v_ent.preferred_time
     OR v_lingua IS DISTINCT FROM v_ent.locale THEN
    UPDATE public.anew_entities e
    SET preferred_contact = v_contacto,
        preferred_time    = v_hora,
        locale            = v_lingua,
        updated_at        = now()
    WHERE e.id = p_entity_id;
    v_mudou := true;
  END IF;

  RETURN jsonb_build_object(
    'preferred_contact', v_contacto,
    'preferred_time', v_hora,
    'locale', v_lingua,
    'mudou', v_mudou);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_contacto_pessoa(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_contacto_pessoa(uuid, uuid, text, text, text) TO authenticated, service_role;

-- 6e (9e). neg_guardar_identidade_pessoa: mesma assinatura (sem DROP, sem
--     sobrecarga). p_tipo aceita person, organization e condominio:
--     condominio -> type organization + organization_kind condominio;
--     organization -> mantém o kind (nulo -> empresa; um condomínio continua
--     condomínio); person -> kind NULL.
CREATE OR REPLACE FUNCTION public.neg_guardar_identidade_pessoa(p_organization_id uuid, p_entity_id uuid, p_tipo text DEFAULT NULL::text, p_nome_empresa text DEFAULT NULL::text, p_nome_proprio text DEFAULT NULL::text, p_apelido text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_nome       text := NULLIF(btrim(p_nome_empresa), '');
  v_keys_pes   text[];
  v_ent        public.anew_entities;
  v_tipo       text;
  v_kind       text;   -- 20261231100000: organization_kind
  v_mudou      boolean := false;
  -- como .trim().replace(/\s+/g, " ") do ecrã: primeiro junta todo o espaço
  -- (tabulações, quebras de linha e o espaço inseparável U+00A0, que o \s do
  -- Postgres também apanha), depois apara.
  v_f          text := NULLIF(btrim(regexp_replace(p_nome_proprio, '\s+', ' ', 'g')), '');
  v_l          text := NULLIF(btrim(regexp_replace(p_apelido, '\s+', ' ', 'g')), '');
  v_disp       text;
  v_first      text;
  v_last       text;
BEGIN
  -- 1. Valores
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('person', 'organization', 'condominio'))
     OR char_length(v_nome) > 200
     OR v_nome ~ '[[:cntrl:]]'
     OR char_length(v_f) > 100 OR char_length(v_l) > 100
     OR v_f ~ '[[:cntrl:]]' OR v_l ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Valor inválido: organização, pessoa, tipo, nome da empresa (até 200 caracteres) ou nome e apelido (até 100).'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração (D1).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Pessoa: entidade viva desta organização, no âmbito de leitura (leads.view
  --    para leads, clients.view para clientes), e que não é a ficha de uma
  --    organização do sistema. 20261228200000: pela entidade, sem lead nem cliente.
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Editar: pessoas.edit na organização e âmbito de edição sobre a entidade
  --    (leads.edit para leads, clients.edit para clientes).
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5b. Não muda o tipo nem o nome de uma entidade que aparece noutra organização
  --     (ligação, lead viva, cliente vivo, papel vivo, ou linha viva de uma tabela
  --     com chave estrangeira para anew_entities; ver PARTILHADA).
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
             WHERE lk.entity_id = p_entity_id AND lk.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.anew_leads l
                WHERE l.entity_id = p_entity_id AND l.organization_id <> p_organization_id
                  AND l.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_clients c
                WHERE c.entity_id = p_entity_id AND c.organization_id <> p_organization_id
                  AND c.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_entity_roles er
                WHERE er.entity_id = p_entity_id AND er.organization_id <> p_organization_id
                  AND er.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_contacts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_contracts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_portal_users t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.contact_tags t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.data_erasure_requests t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.deals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.direct_sales t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.entity_interactions t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.form_submissions t
                WHERE (t.entity_id = p_entity_id OR t.conflicting_entity_id = p_entity_id)
                  AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.levantamentos t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.negocios t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.organization_counted_entities t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.proposals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.quotes t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     -- a ficha de um utilizador do sistema não é uma pessoa da página
     OR EXISTS (SELECT 1 FROM public.anew_users u
                WHERE u.entity_id = p_entity_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 6. Bloqueio: uma alteração de cada vez por pessoa.
  SELECT e.* INTO v_ent FROM public.anew_entities e WHERE e.id = p_entity_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 7. Tipo e nome (só escreve se alguma coisa muda).
  -- 20261231100000: condominio é uma organização com organization_kind
  -- 'condominio'; organization mantém o kind que já tinha (nulo -> 'empresa'),
  -- para nunca despromover um condomínio a empresa; person grava NULL.
  v_tipo := CASE WHEN p_tipo = 'condominio' THEN 'organization' ELSE COALESCE(p_tipo, v_ent.type) END;
  v_kind := CASE WHEN p_tipo IS NULL THEN v_ent.organization_kind
                 WHEN p_tipo = 'person' THEN NULL
                 WHEN p_tipo = 'condominio' THEN 'condominio'
                 ELSE CASE WHEN v_ent.type = 'organization' THEN v_ent.organization_kind ELSE 'empresa' END END;
  IF v_tipo IS DISTINCT FROM 'organization' THEN
    v_kind := NULL;
  END IF;
  IF v_tipo = 'organization' THEN
    -- Empresa: o nome visível é o da empresa; nome próprio e apelido a NULL.
    IF v_f IS NOT NULL OR v_l IS NOT NULL
       OR (v_ent.type IS DISTINCT FROM 'organization' AND v_nome IS NULL) THEN
      RAISE EXCEPTION 'Valor inválido: uma empresa tem só o nome da empresa (obrigatório ao mudar para empresa).'
        USING ERRCODE = 'NG009';
    END IF;
    v_disp  := COALESCE(v_nome, v_ent.display_name);
    v_first := NULL;
    v_last  := NULL;
  ELSE
    -- Pessoa: nome próprio e apelido (os dois, ou nenhum se já era pessoa).
    IF v_nome IS NOT NULL
       OR ((v_f IS NULL) <> (v_l IS NULL))
       OR (v_ent.type IS DISTINCT FROM 'person' AND (v_f IS NULL OR v_l IS NULL)) THEN
      RAISE EXCEPTION 'Valor inválido: uma pessoa tem nome próprio e apelido (obrigatórios ao mudar para pessoa).'
        USING ERRCODE = 'NG009';
    END IF;
    IF v_f IS NULL THEN
      v_disp  := v_ent.display_name;
      v_first := v_ent.first_name;
      v_last  := v_ent.last_name;
    ELSE
      -- normalizeFirstLast (src/utils/composeDisplayName.ts:19-30)
      IF lower(v_f) = lower(v_l) AND position(' ' IN v_f) > 0 THEN
        v_first := split_part(v_f, ' ', 1);
        v_last  := substr(v_f, position(' ' IN v_f) + 1);
      ELSE
        v_first := v_f;
        v_last  := v_l;
      END IF;
      -- composeDisplayName (src/utils/composeDisplayName.ts:8-17)
      v_disp := CASE
        WHEN v_first IS NULL THEN COALESCE(v_last, '')
        WHEN v_last IS NULL THEN v_first
        WHEN lower(v_first) = lower(v_last) THEN v_first
        WHEN starts_with(lower(v_last), lower(v_first) || ' ') THEN v_last
        WHEN right(lower(v_first), char_length(v_last) + 1) = ' ' || lower(v_last) THEN v_first
        ELSE v_first || ' ' || v_last
      END;
    END IF;
  END IF;
  IF v_tipo IS DISTINCT FROM v_ent.type
     OR v_kind IS DISTINCT FROM v_ent.organization_kind
     OR v_disp IS DISTINCT FROM v_ent.display_name
     OR v_first IS DISTINCT FROM v_ent.first_name
     OR v_last IS DISTINCT FROM v_ent.last_name THEN
    UPDATE public.anew_entities e
    SET type         = v_tipo,
        organization_kind = v_kind,
        display_name = v_disp,
        first_name   = v_first,
        last_name    = v_last,
        updated_at   = now()
    WHERE e.id = p_entity_id;
    v_mudou := true;
  END IF;

  RETURN jsonb_build_object(
    'tipo', v_tipo,
    'nome', v_disp,
    'empresa_nome', CASE WHEN v_tipo = 'organization' THEN v_disp END,
    'organization_kind', v_kind,
    'tipo_cliente', CASE WHEN v_tipo = 'person' THEN 'particular'
                         WHEN v_kind = 'condominio' THEN 'condominio'
                         ELSE 'empresa' END,
    'mudou', v_mudou);
END;
$function$;

-- 6f (9f). neg_ficha_pessoa: mesma assinatura, recriada a partir da versão de
--     20261228200000 (a do remoto). A qualificação vem de
--     negocio_qualificacao_respostas (negócio vivo mais recente com respostas);
--     cada negócio traz qualificacao, versao_questionario e pedido_cliente; a
--     pessoa traz preferred_contact, preferred_time, locale, organization_kind e
--     tipo_cliente (particular | empresa | condominio).
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

    v_etapa := CASE
      WHEN v_ent.client_since IS NOT NULL THEN 'cliente'
      WHEN v_ng.abertos > 0 THEN 'qualificada'
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
      'tem_nif', fe.fid IS NOT NULL,
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

-- 6g (9g). fn_neg_ficha_seccao: os levantamentos deixam de listar respostas da
--     secção qualificacao e a morada traz a origem.
CREATE OR REPLACE FUNCTION public.fn_neg_ficha_seccao(p_organization_id uuid, p_entity_id uuid, p_tipo text, p_limite integer, p_depois jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_lim    int;
  v_ts     timestamptz;
  v_dt     date;
  v_id     uuid;
  v_leads  uuid[];
  v_clis   uuid[];
  v_total  bigint;
  v_itens  jsonb;
  v_mais   boolean;
  v_ult_ts timestamptz;
  v_ult_dt date;
  v_ult_id uuid;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('contactos', 'visitas', 'levantamentos', 'atividade')
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois IS NOT NULL AND jsonb_typeof(p_depois) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'Valor inválido: secção, limite (1 a 100) ou página.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_depois) = 'object' THEN
    BEGIN
      v_id := (p_depois ->> 'id')::uuid;
      IF p_tipo = 'levantamentos' THEN
        v_dt := (p_depois ->> 'em')::date;
      ELSE
        v_ts := (p_depois ->> 'em')::timestamptz;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- qualquer erro de conversão (uuid, data, fuso): página inválida
      RAISE EXCEPTION 'Valor inválido: página.' USING ERRCODE = 'NG009';
    END;
    IF v_id IS NULL OR (v_ts IS NULL AND v_dt IS NULL) THEN
      RAISE EXCEPTION 'Valor inválido: página.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- Guardas: saltadas só se neg_ficha_pessoa já as passou nesta transacção
  -- para esta organização e pessoa (variável local que a API não escreve).
  IF COALESCE(current_setting('app.neg_ficha_verificada', true), '')
     IS DISTINCT FROM p_organization_id::text || ':' || p_entity_id::text THEN
    PERFORM public.fn_neg_exigir_config(p_organization_id);
    PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  END IF;

  -- 20261226060000: os levantamentos paginam como as outras secções, com
  -- p_limite por página (antes, no máximo 10).
  v_lim := p_limite;

  IF p_tipo IN ('contactos', 'atividade') THEN
    SELECT count(*) INTO v_total
    FROM public.entity_interactions i
    WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
      AND (p_tipo = 'atividade' OR i.interaction_type = 'call');

    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_ts, v_ult_id
    FROM (
      SELECT i.id, i.interaction_at AS em,
             row_number() OVER (ORDER BY i.interaction_at DESC, i.id DESC) AS rn,
             CASE WHEN p_tipo = 'contactos' THEN
               jsonb_build_object('id', i.id, 'resultado', i.result, 'notas', i.notes,
                                  'em', i.interaction_at, 'proxima_acao_em', i.next_action_date,
                                  'negocio_id', i.negocio_id, 'criado_por_nome', cu.name)
             ELSE
               jsonb_build_object('id', i.id, 'tipo', i.interaction_type, 'assunto', i.subject,
                                  'resultado', i.result, 'notas', i.notes, 'em', i.interaction_at,
                                  'negocio_id', i.negocio_id, 'criado_por_nome', cu.name)
             END AS item
      FROM (
        SELECT ei.*
        FROM public.entity_interactions ei
        WHERE ei.entity_id = p_entity_id AND ei.organization_id = p_organization_id
          AND (p_tipo = 'atividade' OR ei.interaction_type = 'call')
          AND (v_ts IS NULL OR (ei.interaction_at, ei.id) < (v_ts, v_id))
        ORDER BY ei.interaction_at DESC, ei.id DESC
        LIMIT v_lim + 1
      ) i
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u
        WHERE u.id = CASE WHEN i.created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN i.created_by::uuid END
        LIMIT 1
      ) cu ON true
    ) z;

  ELSIF p_tipo = 'visitas' THEN
    -- Dois ramos por índice (leads e clientes da pessoa); sem ausências,
    -- férias nem quadros de ausências ou de frota. 20261226060000: as
    -- canceladas passam a vir (antes eram escondidas), marcadas com
    -- 'cancelada' = true; o total e a paginação contam-nas.
    -- 20261228200000: a visita liga à entidade (schedule_items.entity_id).

    SELECT count(*) INTO v_total
    FROM (SELECT si.id FROM public.schedule_items si
          WHERE si.entity_id = p_entity_id AND si.organization_id = p_organization_id) ids
    JOIN public.schedule_items s ON s.id = ids.id
    LEFT JOIN public.schedule_boards b ON b.id = s.board_id
    WHERE s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'));

    -- 20261226100000: a página primeiro (com a RLS de quem chama, como antes) e
    -- os responsáveis dessas visitas por fn_neg_ficha_visitas_recursos, que não
    -- passa pela política de schedule_item_assignees (essa voltava a ler toda a
    -- agenda da organização com a RLS de quem chama: cerca de 1,5 s por ficha).
    -- Os recursos continuam a vir de schedule_resources com a RLS de quem chama.
    WITH pagina AS MATERIALIZED (
      SELECT si.*, b.name AS board_nome
      FROM (SELECT x.id FROM public.schedule_items x
            WHERE x.entity_id = p_entity_id AND x.organization_id = p_organization_id) ids
      JOIN public.schedule_items si ON si.id = ids.id
      LEFT JOIN public.schedule_boards b ON b.id = si.board_id
      WHERE si.time_off_type IS NULL AND si.vacation_id IS NULL
        AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))
        AND (v_ts IS NULL OR (si.start_datetime, si.id) < (v_ts, v_id))
      ORDER BY si.start_datetime DESC, si.id DESC
      LIMIT v_lim + 1
    ),
    atrib AS MATERIALIZED (
      SELECT h.visita_id, h.recurso_id
      FROM public.fn_neg_ficha_visitas_recursos(p_organization_id,
                                                ARRAY(SELECT pg.id FROM pagina pg)) AS h
    )
    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_ts, v_ult_id
    FROM (
      SELECT s.id, s.start_datetime AS em,
             row_number() OVER (ORDER BY s.start_datetime DESC, s.id DESC) AS rn,
             jsonb_build_object(
               'id', s.id, 'inicio', s.start_datetime, 'fim', s.end_datetime, 'status', s.status,
               'resultado', s.visit_outcome, 'tipo', s.visit_kind, 'titulo', s.title,
               'notas', s.description, 'local', s.location, 'negocio_id', s.negocio_id,
               'feito_por_nome', fp.name, 'board_id', s.board_id, 'board_nome', s.board_nome,
               'recursos', rc.lista, 'detalhes', s.metadata -> 'pessoas',
               'cancelada', s.status = 'cancelled'::public.schedule_item_status) AS item
      FROM pagina s
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u
        WHERE u.id = s.created_by OR u.auth_user_id = s.created_by
        LIMIT 1
      ) fp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.name,
                                                     'user_id', r.user_id, 'ativo', r.is_active)
                                  ORDER BY r.name, r.id), '[]'::jsonb) AS lista
        FROM atrib a
        JOIN public.schedule_resources r ON r.id = a.recurso_id
        WHERE a.visita_id = s.id
      ) rc ON true
    ) z;

  ELSE -- levantamentos
    SELECT count(*) INTO v_total
    FROM public.levantamentos lt
    WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
      AND lt.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_dt, v_ult_id
    FROM (
      SELECT lt.id, lt.data_levantamento AS em,
             row_number() OVER (ORDER BY lt.data_levantamento DESC, lt.id DESC) AS rn,
             jsonb_build_object(
               'id', lt.id, 'visita_id', lt.visita_id, 'negocio_id', lt.negocio_id,
               'data', lt.data_levantamento, 'estado', lt.estado, 'notas', lt.notas,
               'feito_por_id', lt.feito_por, 'feito_por_nome', fp.name,
               'morada', jsonb_build_object('rua', lt.morada_rua, 'codigo_postal', lt.morada_codigo_postal,
                                            'localidade', lt.morada_localidade, 'andar', lt.morada_andar,
                                            'origem', lt.morada_origem),
               'n_linhas', ln.n, 'n_respostas', rs.n,
               'linhas', ln.lista, 'respostas', rs.lista) AS item
      FROM (
        SELECT l2.*
        FROM public.levantamentos l2
        WHERE l2.entity_id = p_entity_id AND l2.organization_id = p_organization_id
          AND l2.deleted_at IS NULL
          AND (v_dt IS NULL OR (l2.data_levantamento, l2.id) < (v_dt, v_id))
        ORDER BY l2.data_levantamento DESC, l2.id DESC
        LIMIT v_lim + 1
      ) lt
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u WHERE u.id = lt.feito_por LIMIT 1
      ) fp ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'divisao', ll.divisao, 'trabalho', ll.trabalho, 'trabalho_outro', ll.trabalho_outro,
                 'medida', ll.medida, 'unidade', ll.unidade, 'observacoes', ll.observacoes,
                 'ordem', ll.ordem) ORDER BY ll.ordem, ll.id), '[]'::jsonb) AS lista
        FROM public.levantamento_linhas ll
        WHERE ll.levantamento_id = lt.id
      ) ln ON true
      LEFT JOIN LATERAL (
        -- 20261226090000: cada resposta traz o snapshot (o que a pessoa viu e
        -- respondeu); tipo NULL = resposta antiga, só com a chave em 'resposta'.
        SELECT count(*) AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'seccao', lr.seccao, 'pergunta', lr.pergunta, 'resposta', lr.resposta,
                 'tipo', lr.tipo, 'pergunta_texto', lr.pergunta_texto, 'seccao_titulo', lr.seccao_titulo,
                 'bloco', lr.bloco, 'ordem', lr.ordem, 'escolhas', lr.escolhas,
                 'escolhas_texto', lr.escolhas_texto, 'valor_texto', lr.valor_texto,
                 'valor_numero', lr.valor_numero)
                 ORDER BY lr.ordem NULLS LAST, lr.seccao, lr.pergunta), '[]'::jsonb) AS lista
        FROM public.levantamento_respostas lr
        WHERE lr.levantamento_id = lt.id
          -- 20261231100000: a Qualificação é do negócio
          AND lr.seccao <> 'qualificacao'
      ) rs ON true
    ) z;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'tem_mais', v_mais,
    'proximo', CASE WHEN v_mais THEN jsonb_build_object(
                 'em', CASE WHEN p_tipo = 'levantamentos' THEN to_char(v_ult_dt, 'YYYY-MM-DD')
                            ELSE to_char(v_ult_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
                 'id', v_ult_id) END,
    'itens', v_itens);
END;
$function$;

-- 6g. fn_form_criar_entidade: mesma assinatura, copiada literalmente da
--     versão do remoto (pg_get_functiondef, a de 20261229100000), mudando só
--     a língua: usa-se a que a página manda apenas se casar com
--     ^[a-z]{2}(-[a-z]{2,4})?$, senão 'pt'. Sem isto, uma língua mal escrita
--     (pt-PT, PT, ...) vinda de create-lead ou book-slot violava o CHECK de
--     locale e a lead perdia-se. CREATE OR REPLACE mantém o EXECUTE (só
--     service_role) e o comentário.
CREATE OR REPLACE FUNCTION public.fn_form_criar_entidade(p_organization_id uuid, p_form_id uuid DEFAULT NULL::uuid, p_campaign_id uuid DEFAULT NULL::uuid, p_campaign_via text DEFAULT NULL::text, p_origin_id uuid DEFAULT NULL::uuid, p_origin_recognized boolean DEFAULT NULL::boolean, p_channel_id uuid DEFAULT NULL::uuid, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_locale text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_extra jsonb DEFAULT NULL::jsonb, p_field_values jsonb DEFAULT NULL::jsonb, p_status text DEFAULT 'in_progress'::text, p_is_complete boolean DEFAULT false, p_current_step integer DEFAULT 1, p_total_steps integer DEFAULT NULL::integer, p_needs_manual_scheduling boolean DEFAULT NULL::boolean)
 RETURNS TABLE(entity_id uuid, submission_id uuid, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_root    uuid;
  v_first   text := NULLIF(btrim(p_first_name), '');
  v_last    text := NULLIF(btrim(p_last_name), '');
  v_email   text := NULLIF(lower(btrim(p_email)), '');
  v_phone   text := NULLIF(btrim(p_phone), '');
  v_digits  text;
  -- 20261231100000: a língua da página só se grava com o formato de código de
  -- língua (o CHECK anew_entities_locale_check); qualquer outra coisa -> 'pt'.
  v_locale  text := CASE WHEN btrim(p_locale) ~ '^[a-z]{2}(-[a-z]{2,4})?$'
                         THEN btrim(p_locale) ELSE 'pt' END;
  v_street  text := NULLIF(btrim(p_street), '');
  v_postal  text := NULLIF(btrim(p_postal_code), '');
  v_city    text := NULLIF(btrim(p_city), '');
  v_notes   text := NULLIF(btrim(p_notes), '');
  v_extra   jsonb := COALESCE(p_extra, '{}'::jsonb);
  v_fv      jsonb := COALESCE(p_field_values, '{}'::jsonb);
  v_meta    jsonb;
  v_display text;
  v_entity  uuid;
  v_created boolean := true;
  v_address uuid;
  v_sub     uuid;
BEGIN
  -- --- validacao contra a organizacao (qualquer falha: 22023) ---
  IF p_organization_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_organization_id) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: organizacao invalida' USING ERRCODE = '22023';
  END IF;

  IF p_form_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.forms f
       WHERE f.id = p_form_id AND f.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: formulario de outra organizacao ou inexistente' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.campaigns ca
       WHERE ca.id = p_campaign_id AND ca.organization_id = p_organization_id
         AND (ca.form_id IS NULL OR p_form_id IS NULL OR ca.form_id = p_form_id)) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: campanha de outra organizacao, de outro formulario ou inexistente' USING ERRCODE = '22023';
  END IF;

  IF p_channel_id IS NOT NULL AND (p_campaign_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.channels ch
       WHERE ch.id = p_channel_id AND ch.campaign_id = p_campaign_id)) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: canal que nao pertence a campanha' USING ERRCODE = '22023';
  END IF;

  IF p_origin_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.lead_sources ls
       WHERE ls.id = p_origin_id
         AND (ls.organization_id = p_organization_id OR ls.organization_id IS NULL)
         AND ls.is_active IS NOT FALSE) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: origem de outra organizacao, inativa ou inexistente' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_extra) <> 'object' OR jsonb_typeof(v_fv) <> 'object' THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: p_extra e p_field_values tem de ser objetos' USING ERRCODE = '22023';
  END IF;

  v_root := public.resolve_root_organization_id(p_organization_id);

  -- type e display_name sao NOT NULL; display_name nunca vazio
  v_display := COALESCE(NULLIF(btrim(concat_ws(' ', v_first, v_last)), ''), v_email, v_phone, 'Sem nome');

  -- --- a entidade e os contactos primarios; corrida -> a entidade vencedora ---
  BEGIN
    INSERT INTO public.anew_entities (
      type, display_name, status, created_by, first_name, last_name,
      organization_id, client_since, email, phone, locale,
      origin_id, campaign_id, notes, extra
    ) VALUES (
      'person', v_display, 'active', NULL, v_first, v_last,
      p_organization_id, NULL, v_email, v_phone, v_locale,
      p_origin_id, p_campaign_id, v_notes, v_extra
    )
    RETURNING id INTO v_entity;

    -- neg_ficha_pessoa le email e telefone SO destas tabelas
    IF v_email IS NOT NULL THEN
      INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary, created_by)
      VALUES (v_entity, v_email, 'personal', true, NULL);
    END IF;
    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anew_entity_phones (entity_id, phone_number, phone_type, is_primary, created_by)
      VALUES (v_entity, v_phone, 'mobile', true, NULL);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- outro envio criou a mesma pessoa entre o achar e este INSERT: pelos
    -- mesmos criterios dos indices unicos (email; telefone nos 9 digitos)
    v_digits := regexp_replace(COALESCE(v_phone, ''), '[^0-9]', '', 'g');
    SELECT e.id INTO v_entity
    FROM public.anew_entities e
    WHERE e.organization_id = p_organization_id
      AND e.deleted_at IS NULL
      AND (   (v_email IS NOT NULL AND e.email IS NOT NULL AND lower(e.email) = v_email)
           OR (v_digits <> '' AND e.phone IS NOT NULL
               AND regexp_replace(e.phone, '[^0-9]', '', 'g') <> ''
               AND right(regexp_replace(e.phone, '[^0-9]', '', 'g'), 9) = right(v_digits, 9)))
    ORDER BY (v_email IS NOT NULL AND lower(e.email) = v_email) DESC, e.created_at, e.id
    LIMIT 1;
    IF v_entity IS NULL THEN
      RAISE;
    END IF;
    v_created := false;
  END;

  -- --- morada: so com rua E codigo postal (mesma address_key do create-lead) ---
  IF v_created AND v_street IS NOT NULL AND v_postal IS NOT NULL THEN
    INSERT INTO public.anew_addresses (
      address_key, street, number, postal_code, city, country, created_by
    ) VALUES (
      lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, ''))),
      v_street, '', v_postal, COALESCE(v_city, ''), 'PT', NULL
    )
    RETURNING id INTO v_address;

    INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type, is_primary, created_by)
    VALUES (v_entity, v_address, 'primary', true, NULL);
  END IF;

  -- --- o toque: target lead = a entidade; a marca entidade_nova so o servidor escreve ---
  v_meta := CASE WHEN jsonb_typeof(v_fv -> '_meta') = 'object' THEN v_fv -> '_meta' ELSE '{}'::jsonb END;
  v_fv := v_fv || jsonb_build_object('_meta', v_meta || jsonb_build_object('entidade_nova', v_created));

  v_sub := public.upsert_form_submission(
    p_organization_id         => p_organization_id,
    p_root_organization_id    => v_root,
    p_entity_id               => v_entity,
    p_form_id                 => p_form_id,
    p_campaign_id             => p_campaign_id,
    p_target_type             => 'lead',
    p_target_id               => v_entity,
    p_field_values            => v_fv,
    p_status                  => COALESCE(p_status, 'in_progress'),
    p_is_complete             => COALESCE(p_is_complete, false),
    p_current_step            => COALESCE(p_current_step, 1),
    p_total_steps             => p_total_steps,
    p_origin_id               => p_origin_id,
    p_origin_recognized       => p_origin_recognized,
    p_channel_id              => p_channel_id,
    p_negocio_id              => NULL,
    p_campaign_via            => p_campaign_via,
    p_needs_manual_scheduling => p_needs_manual_scheduling
  );

  RETURN QUERY SELECT v_entity, v_sub, v_created;
END;
$function$;

-- 6h. neg_guardar_questionario: mesma assinatura, copiada literalmente da
--     versão do remoto (a de 20261226090000), mudando só a guarda D4: o tipo
--     de uma pergunta só muda enquanto não tiver respostas, contando também
--     as da qualificação do negócio (negocio_qualificacao_respostas; o índice
--     (organization_id, pergunta) cobre a pesquisa). SECURITY DEFINER: vê as
--     respostas de todos os negócios da organização, como já via as do
--     levantamento. CREATE OR REPLACE mantém o EXECUTE e o comentário.
CREATE OR REPLACE FUNCTION public.neg_guardar_questionario(p_organization_id uuid, p_versao integer, p_seccoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_escolha  CONSTANT text[] := ARRAY['escolha_unica', 'escolha_multipla'];
  c_re_uuid  CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_uid      uuid := auth.uid();
  v_norm     jsonb;
  v_keys_pes text[];
  v_versao   integer;
  v_actor    uuid;
  v_s        jsonb;
  v_q        jsonb;
  v_o        jsonb;
  v_si       integer;
  v_qi       integer;
  v_oi       integer;
  v_sid      uuid;
  v_pid      uuid;
  v_oid      uuid;
  v_sec      public.levantamento_seccoes;
  v_per      public.levantamento_perguntas;
  v_chave    text;
  v_n        integer;
  v_k        integer;
  v_refs     jsonb := '{}'::jsonb;
  v_vs       uuid[] := ARRAY[]::uuid[];
  v_vp       uuid[] := ARRAY[]::uuid[];
  v_vo       uuid[] := ARRAY[]::uuid[];
  v_novas_p  uuid[] := ARRAY[]::uuid[];
  v_alt_s    uuid[] := ARRAY[]::uuid[];
  v_alt_p    uuid[] := ARRAY[]::uuid[];
  v_alt_o    uuid[] := ARRAY[]::uuid[];
  v_cri_s    integer := 0;
  v_cri_p    integer := 0;
  v_cri_o    integer := 0;
  v_apa_s    integer := 0;
  v_apa_p    integer := 0;
  v_apa_o    integer := 0;
  v_alvo     uuid;
  v_alvo_txt text;
  v_dep_ops  text[];
  v_dep_sem  boolean;
  v_n_env    integer;
  v_n_ok     integer;
  v_n_dist   integer;
  v_mudou    boolean;
BEGIN
  -- 1. Valores (NG009), antes de tudo.
  IF p_organization_id IS NULL OR p_versao IS NULL OR p_versao < 1 THEN
    RAISE EXCEPTION 'Questionário inválido: organização ou versão.' USING ERRCODE = 'NG009';
  END IF;
  v_norm := public.fn_neg_questionario_normalizar(p_seccoes);

  -- 2. Sessão
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view, Pessoas activa e questionário
  --    (a mesma mensagem nos quatro casos).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':'))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = p_organization_id)
     OR NOT EXISTS (SELECT 1 FROM public.levantamento_questionario q WHERE q.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- 4. Permissão própria do Workflow de Pessoas, nesta organização.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.config') THEN
    RAISE EXCEPTION 'Sem permissão para configurar o levantamento.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Exclusivo por organização (as gravações de levantamentos tomam o
  --    mesmo bloqueio partilhado) e versão.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('levantamento_questionario:' || p_organization_id::text, 0));
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = p_organization_id
  FOR UPDATE;
  IF v_versao <> p_versao THEN
    RAISE EXCEPTION 'A configuração do levantamento foi alterada entretanto; volte a abrir.' USING ERRCODE = 'NG021';
  END IF;

  -- 6 e 7. Secções, perguntas e opções, pela ordem do pedido.
  FOR v_s, v_si IN SELECT e.value, (e.ord - 1)::integer
                   FROM jsonb_array_elements(v_norm) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
  LOOP
    v_sid := (v_s ->> 'id')::uuid;
    IF v_sid IS NOT NULL THEN
      SELECT ls.* INTO v_sec
      FROM public.levantamento_seccoes ls
      WHERE ls.id = v_sid AND ls.organization_id = p_organization_id AND ls.apagada_em IS NULL
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Questionário inválido: secção desconhecida.' USING ERRCODE = 'NG009';
      END IF;
      IF ((v_s ->> 'aba') IS NOT NULL AND (v_s ->> 'aba') <> v_sec.aba)
         OR ((v_s ->> 'especial') IS NOT NULL AND (v_s ->> 'especial') IS DISTINCT FROM v_sec.especial) THEN
        RAISE EXCEPTION 'Questionário inválido: a aba e o tipo de uma secção não mudam.' USING ERRCODE = 'NG009';
      END IF;
      IF v_sec.especial IS NOT NULL AND NOT (v_s ->> 'activa')::boolean THEN
        RAISE EXCEPTION 'Questionário inválido: as secções Visitas e Medidas só se reordenam.' USING ERRCODE = 'NG009';
      END IF;
      UPDATE public.levantamento_seccoes ls
      SET titulo = v_s ->> 'titulo', ordem = v_si, activa = (v_s ->> 'activa')::boolean
      WHERE ls.id = v_sid
        AND (ls.titulo, ls.ordem, ls.activa)
            IS DISTINCT FROM (v_s ->> 'titulo', v_si, (v_s ->> 'activa')::boolean);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        v_alt_s := v_alt_s || v_sid;
      END IF;
    ELSE
      IF (v_s ->> 'especial') IS NOT NULL OR COALESCE(v_s ->> 'aba', 'visita') <> 'visita' THEN
        RAISE EXCEPTION 'Questionário inválido: só se criam secções da aba Visita, sem tipo especial.'
          USING ERRCODE = 'NG009';
      END IF;
      LOOP
        v_chave := 's' || substr(md5(gen_random_uuid()::text), 1, 10);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.levantamento_seccoes x
                              WHERE x.organization_id = p_organization_id AND x.chave = v_chave);
      END LOOP;
      INSERT INTO public.levantamento_seccoes (organization_id, chave, titulo, aba, especial, ordem, activa)
      VALUES (p_organization_id, v_chave, v_s ->> 'titulo', 'visita', NULL, v_si, (v_s ->> 'activa')::boolean)
      RETURNING * INTO v_sec;
      v_sid := v_sec.id;
      v_cri_s := v_cri_s + 1;
    END IF;
    IF v_sid = ANY (v_vs) THEN
      RAISE EXCEPTION 'Questionário inválido: secção repetida.' USING ERRCODE = 'NG009';
    END IF;
    v_vs := v_vs || v_sid;
    IF (v_s ->> 'ref') IS NOT NULL THEN
      v_refs := v_refs || jsonb_build_object(v_s ->> 'ref', v_sid);
    END IF;

    IF v_sec.especial IS NOT NULL AND jsonb_array_length(v_s -> 'perguntas') > 0 THEN
      RAISE EXCEPTION 'Questionário inválido: as secções Visitas e Medidas não têm perguntas.' USING ERRCODE = 'NG009';
    END IF;

    FOR v_q, v_qi IN SELECT e.value, (e.ord - 1)::integer
                     FROM jsonb_array_elements(v_s -> 'perguntas') WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
    LOOP
      v_pid := (v_q ->> 'id')::uuid;
      IF v_pid IS NOT NULL THEN
        SELECT lp.* INTO v_per
        FROM public.levantamento_perguntas lp
        WHERE lp.id = v_pid AND lp.organization_id = p_organization_id AND lp.apagada_em IS NULL
        FOR UPDATE;
        IF NOT FOUND OR v_pid = ANY (v_vp) THEN
          RAISE EXCEPTION 'Questionário inválido: pergunta desconhecida.' USING ERRCODE = 'NG009';
        END IF;
        -- D4 (20/10): o tipo só muda enquanto a pergunta não tiver respostas.
        -- 20261231100000: contam também as respostas da qualificação do negócio.
        IF v_per.tipo <> (v_q ->> 'tipo')
           AND (EXISTS (SELECT 1 FROM public.levantamento_respostas lr
                        WHERE lr.organization_id = p_organization_id AND lr.pergunta = v_per.chave)
                OR EXISTS (SELECT 1 FROM public.negocio_qualificacao_respostas nr
                           WHERE nr.organization_id = p_organization_id AND nr.pergunta = v_per.chave)) THEN
          RAISE EXCEPTION 'Questionário inválido: a pergunta «%» já tem respostas e não muda de tipo; crie uma pergunta nova.',
            v_per.texto USING ERRCODE = 'NG009';
        END IF;
        UPDATE public.levantamento_perguntas lp
        SET seccao_id    = v_sid,
            texto        = v_q ->> 'texto',
            bloco        = v_q ->> 'bloco',
            tipo         = v_q ->> 'tipo',
            numero_min   = (v_q ->> 'numero_min')::numeric,
            numero_max   = (v_q ->> 'numero_max')::numeric,
            numero_casas = (v_q ->> 'numero_casas')::smallint,
            unidade      = v_q ->> 'unidade',
            texto_max    = (v_q ->> 'texto_max')::smallint,
            ordem        = v_qi,
            activa       = (v_q ->> 'activa')::boolean
        WHERE lp.id = v_pid
          AND (lp.seccao_id, lp.texto, lp.bloco, lp.tipo, lp.numero_min, lp.numero_max, lp.numero_casas,
               lp.unidade, lp.texto_max, lp.ordem, lp.activa)
              IS DISTINCT FROM
              (v_sid, v_q ->> 'texto', v_q ->> 'bloco', v_q ->> 'tipo', (v_q ->> 'numero_min')::numeric,
               (v_q ->> 'numero_max')::numeric, (v_q ->> 'numero_casas')::smallint, v_q ->> 'unidade',
               (v_q ->> 'texto_max')::smallint, v_qi, (v_q ->> 'activa')::boolean);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN
          v_alt_p := v_alt_p || v_pid;
        END IF;
      ELSE
        LOOP
          v_chave := 'p' || substr(md5(gen_random_uuid()::text), 1, 10);
          EXIT WHEN NOT EXISTS (SELECT 1 FROM public.levantamento_perguntas x
                                WHERE x.organization_id = p_organization_id AND x.chave = v_chave);
        END LOOP;
        INSERT INTO public.levantamento_perguntas
          (organization_id, seccao_id, chave, texto, bloco, tipo, numero_min, numero_max, numero_casas,
           unidade, texto_max, ordem, activa)
        VALUES
          (p_organization_id, v_sid, v_chave, v_q ->> 'texto', v_q ->> 'bloco', v_q ->> 'tipo',
           (v_q ->> 'numero_min')::numeric, (v_q ->> 'numero_max')::numeric, (v_q ->> 'numero_casas')::smallint,
           v_q ->> 'unidade', (v_q ->> 'texto_max')::smallint, v_qi, (v_q ->> 'activa')::boolean)
        RETURNING id INTO v_pid;
        v_novas_p := v_novas_p || v_pid;
        v_cri_p := v_cri_p + 1;
      END IF;
      v_vp := v_vp || v_pid;
      IF (v_q ->> 'ref') IS NOT NULL THEN
        v_refs := v_refs || jsonb_build_object(v_q ->> 'ref', v_pid);
      END IF;

      FOR v_o, v_oi IN SELECT e.value, (e.ord - 1)::integer
                       FROM jsonb_array_elements(v_q -> 'opcoes') WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
      LOOP
        v_oid := (v_o ->> 'id')::uuid;
        IF v_oid IS NOT NULL THEN
          PERFORM 1 FROM public.levantamento_opcoes lo
          WHERE lo.id = v_oid AND lo.pergunta_id = v_pid AND lo.organization_id = p_organization_id
            AND lo.apagada_em IS NULL
          FOR UPDATE;
          IF NOT FOUND OR v_oid = ANY (v_vo) THEN
            RAISE EXCEPTION 'Questionário inválido: opção desconhecida.' USING ERRCODE = 'NG009';
          END IF;
          UPDATE public.levantamento_opcoes lo
          SET texto = v_o ->> 'texto', ordem = v_oi, activa = (v_o ->> 'activa')::boolean
          WHERE lo.id = v_oid
            AND (lo.texto, lo.ordem, lo.activa)
                IS DISTINCT FROM (v_o ->> 'texto', v_oi, (v_o ->> 'activa')::boolean);
          GET DIAGNOSTICS v_n = ROW_COUNT;
          IF v_n > 0 THEN
            v_alt_o := v_alt_o || v_oid;
          END IF;
        ELSE
          LOOP
            v_chave := 'o' || substr(md5(gen_random_uuid()::text), 1, 8);
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.levantamento_opcoes x
                                  WHERE x.pergunta_id = v_pid AND x.chave = v_chave);
          END LOOP;
          INSERT INTO public.levantamento_opcoes (organization_id, pergunta_id, chave, texto, ordem, activa)
          VALUES (p_organization_id, v_pid, v_chave, v_o ->> 'texto', v_oi, (v_o ->> 'activa')::boolean)
          RETURNING id INTO v_oid;
          v_cri_o := v_cri_o + 1;
        END IF;
        v_vo := v_vo || v_oid;
        IF (v_o ->> 'ref') IS NOT NULL THEN
          v_refs := v_refs || jsonb_build_object(v_o ->> 'ref', v_oid);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Apagar o que não veio (nunca DELETE). Visitas, Medidas e Qualificação ficam.
  IF EXISTS (SELECT 1 FROM public.levantamento_seccoes ls
             WHERE ls.organization_id = p_organization_id AND ls.apagada_em IS NULL
               AND ls.id <> ALL (v_vs) AND (ls.especial IS NOT NULL OR ls.chave = 'qualificacao')) THEN
    RAISE EXCEPTION 'Questionário inválido: as secções Visitas, Medidas e Qualificação não se apagam.'
      USING ERRCODE = 'NG009';
  END IF;
  UPDATE public.levantamento_opcoes lo
  SET apagada_em = now()
  WHERE lo.organization_id = p_organization_id AND lo.apagada_em IS NULL
    AND lo.pergunta_id = ANY (v_vp) AND lo.id <> ALL (v_vo);
  GET DIAGNOSTICS v_apa_o = ROW_COUNT;
  UPDATE public.levantamento_perguntas lp
  SET apagada_em = now()
  WHERE lp.organization_id = p_organization_id AND lp.apagada_em IS NULL AND lp.id <> ALL (v_vp);
  GET DIAGNOSTICS v_apa_p = ROW_COUNT;
  UPDATE public.levantamento_seccoes ls
  SET apagada_em = now()
  WHERE ls.organization_id = p_organization_id AND ls.apagada_em IS NULL AND ls.id <> ALL (v_vs);
  GET DIAGNOSTICS v_apa_s = ROW_COUNT;

  -- Condições: resolvidas depois de todas as perguntas e opções terem id
  -- (podem apontar para uma criada nesta mesma gravação, por ref).
  v_k := 0;
  FOR v_q IN SELECT q.value
             FROM jsonb_array_elements(v_norm) WITH ORDINALITY AS s(value, ord)
             CROSS JOIN LATERAL jsonb_array_elements(s.value -> 'perguntas') WITH ORDINALITY AS q(value, ord)
             ORDER BY s.ord, q.ord
  LOOP
    v_k := v_k + 1;
    v_pid := v_vp[v_k];
    v_alvo := NULL;
    v_dep_ops := NULL;
    v_dep_sem := false;
    IF jsonb_typeof(v_q -> 'depende') = 'object' THEN
      v_alvo_txt := v_q -> 'depende' ->> 'pergunta';
      v_alvo := CASE WHEN v_alvo_txt ~ c_re_uuid THEN v_alvo_txt::uuid
                     ELSE (v_refs ->> v_alvo_txt)::uuid END;
      IF v_alvo IS NULL OR NOT (v_alvo = ANY (v_vp)) OR v_alvo = v_pid THEN
        RAISE EXCEPTION 'Questionário inválido: condição de uma pergunta desconhecida.' USING ERRCODE = 'NG009';
      END IF;
      SELECT count(*), count(lo.id), count(DISTINCT lo.id), array_agg(lo.chave ORDER BY d.ord)
        INTO v_n_env, v_n_ok, v_n_dist, v_dep_ops
      FROM jsonb_array_elements_text(v_q -> 'depende' -> 'opcoes') WITH ORDINALITY AS d(ref, ord)
      LEFT JOIN public.levantamento_opcoes lo
        ON lo.id = CASE WHEN d.ref ~ c_re_uuid THEN d.ref::uuid ELSE (v_refs ->> d.ref)::uuid END
       AND lo.pergunta_id = v_alvo AND lo.apagada_em IS NULL;
      IF v_n_ok <> v_n_env OR v_n_dist <> v_n_env THEN
        RAISE EXCEPTION 'Questionário inválido: a condição tem opções desconhecidas ou repetidas.' USING ERRCODE = 'NG009';
      END IF;
      v_dep_sem := (v_q -> 'depende' ->> 'sem_resposta')::boolean;
    END IF;
    UPDATE public.levantamento_perguntas lp
    SET depende_de = v_alvo, depende_opcoes = v_dep_ops, depende_sem_resposta = v_dep_sem
    WHERE lp.id = v_pid
      AND (lp.depende_de, lp.depende_opcoes, lp.depende_sem_resposta)
          IS DISTINCT FROM (v_alvo, v_dep_ops, v_dep_sem);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 AND NOT (v_pid = ANY (v_novas_p)) AND NOT (v_pid = ANY (v_alt_p)) THEN
      v_alt_p := v_alt_p || v_pid;
    END IF;
  END LOOP;

  -- Invariantes do resultado (falha: NG009 e tudo se desfaz).
  IF EXISTS (SELECT 1
             FROM public.levantamento_perguntas lp
             JOIN public.levantamento_perguntas alvo ON alvo.id = lp.depende_de
             WHERE lp.organization_id = p_organization_id AND lp.apagada_em IS NULL
               AND (alvo.apagada_em IS NOT NULL
                    OR alvo.tipo <> ALL (c_escolha)
                    OR alvo.depende_de IS NOT NULL
                    OR EXISTS (SELECT 1 FROM unnest(lp.depende_opcoes) AS d(chave)
                               WHERE NOT EXISTS (SELECT 1 FROM public.levantamento_opcoes lo
                                                 WHERE lo.pergunta_id = alvo.id AND lo.chave = d.chave
                                                   AND lo.apagada_em IS NULL)))) THEN
    RAISE EXCEPTION 'Questionário inválido: cada condição aponta para uma pergunta de escolha viva, sem condição própria, e para opções dela.'
      USING ERRCODE = 'NG009';
  END IF;
  IF EXISTS (SELECT 1 FROM public.levantamento_perguntas lp
             WHERE lp.organization_id = p_organization_id AND lp.apagada_em IS NULL
               AND ((lp.tipo = ANY (c_escolha)
                     AND (SELECT count(*) FROM public.levantamento_opcoes lo
                          WHERE lo.pergunta_id = lp.id AND lo.apagada_em IS NULL) < 2)
                    OR (lp.tipo <> ALL (c_escolha)
                        AND EXISTS (SELECT 1 FROM public.levantamento_opcoes lo
                                    WHERE lo.pergunta_id = lp.id AND lo.apagada_em IS NULL)))) THEN
    RAISE EXCEPTION 'Questionário inválido: perguntas de escolha com 2 a 30 opções; as outras sem opções.'
      USING ERRCODE = 'NG009';
  END IF;
  IF (SELECT string_agg(ls.chave, ',' ORDER BY ls.chave) FROM public.levantamento_seccoes ls
      WHERE ls.organization_id = p_organization_id AND ls.apagada_em IS NULL
        AND (ls.especial IS NOT NULL OR ls.chave = 'qualificacao'))
     IS DISTINCT FROM 'medidas,qualificacao,visitas' THEN
    RAISE EXCEPTION 'Questionário inválido: faltam as secções Visitas, Medidas ou Qualificação.' USING ERRCODE = 'NG009';
  END IF;

  -- 8. Versão e auditoria, só se alguma coisa mudou.
  v_mudou := v_cri_s + v_cri_p + v_cri_o + v_apa_s + v_apa_p + v_apa_o
             + cardinality(v_alt_s) + cardinality(v_alt_p) + cardinality(v_alt_o) > 0;
  IF v_mudou THEN
    v_actor := public.fn_neg_actor();
    UPDATE public.levantamento_questionario q
    SET versao = q.versao + 1, updated_by = v_actor
    WHERE q.organization_id = p_organization_id
    RETURNING q.versao INTO v_versao;
    PERFORM public.fn_manual_audit_log(
      'levantamento_questionario', NULL, p_organization_id, 'UPDATE',
      jsonb_build_object('levantamento_questionario', jsonb_build_object(
        'versao', jsonb_build_object('old', v_versao - 1, 'new', v_versao),
        'criadas', jsonb_build_object('seccoes', v_cri_s, 'perguntas', v_cri_p, 'opcoes', v_cri_o),
        'alteradas', jsonb_build_object('seccoes', cardinality(v_alt_s), 'perguntas', cardinality(v_alt_p),
                                        'opcoes', cardinality(v_alt_o)),
        'apagadas', jsonb_build_object('seccoes', v_apa_s, 'perguntas', v_apa_p, 'opcoes', v_apa_o))),
      'web_app', p_organization_id);
  END IF;

  RETURN jsonb_build_object(
    'versao', v_versao,
    'mudou', v_mudou,
    'criadas', jsonb_build_object('seccoes', v_cri_s, 'perguntas', v_cri_p, 'opcoes', v_cri_o),
    'alteradas', jsonb_build_object('seccoes', cardinality(v_alt_s), 'perguntas', cardinality(v_alt_p),
                                    'opcoes', cardinality(v_alt_o)),
    'apagadas', jsonb_build_object('seccoes', v_apa_s, 'perguntas', v_apa_p, 'opcoes', v_apa_o),
    'refs', v_refs);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Semente do questionário: só a nike
-- -----------------------------------------------------------------------------
DO $semear$
DECLARE
  c_nike CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_r    jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = c_nike)
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = c_nike) THEN
    RAISE EXCEPTION 'Semente: a organização nike não existe ou não tem configuração.';
  END IF;
  v_r := public.fn_neg_semear_questionario(c_nike);
  RAISE NOTICE 'Semente do questionário da nike: %', v_r::text;
END;
$semear$;

-- -----------------------------------------------------------------------------
-- 8. Conferir (falha se alguma coisa divergir)
-- -----------------------------------------------------------------------------
DO $conferir$
DECLARE
  c_nike  CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_n     bigint;
  v_txt   text;
  v_nome  text;
  v_tab   text;
BEGIN
  -- RLS activa e 5 políticas por tabela, com as restritivas certas
  FOREACH v_tab IN ARRAY ARRAY['negocio_qualificacoes', 'negocio_qualificacao_respostas'] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
            WHERE c.oid = to_regclass('public.' || v_tab)) THEN
      RAISE EXCEPTION 'Conferir: RLS desligada em %.', v_tab;
    END IF;
    SELECT count(*) INTO v_n FROM pg_catalog.pg_policy p WHERE p.polrelid = to_regclass('public.' || v_tab);
    IF v_n <> 5 THEN
      RAISE EXCEPTION 'Conferir: % tem % políticas (esperava 5).', v_tab, v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
                   WHERE p.polrelid = to_regclass('public.' || v_tab)
                     AND p.polname::text = 'system_admin_pii_default_deny'
                     AND p.polcmd::text = '*' AND NOT p.polpermissive) THEN
      RAISE EXCEPTION 'Conferir: system_admin_pii_default_deny de % não é RESTRICTIVE FOR ALL.', v_tab;
    END IF;
    -- PUBLIC (grantee 0) e anon sem privilégio nenhum
    SELECT count(*) INTO v_n
    FROM pg_catalog.pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = to_regclass('public.' || v_tab)
      AND (a.grantee = 0 OR a.grantee = 'anon'::regrole::oid);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: PUBLIC ou anon têm % privilégios em %.', v_n, v_tab;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
                 WHERE p.polrelid = to_regclass('public.negocio_qualificacoes')
                   AND p.polname::text = 'negocio_qualificacoes_no_delete'
                   AND p.polcmd::text = 'd' AND NOT p.polpermissive) THEN
    RAISE EXCEPTION 'Conferir: negocio_qualificacoes_no_delete não é RESTRICTIVE FOR DELETE.';
  END IF;

  -- authenticated: exactamente o concedido (nada de TRUNCATE, REFERENCES, TRIGGER, ...)
  SELECT string_agg(a.privilege_type::text, ',' ORDER BY a.privilege_type::text) INTO v_txt
  FROM pg_catalog.pg_class c, aclexplode(c.relacl) a
  WHERE c.oid = to_regclass('public.negocio_qualificacoes') AND a.grantee = 'authenticated'::regrole::oid;
  IF v_txt IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'Conferir: authenticated em negocio_qualificacoes tem [%].', COALESCE(v_txt, '');
  END IF;
  SELECT string_agg(a.privilege_type::text, ',' ORDER BY a.privilege_type::text) INTO v_txt
  FROM pg_catalog.pg_class c, aclexplode(c.relacl) a
  WHERE c.oid = to_regclass('public.negocio_qualificacao_respostas') AND a.grantee = 'authenticated'::regrole::oid;
  IF v_txt IS DISTINCT FROM 'DELETE,INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'Conferir: authenticated em negocio_qualificacao_respostas tem [%].', COALESCE(v_txt, '');
  END IF;

  -- gatilhos das tabelas novas
  SELECT count(*) INTO v_n FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal
    AND t.tgrelid IN (to_regclass('public.negocio_qualificacoes'),
                      to_regclass('public.negocio_qualificacao_respostas'));
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Conferir: % gatilhos nas tabelas novas (esperava 5).', v_n;
  END IF;

  -- anew_entities concede por coluna: todas as colunas têm de ter um direito
  -- de authenticated (o de tabela é só INSERT e DELETE), e organization_kind
  -- é só de leitura e invisível para anon.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = to_regclass('public.anew_entities') AND a.attnum > 0 AND NOT a.attisdropped
    AND NOT EXISTS (SELECT 1 FROM aclexplode(a.attacl) x WHERE x.grantee = 'authenticated'::regrole::oid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % colunas de anew_entities sem direito de authenticated.', v_n;
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.anew_entities', 'organization_kind', 'SELECT')
     OR has_column_privilege('authenticated', 'public.anew_entities', 'organization_kind', 'UPDATE')
     OR has_column_privilege('anon', 'public.anew_entities', 'organization_kind', 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: privilégios de organization_kind diferentes do esperado.';
  END IF;

  -- uma só assinatura de cada função
  FOREACH v_nome IN ARRAY ARRAY['neg_guardar_levantamento', 'neg_ficha_pessoa',
                                'neg_guardar_identidade_pessoa', 'fn_neg_ficha_seccao',
                                'fn_negocios_fechado_so_leitura', 'neg_guardar_qualificacao',
                                'neg_guardar_contacto_pessoa', 'fn_neg_validar_respostas',
                                'fn_negocio_qualificacao_pai', 'fn_negocio_qualificacao_exigir_rpc',
                                'fn_negocio_qualificacoes_preparar_insercao',
                                'fn_negocio_qualificacoes_guardar_alteracao',
                                'fn_negocio_qualificacao_respostas_guardar',
                                'fn_form_criar_entidade', 'neg_guardar_questionario'] LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
  END LOOP;

  -- EXECUTE: as RPCs novas para authenticated e não para anon; as internas para ninguém
  FOREACH v_nome IN ARRAY ARRAY['neg_guardar_qualificacao', 'neg_guardar_contacto_pessoa',
                                'fn_neg_validar_respostas', 'neg_guardar_questionario'] LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: EXECUTE de public.% diferente do esperado.', v_nome;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('fn_negocio_qualificacao_pai', 'fn_negocio_qualificacao_exigir_rpc',
                            'fn_negocio_qualificacoes_preparar_insercao',
                            'fn_negocio_qualificacoes_guardar_alteracao',
                            'fn_negocio_qualificacao_respostas_guardar',
                            'fn_form_criar_entidade')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % funções internas executáveis por anon ou authenticated.', v_n;
  END IF;

  -- SECURITY: as novas e recriadas com o modo previsto
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname::text IN ('neg_guardar_qualificacao', 'fn_neg_validar_respostas',
                              'neg_guardar_levantamento', 'neg_ficha_pessoa', 'fn_neg_ficha_seccao')
          AND p.prosecdef)
      OR (p.proname::text IN ('neg_guardar_contacto_pessoa', 'neg_guardar_identidade_pessoa',
                              'fn_negocio_qualificacao_pai', 'fn_form_criar_entidade',
                              'neg_guardar_questionario')
          AND NOT p.prosecdef));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % funções com SECURITY DEFINER/INVOKER trocado.', v_n;
  END IF;

  -- fn_form_criar_entidade: a língua só passa com o formato (senão 'pt');
  -- neg_guardar_questionario: a guarda D4 conta a qualificação do negócio.
  SELECT pg_get_functiondef(p.oid)::text INTO v_txt FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_form_criar_entidade';
  IF position('CASE WHEN btrim(p_locale) ~ ''^[a-z]{2}(-[a-z]{2,4})?$''' IN v_txt) = 0
     OR position('COALESCE(NULLIF(btrim(p_locale), ''''), ''pt'')' IN v_txt) > 0 THEN
    RAISE EXCEPTION 'Conferir: fn_form_criar_entidade não valida o formato da língua.';
  END IF;
  SELECT pg_get_functiondef(p.oid)::text INTO v_txt FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_questionario';
  IF position('FROM public.negocio_qualificacao_respostas nr' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_questionario não olha para negocio_qualificacao_respostas.';
  END IF;

  -- morada_origem aceita localizacao
  SELECT pg_get_constraintdef(k.oid)::text INTO v_txt FROM pg_catalog.pg_constraint k
  WHERE k.conrelid = to_regclass('public.levantamentos')
    AND k.conname::text = 'levantamentos_morada_origem_check';
  IF v_txt IS NULL OR position('localizacao' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: levantamentos_morada_origem_check não aceita localizacao.';
  END IF;

  -- o texto do NG028 fala do pedido do cliente
  SELECT pg_get_functiondef(p.oid)::text INTO v_txt FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_negocios_fechado_so_leitura';
  IF position('o pedido do cliente já não se alteram' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: a mensagem NG028 não fala do pedido do cliente.';
  END IF;

  -- CHECKs novos presentes e validados
  SELECT count(*) INTO v_n FROM pg_catalog.pg_constraint k
  WHERE k.contype::text = 'c' AND k.convalidated
    AND k.conname::text IN ('anew_entities_organization_kind_check',
                            'anew_entities_organization_kind_tipo_check',
                            'anew_entities_preferred_time_check', 'anew_entities_locale_check',
                            'negocios_pedido_cliente_check', 'levantamentos_morada_origem_check',
                            'levantamentos_morada_coerente',
                            'negocio_qualificacao_respostas_snapshot_check');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Conferir: % dos 8 CHECKs novos presentes.', v_n;
  END IF;

  -- o gatilho de negócio fechado cobre pedido_cliente
  SELECT pg_get_triggerdef(t.oid)::text INTO v_txt FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = to_regclass('public.negocios')
    AND t.tgname::text = 'trg_01_negocios_fechado_so_leitura';
  IF v_txt IS NULL OR position('pedido_cliente' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: trg_01_negocios_fechado_so_leitura não cobre pedido_cliente.';
  END IF;

  -- 6 perguntas de qualificação vivas na nike, as do catálogo
  SELECT count(*), string_agg(p.chave::text, ',' ORDER BY p.chave::text) INTO v_n, v_txt
  FROM public.levantamento_perguntas p
  JOIN public.levantamento_seccoes s ON s.id = p.seccao_id
  WHERE s.organization_id = c_nike AND s.chave = 'qualificacao' AND s.aba = 'qualificacao'
    AND s.apagada_em IS NULL AND p.apagada_em IS NULL AND p.activa;
  IF v_n <> 6 OR v_txt IS DISTINCT FROM 'decisor,imovel,orcCliente,outrosOrc,posse,prazo' THEN
    RAISE EXCEPTION 'Conferir: a nike tem % perguntas de qualificação vivas [%] (esperava 6).', v_n, COALESCE(v_txt, '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.levantamento_questionario q WHERE q.organization_id = c_nike) THEN
    RAISE EXCEPTION 'Conferir: a nike ficou sem levantamento_questionario.';
  END IF;
END;
$conferir$;
