-- ==============================================================================
-- Fim de contrato (1/6): as regras da organizacao e as funcoes de datas.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO (um ecra de configuracao por empresa). Sozinha esta
-- migration so cria uma tabela, uma permissao e funcoes novas; nada a usa ainda e
-- nada do que corre hoje muda. Faz parte de um conjunto de seis (320000 a 370000)
-- que entram no mesmo commit que os ecras: regras da organizacao, regras por
-- contrato, indicacoes/renovacoes/avisos, RPCs do responsavel, RPCs do RH e a
-- rotina diaria.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- 1. Permissao nova hr.contratos.regras.gerir: PERIGOSA, pendurada em
--    hr.pessoas.vinculos.edit, SEM papel por omissao. Quem a tem liga e desliga o
--    aviso de fim de contrato e a renovacao automatica da empresa toda.
--
-- 2. Tabela hr_regras_fim_contrato, UMA linha por organizacao, com os DEFAULTS da
--    empresa. Nenhum valor legal esta no codigo: o numero de renovacoes, a duracao
--    de cada uma, os dias de aviso e o que acontece no limite sao configuracao.
--      ativo                    desligado por omissao: a rotina so corre para
--                               organizacoes que ligarem
--      dias_aviso               dias antes do fim do ciclo (1 a 365, omissao 30)
--      renovacao_automatica     omissao nao
--      max_renovacoes           omissao 0
--      duracao_renovacao_valor / duracao_renovacao_unidade (meses | dias): a
--                               duracao de cada renovacao. NULL nos dois = igual
--                               a duracao do contrato inicial
--      ao_atingir_limite        converter_sem_termo | decisao_manual_rh
--                               (omissao decisao_manual_rh: nada passa a sem
--                               termo sem a empresa o pedir)
--    A escrita e SO pela RPC rpc_hr_regras_fim_contrato_guardar (permissao
--    hr.contratos.regras.gerir). A leitura e de quem tem hr.pessoas.vinculos.view.
--    Uma organizacao sem linha = funcionalidade desligada.
--
-- 3. Funcoes puras de datas (IMMUTABLE), usadas pela renovacao:
--      hr_contrato_fim_por_meses(inicio, meses)   vespera do dia correspondente
--      hr_contrato_meses_exactos(inicio, fim)     inversa (NULL se nao bate)
--      hr_contrato_somar_duracao(fim, valor, unidade)  fim do ciclo seguinte
--      hr_contrato_duracao_inicial(inicio, fim)   valor e unidade do 1.o ciclo
--    Regra dos meses (a mesma do ecra, novaPessoaDatas.ts): somar N meses ao
--    inicio; se o dia do inicio nao existe no mes de destino, o fim e o ultimo
--    dia desse mes (31/01 + 1 = 28/02); senao e o dia correspondente menos um
--    (01/01/2027 + 12 = 31/12/2027). Em dias: inicio + N - 1.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) A permissao NAO e atribuida a nenhum papel aqui. No branch de RH, a
--    atribuicao ao super_admin vai num ficheiro SO do branch (fora do repositorio).
-- b) O branch de RH tem uma so organizacao (a nike). Nada vai para producao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: largar as funcoes
-- hr_contrato_*, a RPC, a tabela e a permissao.
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120060000  pessoas_vinculos (e a permissao hr.pessoas.vinculos.edit/view)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe.';
  END IF;

  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'update_updated_at_column() nao existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.vinculos.edit nao esta no catalogo.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.view') THEN
    RAISE EXCEPTION 'hr.pessoas.vinculos.view nao esta no catalogo.';
  END IF;

  IF to_regclass('public.hr_regras_fim_contrato') IS NOT NULL THEN
    RAISE EXCEPTION 'public.hr_regras_fim_contrato ja existe -- investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A permissao (perigosa, sem papel por omissao)
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.contratos.regras.gerir', 'Configurar regras de fim de contrato',
   'PERIGOSA. Liga e desliga, para a empresa toda, os avisos de fim de contrato e a renovacao automatica, e define quantas renovacoes cada contrato pode ter, a duracao de cada uma e o que acontece ao atingir o limite (por exemplo, passar a contrato sem termo). Pode alterar o estado de muitos contratos de uma so vez, sem ninguem os tocar. Nao e atribuida a papel nenhum por omissao: atribui-se a quem decide a politica de contratos da empresa.',
   'hr', 'hr.pessoas.vinculos.edit', 214, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- 2. A tabela
-- ==============================================================================
CREATE TABLE public.hr_regras_fim_contrato (
  id                          uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL,

  ativo                       boolean NOT NULL DEFAULT false,
  dias_aviso                  integer NOT NULL DEFAULT 30,
  renovacao_automatica        boolean NOT NULL DEFAULT false,
  max_renovacoes              integer NOT NULL DEFAULT 0,
  duracao_renovacao_valor     integer,
  duracao_renovacao_unidade   text,
  ao_atingir_limite           text NOT NULL DEFAULT 'decisao_manual_rh',

  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid,

  CONSTRAINT hr_regras_fim_contrato_pkey PRIMARY KEY (id),
  CONSTRAINT hr_regras_fim_contrato_org_key UNIQUE (organization_id),
  CONSTRAINT hr_regras_fim_contrato_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_regras_fim_contrato_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_regras_fim_contrato_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_regras_fim_contrato_dias_aviso_valido CHECK (dias_aviso BETWEEN 1 AND 365),
  CONSTRAINT hr_regras_fim_contrato_max_renovacoes_valido CHECK (max_renovacoes >= 0),
  CONSTRAINT hr_regras_fim_contrato_duracao_coerente CHECK (
    (duracao_renovacao_valor IS NULL) = (duracao_renovacao_unidade IS NULL)
    AND (duracao_renovacao_valor IS NULL OR duracao_renovacao_valor > 0)
    AND (duracao_renovacao_unidade IS NULL OR duracao_renovacao_unidade IN ('meses', 'dias'))
  ),
  CONSTRAINT hr_regras_fim_contrato_limite_valido CHECK (
    ao_atingir_limite IN ('converter_sem_termo', 'decisao_manual_rh')
  )
);

COMMENT ON TABLE public.hr_regras_fim_contrato IS
'As regras DA EMPRESA para o fim dos contratos com prazo (termo certo, termo incerto, duracao muito curta e temporario): avisos antes do fim, renovacao automatica, numero maximo de renovacoes, duracao de cada uma e o que acontece ao atingir o limite. Uma linha por organizacao; sem linha ou com ativo = false a funcionalidade esta desligada e nada acontece sozinho. Sao os DEFAULTS: cada contrato pode ter excepcoes proprias em pessoas_vinculos (colunas fim_*; NULL = herda daqui). Nenhum valor legal esta no codigo. Escrita so pela RPC rpc_hr_regras_fim_contrato_guardar (hr.contratos.regras.gerir). Desde 20261210320000.';
COMMENT ON COLUMN public.hr_regras_fim_contrato.ativo IS
'Desligado por omissao. A rotina diaria so corre (avisos, renovacoes automaticas, conversoes e fins) para organizacoes com ativo = true.';
COMMENT ON COLUMN public.hr_regras_fim_contrato.dias_aviso IS
'Quantos dias antes do fim do ciclo o responsavel directo e o RH sao avisados (1 a 365). O aviso repete a 7 dias do fim (se dias_aviso for superior a 7) e no dia do fim, enquanto o responsavel nao indicar nada.';
COMMENT ON COLUMN public.hr_regras_fim_contrato.renovacao_automatica IS
'Se, chegada a data de fim e sem ninguem indicar que nao quer continuar, o contrato e prolongado sozinho (o MESMO contrato: data_fim avanca, nao ha contrato novo). Omissao: nao.';
COMMENT ON COLUMN public.hr_regras_fim_contrato.max_renovacoes IS
'Quantas renovacoes (automaticas ou manuais) um contrato pode ter. Omissao 0. O numero vem da politica da empresa, nao do codigo.';
COMMENT ON COLUMN public.hr_regras_fim_contrato.duracao_renovacao_valor IS
'Duracao de cada renovacao, na unidade de duracao_renovacao_unidade. NULL (com a unidade tambem NULL) = igual a duracao do contrato inicial.';
COMMENT ON COLUMN public.hr_regras_fim_contrato.ao_atingir_limite IS
'O que acontece no fim de um ciclo quando renovacoes_realizadas ja atingiu max_renovacoes: converter_sem_termo (o contrato passa a sem_termo, sem data de fim) ou decisao_manual_rh (nada acontece sozinho; fica em vigor e o RH e avisado todos os dias ate decidir).';

DROP TRIGGER IF EXISTS trg_hr_regras_fim_contrato_updated_at ON public.hr_regras_fim_contrato;
CREATE TRIGGER trg_hr_regras_fim_contrato_updated_at
  BEFORE UPDATE ON public.hr_regras_fim_contrato
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Escrita fechada: so a RPC (verifica a permissao com a organizacao e valida os valores).
REVOKE ALL ON TABLE public.hr_regras_fim_contrato FROM anon;
REVOKE ALL ON TABLE public.hr_regras_fim_contrato FROM authenticated;
GRANT SELECT ON TABLE public.hr_regras_fim_contrato TO authenticated;
GRANT ALL ON TABLE public.hr_regras_fim_contrato TO service_role;

ALTER TABLE public.hr_regras_fim_contrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_regras_fim_contrato_select ON public.hr_regras_fim_contrato;
CREATE POLICY hr_regras_fim_contrato_select ON public.hr_regras_fim_contrato
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.view', organization_id)));

DROP POLICY IF EXISTS hr_regras_fim_contrato_block_insert ON public.hr_regras_fim_contrato;
CREATE POLICY hr_regras_fim_contrato_block_insert ON public.hr_regras_fim_contrato
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS hr_regras_fim_contrato_block_update ON public.hr_regras_fim_contrato;
CREATE POLICY hr_regras_fim_contrato_block_update ON public.hr_regras_fim_contrato
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS hr_regras_fim_contrato_block_delete ON public.hr_regras_fim_contrato;
CREATE POLICY hr_regras_fim_contrato_block_delete ON public.hr_regras_fim_contrato
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ==============================================================================
-- 3. Funcoes puras de datas
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_contrato_fim_por_meses(p_inicio date, p_meses integer)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_alvo date;
BEGIN
  IF p_inicio IS NULL OR p_meses IS NULL OR p_meses < 1 THEN
    RETURN NULL;
  END IF;
  -- Somar meses cola o dia ao ultimo dia do mes de destino (31/01 + 1 mes = 28/02).
  v_alvo := (p_inicio + make_interval(months => p_meses))::date;
  -- Se o dia foi colado, o dia correspondente nao existe e o fim e esse ultimo dia.
  IF extract(day FROM p_inicio) > extract(day FROM v_alvo) THEN
    RETURN v_alvo;
  END IF;
  -- Senao e a vespera do dia correspondente.
  RETURN v_alvo - 1;
END;
$$;

COMMENT ON FUNCTION public.hr_contrato_fim_por_meses(date, integer) IS
'Data de fim de um contrato que comeca em p_inicio e dura p_meses meses: a vespera do dia correspondente (01/01/2027 + 12 = 31/12/2027; 15/10/2026 + 6 = 14/04/2027) ou, se o dia nao existe no mes de destino, o ultimo dia desse mes (31/01/2027 + 1 = 28/02/2027). NULL se faltar um argumento ou p_meses < 1. A mesma regra do ecra (novaPessoaDatas.ts). Desde 20261210320000.';

CREATE OR REPLACE FUNCTION public.hr_contrato_meses_exactos(p_inicio date, p_fim date)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n   integer;
  v_fim date;
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RETURN NULL;
  END IF;
  FOR v_n IN 1..240 LOOP
    v_fim := public.hr_contrato_fim_por_meses(p_inicio, v_n);
    IF v_fim = p_fim THEN
      RETURN v_n;
    END IF;
    IF v_fim > p_fim THEN
      RETURN NULL;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_contrato_meses_exactos(date, date) IS
'A inversa de hr_contrato_fim_por_meses: o N (1 a 240) tal que o fim de um contrato que comeca em p_inicio e dura N meses e p_fim; NULL se p_fim nao corresponde a um numero inteiro de meses. Desde 20261210320000.';

CREATE OR REPLACE FUNCTION public.hr_contrato_somar_duracao(p_fim_anterior date, p_valor integer, p_unidade text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_inicio date;
BEGIN
  IF p_fim_anterior IS NULL OR p_valor IS NULL OR p_valor < 1 THEN
    RETURN NULL;
  END IF;
  -- O ciclo seguinte comeca no dia a seguir ao fim do anterior.
  v_inicio := p_fim_anterior + 1;
  IF p_unidade = 'meses' THEN
    RETURN public.hr_contrato_fim_por_meses(v_inicio, p_valor);
  ELSIF p_unidade = 'dias' THEN
    RETURN v_inicio + p_valor - 1;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_contrato_somar_duracao(date, integer, text) IS
'O fim do ciclo seguinte: o ciclo comeca no dia a seguir a p_fim_anterior e dura p_valor meses (regra de hr_contrato_fim_por_meses) ou p_valor dias (inicio + N - 1). NULL se algum argumento for invalido ou a unidade nao for meses nem dias. Desde 20261210320000.';

CREATE OR REPLACE FUNCTION public.hr_contrato_duracao_inicial(p_inicio date, p_fim_inicial date)
RETURNS TABLE (valor integer, unidade text)
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_meses integer;
BEGIN
  IF p_inicio IS NULL OR p_fim_inicial IS NULL OR p_fim_inicial < p_inicio THEN
    RETURN;
  END IF;
  v_meses := public.hr_contrato_meses_exactos(p_inicio, p_fim_inicial);
  IF v_meses IS NOT NULL THEN
    RETURN QUERY SELECT v_meses, 'meses'::text;
  ELSE
    RETURN QUERY SELECT (p_fim_inicial - p_inicio + 1)::integer, 'dias'::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.hr_contrato_duracao_inicial(date, date) IS
'A duracao do contrato inicial como (valor, unidade): em meses se o fim for um numero inteiro de meses a contar do inicio, senao em dias (fim - inicio + 1). Nao devolve linha se as datas forem invalidas. E o que "duracao da renovacao = igual a inicial" usa. Desde 20261210320000.';

REVOKE ALL ON FUNCTION public.hr_contrato_fim_por_meses(date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contrato_fim_por_meses(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_contrato_fim_por_meses(date, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_contrato_meses_exactos(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contrato_meses_exactos(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_contrato_meses_exactos(date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_contrato_somar_duracao(date, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contrato_somar_duracao(date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_contrato_somar_duracao(date, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_contrato_duracao_inicial(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contrato_duracao_inicial(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_contrato_duracao_inicial(date, date) TO authenticated, service_role;

-- ==============================================================================
-- 4. A RPC que guarda as regras da organizacao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_regras_fim_contrato_guardar(
  p_organization_id       uuid,
  p_ativo                 boolean,
  p_dias_aviso            integer,
  p_renovacao_automatica  boolean,
  p_max_renovacoes        integer,
  p_duracao_valor         integer,
  p_duracao_unidade       text,
  p_ao_atingir_limite     text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_user uuid;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.contratos.regras.gerir', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para configurar as regras de fim de contrato.' USING ERRCODE = 'HRV05';
  END IF;

  IF p_ativo IS NULL OR p_dias_aviso IS NULL OR p_renovacao_automatica IS NULL
     OR p_max_renovacoes IS NULL OR p_ao_atingir_limite IS NULL THEN
    RAISE EXCEPTION 'Configuracao incompleta: ativo, dias de aviso, renovacao automatica, maximo de renovacoes e comportamento no limite sao obrigatorios.'
      USING ERRCODE = 'HRV13';
  END IF;

  IF p_dias_aviso < 1 OR p_dias_aviso > 365 THEN
    RAISE EXCEPTION 'Os dias de aviso tem de estar entre 1 e 365; recebi %.', p_dias_aviso USING ERRCODE = 'HRV13';
  END IF;

  IF p_max_renovacoes < 0 THEN
    RAISE EXCEPTION 'O maximo de renovacoes nao pode ser negativo; recebi %.', p_max_renovacoes USING ERRCODE = 'HRV13';
  END IF;

  IF p_ao_atingir_limite NOT IN ('converter_sem_termo', 'decisao_manual_rh') THEN
    RAISE EXCEPTION 'O comportamento ao atingir o limite tem de ser converter_sem_termo ou decisao_manual_rh; recebi %.', p_ao_atingir_limite
      USING ERRCODE = 'HRV13';
  END IF;

  IF (p_duracao_valor IS NULL) <> (p_duracao_unidade IS NULL) THEN
    RAISE EXCEPTION 'A duracao da renovacao precisa do valor e da unidade, ou de nenhum dos dois (igual a duracao inicial).'
      USING ERRCODE = 'HRV13';
  END IF;

  IF p_duracao_valor IS NOT NULL AND (p_duracao_valor < 1 OR p_duracao_unidade NOT IN ('meses', 'dias')) THEN
    RAISE EXCEPTION 'A duracao da renovacao tem de ser positiva e em meses ou dias; recebi % %.', p_duracao_valor, p_duracao_unidade
      USING ERRCODE = 'HRV13';
  END IF;

  SELECT au.id INTO v_user FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  INSERT INTO public.hr_regras_fim_contrato
    (organization_id, ativo, dias_aviso, renovacao_automatica, max_renovacoes,
     duracao_renovacao_valor, duracao_renovacao_unidade, ao_atingir_limite, created_by, updated_by)
  VALUES
    (p_organization_id, p_ativo, p_dias_aviso, p_renovacao_automatica, p_max_renovacoes,
     p_duracao_valor, p_duracao_unidade, p_ao_atingir_limite, v_user, v_user)
  ON CONFLICT (organization_id) DO UPDATE SET
    ativo                     = EXCLUDED.ativo,
    dias_aviso                = EXCLUDED.dias_aviso,
    renovacao_automatica      = EXCLUDED.renovacao_automatica,
    max_renovacoes            = EXCLUDED.max_renovacoes,
    duracao_renovacao_valor   = EXCLUDED.duracao_renovacao_valor,
    duracao_renovacao_unidade = EXCLUDED.duracao_renovacao_unidade,
    ao_atingir_limite         = EXCLUDED.ao_atingir_limite,
    updated_by                = EXCLUDED.updated_by
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_regras_fim_contrato_guardar(uuid, boolean, integer, boolean, integer, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_regras_fim_contrato_guardar(uuid, boolean, integer, boolean, integer, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_fim_contrato_guardar(uuid, boolean, integer, boolean, integer, integer, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_regras_fim_contrato_guardar(uuid, boolean, integer, boolean, integer, integer, text, text) IS
'Cria ou actualiza (upsert por organizacao) as regras de fim de contrato da empresa. Argumentos: p_organization_id, p_ativo, p_dias_aviso (1 a 365), p_renovacao_automatica, p_max_renovacoes (>= 0), p_duracao_valor e p_duracao_unidade (meses | dias; os dois NULL = igual a duracao inicial), p_ao_atingir_limite (converter_sem_termo | decisao_manual_rh). Devolve o id da linha. Exige hr.contratos.regras.gerir na organizacao (HRV05 sem sessao ou sem permissao); valores invalidos dao HRV13. Desde 20261210320000.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_perm   record;
  v_n      integer;
  v_priv   text;
BEGIN
  -- 1. Permissao: no catalogo, perigosa, pendurada em hr.pessoas.vinculos.edit, sem papel.
  SELECT * INTO v_perm FROM public.anew_permissions WHERE code = 'hr.contratos.regras.gerir';
  IF v_perm.code IS NULL THEN
    RAISE EXCEPTION 'hr.contratos.regras.gerir nao ficou no catalogo.';
  END IF;
  IF v_perm.is_dangerous IS NOT TRUE THEN
    RAISE EXCEPTION 'hr.contratos.regras.gerir devia estar marcada is_dangerous.';
  END IF;
  IF v_perm.parent_code IS DISTINCT FROM 'hr.pessoas.vinculos.edit' THEN
    RAISE EXCEPTION 'hr.contratos.regras.gerir devia pendurar em hr.pessoas.vinculos.edit; pendura em %.', coalesce(v_perm.parent_code, '(nada)');
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_role_permissions WHERE permission_code = 'hr.contratos.regras.gerir';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'hr.contratos.regras.gerir esta atribuida a % papel(eis); devia nascer sem nenhum.', v_n;
  END IF;

  -- 2. Tabela: RLS, 4 politicas, so SELECT para authenticated, nada para anon.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_regras_fim_contrato'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activa em hr_regras_fim_contrato.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_regras_fim_contrato';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'hr_regras_fim_contrato ficou com % politicas, esperavam-se 4.', v_n;
  END IF;
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_priv
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'hr_regras_fim_contrato' AND grantee = 'authenticated';
  IF v_priv IS DISTINCT FROM 'SELECT' THEN
    RAISE EXCEPTION 'hr_regras_fim_contrato: authenticated tem "%", esperava-se exactamente SELECT.', coalesce(v_priv, '(nenhum)');
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'hr_regras_fim_contrato' AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'hr_regras_fim_contrato ficou com grant a anon.';
  END IF;

  -- 3. A RPC: SECURITY DEFINER, search_path fixo, sem anon.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.rpc_hr_regras_fim_contrato_guardar(uuid, boolean, integer, boolean, integer, integer, text, text)'::regprocedure
       AND p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_regras_fim_contrato_guardar devia ser SECURITY DEFINER com search_path fixo.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_regras_fim_contrato_guardar(uuid, boolean, integer, boolean, integer, integer, text, text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.rpc_hr_regras_fim_contrato_guardar(uuid, boolean, integer, boolean, integer, integer, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ou PUBLIC conseguem executar rpc_hr_regras_fim_contrato_guardar.';
  END IF;

  -- 4. Os vectores das datas (os mesmos do ecra).
  IF public.hr_contrato_fim_por_meses('2027-01-31', 1)  IS DISTINCT FROM DATE '2027-02-28'
     OR public.hr_contrato_fim_por_meses('2028-01-31', 1)  IS DISTINCT FROM DATE '2028-02-29'
     OR public.hr_contrato_fim_por_meses('2027-01-01', 12) IS DISTINCT FROM DATE '2027-12-31'
     OR public.hr_contrato_fim_por_meses('2027-03-01', 6)  IS DISTINCT FROM DATE '2027-08-31'
     OR public.hr_contrato_fim_por_meses('2027-09-01', 6)  IS DISTINCT FROM DATE '2028-02-29'
     OR public.hr_contrato_fim_por_meses('2027-01-30', 1)  IS DISTINCT FROM DATE '2027-02-28'
     OR public.hr_contrato_fim_por_meses('2028-02-29', 12) IS DISTINCT FROM DATE '2029-02-28'
     OR public.hr_contrato_fim_por_meses('2027-02-28', 1)  IS DISTINCT FROM DATE '2027-03-27'
     OR public.hr_contrato_fim_por_meses('2026-10-15', 6)  IS DISTINCT FROM DATE '2027-04-14' THEN
    RAISE EXCEPTION 'hr_contrato_fim_por_meses nao bate com os vectores da regra (vespera do dia correspondente).';
  END IF;

  IF public.hr_contrato_meses_exactos('2027-01-31', '2027-02-28') IS DISTINCT FROM 1
     OR public.hr_contrato_meses_exactos('2027-01-01', '2027-12-31') IS DISTINCT FROM 12
     OR public.hr_contrato_meses_exactos('2027-01-01', '2027-02-15') IS NOT NULL THEN
    RAISE EXCEPTION 'hr_contrato_meses_exactos nao inverte hr_contrato_fim_por_meses.';
  END IF;

  IF public.hr_contrato_somar_duracao('2027-08-31', 6, 'meses') IS DISTINCT FROM DATE '2028-02-29'
     OR public.hr_contrato_somar_duracao('2027-08-31', 30, 'dias') IS DISTINCT FROM DATE '2027-09-30'
     OR public.hr_contrato_somar_duracao('2027-08-31', 6, 'anos') IS NOT NULL
     OR public.hr_contrato_somar_duracao(NULL, 6, 'meses') IS NOT NULL THEN
    RAISE EXCEPTION 'hr_contrato_somar_duracao nao bate com os vectores.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.hr_contrato_duracao_inicial('2027-03-01', '2027-08-31') d WHERE d.valor = 6 AND d.unidade = 'meses')
     OR NOT EXISTS (SELECT 1 FROM public.hr_contrato_duracao_inicial('2027-03-01', '2027-04-14') d WHERE d.valor = 45 AND d.unidade = 'dias') THEN
    RAISE EXCEPTION 'hr_contrato_duracao_inicial nao devolve (6, meses) nem (45, dias) nos casos de teste.';
  END IF;

  RAISE NOTICE 'OK: permissao hr.contratos.regras.gerir perigosa e sem papel; hr_regras_fim_contrato com RLS e escrita so pela RPC; funcoes de datas conferidas com 9 vectores.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_r        public.hr_regras_fim_contrato%ROWTYPE;
  v_cons     text;
  v_sqlstate text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo das regras foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike. Esta tabela e nova: a nike ainda nao tem linha.
    INSERT INTO public.hr_regras_fim_contrato (organization_id) VALUES (v_org_nike)
    RETURNING * INTO v_r;

    -- 1. Os defaults: desligado, 30 dias, sem renovacao automatica, 0 renovacoes,
    --    duracao igual a inicial, decisao manual no limite.
    IF v_r.ativo IS NOT FALSE OR v_r.dias_aviso <> 30 OR v_r.renovacao_automatica IS NOT FALSE
       OR v_r.max_renovacoes <> 0 OR v_r.duracao_renovacao_valor IS NOT NULL
       OR v_r.duracao_renovacao_unidade IS NOT NULL OR v_r.ao_atingir_limite <> 'decisao_manual_rh' THEN
      RAISE EXCEPTION 'Os defaults das regras nao sao os esperados.' USING ERRCODE = 'HR964';
    END IF;

    -- 2. Cada CHECK recusa o que lhe cabe.
    v_cons := NULL;
    BEGIN
      UPDATE public.hr_regras_fim_contrato SET dias_aviso = 0 WHERE id = v_r.id;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_regras_fim_contrato_dias_aviso_valido' THEN
      RAISE EXCEPTION 'dias_aviso = 0 devia ser recusado por hr_regras_fim_contrato_dias_aviso_valido; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR964';
    END IF;

    v_cons := NULL;
    BEGIN
      UPDATE public.hr_regras_fim_contrato SET duracao_renovacao_valor = 6 WHERE id = v_r.id;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_regras_fim_contrato_duracao_coerente' THEN
      RAISE EXCEPTION 'Valor sem unidade devia ser recusado por hr_regras_fim_contrato_duracao_coerente; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR964';
    END IF;

    v_cons := NULL;
    BEGIN
      UPDATE public.hr_regras_fim_contrato SET ao_atingir_limite = 'apagar' WHERE id = v_r.id;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_regras_fim_contrato_limite_valido' THEN
      RAISE EXCEPTION 'ao_atingir_limite invalido devia ser recusado por hr_regras_fim_contrato_limite_valido; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR964';
    END IF;

    -- 3. Valores validos sao aceites (duracao em dias; limite converter).
    UPDATE public.hr_regras_fim_contrato
       SET ativo = true, dias_aviso = 45, renovacao_automatica = true, max_renovacoes = 2,
           duracao_renovacao_valor = 6, duracao_renovacao_unidade = 'meses', ao_atingir_limite = 'converter_sem_termo'
     WHERE id = v_r.id;

    -- 4. A RPC recusa quem nao tem permissao (utilizador fabricado, sem papel).
    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.rpc_hr_regras_fim_contrato_guardar(v_org_nike, true, 30, false, 0, NULL, NULL, 'decisao_manual_rh');
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'A RPC devia recusar com HRV05 quem nao tem hr.contratos.regras.gerir; foi %.', coalesce(v_sqlstate, '(nada)')
        USING ERRCODE = 'HR964';
    END IF;

    RAISE EXCEPTION 'teste_hr_contratos_regras_organizacao_20261210320000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo das regras de fim de contrato falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): defaults das regras, CHECKs de dias, duracao e limite, valores validos aceites, RPC recusa sem permissao com HRV05. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho; as seis migrations (320000 a 370000)
--    entram no mesmo commit que os ecras.
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Nunca migration repair.
-- 3. Correr os testes ANTES do push. Depois de aplicada, NAO se volta atras para
--    demonstrar o vermelho.
-- ==============================================================================
