-- ==============================================================================
-- 20270114700000_hr_pessoa_sem_cargo_na_admissao (base RH)
--
-- Na ADMISSAO a pessoa pode ser criada SEM cargo. O cargo (e com ele a
-- retribuicao) atribui-se depois, se a pessoa passar.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO MESMO ENVIO: o assistente de nova pessoa do RH
-- exemplo (src/components/rh-exemplo/lib/novaPessoa.ts, novaPessoaCargo.ts, e
-- as copias em src/lib/hr/) deixa de exigir cargo. Ordem: esta migration
-- PRIMEIRO, o codigo DEPOIS. O codigo antigo continua a funcionar com a base
-- nova (continua a mandar cargo, que continua a ser aceite); o codigo novo com
-- a base antiga NAO funciona (uma ficha sem cargo leva HRC08).
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261210110000 decidiu "TODA a ficha nova tem cargo": o trigger
-- trg_pessoas_cargo_guarda recusa um INSERT em pessoas sem cargo_id (HRC08).
-- Mas na admissao ainda nao se sabe se a pessoa fica: obrigar a escolher um
-- cargo -- e portanto a ligar a pessoa a empresa e a um salario -- antes de ela
-- passar e inventar um dado.
--
--
-- -- A DECISAO (do utilizador, 11/11) ------------------------------------------
--
-- Na admissao nao e obrigatorio cargo, nem nada que ligue a pessoa a empresa.
-- REVERTE a regra "TODA a ficha nova tem cargo" de 20261210110000.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- So hr_pessoas_cargo_guarda(), no ramo INSERT:
--   - cargo_id NULL passa (deixa de dar HRC08);
--   - cargo_id preenchido: TODAS as verificacoes de antes ficam -- mesma
--     organizacao e nao apagado (HRC02), activo (HRC09).
-- O ramo UPDATE fica IGUAL, letra a letra:
--   - reenviar o mesmo cargo_id passa;
--   - voltar um cargo ja preenchido a NULL e recusado (HRC08);
--   - mudar o valor sem a GUC hr.sync_cargo_id e recusado (HRC10) -- incluindo
--     de NULL para um cargo. O caminho certo para dar cargo a uma ficha sem
--     cargo e rpc_hr_pessoa_mudar_cargo, que ja trata "sem linha aberta" (lido
--     vivo a 11/11: aceita p_desde ate hoje e nunca antes da admissao, abre a
--     primeira linha de pessoas_cargos, e o trigger de sincronizacao escreve
--     pessoas.cargo_id com a GUC ligada).
--
-- LIMITE da rpc_hr_pessoa_mudar_cargo numa ficha SEM cargo (lido vivo a 11/11;
-- documentado, a RPC NAO muda -- decisao do coordenador):
--   - p_desde tem de estar entre a data de admissao e hoje;
--   - com data_admissao NULL passa (entre hoje - 10 anos e hoje);
--   - com data_admissao FUTURA nao se atribui cargo ate essa data chegar
--     (HRC04: "o cargo so pode comecar ate hoje" ou "nao pode comecar antes da
--     data de admissao").
--   Por isso o assistente so pede o cargo quando a data de inicio e hoje ou
--   ja passou.
--
-- O QUE NAO MUDA (lido vivo a 11/11):
--   - hr_pessoas_cargo_primeira_linha() (AFTER INSERT) ja comeca por
--     "IF NEW.cargo_id IS NULL THEN RETURN NEW" -- sem cargo nao abre linha em
--     pessoas_cargos e nao falha. Nao se reescreve; a guarda abaixo confirma
--     que continua a ser essa versao (md5).
--   - A pendencia "cargo" de hr_admissao_pendencias continua a contar (lido na
--     funcao SQL: p.cargo_id NULL e pendencia quando a organizacao tem o campo
--     "cargo" como obrigatorio; na nike tem, posicao 'ficha', lido em
--     hr_admissao_campos_obrigatorios_org). A Edge criar-acesso-pessoa usa
--     essa pendencia (lido em index.ts e fichaCompleta.ts: chama
--     hr_admissao_pendencias como service_role e qualquer linha da 409
--     ficha_incompleta na PRIMEIRA criacao de acesso). Uma ficha sem cargo
--     fica assim sem acesso ate ter cargo -- o comportamento querido.
--   - Nenhum outro trigger, CHECK ou FK de pessoas depende de cargo_id no
--     INSERT: pessoas_cargo_fkey e (cargo_id, organization_id) com MATCH
--     SIMPLE (NULL passa); datas_derivadas, local_id_e_derivado,
--     fotografia_valida e registar_alteracao_dados nao leem cargo_id.
--   - ACL da funcao: CREATE OR REPLACE mantem-no; o bloco conferir confirma
--     que ficou igual ao de antes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: repor o corpo de
-- hr_pessoas_cargo_guarda() de 20261210110000 (linhas 464-513). Fichas criadas
-- sem cargo entretanto ficam como as fichas antigas sem cargo: editaveis, com a
-- pendencia "cargo", e ganham cargo por rpc_hr_pessoa_mudar_cargo.
--
-- Prerequisitos:
--   20261210110000  pessoas_cargos, hr_pessoas_cargo_guarda, trg_pessoas_cargo_guarda,
--                   hr_pessoas_cargo_primeira_linha, trg_pessoas_cargo_primeira_linha
--   20261210120000  rpc_hr_pessoa_mudar_cargo (caminho para dar o cargo depois)
-- ==============================================================================

SET lock_timeout = '5s';

BEGIN;

-- ---- Guardas ---------------------------------------------------------------
-- md5(pg_get_functiondef(...)) lidos no remoto RH a 11/11:
--   hr_pessoas_cargo_guarda()         bc85bc9b4f2f08c15708c0c5d6e8c1b8
--   hr_pessoas_cargo_primeira_linha() 79aaf1c8d51a1952407a9289b0bf1eca
-- Se a guarda mudou entretanto (e nao e ja esta versao), para em vez de a
-- sobrescrever as cegas. Se a primeira linha mudou, para: a premissa "sem cargo
-- nao faz nada" deixa de estar confirmada.
DO $guardas$
DECLARE
  v_guarda    regprocedure := to_regprocedure('public.hr_pessoas_cargo_guarda()');
  v_primeira  regprocedure := to_regprocedure('public.hr_pessoas_cargo_primeira_linha()');
  v_mudar     regprocedure := to_regprocedure('public.rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text)');
  v_md5       text;
  v_def       text;
BEGIN
  IF v_guarda IS NULL OR v_primeira IS NULL THEN
    RAISE EXCEPTION 'hr_pessoas_cargo_guarda() ou hr_pessoas_cargo_primeira_linha() nao existem. Aplicar 20261210110000 primeiro.';
  END IF;
  IF v_mudar IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text) nao existe: sem ela uma ficha sem cargo nao ganha cargo. Aplicar 20261210120000 primeiro.';
  END IF;

  v_md5 := md5(pg_get_functiondef(v_guarda::oid));
  IF v_md5 <> 'bc85bc9b4f2f08c15708c0c5d6e8c1b8' THEN
    IF position('admissao_sem_cargo' IN pg_get_functiondef(v_guarda::oid)) > 0 THEN
      RAISE NOTICE 'hr_pessoas_cargo_guarda() ja e a versao desta migration; reaplica-se igual.';
    ELSE
      RAISE EXCEPTION 'hr_pessoas_cargo_guarda() mudou desde 11/11 (md5 % em vez de bc85bc9b4f2f08c15708c0c5d6e8c1b8). Ler a versao viva antes de a substituir.',
        v_md5;
    END IF;
  END IF;

  v_md5 := md5(pg_get_functiondef(v_primeira::oid));
  IF v_md5 <> '79aaf1c8d51a1952407a9289b0bf1eca' THEN
    RAISE EXCEPTION 'hr_pessoas_cargo_primeira_linha() mudou desde 11/11 (md5 % em vez de 79aaf1c8d51a1952407a9289b0bf1eca). Confirmar que continua a sair sem fazer nada quando cargo_id e NULL.',
      v_md5;
  END IF;

  SELECT pg_get_triggerdef(t.oid)::text INTO v_def
    FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.pessoas') AND t.tgname::text = 'trg_pessoas_cargo_guarda';
  IF v_def IS NULL
     OR v_def NOT LIKE '%BEFORE INSERT OR UPDATE OF cargo_id ON public.pessoas FOR EACH ROW EXECUTE FUNCTION hr_pessoas_cargo_guarda()%' THEN
    RAISE EXCEPTION 'trg_pessoas_cargo_guarda nao esta como esperado: %', coalesce(v_def, 'em falta');
  END IF;

  SELECT pg_get_triggerdef(t.oid)::text INTO v_def
    FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.pessoas') AND t.tgname::text = 'trg_pessoas_cargo_primeira_linha';
  IF v_def IS NULL
     OR v_def NOT LIKE '%AFTER INSERT ON public.pessoas FOR EACH ROW EXECUTE FUNCTION hr_pessoas_cargo_primeira_linha()%' THEN
    RAISE EXCEPTION 'trg_pessoas_cargo_primeira_linha nao esta como esperado: %', coalesce(v_def, 'em falta');
  END IF;

  -- ACL de antes, para o conferir comparar depois do CREATE OR REPLACE.
  PERFORM set_config('olyvia.acl_cargo_guarda',
                     coalesce((SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_guarda::oid), 'NULL'),
                     true);
END;
$guardas$;

-- ==============================================================================
-- hr_pessoas_cargo_guarda: na admissao a ficha pode nascer sem cargo.
-- BEFORE INSERT OR UPDATE OF cargo_id em pessoas. SECURITY DEFINER como antes
-- (quem cria fichas pode nao ver hr_cargos pela RLS: falso "cargo apagado").
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoas_cargo_guarda()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_activo  boolean;
  v_apagado timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- admissao_sem_cargo: na admissao a pessoa pode ainda nao ter cargo; o
    -- cargo da-se depois por rpc_hr_pessoa_mudar_cargo (20270114700000).
    IF NEW.cargo_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT c.activo, c.deleted_at INTO v_activo, v_apagado
      FROM public.hr_cargos c
     WHERE c.id = NEW.cargo_id AND c.organization_id = NEW.organization_id;

    IF NOT FOUND OR v_apagado IS NOT NULL THEN
      RAISE EXCEPTION 'cargo_nao_encontrado: o cargo escolhido nao existe nesta organizacao ou foi apagado.'
        USING ERRCODE = 'HRC02';
    END IF;

    IF v_activo IS NOT TRUE THEN
      RAISE EXCEPTION 'cargo_desactivado: o cargo escolhido esta desactivado. Escolher um cargo activo.'
        USING ERRCODE = 'HRC09';
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE OF cargo_id. O ecra antigo reenvia sempre cargo_id: inalterado passa.
  IF NEW.cargo_id IS NOT DISTINCT FROM OLD.cargo_id THEN
    RETURN NEW;
  END IF;

  IF NEW.cargo_id IS NULL THEN
    RAISE EXCEPTION 'cargo_obrigatorio: uma pessoa que ja tem cargo nao pode voltar a ficar sem cargo. Para mudar de cargo, escolher outro cargo.'
      USING ERRCODE = 'HRC08';
  END IF;

  IF coalesce(current_setting('hr.sync_cargo_id', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'cargo_so_por_rpc: pessoas.cargo_id passou a ser derivado do historico de cargos (pessoas_cargos). Nao se edita directamente -- usar a funcao de mudar o cargo da pessoa.'
      USING ERRCODE = 'HRC10';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_cargo_guarda() IS
'BEFORE INSERT OR UPDATE OF cargo_id em pessoas. INSERT: sem cargo passa (admissao: o cargo da-se depois por rpc_hr_pessoa_mudar_cargo, 20270114700000); com cargo, tem de ser do catalogo da mesma organizacao, nao apagado (HRC02) e activo (HRC09). UPDATE: cargo_id inalterado passa; passar a NULL e HRC08; mudar o valor (tambem de NULL para um cargo) sem a GUC hr.sync_cargo_id (so o trigger de pessoas_cargos a liga) e HRC10. Nao ha NOT NULL nem CHECK de proposito.';

-- ==============================================================================
-- Conferir (so catalogo; os casos de comportamento estao em
-- supabase/tests/hr_pessoa_sem_cargo_na_admissao.test.sql, a correr depois).
-- ==============================================================================
DO $conferir$
DECLARE
  v_oid     oid := to_regprocedure('public.hr_pessoas_cargo_guarda()')::oid;
  v_def     text;
  v_acl     text;
  v_secdef  boolean;
  v_config  text;
BEGIN
  v_def := pg_get_functiondef(v_oid);

  IF position('admissao_sem_cargo' IN v_def) = 0
     OR position('toda a pessoa nova tem de ter um cargo' IN v_def) > 0 THEN
    RAISE EXCEPTION 'hr_pessoas_cargo_guarda() nao ficou com a versao desta migration.';
  END IF;

  -- As quatro recusas continuam no corpo.
  IF position('HRC02' IN v_def) = 0 OR position('HRC09' IN v_def) = 0
     OR position('HRC08' IN v_def) = 0 OR position('HRC10' IN v_def) = 0 THEN
    RAISE EXCEPTION 'hr_pessoas_cargo_guarda() perdeu uma das recusas HRC02/HRC09/HRC08/HRC10.';
  END IF;

  SELECT p.proacl::text, p.prosecdef, array_to_string(p.proconfig, ',')::text
    INTO v_acl, v_secdef, v_config
    FROM pg_proc p WHERE p.oid = v_oid;

  IF coalesce(v_acl, 'NULL') IS DISTINCT FROM current_setting('olyvia.acl_cargo_guarda', true) THEN
    RAISE EXCEPTION 'O ACL de hr_pessoas_cargo_guarda() mudou: era %, ficou %.',
      current_setting('olyvia.acl_cargo_guarda', true), coalesce(v_acl, 'NULL');
  END IF;
  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'hr_pessoas_cargo_guarda() deixou de ser SECURITY DEFINER.';
  END IF;
  IF coalesce(v_config, '') NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'hr_pessoas_cargo_guarda() ficou sem o search_path fixo (proconfig: %).', coalesce(v_config, 'NULL');
  END IF;

  -- A primeira linha continua a mesma (nao se tocou).
  IF md5(pg_get_functiondef(to_regprocedure('public.hr_pessoas_cargo_primeira_linha()')::oid))
     <> '79aaf1c8d51a1952407a9289b0bf1eca' THEN
    RAISE EXCEPTION 'hr_pessoas_cargo_primeira_linha() mudou durante a migration.';
  END IF;

  RAISE NOTICE 'OK: hr_pessoas_cargo_guarda() aceita fichas sem cargo no INSERT; HRC02/HRC09 com cargo, HRC08/HRC10 no UPDATE mantidos; ACL, SECURITY DEFINER e search_path iguais; primeira linha intacta.';
END;
$conferir$;

COMMIT;

RESET lock_timeout;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes: so esta pode
--    estar pendente.
-- 2. Base RH: so tem a organizacao nike. Nada disto chega a Mudelar (outra base).
-- 3. Depois do push: correr supabase/tests/hr_pessoa_sem_cargo_na_admissao.test.sql
--    (BEGIN ... ROLLBACK) e so depois publicar o codigo do assistente.
-- ==============================================================================
