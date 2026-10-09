-- ==============================================================================
-- Modelo do contrato (2/2): o historico de alteracoes do contrato passa a regista
-- os campos certos, com motivo e documento, e ganha uma RPC de leitura.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO (para o ecra do historico; a base em si nao parte nada).
-- O trigger corrigido e a RPC nova entram no mesmo commit que o cartao de
-- Historico de alteracoes do separador Contratos. Sem o ecra, esta migration so
-- corrige o que o trigger grava: nenhum ecra o le hoje.
--
-- Depende de 20261210300000 (regime_contratual): o trigger regista essa coluna.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. hr_vinculos_registar_alteracao() (versao anterior: 20261130180000) tinha a
--    lista de campos desactualizada: incluia horas_semanais (coluna que ja nao
--    existe, renomeada para horas_periodo em 20261120190000, por isso nunca
--    registava nada) e deixava de fora horas_periodo, categoria_profissional,
--    renovavel, isencao_horario, formacao_inicio, formacao_fim e regime_contratual.
--    A lista passa a ter TODOS os campos de negocio de pessoas_vinculos (25).
--
--    Salto de horas: hr.skip_horas_auditoria (ligada a volta do UPDATE de
--    sincronizacao de hr_vinculos_horas_sincronizar) salta horas_frequencia
--    (como antes) E AGORA TAMBEM horas_periodo, porque esse UPDATE escreve as duas.
--    CONSEQUENCIA A SABER: as horas contratadas NAO aparecem neste historico. A
--    coluna e derivada (escrita directa recusada, HR010) e a sincronizacao salta-a;
--    o historico das horas vive em pessoas_vinculos_horas (versoes com motivo e
--    documento) e na auditoria de acessos sensiveis. Estao na lista para que uma
--    escrita que nao venha da sincronizacao nunca passe em silencio.
--
-- 2. Motivo e documento. A tabela tinha as colunas motivo e documento_id mas o
--    trigger nunca as preenchia. Passa a le-las de duas variaveis de sessao
--    LOCAIS a transaccao, que quem altera o contrato por uma RPC define antes do
--    UPDATE:
--        PERFORM set_config('hr.alteracao_motivo', '<texto>', true);
--        PERFORM set_config('hr.alteracao_documento_id', '<uuid>', true);
--    O documento so e gravado se existir em pessoas_documentos e for da MESMA
--    pessoa e organizacao; um uuid invalido ou alheio e ignorado (nunca rebenta o
--    UPDATE). Variavel por definir ou vazia = NULL.
--
--    LIMITE ASSUMIDO: uma alteracao feita por UPDATE directo pelo ecra (o caminho
--    de hoje, PostgREST, uma transaccao por pedido) NAO tem como definir estas
--    variaveis, por isso o motivo fica NULL. Para o ecra preencher o motivo, a
--    gravacao tem de passar por uma RPC que defina as variaveis na mesma
--    transaccao do UPDATE. Isso e uma decisao (nao esta nesta migration).
--
-- 3. rpc_hr_vinculo_historico(p_pessoa_id uuid) -- leitura do historico para o
--    ecra. SECURITY DEFINER. Mesma regra da politica de SELECT da tabela
--    (hr.pessoas.vinculos.view, ou a propria pessoa com hr.pessoas.view.own) e
--    devolve o nome de quem alterou (anew_users.name) e o titulo do documento
--    (so a quem pode ver documentos: hr.pessoas.documentos.view, ou a propria
--    pessoa com hr.pessoas.documentos.view.own). Sem permissao ou pessoa
--    inexistente: SQLSTATE HRV05 (a mesma resposta para as duas, para nao revelar
--    quem existe).
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) O trigger continua AFTER UPDATE (so UPDATE): um contrato criado nao gera
--    linhas, tal como antes. A criacao nao e uma alteracao.
-- b) A migration 20261210300000 corre ANTES e migra as linhas de tempo_parcial
--    com a funcao antiga: essas alteracoes ficam registadas sem motivo.
-- c) Esta migration so se aplica ao branch de RH (uma so organizacao, a nike).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: largar a RPC e repor
-- a funcao de trigger com o corpo de 20261130180000.
--
-- Prerequisitos:
--   20261123050000  pessoas_vinculos_alteracoes e o trigger
--   20261130180000  versao anterior da funcao (GUC hr.skip_horas_auditoria)
--   20261210300000  pessoas_vinculos.regime_contratual
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_vinculos_alteracoes') IS NULL THEN
    RAISE EXCEPTION 'pessoas_vinculos_alteracoes nao existe. Aplicar 20261123050000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_documentos') IS NULL THEN
    RAISE EXCEPTION 'pessoas_documentos nao existe. Aplicar 20261123030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'regime_contratual'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos.regime_contratual nao existe. Aplicar 20261210300000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_registar_alteracao'
       AND tgrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_vinculos_registar_alteracao nao existe em pessoas_vinculos.';
  END IF;

  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe.';
  END IF;

  IF to_regprocedure('public.hr_pessoa_do_utilizador(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. O trigger: lista de campos certa, motivo e documento
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_vinculos_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Todos os campos de negocio de pessoas_vinculos. NENHUM e monetario.
  v_campos text[] := ARRAY[
    'tipo_contrato', 'regime', 'regime_contratual',
    'data_inicio', 'data_fim', 'motivo_termo', 'estado',
    'periodo_experimental_dias', 'periodo_experimental_ate', 'periodo_experimental_origem',
    'entidade_legal_org_id', 'tipo_trabalho', 'tempo_trabalho_pct',
    'dias_uteis', 'politica_feriados',
    'horas_periodo', 'horas_frequencia', 'horas_semanais_maximas', 'horas_anuais_maximas',
    'categoria_funcao', 'categoria_profissional',
    'renovavel', 'isencao_horario', 'formacao_inicio', 'formacao_fim'
  ];
  v_old        jsonb := to_jsonb(OLD);
  v_new        jsonb := to_jsonb(NEW);
  v_campo      text;
  v_criado_por uuid;
  v_motivo     text;
  v_doc_txt    text;
  v_documento  uuid;
BEGIN
  -- Marcar como apagado (soft delete) nao e uma alteracao de negocio.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  -- Motivo e documento de apoio, definidos pela RPC que altera o contrato (locais
  -- a transaccao). Por definir ou vazios = NULL.
  v_motivo  := NULLIF(btrim(coalesce(current_setting('hr.alteracao_motivo', true), '')), '');
  v_doc_txt := NULLIF(btrim(coalesce(current_setting('hr.alteracao_documento_id', true), '')), '');
  IF v_doc_txt IS NOT NULL
     AND v_doc_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT d.id INTO v_documento
      FROM public.pessoas_documentos d
     WHERE d.id = v_doc_txt::uuid
       AND d.pessoa_id = NEW.pessoa_id
       AND d.organization_id = NEW.organization_id;
  END IF;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    -- A sincronizacao das horas (hr_vinculos_horas_sincronizar) escreve
    -- horas_periodo e horas_frequencia com hr.skip_horas_auditoria ligada: copiar
    -- o valor da versao em vigor nao e uma alteracao feita por ninguem.
    IF v_campo IN ('horas_periodo', 'horas_frequencia')
       AND coalesce(current_setting('hr.skip_horas_auditoria', true), 'off') = 'on' THEN
      CONTINUE;
    END IF;

    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_vinculos_alteracoes
        (vinculo_id, pessoa_id, organization_id, campo, valor_antes, valor_depois,
         motivo, documento_id, created_by)
      VALUES
        (NEW.id, NEW.pessoa_id, NEW.organization_id, v_campo, v_old ->> v_campo, v_new ->> v_campo,
         v_motivo, v_documento, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_registar_alteracao() IS
'Escreve uma linha em pessoas_vinculos_alteracoes por CADA campo de negocio que mudou num UPDATE de pessoas_vinculos (25 campos, incluindo regime_contratual, horas_periodo, categoria_profissional, renovavel, isencao_horario e formacao_inicio/fim). Nao regista quando a unica mudanca e marcar deleted_at (soft delete). Salta horas_periodo e horas_frequencia quando hr.skip_horas_auditoria esta ligada (so a sincronizacao das horas a liga): as horas contratadas tem o seu historico em pessoas_vinculos_horas. Preenche motivo e documento_id a partir das variaveis de sessao locais hr.alteracao_motivo e hr.alteracao_documento_id, que so uma RPC pode definir na mesma transaccao do UPDATE (o documento tem de ser da mesma pessoa e organizacao, senao fica NULL). Comparacao via to_jsonb(OLD/NEW) ->> campo, por isso dias_uteis (array) fica na sua representacao JSON. Lista corrigida em 20261210310000 (antes: horas_semanais, coluna inexistente, e sem os campos acrescentados depois).';

COMMENT ON TABLE public.pessoas_vinculos_alteracoes IS
'Historico de alteracoes a pessoas_vinculos e a pessoas.cargo, uma linha por campo alterado, escrito SO por trigger (nunca directamente por authenticated). NUNCA guarda retribuicao -- pessoas_vinculos nao tem nenhuma coluna monetaria; o salario tem o seu proprio historico em pessoas_retribuicoes. data_efeito e a data em que a alteracao ficou registada, nao uma data de vigencia negociada. motivo e documento_id so vem preenchidos quando a alteracao passou por uma RPC que definiu hr.alteracao_motivo e hr.alteracao_documento_id (20261210310000). Para o ecra ler com o nome do autor e o titulo do documento: rpc_hr_vinculo_historico(p_pessoa_id).';

-- O trigger ja existe (20261123050000); so a funcao mudou. Sem novo DROP/CREATE
-- TRIGGER: continua ligado ao mesmo nome, mesma tabela, mesmo evento.

-- ==============================================================================
-- 2. A RPC de leitura para o ecra
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_vinculo_historico(p_pessoa_id uuid)
RETURNS TABLE (
  id               uuid,
  vinculo_id       uuid,
  campo            text,
  valor_antes      text,
  valor_depois     text,
  data_efeito      date,
  motivo           text,
  documento_id     uuid,
  documento_titulo text,
  created_at       timestamptz,
  autor_id         uuid,
  autor_nome       text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_propria   boolean;
  v_pode_ver  boolean;
  v_ver_docs  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessao.' USING ERRCODE = 'HRV05';
  END IF;

  SELECT p.organization_id INTO v_org FROM public.pessoas p WHERE p.id = p_pessoa_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem permissao para ver o historico do contrato.' USING ERRCODE = 'HRV05';
  END IF;

  v_propria := public.hr_pessoa_do_utilizador(v_uid, v_org) IS NOT DISTINCT FROM p_pessoa_id;

  v_pode_ver :=
    public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', v_org)
    OR (public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view.own', v_org) AND v_propria);
  IF NOT v_pode_ver THEN
    RAISE EXCEPTION 'Sem permissao para ver o historico do contrato.' USING ERRCODE = 'HRV05';
  END IF;

  v_ver_docs :=
    public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.view', v_org)
    OR (public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.view.own', v_org) AND v_propria);

  RETURN QUERY
  SELECT a.id,
         a.vinculo_id,
         a.campo,
         a.valor_antes,
         a.valor_depois,
         a.data_efeito,
         a.motivo,
         CASE WHEN v_ver_docs THEN a.documento_id END,
         CASE WHEN v_ver_docs THEN d.titulo END,
         a.created_at,
         a.created_by,
         u.name::text
    FROM public.pessoas_vinculos_alteracoes a
    LEFT JOIN public.anew_users u ON u.id = a.created_by
    LEFT JOIN public.pessoas_documentos d ON d.id = a.documento_id
   WHERE a.pessoa_id = p_pessoa_id
     AND a.organization_id = v_org
   ORDER BY a.created_at DESC, a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_historico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_historico(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_historico(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_historico(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_vinculo_historico(uuid) IS
'Historico de alteracoes do contrato de uma pessoa, do mais recente para o mais antigo (uma linha por campo alterado; inclui as alteracoes de cargo, com vinculo_id NULL). Colunas: id, vinculo_id, campo, valor_antes, valor_depois, data_efeito, motivo, documento_id, documento_titulo, created_at, autor_id, autor_nome. Regra de acesso igual a politica de SELECT da tabela: hr.pessoas.vinculos.view na organizacao da pessoa, ou a propria pessoa com hr.pessoas.view.own. documento_id e documento_titulo so vem a quem pode ver documentos (hr.pessoas.documentos.view, ou a propria pessoa com hr.pessoas.documentos.view.own). Sem sessao, sem permissao ou pessoa inexistente: SQLSTATE HRV05 (a mesma resposta para as tres). SECURITY DEFINER porque o nome do autor esta em anew_users. Desde 20261210310000.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_def    text;
  v_campo  text;
  v_campos text[] := ARRAY[
    'tipo_contrato', 'regime', 'regime_contratual',
    'data_inicio', 'data_fim', 'motivo_termo', 'estado',
    'periodo_experimental_dias', 'periodo_experimental_ate', 'periodo_experimental_origem',
    'entidade_legal_org_id', 'tipo_trabalho', 'tempo_trabalho_pct',
    'dias_uteis', 'politica_feriados',
    'horas_periodo', 'horas_frequencia', 'horas_semanais_maximas', 'horas_anuais_maximas',
    'categoria_funcao', 'categoria_profissional',
    'renovavel', 'isencao_horario', 'formacao_inicio', 'formacao_fim'
  ];
BEGIN
  v_def := pg_get_functiondef('public.hr_vinculos_registar_alteracao()'::regprocedure);

  -- 1. Cada campo da lista existe como coluna e esta na funcao instalada.
  FOREACH v_campo IN ARRAY v_campos LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = v_campo
    ) THEN
      RAISE EXCEPTION 'O campo % da lista do historico nao e coluna de pessoas_vinculos.', v_campo;
    END IF;
    IF position('''' || v_campo || '''' IN v_def) = 0 THEN
      RAISE EXCEPTION 'A funcao instalada nao regista o campo %.', v_campo;
    END IF;
  END LOOP;

  -- 2. A coluna que ja nao existe saiu da lista (o par aspas-virgula distingue-a
  --    de horas_semanais_maximas).
  IF position('''horas_semanais'',' IN v_def) <> 0 THEN
    RAISE EXCEPTION 'A funcao instalada ainda lista horas_semanais, que ja nao e coluna.';
  END IF;

  -- 3. Motivo, documento e salto das horas presentes.
  IF position('hr.alteracao_motivo' IN v_def) = 0 OR position('hr.alteracao_documento_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'A funcao instalada nao le hr.alteracao_motivo e hr.alteracao_documento_id.';
  END IF;
  IF position('hr.skip_horas_auditoria' IN v_def) = 0 THEN
    RAISE EXCEPTION 'A funcao instalada perdeu o salto hr.skip_horas_auditoria.';
  END IF;

  -- 4. O trigger continua ligado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_registar_alteracao'
       AND tgrelid = to_regclass('public.pessoas_vinculos')
       AND tgfoid = 'public.hr_vinculos_registar_alteracao()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_vinculos_registar_alteracao deixou de apontar para hr_vinculos_registar_alteracao().';
  END IF;

  -- 5. A RPC: SECURITY DEFINER, search_path fixo, sem anon, com authenticated.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.rpc_hr_vinculo_historico(uuid)'::regprocedure
       AND p.prosecdef
       AND p.proconfig IS NOT NULL
       AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_vinculo_historico devia ser SECURITY DEFINER com search_path fixo.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_vinculo_historico(uuid)', 'EXECUTE')
     OR has_function_privilege('public', 'public.rpc_hr_vinculo_historico(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ou PUBLIC conseguem executar rpc_hr_vinculo_historico.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_vinculo_historico(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated devia poder executar rpc_hr_vinculo_historico.';
  END IF;

  RAISE NOTICE 'OK: historico com 25 campos (sem horas_semanais), motivo e documento por variaveis locais, e rpc_hr_vinculo_historico protegida.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_pessoa    uuid;
  v_vinculo   uuid;
  v_uid       uuid;
  v_n         integer;
  v_motivo    text;
  v_doc       uuid;
  v_sqlstate  text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo do historico foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210310000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210310000 -- apagar', v_cargo, current_date)
    RETURNING id INTO v_pessoa;

    INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
    VALUES (v_pessoa, v_org_nike, 'sem_termo', current_date, 'activo')
    RETURNING id INTO v_vinculo;

    -- 1. Um campo que ficava de fora (categoria_profissional) fica registado, sem motivo.
    UPDATE public.pessoas_vinculos SET categoria_profissional = 'Categoria de teste' WHERE id = v_vinculo;
    SELECT count(*) INTO v_n
      FROM public.pessoas_vinculos_alteracoes
     WHERE vinculo_id = v_vinculo AND campo = 'categoria_profissional'
       AND valor_antes IS NULL AND valor_depois = 'Categoria de teste' AND motivo IS NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'A alteracao de categoria_profissional devia ficar registada uma vez, sem motivo; ha % linha(s).', v_n
        USING ERRCODE = 'HR963';
    END IF;

    -- 2. O regime contratual fica registado.
    UPDATE public.pessoas_vinculos SET regime_contratual = 'coletivo' WHERE id = v_vinculo;
    SELECT count(*) INTO v_n
      FROM public.pessoas_vinculos_alteracoes
     WHERE vinculo_id = v_vinculo AND campo = 'regime_contratual'
       AND valor_antes = 'individual' AND valor_depois = 'coletivo';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'A alteracao de regime_contratual devia ficar registada uma vez; ha % linha(s).', v_n
        USING ERRCODE = 'HR963';
    END IF;

    -- 3. O motivo definido na transaccao fica na linha; um documento alheio e ignorado.
    PERFORM set_config('hr.alteracao_motivo', 'Motivo de teste 20261210310000', true);
    PERFORM set_config('hr.alteracao_documento_id', gen_random_uuid()::text, true);
    UPDATE public.pessoas_vinculos SET renovavel = true WHERE id = v_vinculo;
    PERFORM set_config('hr.alteracao_motivo', '', true);
    PERFORM set_config('hr.alteracao_documento_id', '', true);

    SELECT a.motivo, a.documento_id INTO v_motivo, v_doc
      FROM public.pessoas_vinculos_alteracoes a
     WHERE a.vinculo_id = v_vinculo AND a.campo = 'renovavel';
    IF v_motivo IS DISTINCT FROM 'Motivo de teste 20261210310000' THEN
      RAISE EXCEPTION 'O motivo da transaccao devia ficar na linha; ficou %.', coalesce(v_motivo, '(nulo)')
        USING ERRCODE = 'HR963';
    END IF;
    IF v_doc IS NOT NULL THEN
      RAISE EXCEPTION 'Um documento que nao existe devia ser ignorado, e ficou gravado.'
        USING ERRCODE = 'HR963';
    END IF;

    -- 4. Sem as variaveis, a alteracao seguinte volta a ficar sem motivo.
    UPDATE public.pessoas_vinculos SET isencao_horario = true WHERE id = v_vinculo;
    SELECT count(*) INTO v_n
      FROM public.pessoas_vinculos_alteracoes
     WHERE vinculo_id = v_vinculo AND campo = 'isencao_horario' AND motivo IS NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Sem variaveis, isencao_horario devia ficar sem motivo; ha % linha(s) sem motivo.', v_n
        USING ERRCODE = 'HR963';
    END IF;

    -- 5. A RPC recusa quem nao tem permissao (utilizador fabricado, sem ficha nem papel).
    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    v_sqlstate := NULL;
    BEGIN
      PERFORM 1 FROM public.rpc_hr_vinculo_historico(v_pessoa);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'A RPC do historico devia recusar com HRV05 quem nao tem permissao; foi %.', coalesce(v_sqlstate, '(nada)')
        USING ERRCODE = 'HR963';
    END IF;

    -- 6. A RPC devolve as linhas a quem tem hr.pessoas.vinculos.view na nike (se
    --    houver um utilizador assim neste ambiente; senao salta-se este passo).
    SELECT au.auth_user_id INTO v_uid
      FROM public.anew_users au
     WHERE au.auth_user_id IS NOT NULL
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.vinculos.view', v_org_nike)
     LIMIT 1;

    IF v_uid IS NULL THEN
      RAISE NOTICE 'Sem utilizador com hr.pessoas.vinculos.view na nike: o passo de leitura da RPC foi saltado.';
    ELSE
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
      IF auth.uid() IS NOT DISTINCT FROM v_uid THEN
        SELECT count(*) INTO v_n FROM public.rpc_hr_vinculo_historico(v_pessoa) h WHERE h.vinculo_id = v_vinculo;
        IF v_n < 4 THEN
          RAISE EXCEPTION 'A RPC do historico devia devolver pelo menos 4 linhas; devolveu %.', v_n
            USING ERRCODE = 'HR963';
        END IF;
      ELSE
        RAISE NOTICE 'auth.uid() nao le a variavel de teste neste ambiente: o passo de leitura da RPC foi saltado.';
      END IF;
    END IF;

    RAISE EXCEPTION 'teste_hr_vinculos_historico_20261210310000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao (linhas e variaveis locais).
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo do historico falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): categoria_profissional, regime_contratual e renovavel registados; motivo da transaccao gravado e documento alheio ignorado; RPC recusa sem permissao com HRV05. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho. Aplica-se depois de 20261210300000
--    e com o ecra do historico no mesmo commit.
--
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Nunca migration repair.
--
-- 3. Correr os testes ANTES do push, contra o remoto ainda por migrar: depois de
--    aplicada, NAO se volta atras para demonstrar o vermelho.
-- ==============================================================================
