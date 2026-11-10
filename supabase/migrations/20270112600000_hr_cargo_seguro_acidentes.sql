-- ==============================================================================
-- O seguro de acidentes de trabalho passa a ter uma percentagem POR CARGO.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO CLIENTE NO MESMO ENVIO, e o push vem ANTES do
-- cliente: o cliente (useCargos) le a coluna hr_cargos.seguro_acidentes_pct
-- pelo nome. Com o cliente novo publicado antes do push, a leitura dos cargos
-- falha (a coluna nao existe). Com o cliente antigo depois do push, nada parte
-- (a coluna nova so e lida por quem a pede).
--
-- SEM BACKFILL: todos os cargos ficam SEM seguro (NULL) ate o RH o definir em
-- cada cargo. Nenhum valor e inventado.
--
-- IMPACTO NOUTRAS ORGANIZACOES DA BASE: nenhum. So uma coluna nova a NULL em
-- todos os cargos, uma funcao nova e um gatilho que so actua sobre a coluna
-- nova. Nenhuma funcao existente muda; nenhum valor existente muda.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. hr_cargos.seguro_acidentes_pct numeric(5,2) NULL. NULL = o cargo nao tem
--    seguro. CHECK hr_cargos_seguro_acidentes_pct_intervalo: entre 0 e 100.
--
-- 2. Leitura: hr_cargos le-se por coluna desde 20261210130000 (salario_base e
--    periodicidade nao sao legiveis por authenticated; tecnico_obra entrou por
--    coluna em 20261231998000). Concede-se SELECT (seguro_acidentes_pct) a
--    authenticated. Le-o quem ja le cargos (RLS hr_cargos_select,
--    hr.pessoas.laborais.view): o seguro nao e dado salarial pessoal. Uma
--    concessao por coluna nao cobre colunas futuras: o conferir compara as
--    colunas concedidas com as da tabela e para o push se divergirem.
--
-- 3. Escrita SO pela funcao rpc_hr_cargo_definir_seguro(p_cargo_id, p_pct)
--    -> jsonb {cargo_id, seguro_acidentes_pct}. p_pct NULL limpa o seguro.
--    authenticated tem UPDATE e INSERT na tabela inteira (20261207022100), por
--    isso a coluna protege-se como o salario (HRC01): o gatilho
--    trg_hr_cargos_seguro_so_por_funcao recusa (HRC16) um INSERT com seguro
--    preenchido e um UPDATE que o mude, a quem quer que seja, sempre que a GUC
--    de transaccao hr.cargo_seguro_via_rpc nao esta ligada (so a funcao a liga).
--
-- 4. Registo da alteracao: onde as funcoes de cargos registam as correccoes no
--    proprio registo, hr_cargos_correcoes (valor antigo, valor novo, quem,
--    quando). O CHECK hr_cargos_correcoes_tabela_valida passa a aceitar tambem
--    'hr_cargos'. Nada existente muda. hr_cargos_correcoes continua a ler-se so
--    com hr.pessoas.retribuicao.view.
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo) ----------------------------------------
--   42501 insufficient_privilege  sem sessao; ou sem hr.pessoas.laborais.edit
--                                 num cargo que o utilizador JA VE (tem
--                                 hr.pessoas.laborais.view nessa organizacao,
--                                 por isso nao se revela nada)
--   HRC02 nao_encontrado          cargo inexistente, apagado, ou de uma
--                                 organizacao onde o utilizador nem ve cargos
--                                 (a MESMA resposta: quem nao tem acesso nao
--                                 descobre se o uuid e de um cargo). HRC02 ja
--                                 quer dizer "cargo nao encontrado" no modulo.
--   22023 seguro_invalido         percentagem fora de 0..100 ou com mais de 2
--                                 casas decimais (invalid_parameter_value; e o
--                                 que o cliente traduz como percentagem
--                                 invalida, src/lib/hr/seguroCargo.ts)
--   HRC16 seguro_so_por_funcao    INSERT/UPDATE directo da coluna (gatilho; novo;
--                                 HRC00 a HRC14 ja estao usados no modulo)
--
--
-- -- ORDEM DA FUNCAO -----------------------------------------------------------
-- sessao -> cargo (leitura simples, sem lock) e permissao na organizacao dele ->
-- validar a percentagem -> lock FOR NO KEY UPDATE do cargo (ordem do modulo: o
-- cargo antes das pessoas) -> escrever (so se mudou) -> registar a correccao.
-- Pedir o valor que ja la esta devolve o mesmo jsonb e nao escreve nada.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao (perde-se o seguro
-- de todos os cargos):
--   DROP FUNCTION IF EXISTS public.rpc_hr_cargo_definir_seguro(uuid, numeric);
--   DROP TRIGGER IF EXISTS trg_hr_cargos_seguro_so_por_funcao ON public.hr_cargos;
--   DROP FUNCTION IF EXISTS public.hr_cargos_seguro_so_por_funcao();
--   DELETE FROM public.hr_cargos_correcoes WHERE tabela = 'hr_cargos';
--   ALTER TABLE public.hr_cargos_correcoes DROP CONSTRAINT hr_cargos_correcoes_tabela_valida,
--     ADD CONSTRAINT hr_cargos_correcoes_tabela_valida CHECK (tabela IN ('hr_cargos_periodos', 'pessoas_cargos'));
--   ALTER TABLE public.hr_cargos DROP COLUMN seguro_acidentes_pct;
--
--
-- -- ANTES DO db push ----------------------------------------------------------
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (supabase/.temp/project-ref = base RH): so esta
--    pendente o que se quer aplicar.
-- 2. O conferir faz a prova na nike (b6ffce4f-f630-4933-833a-008649757a33)
--    numa subtransaccao desfeita por sentinela (HSG00): nada fica escrito.
--
-- Prerequisitos:
--   20261210100000  hr_cargos_correcoes
--   20261210130000  hr_cargos lida por coluna (salario fora)
--   20261231998000  hr_cargos.tecnico_obra (concedida por coluna)
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_def text;
BEGIN
  IF to_regclass('public.hr_cargos') IS NULL THEN
    RAISE EXCEPTION 'Guarda: public.hr_cargos nao existe.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
              WHERE a.attrelid = to_regclass('public.hr_cargos')
                AND a.attname::text = 'seguro_acidentes_pct' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'Guarda: hr_cargos.seguro_acidentes_pct ja existe. Esta migration nao e para correr duas vezes: ler o estado real antes.';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = to_regclass('public.hr_cargos') AND NOT a.attisdropped
         AND a.attname::text IN ('id', 'organization_id', 'deleted_at', 'updated_by', 'salario_base', 'periodicidade')) <> 6 THEN
    RAISE EXCEPTION 'Guarda: hr_cargos nao tem as colunas esperadas (id, organization_id, deleted_at, updated_by, salario_base, periodicidade).';
  END IF;

  -- hr_cargos le-se por coluna: authenticated sem SELECT ao nivel da tabela e
  -- sem SELECT de salario_base (20261210130000).
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c,
                    LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
              WHERE c.oid = to_regclass('public.hr_cargos')
                AND x.grantee <> 0 AND x.grantee::regrole::text = 'authenticated'
                AND x.privilege_type::text = 'SELECT') THEN
    RAISE EXCEPTION 'Guarda: authenticated tem SELECT na tabela hr_cargos inteira; esperava-se a leitura por coluna de 20261210130000.';
  END IF;
  IF has_column_privilege('authenticated', 'public.hr_cargos', 'salario_base', 'SELECT') THEN
    RAISE EXCEPTION 'Guarda: authenticated le hr_cargos.salario_base; esperava-se que nao (20261210130000).';
  END IF;

  IF to_regprocedure('public.has_anew_permission_in_org(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: public.has_anew_permission_in_org(uuid, text, uuid) nao existe.';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Guarda: auth.uid() nao existe.';
  END IF;
  IF to_regclass('public.anew_users') IS NULL OR to_regclass('public.anew_memberships') IS NULL THEN
    RAISE EXCEPTION 'Guarda: anew_users ou anew_memberships nao existem.';
  END IF;
  IF (SELECT count(*) FROM public.anew_permissions p
       WHERE p.code IN ('hr.pessoas.laborais.edit', 'hr.pessoas.laborais.view')) <> 2 THEN
    RAISE EXCEPTION 'Guarda: hr.pessoas.laborais.edit e hr.pessoas.laborais.view tem de estar no catalogo de permissoes.';
  END IF;

  IF to_regprocedure('public.rpc_hr_cargo_definir_seguro(uuid,numeric)') IS NOT NULL
     OR to_regprocedure('public.hr_cargos_seguro_so_por_funcao()') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_cargo_definir_seguro ou hr_cargos_seguro_so_por_funcao ja existem. Ler a versao no remoto antes de continuar.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
              WHERE t.tgrelid = to_regclass('public.hr_cargos')
                AND t.tgname::text = 'trg_hr_cargos_seguro_so_por_funcao') THEN
    RAISE EXCEPTION 'Guarda: o gatilho trg_hr_cargos_seguro_so_por_funcao ja existe.';
  END IF;

  -- O padrao de protecao do salario esta la (HRC01, 20261210130000).
  IF to_regprocedure('public.hr_cargos_salario_so_por_periodos()') IS NULL
     OR to_regprocedure('public.rpc_hr_cargo_definir_salario(uuid,numeric,text,date,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: as funcoes de salario do cargo (20261210130000) nao existem com a forma esperada.';
  END IF;

  -- hr_cargos_correcoes e o CHECK de tabela, tal como 20261210100000 o criou.
  IF to_regclass('public.hr_cargos_correcoes') IS NULL THEN
    RAISE EXCEPTION 'Guarda: public.hr_cargos_correcoes nao existe. Aplicar 20261210100000 primeiro.';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_catalog.pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_cargos_correcoes')
     AND c.conname::text = 'hr_cargos_correcoes_tabela_valida' AND c.contype::text = 'c';
  IF v_def IS DISTINCT FROM 'CHECK ((tabela = ANY (ARRAY[''hr_cargos_periodos''::text, ''pessoas_cargos''::text])))' THEN
    RAISE EXCEPTION 'Guarda: hr_cargos_correcoes_tabela_valida nao e a esperada (20261210100000): %.', coalesce(v_def, '(nao existe)');
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A coluna
-- ==============================================================================
ALTER TABLE public.hr_cargos
  ADD COLUMN seguro_acidentes_pct numeric(5,2) NULL,
  ADD CONSTRAINT hr_cargos_seguro_acidentes_pct_intervalo
    CHECK (seguro_acidentes_pct IS NULL OR (seguro_acidentes_pct >= 0 AND seguro_acidentes_pct <= 100));

COMMENT ON COLUMN public.hr_cargos.seguro_acidentes_pct IS
'Percentagem do seguro de acidentes de trabalho do cargo, entre 0 e 100 com 2 casas decimais. NULL = o cargo nao tem seguro. Muda so por rpc_hr_cargo_definir_seguro (hr.pessoas.laborais.edit); INSERT ou UPDATE directo recusado pelo gatilho trg_hr_cargos_seguro_so_por_funcao (HRC16). Legivel por authenticated (GRANT por coluna) sob a RLS de hr_cargos. Cada alteracao fica em hr_cargos_correcoes (tabela hr_cargos). Desde 20270112600000, sem backfill: todos os cargos comecaram sem seguro.';

-- ==============================================================================
-- 2. Leitura por coluna
-- ==============================================================================
GRANT SELECT (seguro_acidentes_pct) ON TABLE public.hr_cargos TO authenticated;

-- ==============================================================================
-- 3. Escrita directa recusada (o padrao de HRC01)
-- ==============================================================================
CREATE FUNCTION public.hr_cargos_seguro_so_por_funcao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('hr.cargo_seguro_via_rpc', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.seguro_acidentes_pct IS NOT NULL THEN
      RAISE EXCEPTION 'seguro_so_por_funcao' USING ERRCODE = 'HRC16',
        DETAIL = 'O seguro de acidentes de trabalho de um cargo define-se so pela funcao propria (rpc_hr_cargo_definir_seguro), depois de o cargo existir.';
    END IF;
  ELSIF NEW.seguro_acidentes_pct IS DISTINCT FROM OLD.seguro_acidentes_pct THEN
    RAISE EXCEPTION 'seguro_so_por_funcao' USING ERRCODE = 'HRC16',
      DETAIL = 'O seguro de acidentes de trabalho de um cargo muda so pela funcao propria (rpc_hr_cargo_definir_seguro).';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_cargos_seguro_so_por_funcao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_cargos_seguro_so_por_funcao() FROM anon;
REVOKE ALL ON FUNCTION public.hr_cargos_seguro_so_por_funcao() FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_cargos_seguro_so_por_funcao() FROM service_role;

COMMENT ON FUNCTION public.hr_cargos_seguro_so_por_funcao() IS
'INTERNA (gatilho BEFORE INSERT OR UPDATE OF seguro_acidentes_pct em hr_cargos). Fora de rpc_hr_cargo_definir_seguro (que liga a GUC de transaccao hr.cargo_seguro_via_rpc) recusa com HRC16 um INSERT com seguro preenchido e um UPDATE que mude o seguro, a quem quer que seja (tambem dono e service_role). Um UPDATE que reenvia o mesmo valor passa. Desde 20270112600000.';

CREATE TRIGGER trg_hr_cargos_seguro_so_por_funcao
  BEFORE INSERT OR UPDATE OF seguro_acidentes_pct ON public.hr_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_cargos_seguro_so_por_funcao();

-- ==============================================================================
-- 4. hr_cargos_correcoes passa a aceitar a correccao do proprio cargo
-- ==============================================================================
ALTER TABLE public.hr_cargos_correcoes
  DROP CONSTRAINT hr_cargos_correcoes_tabela_valida,
  ADD CONSTRAINT hr_cargos_correcoes_tabela_valida
    CHECK (tabela IN ('hr_cargos_periodos', 'pessoas_cargos', 'hr_cargos'));

COMMENT ON TABLE public.hr_cargos_correcoes IS
'Historico das correccoes feitas no proprio registo de cargo: o valor antigo e o novo (jsonb), o motivo e quem corrigiu. Escrito por trigger quando o salario ou a periodicidade de um periodo de hr_cargos_periodos muda, quando o cargo de uma linha de pessoas_cargos muda, e (desde 20270112600000, tabela hr_cargos) por rpc_hr_cargo_definir_seguro quando o seguro de acidentes de trabalho do cargo muda. Append-only (INSERT, UPDATE e DELETE de authenticated recusados); SELECT so com hr.pessoas.retribuicao.view, porque guarda salarios.';

-- ==============================================================================
-- 5. rpc_hr_cargo_definir_seguro
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_cargo_definir_seguro(p_cargo_id uuid, p_pct numeric)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_antigo  numeric(5,2);
  v_novo    numeric(5,2);
  v_actor   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501',
      DETAIL = 'E preciso uma sessao autenticada.';
  END IF;

  -- 1. Permissao ANTES de qualquer lock (leitura simples). Inexistente, apagado,
  --    ou de uma organizacao onde o utilizador nem ve cargos: nao_encontrado.
  --    Quem ve o cargo (laborais.view) mas nao o pode alterar: 42501.
  SELECT c.organization_id INTO v_org
    FROM public.hr_cargos c
   WHERE c.id = p_cargo_id AND c.deleted_at IS NULL;
  IF v_org IS NULL
     OR NOT (coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.laborais.view', v_org), false)
             OR coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.laborais.edit', v_org), false)) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRC02',
      DETAIL = 'O cargo nao existe.';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.laborais.edit', v_org), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501',
      DETAIL = 'Alterar o seguro de um cargo exige hr.pessoas.laborais.edit.';
  END IF;

  -- 2. A percentagem: NULL limpa; senao entre 0 e 100 e no maximo 2 casas.
  --    Dois IF separados: o intervalo (que apanha NaN e infinitos) antes do
  --    arredondamento.
  IF p_pct IS NOT NULL AND NOT (p_pct >= 0 AND p_pct <= 100) THEN
    RAISE EXCEPTION 'seguro_invalido' USING ERRCODE = '22023',
      DETAIL = 'A percentagem do seguro de acidentes de trabalho tem de estar entre 0 e 100.';
  END IF;
  IF p_pct IS NOT NULL AND p_pct <> round(p_pct, 2) THEN
    RAISE EXCEPTION 'seguro_invalido' USING ERRCODE = '22023',
      DETAIL = 'A percentagem do seguro de acidentes de trabalho tem no maximo 2 casas decimais.';
  END IF;
  v_novo := p_pct;

  -- 3. O cargo, com lock (serializa quem mexe no mesmo cargo; FOR NO KEY UPDATE
  --    como a funcao de salario).
  SELECT c.seguro_acidentes_pct INTO v_antigo
    FROM public.hr_cargos c
   WHERE c.id = p_cargo_id AND c.organization_id = v_org AND c.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRC02',
      DETAIL = 'O cargo nao existe.';
  END IF;

  IF v_antigo IS DISTINCT FROM v_novo THEN
    SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

    PERFORM set_config('hr.cargo_seguro_via_rpc', 'on', true);
    UPDATE public.hr_cargos
       SET seguro_acidentes_pct = v_novo, updated_by = v_actor
     WHERE id = p_cargo_id AND organization_id = v_org;
    PERFORM set_config('hr.cargo_seguro_via_rpc', 'off', true);

    INSERT INTO public.hr_cargos_correcoes
      (organization_id, tabela, registo_id, cargo_id, valor_antigo, valor_novo, motivo, corrigido_por)
    VALUES
      (v_org, 'hr_cargos', p_cargo_id, p_cargo_id,
       jsonb_build_object('seguro_acidentes_pct', v_antigo),
       jsonb_build_object('seguro_acidentes_pct', v_novo),
       'Seguro de acidentes de trabalho do cargo', v_actor);
  END IF;

  RETURN jsonb_build_object('cargo_id', p_cargo_id, 'seguro_acidentes_pct', v_novo);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_cargo_definir_seguro(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_cargo_definir_seguro(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_cargo_definir_seguro(uuid, numeric) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_cargo_definir_seguro(uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_cargo_definir_seguro(uuid, numeric) IS
'Define a percentagem do seguro de acidentes de trabalho de um cargo (0 a 100, no maximo 2 casas); p_pct NULL limpa (o cargo fica sem seguro). Gate: hr.pessoas.laborais.edit na organizacao do cargo, verificada antes do lock. Erros: 42501 insufficient_privilege (sem sessao, ou ve o cargo mas nao tem laborais.edit); HRC02 nao_encontrado (cargo inexistente, apagado, ou de uma organizacao onde nem ve cargos: a mesma resposta); 22023 seguro_invalido. Escreve so se o valor muda, e regista o valor antigo, o novo e quem mudou em hr_cargos_correcoes (tabela hr_cargos). Devolve jsonb {cargo_id, seguro_acidentes_pct}. So authenticated tem EXECUTE. Desde 20270112600000.';

-- ==============================================================================
-- Conferir. Ajudante de chamada: corre p_sql com a sessao p_auth (NULL = sem
-- sessao) e, se p_papel vier, no papel p_papel. Devolve o resultado em texto,
-- '' se nao houver linha, ou 'ERRO:<sqlstate>:<mensagem>'. Volta-se ao papel de
-- antes com SET LOCAL ROLE, NUNCA RESET ROLE (no db push o utilizador de sessao
-- e cli_login_postgres); numa excepcao a subtransaccao desfaz o SET LOCAL ROLE.
-- ==============================================================================
CREATE FUNCTION pg_temp.sg_chamar(p_auth uuid, p_sql text, p_papel text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_volta  text := current_user;
  v_res    text;
  v_estado text;
  v_msg    text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true),
          set_config('request.jwt.claims',
                     CASE WHEN p_auth IS NULL THEN '{}'
                          ELSE json_build_object('sub', p_auth, 'role', 'authenticated')::text END, true);
  BEGIN
    IF p_papel IS NOT NULL THEN
      EXECUTE format('SET LOCAL ROLE %I', p_papel);
    END IF;
    EXECUTE p_sql INTO v_res;
    IF p_papel IS NOT NULL THEN
      EXECUTE format('SET LOCAL ROLE %I', v_volta);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    v_res := 'ERRO:' || v_estado || ':' || v_msg;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  RETURN coalesce(v_res, '');
END;
$f$;

DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_rpc       constant text := 'public.rpc_hr_cargo_definir_seguro(uuid,numeric)';
  k_trg_fn    constant text := 'public.hr_cargos_seguro_so_por_funcao()';
  k_chamada   constant text := 'SELECT public.rpc_hr_cargo_definir_seguro(%L::uuid, %L::numeric)::text';
  k_update    constant text := 'UPDATE public.hr_cargos SET seguro_acidentes_pct = 7 WHERE id = %L::uuid AND organization_id = %L::uuid RETURNING id::text';
  v_tag       text := replace(gen_random_uuid()::text, '-', '');
  v_tipo      text;
  v_notnull   boolean;
  v_temdef    boolean;
  v_attnum    smallint;
  v_lista     text;
  v_grant     text;
  v_papel     text := current_user;
  v_pode      boolean;
  v_auth_papel text;
  v_uid       uuid;
  v_uid_sem   uuid;
  v_sem_ve    boolean;
  v_cargo     uuid;
  v_outro     uuid;
  v_res       text;
  v_pct       numeric;
  v_n         integer;
  v_ne        text;
  v_nperm     text;
  v_noutro    text;
  v_prova_papel  text;
  v_prova_sem    text;
  v_prova_outro  text;
  v_prova_ler    text;
  v_prova_upd    text;
  v_prova_cargo  text;
BEGIN
  -- 1. A coluna: tipo, nula, sem default, CHECK validado, comentario.
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasdef, a.attnum
    INTO v_tipo, v_notnull, v_temdef, v_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_cargos')
     AND a.attname::text = 'seguro_acidentes_pct' AND NOT a.attisdropped;
  IF v_tipo IS DISTINCT FROM 'numeric(5,2)' OR v_notnull OR v_temdef THEN
    RAISE EXCEPTION 'Conferir: hr_cargos.seguro_acidentes_pct devia ser numeric(5,2) NULL sem default (tipo %, not null %, default %).',
      coalesce(v_tipo, '(nao existe)'), v_notnull, v_temdef;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                  WHERE c.conrelid = to_regclass('public.hr_cargos')
                    AND c.conname::text = 'hr_cargos_seguro_acidentes_pct_intervalo'
                    AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'Conferir: o CHECK hr_cargos_seguro_acidentes_pct_intervalo nao existe ou nao esta validado.';
  END IF;
  IF col_description(to_regclass('public.hr_cargos'), v_attnum) IS NULL THEN
    RAISE EXCEPTION 'Conferir: hr_cargos.seguro_acidentes_pct ficou sem comentario.';
  END IF;

  -- 2. Leitura. As colunas de salario continuam ilegiveis; todas as outras,
  --    incluindo a nova, legiveis. Uma coluna futura sem concessao aparece aqui
  --    e para o push.
  SELECT string_agg(a.attname::text, ', ' ORDER BY a.attname) INTO v_lista
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_cargos')
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('salario_base', 'periodicidade')
     AND has_column_privilege('authenticated', 'public.hr_cargos', a.attname::text, 'SELECT');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: authenticated consegue ler colunas de salario de hr_cargos: %.', v_lista;
  END IF;
  SELECT string_agg(a.attname::text, ', ' ORDER BY a.attname) INTO v_lista
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_cargos')
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text NOT IN ('salario_base', 'periodicidade')
     AND NOT has_column_privilege('authenticated', 'public.hr_cargos', a.attname::text, 'SELECT');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: hr_cargos tem colunas que authenticated nao consegue ler (uma concessao por coluna nao cobre colunas futuras): %.', v_lista;
  END IF;

  -- Pela ACL: a coluna nova concedida a authenticated (SELECT) e a mais
  -- ninguem; a tabela sem SELECT para authenticated nem nada para anon/PUBLIC.
  SELECT string_agg(DISTINCT (CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END) || ':' || x.privilege_type::text, ',')
    INTO v_grant
    FROM pg_catalog.pg_attribute a, LATERAL aclexplode(a.attacl) x
   WHERE a.attrelid = to_regclass('public.hr_cargos')
     AND a.attname::text = 'seguro_acidentes_pct' AND NOT a.attisdropped
     AND (x.grantee = 0 OR x.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF v_grant IS DISTINCT FROM 'authenticated:SELECT' THEN
    RAISE EXCEPTION 'Conferir: a ACL de hr_cargos.seguro_acidentes_pct devia ser so authenticated:SELECT, e "%".', coalesce(v_grant, '');
  END IF;
  SELECT string_agg(DISTINCT (CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END) || ':' || x.privilege_type::text, ',')
    INTO v_grant
    FROM pg_catalog.pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
   WHERE c.oid = to_regclass('public.hr_cargos')
     AND (x.grantee = 0 OR x.grantee::regrole::text = 'anon'
          OR (x.grantee::regrole::text = 'authenticated' AND x.privilege_type::text = 'SELECT'));
  IF v_grant IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: hr_cargos tem ao nivel da tabela privilegios que nao devia: "%".', v_grant;
  END IF;

  -- 3. O gatilho: ligado, BEFORE ROW INSERT OR UPDATE (1+2+4+16 = 23), so na
  --    coluna nova.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                  WHERE t.tgrelid = to_regclass('public.hr_cargos')
                    AND t.tgname::text = 'trg_hr_cargos_seguro_so_por_funcao'
                    AND NOT t.tgisinternal AND t.tgenabled::text <> 'D'
                    AND (t.tgtype::integer & 63) = 23
                    AND t.tgattr::text = v_attnum::text
                    AND t.tgfoid = to_regprocedure(k_trg_fn)::oid) THEN
    RAISE EXCEPTION 'Conferir: o gatilho trg_hr_cargos_seguro_so_por_funcao nao ficou BEFORE INSERT OR UPDATE OF seguro_acidentes_pct, ligado.';
  END IF;

  -- 4. As funcoes: search_path vazio; a RPC definer e jsonb, EXECUTE so para
  --    authenticated; a do gatilho sem EXECUTE para ninguem; comentarios.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                  WHERE p.oid = to_regprocedure(k_rpc)::oid AND p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']
                    AND pg_get_function_result(p.oid) = 'jsonb') THEN
    RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER, search_path vazio, RETURNS jsonb.', k_rpc;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                  WHERE p.oid = to_regprocedure(k_trg_fn)::oid AND NOT p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Conferir: % devia ser SECURITY INVOKER com search_path vazio.', k_trg_fn;
  END IF;
  SELECT string_agg(DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END, ',')
    INTO v_grant
    FROM pg_catalog.pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
   WHERE p.oid = to_regprocedure(k_rpc)::oid AND x.privilege_type::text = 'EXECUTE'
     AND (x.grantee = 0 OR x.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF v_grant IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser so "authenticated", e "%".', k_rpc, coalesce(v_grant, '');
  END IF;
  SELECT string_agg(DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END, ',')
    INTO v_grant
    FROM pg_catalog.pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
   WHERE p.oid = to_regprocedure(k_trg_fn)::oid AND x.privilege_type::text = 'EXECUTE'
     AND (x.grantee = 0 OR x.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF v_grant IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', k_trg_fn, v_grant;
  END IF;
  IF obj_description(to_regprocedure(k_rpc)::oid, 'pg_proc') IS NULL
     OR obj_description(to_regprocedure(k_trg_fn)::oid, 'pg_proc') IS NULL THEN
    RAISE EXCEPTION 'Conferir: as funcoes novas ficaram sem comentario.';
  END IF;

  -- 5. hr_cargos_correcoes aceita 'hr_cargos' (e continua a aceitar as outras duas).
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                  WHERE c.conrelid = to_regclass('public.hr_cargos_correcoes')
                    AND c.conname::text = 'hr_cargos_correcoes_tabela_valida' AND c.contype::text = 'c'
                    AND c.convalidated
                    AND position('''hr_cargos''::text' IN pg_get_constraintdef(c.oid)) > 0
                    AND position('''hr_cargos_periodos''::text' IN pg_get_constraintdef(c.oid)) > 0
                    AND position('''pessoas_cargos''::text' IN pg_get_constraintdef(c.oid)) > 0) THEN
    RAISE EXCEPTION 'Conferir: hr_cargos_correcoes_tabela_valida devia aceitar hr_cargos_periodos, pessoas_cargos e hr_cargos.';
  END IF;

  -- 6. O papel authenticated pode ser assumido aqui?
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL ROLE %I', v_papel);
    v_pode := true;
  EXCEPTION WHEN OTHERS THEN
    v_pode := false;
  END;
  v_auth_papel := CASE WHEN v_pode THEN 'authenticated' END;
  v_prova_papel := CASE WHEN v_pode THEN 'chamadas feitas no papel authenticated'
                        ELSE 'nao provado no papel authenticated (nao se pode assumir aqui); chamadas feitas como ' || v_papel END;

  -- 7. Prova na nike, DESFEITA no fim (sentinela HSG00). Toda a consulta leva a
  --    organizacao da nike.
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- Quem define: membro activo da nike com hr.pessoas.laborais.edit e .view.
    SELECT au.auth_user_id INTO v_uid
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.laborais.edit', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.laborais.view', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um membro activo com hr.pessoas.laborais.edit e .view.';
    END IF;

    -- Quem nao pode: membro activo da nike SEM hr.pessoas.laborais.edit.
    SELECT au.auth_user_id INTO v_uid_sem
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.laborais.edit', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_sem IS NULL THEN
      v_uid_sem := gen_random_uuid();
      v_prova_sem := 'nao provado com membro real (a nike nao tem um activo sem hr.pessoas.laborais.edit); provado com um utilizador sem permissoes';
    ELSE
      v_prova_sem := 'provado com um membro da nike sem hr.pessoas.laborais.edit';
    END IF;
    -- v_sem_ve: ve o cargo (view OU edit). Sem nenhuma das duas: nao_encontrado;
    -- com uma delas mas sem edit: 42501 (v_uid_sem nunca tem edit, por construcao).
    v_sem_ve := coalesce(public.has_anew_permission_in_org(v_uid_sem, 'hr.pessoas.laborais.view', k_nike), false)
             OR coalesce(public.has_anew_permission_in_org(v_uid_sem, 'hr.pessoas.laborais.edit', k_nike), false);

    -- O cargo: um da nike; sem nenhum, cria-se um (desfeito pela sentinela).
    SELECT c.id INTO v_cargo
      FROM public.hr_cargos c
     WHERE c.organization_id = k_nike AND c.deleted_at IS NULL
     ORDER BY c.id
     LIMIT 1;
    IF v_cargo IS NULL THEN
      INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
      VALUES (k_nike, 'prova 20270112600000 ' || v_tag, 0, 'mensal')
      RETURNING id INTO v_cargo;
      v_prova_cargo := 'num cargo criado para a prova';
    ELSE
      v_prova_cargo := 'num cargo existente da nike';
    END IF;
    IF (SELECT c.seguro_acidentes_pct FROM public.hr_cargos c
         WHERE c.id = v_cargo AND c.organization_id = k_nike) IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: o cargo da prova devia comecar sem seguro (coluna nova).';
    END IF;

    -- a) Sem sessao: 42501.
    v_res := pg_temp.sg_chamar(NULL, format(k_chamada, v_cargo, '4.5'), NULL);
    IF v_res NOT LIKE 'ERRO:42501:%' THEN
      RAISE EXCEPTION 'Conferir [sem sessao]: esperava 42501, veio %.', left(v_res, 300);
    END IF;

    -- b) Definir 4,5 e ler.
    v_res := pg_temp.sg_chamar(v_uid, format(k_chamada, v_cargo, '4.5'), v_auth_papel);
    IF v_res LIKE 'ERRO:%' THEN
      RAISE EXCEPTION 'Conferir [definir 4,5]: devia passar, veio %.', left(v_res, 300);
    END IF;
    IF v_res::jsonb IS DISTINCT FROM jsonb_build_object('cargo_id', v_cargo, 'seguro_acidentes_pct', 4.50) THEN
      RAISE EXCEPTION 'Conferir [definir 4,5]: esperava {cargo_id, seguro_acidentes_pct: 4.50}, veio %.', left(v_res, 300);
    END IF;
    SELECT c.seguro_acidentes_pct INTO v_pct
      FROM public.hr_cargos c WHERE c.id = v_cargo AND c.organization_id = k_nike;
    IF v_pct IS DISTINCT FROM 4.50 THEN
      RAISE EXCEPTION 'Conferir [definir 4,5]: o cargo devia ficar com 4,50, ficou %.', v_pct;
    END IF;
    SELECT count(*)::integer INTO v_n
      FROM public.hr_cargos_correcoes k
     WHERE k.organization_id = k_nike AND k.tabela = 'hr_cargos' AND k.registo_id = v_cargo AND k.cargo_id = v_cargo
       AND k.valor_antigo -> 'seguro_acidentes_pct' = 'null'::jsonb
       AND (k.valor_novo ->> 'seguro_acidentes_pct')::numeric = 4.5;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir [definir 4,5]: devia ficar 1 registo em hr_cargos_correcoes (de NULL para 4,50); ha %.', v_n;
    END IF;

    -- Ler a coluna como quem le cargos (papel authenticated, RLS hr_cargos_select).
    IF v_pode THEN
      v_res := pg_temp.sg_chamar(v_uid, format('SELECT c.seguro_acidentes_pct::text FROM public.hr_cargos c WHERE c.id = %L::uuid AND c.organization_id = %L::uuid', v_cargo, k_nike), 'authenticated');
      IF v_res = '4.50' THEN
        v_prova_ler := 'authenticated le a coluna nova';
      ELSIF v_res = '' THEN
        v_prova_ler := 'nao provado: a RLS de hr_cargos escondeu o cargo a este utilizador';
      ELSE
        RAISE EXCEPTION 'Conferir [ler como authenticated]: esperava 4.50, veio %.', left(v_res, 300);
      END IF;
      v_res := pg_temp.sg_chamar(v_uid, format('SELECT c.salario_base::text FROM public.hr_cargos c WHERE c.id = %L::uuid AND c.organization_id = %L::uuid', v_cargo, k_nike), 'authenticated');
      IF v_res NOT LIKE 'ERRO:42501:%' THEN
        RAISE EXCEPTION 'Conferir [ler salario como authenticated]: devia continuar recusado (42501), veio %.', left(v_res, 300);
      END IF;
    ELSE
      v_prova_ler := 'nao provado no papel authenticated';
    END IF;

    -- c) Recusados: 100,01, -1 e 1,234 (22023 seguro_invalido); o valor fica 4,50.
    v_res := pg_temp.sg_chamar(v_uid, format(k_chamada, v_cargo, '100.01'), v_auth_papel);
    IF v_res IS DISTINCT FROM 'ERRO:22023:seguro_invalido' THEN
      RAISE EXCEPTION 'Conferir [100,01]: esperava 22023 seguro_invalido, veio %.', left(v_res, 300);
    END IF;
    v_res := pg_temp.sg_chamar(v_uid, format(k_chamada, v_cargo, '-1'), v_auth_papel);
    IF v_res IS DISTINCT FROM 'ERRO:22023:seguro_invalido' THEN
      RAISE EXCEPTION 'Conferir [-1]: esperava 22023 seguro_invalido, veio %.', left(v_res, 300);
    END IF;
    v_res := pg_temp.sg_chamar(v_uid, format(k_chamada, v_cargo, '1.234'), v_auth_papel);
    IF v_res IS DISTINCT FROM 'ERRO:22023:seguro_invalido' THEN
      RAISE EXCEPTION 'Conferir [1,234]: esperava 22023 seguro_invalido, veio %.', left(v_res, 300);
    END IF;
    IF (SELECT c.seguro_acidentes_pct FROM public.hr_cargos c
         WHERE c.id = v_cargo AND c.organization_id = k_nike) IS DISTINCT FROM 4.50 THEN
      RAISE EXCEPTION 'Conferir: as recusas nao deviam ter mudado o seguro do cargo.';
    END IF;

    -- d) O limite 100 passa.
    v_res := pg_temp.sg_chamar(v_uid, format(k_chamada, v_cargo, '100'), v_auth_papel);
    IF v_res LIKE 'ERRO:%' THEN
      RAISE EXCEPTION 'Conferir [100]: devia passar, veio %.', left(v_res, 300);
    END IF;
    IF (v_res::jsonb ->> 'seguro_acidentes_pct')::numeric IS DISTINCT FROM 100 THEN
      RAISE EXCEPTION 'Conferir [100]: devia devolver 100, veio %.', left(v_res, 300);
    END IF;

    -- e) Limpar com NULL.
    v_res := pg_temp.sg_chamar(v_uid, format(k_chamada, v_cargo, NULL), v_auth_papel);
    IF v_res LIKE 'ERRO:%' THEN
      RAISE EXCEPTION 'Conferir [limpar]: devia passar, veio %.', left(v_res, 300);
    END IF;
    IF v_res::jsonb IS DISTINCT FROM jsonb_build_object('cargo_id', v_cargo, 'seguro_acidentes_pct', NULL) THEN
      RAISE EXCEPTION 'Conferir [limpar]: esperava {cargo_id, seguro_acidentes_pct: null}, veio %.', left(v_res, 300);
    END IF;
    IF (SELECT c.seguro_acidentes_pct FROM public.hr_cargos c
         WHERE c.id = v_cargo AND c.organization_id = k_nike) IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir [limpar]: o cargo devia ficar sem seguro.';
    END IF;
    SELECT count(*)::integer INTO v_n
      FROM public.hr_cargos_correcoes k
     WHERE k.organization_id = k_nike AND k.tabela = 'hr_cargos' AND k.registo_id = v_cargo;
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'Conferir: deviam ficar 3 registos em hr_cargos_correcoes (4,50; 100; NULL), as recusas nenhum; ha %.', v_n;
    END IF;

    -- f) Sem permissao: 42501 se ve o cargo (laborais.view), senao nao_encontrado.
    --    Inexistente e de outra organizacao: o mesmo nao_encontrado.
    v_nperm := pg_temp.sg_chamar(v_uid_sem, format(k_chamada, v_cargo, '4.5'), v_auth_papel);
    IF v_nperm IS DISTINCT FROM (CASE WHEN v_sem_ve THEN 'ERRO:42501:insufficient_privilege'
                                      ELSE 'ERRO:HRC02:nao_encontrado' END) THEN
      RAISE EXCEPTION 'Conferir [sem permissao, ve cargos: %]: resposta inesperada %.', v_sem_ve, left(v_nperm, 300);
    END IF;
    v_prova_sem := v_prova_sem || CASE WHEN v_sem_ve THEN ' (ve cargos: 42501)' ELSE ' (nao ve cargos: nao_encontrado)' END;

    v_ne := pg_temp.sg_chamar(v_uid, format(k_chamada, gen_random_uuid(), '4.5'), v_auth_papel);
    IF v_ne IS DISTINCT FROM 'ERRO:HRC02:nao_encontrado' THEN
      RAISE EXCEPTION 'Conferir [inexistente]: esperava HRC02 nao_encontrado, veio %.', left(v_ne, 300);
    END IF;

    -- Cruzamento entre organizacoes: nao se le nenhuma outra organizacao (so a nike).
    v_prova_outro := 'cruzamento entre organizacoes nao provado (sem ler outras organizacoes)';
    RAISE NOTICE 'cruzamento entre organizacoes nao provado (sem ler outras organizacoes)';

    -- g) Escrita directa recusada (HRC16): UPDATE como dono, UPDATE como
    --    authenticated com a permissao (passa a RLS de hr_cargos_update e e o
    --    gatilho que recusa), INSERT com seguro como dono.
    v_res := pg_temp.sg_chamar(NULL, format(k_update, v_cargo, k_nike), NULL);
    IF v_res IS DISTINCT FROM 'ERRO:HRC16:seguro_so_por_funcao' THEN
      RAISE EXCEPTION 'Conferir [UPDATE directo, dono]: esperava HRC16, veio %.', CASE WHEN v_res = '' THEN 'vazio (a RLS escondeu a linha, nenhuma linha foi actualizada)' ELSE left(v_res, 300) END;
    END IF;
    IF v_pode THEN
      v_res := pg_temp.sg_chamar(v_uid, format(k_update, v_cargo, k_nike), 'authenticated');
      IF v_res = 'ERRO:HRC16:seguro_so_por_funcao' THEN
        v_prova_upd := 'UPDATE directo de authenticated recusado (HRC16)';
      ELSIF v_res = '' THEN
        v_prova_upd := 'nao provado no papel authenticated: a RLS de hr_cargos escondeu a linha';
      ELSE
        RAISE EXCEPTION 'Conferir [UPDATE directo, authenticated]: esperava HRC16, veio %.', left(v_res, 300);
      END IF;
    ELSE
      v_prova_upd := 'UPDATE directo provado so como dono';
    END IF;
    v_res := pg_temp.sg_chamar(NULL, format(
      'INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade, seguro_acidentes_pct) VALUES (%L::uuid, %L, 0, %L, 3) RETURNING id::text',
      k_nike, 'prova 20270112600000 insert ' || v_tag, 'mensal'), NULL);
    IF v_res IS DISTINCT FROM 'ERRO:HRC16:seguro_so_por_funcao' THEN
      RAISE EXCEPTION 'Conferir [INSERT com seguro]: esperava HRC16, veio %.', CASE WHEN v_res = '' THEN 'vazio (a RLS escondeu a linha, nenhuma linha foi inserida)' ELSE left(v_res, 300) END;
    END IF;
    IF (SELECT c.seguro_acidentes_pct FROM public.hr_cargos c
         WHERE c.id = v_cargo AND c.organization_id = k_nike) IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: a escrita directa recusada nao devia ter mudado o seguro.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir 20270112600000: prova na nike %; %; leitura: %; sem permissao: %; outra organizacao: %; escrita directa: %.',
      v_prova_cargo, v_prova_papel, v_prova_ler, v_prova_sem, v_prova_outro, v_prova_upd;
    RAISE EXCEPTION 'teste_cargo_seguro_ok' USING ERRCODE = 'HSG00';
  EXCEPTION
    WHEN SQLSTATE 'HSG00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.hr_cargos_correcoes k
              WHERE k.organization_id = k_nike AND k.tabela = 'hr_cargos')
     OR EXISTS (SELECT 1 FROM public.hr_cargos c
                 WHERE c.organization_id = k_nike
                   AND (c.seguro_acidentes_pct IS NOT NULL OR c.nome LIKE 'prova 20270112600000 %')) THEN
    RAISE EXCEPTION 'Conferir: a prova deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido 20270112600000: hr_cargos.seguro_acidentes_pct numeric(5,2) NULL com CHECK 0..100, legivel por authenticated por coluna (salario continua fora), escrita so por rpc_hr_cargo_definir_seguro (HRC16 em INSERT/UPDATE directo); a funcao recusa sem sessao (42501), sem laborais.edit num cargo que ve (42501), percentagem invalida (22023 seguro_invalido), e da o mesmo nao_encontrado (HRC02) a cargo inexistente e de outra organizacao; regista em hr_cargos_correcoes; EXECUTE so para authenticated.';
END;
$conferir$;

DROP FUNCTION pg_temp.sg_chamar(uuid, text, text);

COMMIT;
