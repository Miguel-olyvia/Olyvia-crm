-- ==============================================================================
-- Anexos nas justificacoes (ENTREGA E1 do plano "anexos reais nas
-- justificacoes"): os nomes dos anexos de uma justificacao do dia deixam de
-- sair a quem nao pode ler o texto dela. CORRECCAO (achados 1 e 2 do plano),
-- nao decisao de produto.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth):
-- pendente so este (e 20270111610000, que depende dele), acima de
-- 20270111500000; (2) correr a prova na nike em transaccao desfeita ANTES do
-- push (o conferir abaixo e essa prova); (3) revisao ecc:database-reviewer e
-- ecc:security-reviewer.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 1. rpc_hr_justificacao_dia_listar (corpo de 20261231800000; nenhuma
--    migration posterior o reescreveu) esconde o motivo de uma consulta
--    medica a quem nao e a propria pessoa, mas devolve anexos_nomes na mesma.
--    O nome de um ficheiro ("atestado-psiquiatria.pdf") e dado de saude.
-- 2. A coluna anexos_nomes tem GRANT SELECT por coluna a authenticated
--    (20261231800000, ~:496-500): quem tem justificacao.edit ou .view le-a
--    directamente pelo PostgREST, sem passar pela RPC.
--
-- No remoto (lido a 9/11): 0 justificacoes do dia com anexos_nomes. A fuga e
-- teorica; fecha-se antes de os anexos reais (E2) existirem.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- a) rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean): CREATE
--    OR REPLACE na MESMA assinatura e no MESMO RETURNS TABLE, por troca de
--    texto no corpo do remoto (pg_get_functiondef: mantem dono, privilegios,
--    SECURITY DEFINER, search_path e comentario). O corpo do remoto tem de
--    ser o de 20261231800000 letra a letra (guarda md5, sem \r dos dois
--    lados). Troca UMA coisa: a coluna anexos_nomes passa a vir '{}' quando o
--    motivo vem escondido (consulta medica e quem pede nao e a propria
--    pessoa): exactamente a mesma condicao do motivo.
-- b) REVOKE SELECT (anexos_nomes) ON pessoas_justificacoes_dia FROM
--    authenticated. A tabela nao tem GRANT de tabela a authenticated (so por
--    coluna), por isso o REVOKE por coluna fecha mesmo (guarda G2).
--
--
-- -- PRECISA DE CODIGO NOVO? ---------------------------------------------------
--
-- Nao parte nada: o ecra (rh-exemplo JustificacaoDiaRh.tsx:167) le
-- anexos_nomes so pela RPC e com a lista vazia simplesmente nao mostra a
-- linha "Anexos". Nenhum cliente pode ler a coluna directamente (procurar
-- "anexos_nomes" em src/ antes do push). Para dizer "N anexos" numa consulta
-- medica o ecra precisa da contagem, que vem de
-- rpc_hr_justificacao_anexos_listar (E2): com '{}' nao ha N.
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Quem nao e a propria pessoa deixa de ver os nomes (simulados) dos anexos de
-- uma consulta medica. Mudelar nao esta nesta base.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: repor o
-- corpo de 20261231800000 (tirar o CASE de anexos_nomes) e GRANT SELECT
-- (anexos_nomes) a authenticated. Reverter e reabrir a fuga.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'justificacao_dia_nomes_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- O corpo de rpc_hr_justificacao_dia_listar em vigor (20261231800000) -----
CREATE TEMP TABLE tmp_hja1_listar_antigo (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_hja1_listar_antigo (corpo) VALUES ($old$
#variable_conflict use_column
DECLARE
  v_auth   uuid := auth.uid();
  v_rh     boolean;
  v_minha  uuid;
  v_pessoa uuid := _pessoa_id;
  v_pend   boolean := coalesce(_so_pendentes, false);
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_dados_em_falta: a organizacao e obrigatoria.' USING ERRCODE = '23502';
  END IF;

  v_rh := public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', _organization_id)
       OR public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.view', _organization_id);
  v_minha := public.hr_pessoa_do_utilizador(v_auth, _organization_id);

  -- Sem permissao de RH: so as da propria pessoa.
  IF NOT v_rh THEN
    IF v_minha IS NULL
       OR NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.view.own', _organization_id) THEN
      RAISE EXCEPTION 'justificacao_dia_sem_permissao: sem permissao para ver justificacoes do dia nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
    IF v_pessoa IS NOT NULL AND v_pessoa <> v_minha THEN
      RAISE EXCEPTION 'justificacao_dia_sem_permissao: so pode ver as suas justificacoes.' USING ERRCODE = '42501';
    END IF;
    v_pessoa := v_minha;
  END IF;

  IF _de IS NOT NULL AND _ate IS NOT NULL AND _ate < _de THEN
    RAISE EXCEPTION 'justificacao_dia_intervalo_invalido: o fim do intervalo e anterior ao inicio.' USING ERRCODE = '22023';
  END IF;

  -- Nada de varrer a organizacao inteira: a fila (so pendentes), uma pessoa,
  -- ou um intervalo de ate um ano.
  IF v_pessoa IS NULL AND NOT v_pend
     AND (_de IS NULL OR _ate IS NULL OR _ate - _de > 366) THEN
    RAISE EXCEPTION
      'justificacao_dia_intervalo_obrigatorio: para toda a organizacao, pedir so pendentes ou um intervalo de ate 366 dias.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT j.id,
         j.pessoa_id,
         p.nome_completo,
         j.data,
         j.tipo,
         j.de_atraso,
         j.periodo_inicio,
         j.periodo_fim,
         j.minutos,
         j.hora_real,
         CASE WHEN j.tipo <> 'consulta_medica' OR j.pessoa_id = v_minha THEN j.motivo END,
         (j.tipo = 'consulta_medica' AND j.pessoa_id IS DISTINCT FROM v_minha),
         j.anexos_nomes,
         j.estado,
         j.created_at,
         j.decidida_por,
         u.name,
         j.decidida_em,
         j.motivo_recusa,
         j.falta_id,
         j.mes_fechado_na_decisao,
         j.sem_efeito_em
    FROM public.pessoas_justificacoes_dia j
    JOIN public.pessoas p
      ON p.id = j.pessoa_id AND p.organization_id = j.organization_id
    LEFT JOIN public.anew_users u
      ON u.id = j.decidida_por
   WHERE j.organization_id = _organization_id
     AND (v_pessoa IS NULL OR j.pessoa_id = v_pessoa)
     AND (_de IS NULL OR j.data >= _de)
     AND (_ate IS NULL OR j.data <= _ate)
     AND (NOT v_pend OR j.estado = 'pendente')
   ORDER BY j.data DESC, j.created_at DESC;
END;
$old$);

-- ---- A troca: ancora (aparece UMA vez no corpo) e substituto -----------------
CREATE TEMP TABLE tmp_hja1_troca (ancora text NOT NULL, novo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_hja1_troca (ancora, novo) VALUES (
  'j.anexos_nomes,',
  'CASE WHEN j.tipo <> ''consulta_medica'' OR j.pessoa_id = v_minha THEN j.anexos_nomes ELSE ''{}''::text[] END,'
);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  k_listar constant text := 'public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)';
  k_tab    constant text := 'public.pessoas_justificacoes_dia';
  v_src    text;
  v_antigo text;
  v_def    text;
  v_ancora text;
  v_n      integer;
  v_cod    text;
BEGIN
  -- G0. Quem aplica passa a RLS (a prova insere e le linhas da nike).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS.', current_user::text;
  END IF;

  -- G1. A funcao existe com UMA so assinatura (a lida), SECURITY DEFINER, com
  --     o search_path de 20261231800000, e o corpo e o de 20261231800000.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_justificacao_dia_listar';
  IF v_n <> 1 OR to_regprocedure(k_listar) IS NULL THEN
    RAISE EXCEPTION 'G1: rpc_hr_justificacao_dia_listar devia existir so como (uuid, uuid, date, date, boolean); ha % assinatura(s).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(k_listar)::oid AND p.prosecdef
                    AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=public, pg_temp%') THEN
    RAISE EXCEPTION 'G1: rpc_hr_justificacao_dia_listar deixou de ser SECURITY DEFINER com search_path public, pg_temp. Reler.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(k_listar)::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_hja1_listar_antigo t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G1: o corpo de rpc_hr_justificacao_dia_listar no remoto (md5 sem \r %) nao e o de 20261231800000 transcrito aqui (md5 %). Reler a versao mais recente antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;

  -- G2. A tabela: anexos_nomes existe, authenticated le-a por COLUNA e nao tem
  --     nenhum privilegio de TABELA (senao o REVOKE por coluna nao fecha nada).
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass(k_tab) AND a.attname::text = 'anexos_nomes' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'G2: pessoas_justificacoes_dia.anexos_nomes nao existe.';
  END IF;
  IF has_table_privilege('authenticated', k_tab, 'SELECT') THEN
    RAISE EXCEPTION 'G2: authenticated tem SELECT de TABELA em pessoas_justificacoes_dia: o REVOKE por coluna nao fecharia nada. Reler os GRANTs.';
  END IF;
  IF NOT has_column_privilege('authenticated', k_tab, 'anexos_nomes', 'SELECT') THEN
    RAISE NOTICE 'G2: authenticated ja nao le anexos_nomes; o REVOKE desta migration nao muda nada.';
  END IF;

  -- G3. A ancora aparece exactamente uma vez no corpo e na definicao inteira.
  SELECT t.ancora INTO v_ancora FROM tmp_hja1_troca t;
  v_n := (length(v_src) - length(replace(v_src, v_ancora, ''))) / length(v_ancora);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G3: a ancora "%" aparece % vez(es) no corpo; esperava-se 1.', v_ancora, v_n;
  END IF;
  v_def := pg_get_functiondef(to_regprocedure(k_listar)::oid);
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G3: a ancora "%" aparece % vez(es) na definicao; esperava-se 1.', v_ancora, v_n;
  END IF;

  -- G4. Permissoes usadas na prova.
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.justificacao.edit', 'hr.assiduidade.justificacao.view'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G4: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;
END;
$guardas$;

-- O antes, para o conferir provar que so mudou a troca.
CREATE TEMP TABLE tmp_hja1_antes ON COMMIT DROP AS
SELECT p.prosrc, p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce(p.proacl::text, '') AS proacl
  FROM pg_proc p
 WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)')::oid;


-- ==============================================================================
-- 1. A troca no corpo da listagem
-- ==============================================================================
DO $troca$
DECLARE
  v_def text;
  v_t   record;
BEGIN
  SELECT * INTO v_t FROM tmp_hja1_troca;
  v_def := pg_get_functiondef(to_regprocedure('public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)')::oid);
  EXECUTE replace(v_def, v_t.ancora, v_t.novo);
END;
$troca$;

DO $comentario$
BEGIN
  EXECUTE format('COMMENT ON FUNCTION %s IS %L',
    to_regprocedure('public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)')::text,
    coalesce(obj_description(to_regprocedure('public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)')::oid, 'pg_proc'), '')
    || ' Desde 20270111600000: anexos_nomes vem vazio ({}) nas mesmas linhas em que o motivo vem escondido (consulta medica e quem pede nao e a propria pessoa): o nome de um ficheiro tambem e dado de saude. A contagem dos anexos reais vem de rpc_hr_justificacao_anexos_listar.');
END;
$comentario$;


-- ==============================================================================
-- 2. A coluna deixa de se ler directamente
-- ==============================================================================
REVOKE SELECT (anexos_nomes) ON public.pessoas_justificacoes_dia FROM authenticated;

COMMENT ON COLUMN public.pessoas_justificacoes_dia.anexos_nomes IS
'Nomes SIMULADOS de anexos (nenhum ficheiro foi enviado: o envio real e pessoas_justificacoes_anexos, desde 20270111610000). Sem GRANT de leitura a authenticated desde 20270111600000: o nome de um ficheiro de uma consulta medica e dado de saude. Sai so por rpc_hr_justificacao_dia_listar, vazio quando o motivo vem escondido.';


-- ==============================================================================
-- 3. Conferir (estrutura, troca, privilegios, e comportamento na nike, desfeito)
-- ==============================================================================

-- Um perfil de prova na nike: um papel novo (molde: um papel da propria nike)
-- com so estes codigos, atribuido a este utilizador na nike. So existe dentro
-- da prova (desfeito pela sentinela). Funcao temporaria (pg_temp), largada no
-- fim deste ficheiro.
CREATE FUNCTION pg_temp.hja1_perfil(p_org uuid, p_anew_user uuid, p_codigos text[], p_rotulo text)
RETURNS uuid
LANGUAGE plpgsql
AS $perfil$
DECLARE
  v_base jsonb;
  v_role uuid := gen_random_uuid();
  v_tag  text;
  v_n    integer;
BEGIN
  v_tag := replace(v_role::text, '-', '');
  SELECT to_jsonb(r) INTO v_base
    FROM public.anew_roles r
   WHERE r.organization_id = p_org
   ORDER BY ((to_jsonb(r) ->> 'code') IN ('viewer', 'worker')) DESC,
            coalesce((to_jsonb(r) ->> 'is_system')::boolean, false),
            r.id
   LIMIT 1;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'Conferir: a nike nao tem nenhum papel que sirva de molde ao perfil de prova.';
  END IF;

  INSERT INTO public.anew_roles
  SELECT * FROM jsonb_populate_record(NULL::public.anew_roles,
            v_base || jsonb_build_object(
              'id', v_role,
              'code', 'prova_hja1_' || p_rotulo || '_' || v_tag,
              'slug', 'prova_hja1_' || p_rotulo || '_' || v_tag,
              'key', 'prova_hja1_' || p_rotulo || '_' || v_tag,
              'name', 'Prova HJA1 ' || p_rotulo || ' ' || v_tag,
              'nome', 'Prova HJA1 ' || p_rotulo || ' ' || v_tag,
              'description', 'Papel de prova da migracao 20270111600000 (desfeito)',
              'is_system', false, 'is_default', false, 'can_sign_contracts', false,
              'created_by', NULL));

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role, c.codigo FROM unnest(p_codigos) AS c(codigo);

  UPDATE public.anew_memberships m
     SET role_id = v_role
   WHERE m.user_id = p_anew_user AND m.organization_id = p_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: o perfil de prova % devia mudar 1 associacao na nike; mudou %.', p_rotulo, v_n;
  END IF;
  RETURN v_role;
END;
$perfil$;

DO $conferir$
DECLARE
  k_nike    constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_motivo  constant text := 'prova da migracao 20270111600000';
  k_listar  constant text := 'public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)';
  k_tab     constant text := 'public.pessoas_justificacoes_dia';
  v_antes   record;
  v_new     record;
  v_t       record;
  v_esperado text;
  v_dif     text;
  v_st      text;
  v_d       date;
  v_i       integer;
  v_p       uuid;
  v_uid_e   uuid;
  v_anew_e  uuid;
  v_role_e  uuid;
  v_j_med   uuid;
  v_j_tra   uuid;
  v_nomes_med text[];
  v_sens_med  boolean;
  v_motivo_med text;
  v_nomes_tra text[];
  v_n_lidas integer;
BEGIN
  -- 3.1 A troca: corpo novo = corpo antigo com a troca (sem \r); SECURITY
  --     DEFINER, search_path e privilegios iguais; uma so assinatura.
  SELECT * INTO v_antes FROM tmp_hja1_antes;
  SELECT * INTO v_t FROM tmp_hja1_troca;
  v_esperado := replace(replace(v_antes.prosrc, chr(13), ''), v_t.ancora, v_t.novo);
  SELECT p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
         coalesce(p.proacl::text, '') AS proacl
    INTO v_new FROM pg_proc p WHERE p.oid = to_regprocedure(k_listar)::oid;
  IF replace(v_new.prosrc, chr(13), '') IS DISTINCT FROM v_esperado
     OR v_new.prosecdef IS DISTINCT FROM v_antes.prosecdef
     OR v_new.proconfig IS DISTINCT FROM v_antes.proconfig
     OR v_new.proacl IS DISTINCT FROM v_antes.proacl THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_justificacao_dia_listar mudou mais do que a troca (corpo, SECURITY DEFINER, search_path ou privilegios).';
  END IF;
  IF replace(replace(v_new.prosrc, chr(13), ''), v_t.novo, v_t.ancora)
       IS DISTINCT FROM (SELECT replace(a.corpo, chr(13), '') FROM tmp_hja1_listar_antigo a) THEN
    RAISE EXCEPTION 'Conferir: sem a troca, a listagem devia ser o corpo de 20261231800000.';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_justificacao_dia_listar') <> 1 THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_justificacao_dia_listar devia ter uma so assinatura.';
  END IF;
  IF EXISTS (SELECT 1
               FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              WHERE p.oid = to_regprocedure(k_listar)::oid
                AND a.privilege_type::text = 'EXECUTE'
                AND (a.grantee = 0 OR a.grantee::regrole::text = 'anon'))
     OR NOT has_function_privilege('authenticated', k_listar, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: a listagem devia ser executavel por authenticated e nao por PUBLIC nem anon.';
  END IF;

  -- 3.2 Privilegios da tabela: authenticated sem nada de tabela nem de
  --     escrita; motivo e anexos_nomes sem leitura; TODAS as outras colunas
  --     com leitura (a concessao por coluna nao cobre colunas futuras: esta
  --     comparacao falha quando aparecer uma coluna nova sem decisao).
  IF has_table_privilege('authenticated', k_tab, 'SELECT')
     OR has_table_privilege('authenticated', k_tab, 'INSERT')
     OR has_table_privilege('authenticated', k_tab, 'UPDATE')
     OR has_table_privilege('authenticated', k_tab, 'DELETE')
     OR has_table_privilege('authenticated', k_tab, 'TRUNCATE')
     OR has_any_column_privilege('authenticated', k_tab, 'INSERT')
     OR has_any_column_privilege('authenticated', k_tab, 'UPDATE')
     OR has_any_column_privilege('anon', k_tab, 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: authenticated (ou anon) tem privilegio de tabela ou de escrita em pessoas_justificacoes_dia.';
  END IF;
  IF has_column_privilege('authenticated', k_tab, 'anexos_nomes', 'SELECT')
     OR has_column_privilege('authenticated', k_tab, 'motivo', 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: authenticated ainda le anexos_nomes ou motivo directamente.';
  END IF;
  SELECT string_agg(a.attname::text, ', ' ORDER BY a.attname::text) INTO v_dif
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass(k_tab) AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text NOT IN ('motivo', 'anexos_nomes')
     AND NOT has_column_privilege('authenticated', k_tab, a.attname::text, 'SELECT');
  IF v_dif IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: colunas sem leitura para authenticated (so motivo e anexos_nomes podem ficar de fora): %.', v_dif;
  END IF;

  -- 3.3 Comportamento na nike, DESFEITO no fim (sentinela HJA00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- A pessoa de teste: da nike, nao apagada. Toda a consulta leva a nike.
    SELECT p.id INTO v_p
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
     ORDER BY p.id
     LIMIT 1;
    IF v_p IS NULL THEN
      RAISE EXCEPTION 'Conferir: a nike nao tem pessoas.';
    END IF;

    -- Quem pede: um utilizador activo da nike, com UMA associacao na nike, sem
    -- ligacao a pessoa de teste. Passa a ter SO hr.assiduidade.justificacao.edit.
    SELECT au.auth_user_id, au.id INTO v_uid_e, v_anew_e
      FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.organization_id = k_nike AND am.status = 'active'
     WHERE au.auth_user_id IS NOT NULL
       AND (SELECT count(*) FROM public.anew_memberships m2
             WHERE m2.user_id = au.id AND m2.organization_id = k_nike) = 1
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS DISTINCT FROM v_p
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_e IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo, com uma so associacao e sem ligacao a pessoa de teste.';
    END IF;
    v_role_e := pg_temp.hja1_perfil(k_nike, v_anew_e, ARRAY['hr.assiduidade.justificacao.edit'], 'edit');
    IF NOT public.has_anew_permission_in_org(v_uid_e, 'hr.assiduidade.justificacao.edit', k_nike)
       OR public.has_anew_permission_in_org(v_uid_e, 'hr.assiduidade.justificacao.view', k_nike) THEN
      RAISE EXCEPTION 'Conferir: o perfil de prova devia ter justificacao.edit e NAO ter justificacao.view.';
    END IF;

    -- Um dia sem nenhuma justificacao da pessoa (ate 60 dias para tras).
    v_d := NULL;
    FOR v_i IN 2..60 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                      WHERE j.pessoa_id = v_p AND j.organization_id = k_nike
                        AND j.data = current_date - v_i) THEN
        v_d := current_date - v_i;
        EXIT;
      END IF;
    END LOOP;
    IF v_d IS NULL THEN
      RAISE EXCEPTION 'Conferir: a pessoa de teste tem justificacoes do dia em todos os ultimos 60 dias.';
    END IF;

    -- Duas justificacoes pendentes no mesmo dia: uma consulta medica e um
    -- transporte, cada uma com um nome de anexo (simulado).
    INSERT INTO public.pessoas_justificacoes_dia
      (organization_id, pessoa_id, data, tipo, de_atraso, periodo_inicio, periodo_fim, motivo, anexos_nomes)
    VALUES (k_nike, v_p, v_d, 'consulta_medica', false, TIME '05:00', TIME '05:15', k_motivo, ARRAY['atestado-prova.pdf'])
    RETURNING id INTO v_j_med;
    INSERT INTO public.pessoas_justificacoes_dia
      (organization_id, pessoa_id, data, tipo, de_atraso, periodo_inicio, periodo_fim, motivo, anexos_nomes)
    VALUES (k_nike, v_p, v_d, 'transporte', false, TIME '05:30', TIME '05:45', k_motivo, ARRAY['bilhete-prova.pdf'])
    RETURNING id INTO v_j_tra;

    -- a) Quem so tem .edit chama a listagem: a consulta medica vem sem nomes
    --    (e sem motivo, como antes); o transporte vem com o nome. A chamada e
    --    a verificacao sao instrucoes separadas.
    PERFORM set_config('request.jwt.claim.sub', v_uid_e::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid_e, 'role', 'authenticated')::text, true);
    SELECT l.anexos_nomes, l.texto_sensivel, l.motivo INTO v_nomes_med, v_sens_med, v_motivo_med
      FROM public.rpc_hr_justificacao_dia_listar(k_nike, v_p, v_d, v_d, false) AS l
     WHERE l.id = v_j_med;
    SELECT l.anexos_nomes INTO v_nomes_tra
      FROM public.rpc_hr_justificacao_dia_listar(k_nike, v_p, v_d, v_d, false) AS l
     WHERE l.id = v_j_tra;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    IF v_nomes_med IS DISTINCT FROM '{}'::text[] OR v_sens_med IS DISTINCT FROM true OR v_motivo_med IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: para quem so tem .edit, a consulta medica devia vir com anexos_nomes {} e motivo escondido; veio % / % / %.',
        coalesce(v_nomes_med::text, 'NULL'), coalesce(v_sens_med::text, 'NULL'), coalesce(v_motivo_med, 'NULL');
    END IF;
    IF v_nomes_tra IS DISTINCT FROM ARRAY['bilhete-prova.pdf'] THEN
      RAISE EXCEPTION 'Conferir: um transporte devia continuar a vir com o nome do anexo; veio %.', coalesce(v_nomes_tra::text, 'NULL');
    END IF;

    -- b) Como authenticated, SELECT directo: id le-se (controlo: o SET ROLE
    --    funcionou), anexos_nomes da insufficient_privilege (42501). Cada
    --    bloco acaba numa excepcao, que desfaz o SET LOCAL ROLE.
    v_st := NULL;
    BEGIN
      SET LOCAL ROLE authenticated;
      IF current_user::text IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'controlo_sem_role' USING ERRCODE = 'HJA07';
      END IF;
      SELECT count(*) INTO v_n_lidas FROM (SELECT j.id FROM public.pessoas_justificacoes_dia j LIMIT 1) x;
      RAISE EXCEPTION 'controlo_ok' USING ERRCODE = 'HJA08';
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HJA08' THEN
      RAISE EXCEPTION 'Conferir: o controlo (SET ROLE authenticated e ler a coluna id) devia passar; deu %.', coalesce(v_st, '?');
    END IF;
    v_st := NULL;
    BEGIN
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO v_n_lidas FROM (SELECT j.anexos_nomes FROM public.pessoas_justificacoes_dia j LIMIT 1) x;
      RAISE EXCEPTION 'leu_anexos_nomes' USING ERRCODE = 'HJA09';
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: ler anexos_nomes como authenticated devia dar 42501 (insufficient_privilege); deu %.', coalesce(v_st, '?');
    END IF;
    IF current_user::text = 'authenticated' THEN
      RAISE EXCEPTION 'Conferir: o SET ROLE da prova nao foi desfeito.';
    END IF;

    RAISE NOTICE 'Conferir E1: prova na nike no dia % (pessoa %, utilizador so com justificacao.edit): consulta medica sem nomes, transporte com nome, SELECT directo de anexos_nomes 42501.', v_d, v_p;
    RAISE EXCEPTION 'teste_nomes_anexos_ok' USING ERRCODE = 'HJA00';
  EXCEPTION
    WHEN SQLSTATE 'HJA00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j WHERE j.motivo = k_motivo)
     OR EXISTS (SELECT 1 FROM public.anew_roles r WHERE (to_jsonb(r) ->> 'code') LIKE 'prova\_hja1\_%') THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: listagem = corpo de 20261231800000 + anexos_nomes vazio quando o motivo vem escondido; authenticated deixou de ler anexos_nomes (todas as outras colunas, menos motivo, continuam legiveis).';
END;
$conferir$;

DROP FUNCTION pg_temp.hja1_perfil(uuid, uuid, text[], text);

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so
--    este e 20270111610000, acima de 20270111500000.
-- 2. Prova na nike ANTES do push: correr o ficheiro numa transaccao terminada
--    por um RAISE EXCEPTION (desfaz tudo); a guarda confirma o corpo da
--    listagem no remoto, o conferir prova o resto.
-- 3. Procurar "anexos_nomes" em src/: nenhum cliente o pode ler pela tabela.
-- ==============================================================================
