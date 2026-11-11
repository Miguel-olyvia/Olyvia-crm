-- ==============================================================================
-- 20270114800000_hr_cargo_com_admissao_futura (base RH)
--
-- Uma ficha SEM cargo cuja admissao esta no FUTURO passa a poder receber cargo
-- a comecar NO PROPRIO DIA da admissao.
--
-- POR APLICAR. Nao precisa de codigo novo no mesmo envio: o codigo de hoje
-- continua a funcionar igual (so passa a ser aceite um pedido que antes era
-- recusado). Ordem: esta migration PRIMEIRO; so depois o assistente pode pedir
-- o cargo numa admissao futura.
--
--
-- -- O BECO --------------------------------------------------------------------
--
-- Desde 20270114700000 a ficha pode nascer sem cargo. Quando a pessoa e aceite
-- hoje e so comeca depois, a data de admissao deriva do inicio do contrato e
-- fica no FUTURO. Nessa ficha rpc_hr_pessoa_mudar_cargo, no ramo "sem linha
-- aberta", exigia p_desde entre a admissao e hoje (HRC04): com admissao futura
-- nenhuma data servia -- antes da admissao dava "nao pode comecar antes da data
-- de admissao", na admissao ou depois dava "so pode comecar ate hoje". A ficha
-- ficava sem cargo (e sem acesso, pela pendencia "cargo") ate o dia chegar.
--
--
-- -- A DECISAO (coordenador, 11/11) --------------------------------------------
--
-- O cargo pode comecar NA data de admissao (o inicio do contrato), mesmo
-- futura, SO quando a ficha nao tem linha de cargo aberta. E o que ja acontece
-- quando a ficha nasce com cargo: hr_pessoas_cargo_primeira_linha abre a linha
-- em coalesce(data_admissao, hoje), futura incluida.
--
--
-- -- O QUE MUDA (so isto) ------------------------------------------------------
--
-- rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text), ramo SEM linha aberta, uma
-- condicao:
--     antes:  IF p_desde > v_hoje THEN                                 -> HRC04
--     depois: IF p_desde > v_hoje AND p_desde IS DISTINCT FROM v_admissao THEN
-- mais o comentario interno desse bloco (3 linhas no lugar de 1) e uma frase no
-- COMMENT ON FUNCTION. O resto do corpo e o do remoto byte a byte: a guarda
-- abaixo exige o md5 vivo de 11/11 e o conferir exige o md5 do resultado.
--
-- Fica TUDO o resto recusado como antes:
--   - sem linha aberta, p_desde antes da admissao -> HRC04 (inalterado);
--   - sem linha aberta, p_desde futuro e diferente da admissao (depois dela, ou
--     com admissao NULL) -> HRC04 "so pode comecar ate hoje" (inalterado);
--   - COM linha aberta: ramo normal e ramo substituir intactos (nao se toca).
-- Com p_desde = admissao futura o resto da funcao ja servia: a verificacao de
-- correccao so corre com p_desde < hoje; hr_pessoa_cargo_em devolve NULL;
-- hr_retribuicao_refazer_desde nao recusa datas futuras (o modo substituir ja a
-- chama com p_desde >= hoje) e devolve 0 a quem nao tem retribuicao;
-- hr_pessoas_cargos_sincronizar escreve pessoas.cargo_id a partir da linha
-- ABERTA, seja qual for a data (lido vivo a 11/11).
--
-- Duas consequencias, aceites (nenhuma funcao alem desta e alterada):
--   (a) fn_rh_pessoa_cargo_vigente faz coalesce(hr_pessoa_cargo_em(hoje),
--       pessoas.cargo_id): numa ficha cujo cargo so comeca no futuro, o recurso
--       ao pessoas.cargo_id usa o cargo futuro ja preenchido pelo trigger, e a
--       pessoa conta desde ja como tecnica nas funcoes que a usam
--       (fn_rh_pessoa_tecnica, fn_rh_oficios_efetivos,
--       fn_rh_custo_hora_pessoa_em_det, rh_ler_oficios_pessoa,
--       rh_guardar_oficios_pessoa). Isto JA acontece hoje com o INSERT com cargo
--       e admissao futura (hr_pessoas_cargo_primeira_linha); esta migration so o
--       alarga a mais fichas.
--   (b) a pendencia "cargo" de hr_admissao_pendencias sai assim que cargo_id
--       fica preenchido (antes de a pessoa comecar): e a consequencia pretendida
--       e igual a do INSERT com cargo. O acesso depende tambem das outras
--       pendencias (ex.: data de admissao) e da Edge criar-acesso-pessoa.
--
-- IMPACTO: so fichas sem linha de cargo aberta e com data_admissao > hoje, e so
-- quando p_desde e exactamente essa data. A base RH so tem a organizacao nike;
-- nada disto chega a Mudelar (outra base).
--
-- NOTA (nao muda aqui): se a data de admissao mudar depois (o inicio do
-- contrato mudar), a linha de cargo nao a acompanha -- igual ao que ja acontece
-- com a primeira linha aberta no INSERT com cargo.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: repor a condicao
-- "IF p_desde > v_hoje THEN" (versao viva a 11/11, md5
-- dc7a12fb2d19bc4b6b203cc0943b31de). Linhas de cargo abertas entretanto numa
-- admissao futura ficam validas (sao iguais as que o INSERT com cargo abre).
--
-- Prerequisitos:
--   20261210120000  rpc_hr_pessoa_mudar_cargo (versao viva lida a 11/11)
--   20270114700000  fichas sem cargo na admissao
-- ==============================================================================

SET lock_timeout = '5s';

BEGIN;

-- ---- Guardas ---------------------------------------------------------------
-- md5(pg_get_functiondef(...)) e md5(obj_description(...)) lidos no remoto RH
-- a 11/11:
--   rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text)  dc7a12fb2d19bc4b6b203cc0943b31de
--   comentario dessa funcao                          7392e70ab58cb201060d4a666a6b8440
--   versao desta migration (resultado esperado)      2d1100b0d0cf8d68bbdb19f81ca8505f
DO $guardas$
DECLARE
  v_fn   regprocedure := to_regprocedure('public.rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text)');
  v_md5  text;
  v_n    integer;
BEGIN
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text) nao existe. Aplicar 20261210120000 primeiro.';
  END IF;

  -- Uma so assinatura: recriar com outra deixaria o PostgREST sem saber qual chamar.
  SELECT count(*)::integer INTO v_n
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname::text = 'rpc_hr_pessoa_mudar_cargo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo tem % assinaturas (esperada 1). Ler o remoto antes de continuar.', v_n;
  END IF;

  v_md5 := md5(pg_get_functiondef(v_fn::oid));
  IF v_md5 = '2d1100b0d0cf8d68bbdb19f81ca8505f' THEN
    RAISE NOTICE 'rpc_hr_pessoa_mudar_cargo ja e a versao desta migration; reaplica-se igual.';
  ELSIF v_md5 <> 'dc7a12fb2d19bc4b6b203cc0943b31de' THEN
    RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo mudou desde 11/11 (md5 % em vez de dc7a12fb2d19bc4b6b203cc0943b31de). Ler a versao viva antes de a substituir.',
      v_md5;
  ELSIF md5(coalesce(obj_description(v_fn::oid, 'pg_proc'), '')) <> '7392e70ab58cb201060d4a666a6b8440' THEN
    RAISE EXCEPTION 'O comentario de rpc_hr_pessoa_mudar_cargo mudou desde 11/11. Ler o vivo antes de o substituir.';
  END IF;

  -- ACL de antes, para o conferir comparar depois do CREATE OR REPLACE.
  PERFORM set_config('olyvia.acl_mudar_cargo',
                     coalesce((SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_fn::oid), 'NULL'),
                     true);
END;
$guardas$;

-- ==============================================================================
-- rpc_hr_pessoa_mudar_cargo: corpo do remoto (md5 dc7a12fb...) com UMA condicao
-- mudada no ramo sem linha aberta (ver cabecalho). SECURITY DEFINER e
-- search_path como antes; o ACL mantem-se (CREATE OR REPLACE) e confere-se.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_pessoa_mudar_cargo(p_pessoa_id uuid, p_cargo_id uuid, p_desde date, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_motivo_max     constant integer := 500;
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_org            uuid;
  v_admissao       date;
  v_hoje           date := current_date;
  v_limite_passado date := (current_date - interval '10 years')::date;
  v_cargo_nome     text;
  v_cargo_activo   boolean;
  v_cargo_apagado  timestamptz;
  v_l              public.pessoas_cargos%ROWTYPE;
  v_tem_l          boolean;
  v_substituir     boolean := false;
  v_tem_retrib     boolean;
  v_cargo_antes    uuid;
  v_ve_salario     boolean;
  v_sal_antes      numeric;
  v_per_antes      text;
  v_sal_depois     numeric;
  v_per_depois     text;
  v_motivo_limpo   text;
  v_versoes        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: e preciso uma sessao autenticada.'
      USING ERRCODE = '42501';
  END IF;

  -- Pessoa que nao existe e falta de permissao dao A MESMA resposta: quem nao
  -- tem acesso nao descobre se um uuid pertence a uma pessoa de outra organizacao.
  SELECT p.organization_id, p.data_admissao INTO v_org, v_admissao
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para mudar o cargo desta pessoa (hr.pessoas.laborais.edit).'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.laborais.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para mudar o cargo desta pessoa (hr.pessoas.laborais.edit).'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data a partir da qual o cargo muda e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_desde < v_limite_passado THEN
    RAISE EXCEPTION 'data_invalida: o cargo nao pode mudar com data anterior a % (maximo 10 anos para tras).', v_limite_passado
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_motivo IS NOT NULL AND char_length(p_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo nao pode ter mais de % caracteres.', c_motivo_max
      USING ERRCODE = 'HRC03';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  -- ORDEM DE LOCKS: o cargo ANTES da pessoa (rpc_hr_cargo_definir_salario faz o
  -- mesmo: cargo e depois cada pessoa), e os dois FOR NO KEY UPDATE, para nao
  -- bloquear as verificacoes de chave estrangeira de quem escreve em pessoas_cargos
  -- (o impasse entre mudar o cargo de uma pessoa e subir o salario desse cargo).
  SELECT c.nome, c.activo, c.deleted_at INTO v_cargo_nome, v_cargo_activo, v_cargo_apagado
    FROM public.hr_cargos c
   WHERE c.id = p_cargo_id AND c.organization_id = v_org
     FOR NO KEY UPDATE;
  IF NOT FOUND OR v_cargo_apagado IS NOT NULL THEN
    RAISE EXCEPTION 'cargo_nao_encontrado: o cargo nao existe nesta organizacao ou foi apagado.'
      USING ERRCODE = 'HRC02';
  END IF;
  IF v_cargo_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'cargo_desactivado: o cargo escolhido esta desactivado. Escolher um cargo activo.'
      USING ERRCODE = 'HRC09';
  END IF;

  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para mudar o cargo desta pessoa (hr.pessoas.laborais.edit).'
      USING ERRCODE = '42501';
  END IF;

  -- D2 (DEPOIS do lock da pessoa: uma retribuicao criada entretanto por outra
  -- transaccao ja conta): mudar o cargo de quem ja tem retribuicao muda-lhe o
  -- salario.
  SELECT EXISTS (
    SELECT 1 FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
  ) INTO v_tem_retrib;
  IF v_tem_retrib
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: mudar o cargo de quem ja tem retribuicao muda-lhe o salario e exige tambem hr.pessoas.retribuicao.edit.'
      USING ERRCODE = '42501';
  END IF;

  -- Uma data passada que reescreve uma versao ja em vigor e uma CORRECCAO
  -- (exige tambem hr.pessoas.retribuicao.corrigir), como em
  -- rpc_hr_retribuicao_definir_pessoal.
  IF p_desde < v_hoje
     AND EXISTS (
       SELECT 1 FROM public.pessoas_retribuicoes r
        WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
          AND r.valido_de < p_desde
          AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
     )
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.corrigir', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: mudar o cargo com data passada reescreve uma versao de retribuicao ja em vigor e exige tambem hr.pessoas.retribuicao.corrigir.'
      USING ERRCODE = '42501';
  END IF;

  -- Datas (D3). Com linha aberta L: cargo igual -> HRC07; modo normal exige
  -- L.valido_de < p_desde <= hoje; modo substituir (corrigir o cargo de uma
  -- admissao futura) exige p_desde = L.valido_de >= hoje. Sem linha aberta
  -- (ficha sem cargo): de hoje para tras, e nunca antes da admissao; ou no
  -- proprio dia de uma admissao futura (20270114800000), como a primeira linha
  -- que o INSERT com cargo abre em coalesce(data_admissao, hoje).
  SELECT * INTO v_l
    FROM public.pessoas_cargos c
   WHERE c.pessoa_id = p_pessoa_id AND c.valido_ate IS NULL;
  v_tem_l := FOUND;

  IF v_tem_l THEN
    IF v_l.cargo_id = p_cargo_id THEN
      RAISE EXCEPTION 'sem_alteracao: a pessoa ja tem este cargo.'
        USING ERRCODE = 'HRC07';
    END IF;

    IF p_desde = v_l.valido_de AND v_l.valido_de >= v_hoje THEN
      v_substituir := true;
    ELSIF p_desde > v_l.valido_de AND p_desde <= v_hoje THEN
      v_substituir := false;
    ELSE
      RAISE EXCEPTION
        'data_invalida: o cargo so pode mudar a partir do dia a seguir ao inicio do cargo actual (%) e ate hoje (%). Numa admissao futura so se corrige o cargo no proprio dia de inicio.',
        v_l.valido_de, v_hoje
        USING ERRCODE = 'HRC04';
    END IF;
  ELSE
    IF p_desde > v_hoje AND p_desde IS DISTINCT FROM v_admissao THEN
      RAISE EXCEPTION 'data_invalida: o cargo so pode comecar ate hoje (%).', v_hoje
        USING ERRCODE = 'HRC04';
    END IF;
    IF v_admissao IS NOT NULL AND p_desde < v_admissao THEN
      RAISE EXCEPTION 'data_invalida: o cargo nao pode comecar antes da data de admissao (%).', v_admissao
        USING ERRCODE = 'HRC04';
    END IF;
  END IF;

  -- Salario antes e depois, calculados ANTES de mexer em nada, e SO para quem
  -- tem hr.pessoas.retribuicao.view (senao ficam NULL: o salario nao se revela
  -- a quem so tem laborais.edit).
  v_ve_salario := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', v_org);
  v_cargo_antes := public.hr_pessoa_cargo_em(p_pessoa_id, p_desde);

  IF v_ve_salario THEN
    IF v_cargo_antes IS NOT NULL THEN
      SELECT s.salario_base, s.periodicidade INTO v_sal_antes, v_per_antes
        FROM public.hr_cargo_salario_em(v_cargo_antes, p_desde) s;
    ELSE
      -- Ficha sem cargo nessa data: o "antes" e a retribuicao antiga, se tem
      -- (a que cobre a data, senao a primeira que comeca depois).
      SELECT r.valor_base, r.periodicidade INTO v_sal_antes, v_per_antes
        FROM public.pessoas_retribuicoes r
       WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
         AND r.valido_de <= p_desde
         AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
       ORDER BY r.valido_de DESC
       LIMIT 1;
      IF NOT FOUND THEN
        SELECT r.valor_base, r.periodicidade INTO v_sal_antes, v_per_antes
          FROM public.pessoas_retribuicoes r
         WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
           AND r.valido_de > p_desde
         ORDER BY r.valido_de ASC
         LIMIT 1;
      END IF;
    END IF;

    SELECT s.salario_base, s.periodicidade INTO v_sal_depois, v_per_depois
      FROM public.hr_cargo_salario_em(p_cargo_id, p_desde) s;
  END IF;

  v_motivo_limpo := NULLIF(btrim(coalesce(p_motivo, '')), '');

  -- Escreve o historico de cargos; o trigger sincroniza pessoas.cargo_id.
  -- No modo substituir o cargo antigo fica em hr_cargos_correcoes (trigger de
  -- pessoas_cargos), com quem corrigiu (updated_by).
  IF v_substituir THEN
    UPDATE public.pessoas_cargos
       SET cargo_id   = p_cargo_id,
           motivo     = coalesce(v_motivo_limpo, 'Correccao do cargo da admissao'),
           updated_by = v_actor
     WHERE id = v_l.id;
  ELSE
    IF v_tem_l THEN
      UPDATE public.pessoas_cargos
         SET valido_ate = p_desde, updated_by = v_actor
       WHERE id = v_l.id;
    END IF;
    INSERT INTO public.pessoas_cargos
      (organization_id, pessoa_id, cargo_id, valido_de, motivo, created_by)
    VALUES
      (v_org, p_pessoa_id, p_cargo_id, p_desde,
       coalesce(v_motivo_limpo, 'Mudanca de cargo'), v_actor);
  END IF;

  -- Refaz as retribuicoes a partir da data. Nao cria a primeira retribuicao de
  -- quem nao tem nenhuma (isso e o gesto do subsidio e duodecimos).
  v_versoes := public.hr_retribuicao_refazer_desde(
    p_pessoa_id, p_desde, NULL, 'cargo',
    'Mudanca de cargo: ' || v_cargo_nome
      || CASE WHEN v_motivo_limpo IS NOT NULL THEN ' - ' || v_motivo_limpo ELSE '' END,
    v_actor);

  RETURN jsonb_build_object(
    'cargo_anterior_id',     v_cargo_antes,
    'cargo_id',              p_cargo_id,
    'desde',                 p_desde,
    'salario_antes',         v_sal_antes,
    'periodicidade_antes',   v_per_antes,
    'salario_depois',        v_sal_depois,
    'periodicidade_depois',  v_per_depois,
    'versoes_criadas',       v_versoes
  );
END;
$function$;

COMMENT ON FUNCTION public.rpc_hr_pessoa_mudar_cargo(uuid, uuid, date, text) IS
'Muda o cargo de uma pessoa a partir de p_desde: fecha o cargo em aberto de pessoas_cargos nesse dia e abre o novo (ou, numa admissao futura, corrige o cargo no proprio dia de inicio, e o cargo antigo fica em hr_cargos_correcoes), e refaz as retribuicoes dessa data em diante com o salario do cargo novo. Gate: hr.pessoas.laborais.edit na organizacao da pessoa; pessoa inexistente e falta de permissao dao a mesma resposta (42501). Se a pessoa ja tem retribuicao, tambem hr.pessoas.retribuicao.edit; se a data e passada e reescreve uma versao em vigor, tambem hr.pessoas.retribuicao.corrigir (ambas verificadas depois do lock da pessoa). Datas: so de hoje para tras (o dia seguinte ao inicio do cargo actual; numa ficha sem cargo, entre a admissao e hoje, ou no proprio dia de uma admissao futura), nunca mais de 10 anos para tras; motivo ate 500 caracteres. Locks: cargo e depois pessoa, FOR NO KEY UPDATE. Erros HRC02, HRC03, HRC04, HRC06, HRC07, HRC09, HRC11, HRC13 e 42501. Devolve jsonb: cargo_anterior_id, cargo_id, desde, salario_antes, periodicidade_antes, salario_depois, periodicidade_depois (estes quatro SO se o chamador tem hr.pessoas.retribuicao.view; senao NULL; sem cargo anterior, o antes e a retribuicao antiga da ficha) e versoes_criadas. Nao cria a primeira retribuicao de quem nao tem nenhuma.';

-- ==============================================================================
-- Conferir (so catalogo; os casos de comportamento estao em
-- supabase/tests/hr_cargo_com_admissao_futura.test.sql).
-- ==============================================================================
DO $conferir$
DECLARE
  v_oid     oid := to_regprocedure('public.rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text)')::oid;
  v_md5     text;
  v_acl     text;
  v_secdef  boolean;
  v_config  text;
BEGIN
  v_md5 := md5(pg_get_functiondef(v_oid));
  IF v_md5 <> '2d1100b0d0cf8d68bbdb19f81ca8505f' THEN
    RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo nao ficou byte a byte a versao desta migration (md5 % em vez de 2d1100b0d0cf8d68bbdb19f81ca8505f).',
      v_md5;
  END IF;

  SELECT p.proacl::text, p.prosecdef, array_to_string(p.proconfig, ',')::text
    INTO v_acl, v_secdef, v_config
    FROM pg_proc p WHERE p.oid = v_oid;

  IF coalesce(v_acl, 'NULL') IS DISTINCT FROM current_setting('olyvia.acl_mudar_cargo', true) THEN
    RAISE EXCEPTION 'O ACL de rpc_hr_pessoa_mudar_cargo mudou: era %, ficou %.',
      current_setting('olyvia.acl_mudar_cargo', true), coalesce(v_acl, 'NULL');
  END IF;
  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo deixou de ser SECURITY DEFINER.';
  END IF;
  IF coalesce(v_config, '') NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo ficou sem o search_path fixo (proconfig: %).', coalesce(v_config, 'NULL');
  END IF;

  IF md5(coalesce(obj_description(v_oid, 'pg_proc'), '')) <> '34c3d8b007205ebcd4a547ec1f7c23c3' THEN
    RAISE EXCEPTION 'O comentario de rpc_hr_pessoa_mudar_cargo nao ficou o desta migration.';
  END IF;

  RAISE NOTICE 'OK: rpc_hr_pessoa_mudar_cargo aceita p_desde = admissao futura numa ficha sem linha aberta; corpo, comentario, ACL, SECURITY DEFINER e search_path conferidos.';
END;
$conferir$;

COMMIT;

RESET lock_timeout;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes. A 11/11 havia 13
--    migrations locais mais antigas do que o ultimo carimbo remoto e nunca
--    aplicadas (20270105100000 ... 20270112800000): NAO as levar junto sem
--    decisao. Esta deve ser a unica com carimbo acima de 20270114700000.
-- 2. Correr supabase/tests/hr_cargo_com_admissao_futura.test.sql ANTES do push,
--    contra o remoto ainda por corrigir: tem de dar vermelho SO no caso 3.1
--    ("FALHOU: 3.1 ... HRC04"). E esse o vermelho legitimo. Os casos 0.x, 1.x
--    e 2.x correm antes e passam (premissas e recusas que ja existem hoje); o
--    teste para no 3.1, por isso os casos 4 e 5 so correm depois do push.
-- 3. db push desta migration. Depois correr o mesmo teste (BEGIN ... ROLLBACK):
--    tem de dar OK. Correr tambem hr_pessoa_sem_cargo_na_admissao.test.sql
--    (o caso 7b foi actualizado para o comportamento novo).
-- 4. Base RH: so tem a organizacao nike. Nada disto chega a Mudelar.
-- ==============================================================================
