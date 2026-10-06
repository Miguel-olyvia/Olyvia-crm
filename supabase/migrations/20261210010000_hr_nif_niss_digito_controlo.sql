-- ==============================================================================
-- NIF e NISS passam a ser validados pelo DIGITO DE CONTROLO, nao so pelo
-- formato (9 e 11 digitos). Lote A (admissao), migration 1 de 3.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- pessoas_identificacao so tem CHECK de formato (nif ~ '^[0-9]{9}$',
-- niss ~ '^[0-9]{11}$'). Um NIF inventado de nove digitos qualquer (por
-- exemplo 123456780) e aceite pelo convite, pelo formulario interno e pela
-- edicao do RH, e fica gravado como se fosse verdadeiro.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- hr_nif_valido(text): 9 digitos; soma dos 8 primeiros multiplicados por 9..2;
--   controlo = 0 se o resto da divisao por 11 for < 2, senao 11 - resto; tem de
--   ser igual ao 9.o digito. Sem regra de prefixo (os prefixos mudam e nao se
--   adivinham).
-- hr_niss_valido(text): 11 digitos, o primeiro 1 ou 2; pesos 29,23,19,17,13,11,
--   7,5,3,2 sobre os 10 primeiros; controlo = 9 - (soma mod 10); tem de ser
--   igual ao 11.o digito.
-- Ambas puras (sem dados), IMMUTABLE, devolvem false para NULL (o chamador so
-- as chama com valor).
--
-- Trigger trg_pessoas_identificacao_validar_numeros (BEFORE INSERT OR UPDATE OF
-- nif, niss): valida SO quando o valor muda. Porque trigger e nao CHECK: um
-- CHECK reavaliaria fichas antigas com numero invalido em qualquer UPDATE de
-- outra coluna e bloquearia a edicao delas. O trigger cobre os quatro
-- caminhos de escrita (convite, edicao do RH, rpc_hr_definir_niss, formulario
-- interno de criar pessoa) sem tocar no legado.
--
-- Codigos: nif_invalido -> SQLSTATE HRA11; niss_invalido -> SQLSTATE HRA12 (a
-- MESSAGE e exactamente o codigo, sem sufixo).
--
-- Espelho em TypeScript: src/lib/hr/identificadoresPt.ts (mesmo algoritmo, mesmos
-- vectores). O teste src/lib/hr/__tests__/identificadoresPt.test.ts le esta migration e
-- confirma que os vectores do bloco de conferir coincidem com os do teste.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- IMPACTO PARA A MUDELAR (unica producao real) E PARA TODAS AS ORGANIZACOES: o
-- trigger e GLOBAL. Aplica-se a todas as organizacoes e a todos os caminhos de
-- escrita (convite, edicao do RH, rpc_hr_definir_niss, formulario interno).
-- Quem hoje grave ou altere um NIF/NISS com digito errado passa a receber
-- nif_invalido/niss_invalido. A Mudelar so e afectada se usar o modulo de RH e
-- escrever NIF/NISS; os valores ja gravados nao sao reavaliados. Pedir
-- autorizacao antes de publicar. Seeds e testes (por exemplo o NISS de fantasia
-- 12345678901 de 20261201060000) NAO sao reavaliados ao reconstruir uma base,
-- porque correm antes desta migration; nada posterior a esta pode usar
-- numeros de fantasia invalidos.
--
-- Fichas antigas com numero invalido NAO sao corrigidas nem bloqueadas por esta
-- migration. O conferir apenas conta e avisa (NOTICE), so na organizacao nike.
--
--
-- -- NAO PRECISA DE CODIGO NOVO PARA FUNCIONAR ---------------------------------
--
-- Mas os ecras que mostram o erro (lote B) traduzem nif_invalido e
-- niss_invalido; ate la o utilizador ve o erro em bruto.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP TRIGGER IF EXISTS trg_pessoas_identificacao_validar_numeros
--   ON public.pessoas_identificacao;
-- DROP FUNCTION IF EXISTS public.hr_identificacao_validar_numeros();
-- DROP FUNCTION IF EXISTS public.hr_niss_valido(text);
-- DROP FUNCTION IF EXISTS public.hr_nif_valido(text);
--
--
-- Prerequisitos:
--   20261120040000  pessoas_identificacao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_identificacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_identificacao nao existe. Aplicar 20261120040000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. hr_nif_valido
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_nif_valido(p_nif text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_nif ~ '^[0-9]{9}$' THEN
      (
        SELECT CASE WHEN (s.soma % 11) < 2 THEN 0 ELSE 11 - (s.soma % 11) END
        FROM (
          SELECT sum(substr(p_nif, i, 1)::integer * (10 - i)) AS soma
          FROM generate_series(1, 8) AS i
        ) AS s
      ) = substr(p_nif, 9, 1)::integer
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.hr_nif_valido(text) IS
'NIF portugues valido: 9 digitos e digito de controlo certo (soma dos 8 primeiros por 9..2; controlo 0 se resto < 2, senao 11 - resto). Sem regra de prefixo. false para NULL. Pura, sem dados. Espelho em src/lib/hr/nifNiss.ts.';

-- ==============================================================================
-- 2. hr_niss_valido
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_niss_valido(p_niss text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_niss ~ '^[12][0-9]{10}$' THEN
      (
        SELECT 9 - (s.soma % 10)
        FROM (
          SELECT sum(
            substr(p_niss, p.i, 1)::integer
            * (ARRAY[29, 23, 19, 17, 13, 11, 7, 5, 3, 2])[p.i]
          ) AS soma
          FROM generate_series(1, 10) AS p(i)
        ) AS s
      ) = substr(p_niss, 11, 1)::integer
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.hr_niss_valido(text) IS
'NISS valido: 11 digitos, o primeiro 1 ou 2, e digito de controlo certo (pesos 29,23,19,17,13,11,7,5,3,2 sobre os 10 primeiros; controlo = 9 - (soma mod 10)). false para NULL. Pura, sem dados. Espelho em src/lib/hr/nifNiss.ts.';

REVOKE ALL ON FUNCTION public.hr_nif_valido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_nif_valido(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_nif_valido(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_nif_valido(text) TO service_role;

REVOKE ALL ON FUNCTION public.hr_niss_valido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_niss_valido(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_niss_valido(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_niss_valido(text) TO service_role;

-- ==============================================================================
-- 3. Trigger: valida so quando o valor muda
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_identificacao_validar_numeros()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.nif IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.nif IS DISTINCT FROM OLD.nif)
     AND NOT public.hr_nif_valido(NEW.nif) THEN
    RAISE EXCEPTION 'nif_invalido' USING ERRCODE = 'HRA11';
  END IF;

  IF NEW.niss IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.niss IS DISTINCT FROM OLD.niss)
     AND NOT public.hr_niss_valido(NEW.niss) THEN
    RAISE EXCEPTION 'niss_invalido' USING ERRCODE = 'HRA12';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_identificacao_validar_numeros() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_identificacao_validar_numeros() FROM anon;
REVOKE ALL ON FUNCTION public.hr_identificacao_validar_numeros() FROM authenticated;

COMMENT ON FUNCTION public.hr_identificacao_validar_numeros() IS
'Trigger de pessoas_identificacao: recusa NIF (HRA11 nif_invalido) e NISS (HRA12 niss_invalido) com digito de controlo errado, SO quando o valor muda e nao e NULL -- fichas antigas com numero invalido continuam editaveis noutras colunas. Trigger e nao CHECK de proposito: um CHECK reavaliava o legado.';

DROP TRIGGER IF EXISTS trg_pessoas_identificacao_validar_numeros
  ON public.pessoas_identificacao;
CREATE TRIGGER trg_pessoas_identificacao_validar_numeros
  BEFORE INSERT OR UPDATE OF nif, niss ON public.pessoas_identificacao
  FOR EACH ROW EXECUTE FUNCTION public.hr_identificacao_validar_numeros();

-- ==============================================================================
-- Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  c_org_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_nif_invalidos  bigint;
  v_niss_invalidos bigint;
BEGIN
  -- Vectores ao vivo (os mesmos de src/lib/hr/__tests__/identificadoresPt.test.ts).
  IF NOT public.hr_nif_valido('123456789') THEN
    RAISE EXCEPTION 'hr_nif_valido(123456789) devia ser true.';
  END IF;
  IF public.hr_nif_valido('123456780') THEN
    RAISE EXCEPTION 'hr_nif_valido(123456780) devia ser false.';
  END IF;
  IF public.hr_nif_valido('12345678') THEN
    RAISE EXCEPTION 'hr_nif_valido(12345678) devia ser false (8 digitos).';
  END IF;
  IF public.hr_nif_valido('12345678a') THEN
    RAISE EXCEPTION 'hr_nif_valido(12345678a) devia ser false (letra).';
  END IF;
  IF public.hr_nif_valido(NULL) THEN
    RAISE EXCEPTION 'hr_nif_valido(NULL) devia ser false.';
  END IF;

  IF NOT public.hr_niss_valido('12345678902') THEN
    RAISE EXCEPTION 'hr_niss_valido(12345678902) devia ser true.';
  END IF;
  IF public.hr_niss_valido('12345678901') THEN
    RAISE EXCEPTION 'hr_niss_valido(12345678901) devia ser false.';
  END IF;
  IF public.hr_niss_valido('1234567890') THEN
    RAISE EXCEPTION 'hr_niss_valido(1234567890) devia ser false (10 digitos).';
  END IF;
  IF public.hr_niss_valido('32345678902') THEN
    RAISE EXCEPTION 'hr_niss_valido(32345678902) devia ser false (primeiro digito 3).';
  END IF;
  IF public.hr_niss_valido(NULL) THEN
    RAISE EXCEPTION 'hr_niss_valido(NULL) devia ser false.';
  END IF;

  -- O trigger existe, e so nos dois campos.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.pessoas_identificacao'::regclass
       AND t.tgname = 'trg_pessoas_identificacao_validar_numeros'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger trg_pessoas_identificacao_validar_numeros nao ficou criado.';
  END IF;

  -- Privilegios: puras abertas a authenticated e service_role; trigger fechado.
  IF has_function_privilege('anon', 'public.hr_nif_valido(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_niss_valido(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_nif_valido ou hr_niss_valido ficou executavel por anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hr_nif_valido(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_niss_valido(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_nif_valido / hr_niss_valido deviam ser executaveis por authenticated e service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.hr_identificacao_validar_numeros()', 'EXECUTE') THEN
    RAISE EXCEPTION 'A funcao do trigger ficou executavel por authenticated.';
  END IF;

  -- Legado: so conta, so na organizacao nike, e nunca falha a migration.
  SELECT count(*) FILTER (WHERE i.nif IS NOT NULL AND NOT public.hr_nif_valido(i.nif)),
         count(*) FILTER (WHERE i.niss IS NOT NULL AND NOT public.hr_niss_valido(i.niss))
    INTO v_nif_invalidos, v_niss_invalidos
    FROM public.pessoas_identificacao i
   WHERE i.organization_id = c_org_nike;

  RAISE NOTICE 'OK: hr_nif_valido, hr_niss_valido e o trigger validados. Na organizacao nike ha % ficha(s) com NIF invalido e % com NISS invalido (legado; nao bloqueado, so avisado).',
    v_nif_invalidos, v_niss_invalidos;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. So acrescenta funcoes e um trigger; a unica mudanca de comportamento e que
--    um NIF ou NISS NOVO (ou alterado) com digito de controlo errado passa a
--    ser recusado. Valores ja gravados nao sao reavaliados.
-- 2. Mudar de NIF/NISS por qualquer caminho exige agora um numero real: quem
--    use numeros de fantasia em testes (nike) tem de passar a usar validos
--    (123456789 e 12345678902 passam).
-- 3. O trigger e global (todas as organizacoes, a Mudelar incluida): ver o
--    cabecalho. Listar `supabase migration list --linked` antes do push e nao
--    o fazer a partir de um worktree nao reconciliado com o remoto (ha muitas
--    migrations so locais e centenas so no remoto).
-- ==============================================================================
