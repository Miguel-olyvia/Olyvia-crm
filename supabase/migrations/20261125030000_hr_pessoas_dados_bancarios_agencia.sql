-- ==============================================================================
-- Agencia bancaria -- o unico campo da Folha de Cadastro em papel que ainda
-- nao tinha onde ir parar na ficha.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- pessoas_dados_bancarios guarda formato_conta, titular, banco,
-- conta_ultimos4, conta_pais, swift, is_principal. Falta a agencia bancaria
-- (o "branch" do IBAN em Espanha/Mexico, a "sort code branch" no Reino Unido,
-- a agencia no Brasil) -- um campo de identificacao da agencia, nao do numero
-- de conta em si, e por isso NAO cifrado no Vault: nao e uma instrucao de
-- pagamento, e um dado de identificacao do balcao, tao sensivel quanto o nome
-- do banco que ja vive em claro na mesma linha.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma coluna `agencia text`, nullable, ao lado de `banco`. Sem CHECK de
-- formato: ao contrario do IBAN ou do SWIFT, a agencia nao tem uma forma
-- universal (numerica num pais, alfanumerica noutro) que valha a pena
-- policiar aqui.
--
-- Entra no unico caminho de escrita, `rpc_hr_definir_conta`, como mais um
-- parametro com DEFAULT NULL -- exactamente como titular, banco e swift ja
-- entram. A funcao TEM de ser largada e recriada (nao apenas substituida):
-- adicionar um parametro muda o numero de argumentos, e um CREATE OR REPLACE
-- com assinatura diferente cria uma SEGUNDA funcao ao lado da antiga em vez de
-- a substituir -- foi exactamente isso (duas candidatas) que ja parou o botao
-- de resolver submissoes neste projecto (ver 20261120220000). Por isso: DROP
-- da assinatura antiga de 6 argumentos, CREATE da nova de 7.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- O bloco bancario do convite de admissao (`convite-admissao` Edge Function)
-- nao grava titular, banco nem swift -- so formato e numero, via
-- `NovaPessoaPayload.conta`. Agencia segue a mesma regra: nao entra no
-- convite de admissao porque titular/banco/swift tambem nao entram; entrar so
-- ela seria inconsistente com o resto do bloco. Fica disponivel, como os
-- outros, na ficha depois de a pessoa existir.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- ALTER TABLE public.pessoas_dados_bancarios DROP COLUMN IF EXISTS agencia;
-- DROP FUNCTION IF EXISTS public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text);
-- E recriar rpc_hr_definir_conta(uuid, text, text, text, text, text) tal como
-- ficou em 20261120220000.
--
--
-- Prerequisitos:
--   20261120070000  pessoas_dados_bancarios, rpc_hr_definir_iban original
--   20261120220000  formato_conta, rename para conta_*, rpc_hr_definir_conta
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_dados_bancarios') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_dados_bancarios nao existe -- 20261120070000 tem de ir a frente na fila.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'agencia'
  ) THEN
    RAISE EXCEPTION
      'public.pessoas_dados_bancarios ja tem a coluna agencia. Investigar antes de aplicar -- pode ja ter sido aplicada por outra via.';
  END IF;

  -- Conta-se o NUMERO de argumentos; nao se compara a lista por texto.
  -- pg_get_function_identity_arguments devolve tambem os NOMES dos parametros
  -- ("p_pessoa_id uuid, p_formato text, ..."), e nunca so os tipos -- por isso
  -- a comparacao com 'uuid, text, text, text, text, text' nao batia nunca, e a
  -- guarda dizia que a funcao nao existia quando existia mesmo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta'
       AND p.pronargs = 6
  ) THEN
    RAISE EXCEPTION
      'public.rpc_hr_definir_conta(uuid,text,text,text,text,text) nao existe com a assinatura esperada -- 20261120220000 tem de ir a frente na fila, ou ja foi alterada por outra migracao entretanto.';
  END IF;
END;
$guardas$;

-- ---- A coluna ---------------------------------------------------------------
ALTER TABLE public.pessoas_dados_bancarios
  ADD COLUMN IF NOT EXISTS agencia text;

COMMENT ON COLUMN public.pessoas_dados_bancarios.agencia IS
'A agencia bancaria (branch/sort code branch/agencia, conforme o pais). Dado de identificacao do balcao, nao instrucao de pagamento -- por isso NAO cifrado no Vault, ao contrario do numero de conta. Nullable: nem todos os formatos de conta tem agencia como conceito relevante.';

-- ---- A RPC: largar a de 6 argumentos, criar a de 7 -------------------------
-- Nao se pode so CREATE OR REPLACE: um argumento a mais e uma assinatura
-- diferente, e o Postgres criaria uma SEGUNDA funcao ao lado da antiga --
-- o cenario dos dois candidatos que ja parou o botao de resolver submissoes.
DROP FUNCTION IF EXISTS public.rpc_hr_definir_conta(uuid, text, text, text, text, text);

CREATE FUNCTION public.rpc_hr_definir_conta(
  p_pessoa_id uuid,
  p_formato   text,
  p_conta     text,
  p_titular   text DEFAULT NULL,
  p_banco     text DEFAULT NULL,
  p_agencia   text DEFAULT NULL,
  p_swift     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org       uuid;
  v_conta     text;
  v_formato   text;
  v_pais      text;
  v_linha     record;
  v_secret_id uuid;
  v_anew      uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.bancarios.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  v_formato := coalesce(p_formato, 'iban');

  IF v_formato NOT IN ('iban','conta_mais_sort_code','conta_mais_routing',
                       'clabe','banco_mais_conta','outro') THEN
    RAISE EXCEPTION 'formato_invalido';
  END IF;

  -- Normalizacao unica para todos os formatos: maiusculas, sem espacos.
  v_conta := upper(regexp_replace(coalesce(p_conta, ''), '[[:space:]]', '', 'g'));

  IF v_formato = 'iban' THEN
    -- O ramo do IBAN NAO foi tocado por esta migracao: continua o mod-97
    -- completo, pela mesma funcao de 20261120070000.
    IF NOT public.hr_iban_valido(v_conta) THEN
      RAISE EXCEPTION 'iban_invalido';
    END IF;
    v_pais := left(v_conta, 2);
  ELSE
    IF v_conta !~ '^[0-9A-Z]{4,34}$' THEN
      RAISE EXCEPTION 'conta_invalida';
    END IF;
    v_pais := NULL;
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  SELECT b.id, b.conta_secret_id INTO v_linha
  FROM public.pessoas_dados_bancarios b
  WHERE b.pessoa_id = p_pessoa_id;

  IF v_linha.id IS NOT NULL AND v_linha.conta_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_linha.conta_secret_id, v_conta);
    v_secret_id := v_linha.conta_secret_id;
  ELSE
    v_secret_id := vault.create_secret(
      v_conta,
      'hr_conta:' || p_pessoa_id::text || ':' || gen_random_uuid()::text,
      'Conta bancaria de RH da pessoa ' || p_pessoa_id::text || ' (formato ' || v_formato || ')'
    );
  END IF;

  INSERT INTO public.pessoas_dados_bancarios
    (pessoa_id, organization_id, titular, banco, agencia, formato_conta,
     conta_secret_id, conta_ultimos4, conta_pais, swift,
     is_principal, created_by, updated_by)
  VALUES
    (p_pessoa_id, v_org, p_titular, p_banco, p_agencia, v_formato,
     v_secret_id, right(v_conta, 4), v_pais, p_swift,
     true, v_anew, v_anew)
  ON CONFLICT (pessoa_id) DO UPDATE SET
    titular         = EXCLUDED.titular,
    banco           = EXCLUDED.banco,
    agencia         = EXCLUDED.agencia,
    formato_conta   = EXCLUDED.formato_conta,
    conta_secret_id = EXCLUDED.conta_secret_id,
    conta_ultimos4  = EXCLUDED.conta_ultimos4,
    conta_pais      = EXCLUDED.conta_pais,
    swift           = EXCLUDED.swift,
    updated_by      = EXCLUDED.updated_by,
    updated_at      = now();

  PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, v_org, 'conta_bancaria', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) IS
'Unico caminho para escrever dados bancarios de RH, em qualquer dos seis formatos. Ganhou p_agencia em 20261125030000 (a assinatura de 6 argumentos de 20261120220000 foi LARGADA e nao mantida ao lado, pela mesma razao que rpc_hr_definir_iban foi largada nessa altura: duas candidatas deixam o PostgREST sem saber qual escolher). Exige hr.pessoas.bancarios.edit na organizacao da pessoa. Valida conforme o formato: mod-97 completo por hr_iban_valido quando formato = ''iban'', e ^[0-9A-Z]{4,34}$ nos restantes. Guarda o numero cifrado no Vault e grava na linha apenas a referencia, os ultimos quatro caracteres, o formato, a agencia (em claro -- dado de identificacao do balcao, nao instrucao de pagamento) e -- so no caso IBAN -- o pais. Registra em pessoas_acessos_sensiveis com campo = ''conta_bancaria''.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n_funcoes integer;
  v_n_antiga  integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'agencia' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'pessoas_dados_bancarios.agencia nao existe ou nao e nullable.';
  END IF;

  SELECT count(*) INTO v_n_funcoes
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta';

  IF v_n_funcoes <> 1 THEN
    RAISE EXCEPTION
      'Existem % funcoes rpc_hr_definir_conta e devia existir 1. Com mais do que uma, o PostgREST nao sabe qual escolher.',
      v_n_funcoes;
  END IF;

  SELECT count(*) INTO v_n_antiga
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta'
     AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text, text, text';

  IF v_n_antiga <> 0 THEN
    RAISE EXCEPTION 'A assinatura antiga de rpc_hr_definir_conta (6 argumentos) ainda existe -- devia ter sido largada.';
  END IF;

  IF has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'UPDATE') THEN
    RAISE EXCEPTION
      'authenticated tem INSERT ou UPDATE em pessoas_dados_bancarios. A escrita tem de passar so por rpc_hr_definir_conta -- nao aplicar neste estado.';
  END IF;

  RAISE NOTICE 'OK: agencia acrescentada (nullable), rpc_hr_definir_conta unica com 7 argumentos, escrita continua fechada.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Mexe numa RPC com chamador vivo (PessoaContaBancariaField.tsx via
--    usePessoa.ts). A migracao e a alteracao de src TEM de ir no mesmo commit.
--
-- 2. So ACRESCENTA uma coluna nullable e substitui uma RPC dentro da mesma
--    transaccao -- nao ha janela em que a base fique sem a funcao.
--
-- 3. Correr os testes ANTES do push, contra o remoto ainda por corrigir.
-- ==============================================================================
