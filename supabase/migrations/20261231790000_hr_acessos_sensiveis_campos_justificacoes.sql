-- ==============================================================================
-- Migration A: alargar o CHECK de pessoas_acessos_sensiveis.campo, com a lista
-- COMPLETA (14 valores). E uma CORRECCAO de tres funcionalidades que ja existem
-- e o pre-requisito da justificacao do dia (migration B, 20261231800000).
--
-- RASCUNHO. NAO APLICADO. Vive em supabase/rascunhos/ e so passa para
-- supabase/migrations/ depois de revisto e depois de reproduzido o defeito.
--
--
-- -- O PROBLEMA (lido no catalogo da base RH a 27/10, NAO chamado) -------------
--
-- O CHECK pessoas_acessos_sensiveis_campo_valido aceita hoje 10 valores:
--   niss, iban, conta_bancaria, incapacidade, retribuicao, documento,
--   sindicalizacao, horas_contratadas, anexo_cartao_cidadao,
--   anexo_comprovativo_iban
--
-- Mas tres RPCs que existem registam o acesso com valores que la nao estao,
-- ANTES de devolver o texto (lido com pg_get_functiondef/prosrc):
--   rpc_hr_falta_ver_justificacao     -> 'falta_justificacao'
--   rpc_hr_ausencia_ver_justificacao  -> 'ausencia_justificacao'
--   rpc_hr_ausencia_ver_motivo        -> 'ausencia_motivo'
-- O INSERT em pessoas_acessos_sensiveis viola o CHECK e a excepcao acontece
-- antes do RETURN: as tres devem falhar em TODAS as chamadas. Ninguem consegue
-- ler a justificacao de uma falta, a de uma ausencia, nem o motivo de uma
-- ausencia pelo caminho auditado.
--
-- 'justificacao_dia' e o valor novo que a migration B usa
-- (rpc_hr_justificacao_dia_ver_texto).
--
--
-- -- ANTES DO PUSH (obrigatorio) ------------------------------------------------
--
-- 1. Reproduzir o defeito na nike, contra o remoto AINDA por corrigir (e ai
--    que o vermelho existe legitimamente): chamar rpc_hr_falta_ver_justificacao
--    numa falta da nike com justificacao, como utilizador com
--    hr.assiduidade.justificacao.view. Esperado: 23514, violacao de
--    pessoas_acessos_sensiveis_campo_valido. Nunca na Mudelar. Depois do push
--    nao se volta atras para o demonstrar.
-- 2. Listar o que esta pendente (migration list --linked) imediatamente antes.
-- 3. Reler o CHECK no remoto: se alguem lhe acrescentou um valor entretanto, a
--    guarda desta migration para (ver abaixo) e o valor entra na lista.
--
--
-- -- A LICAO DESTA CONSTRAINT ---------------------------------------------------
--
-- Ja perdeu 'conta_bancaria' duas vezes por listas escritas de cor
-- (20261207011900). Por isso:
--   * a lista vive UMA vez, em v_valores, e o ADD CONSTRAINT e construido a
--     partir dela;
--   * a guarda recusa aplicar se o CHECK actual tiver um valor que a lista nova
--     nao tenha (a lista nova tem de ser SUPERCONJUNTO da actual);
--   * o conferir compara o conjunto EXACTO (nos dois sentidos), extraido da
--     definicao, e nao por LIKE ('iban' casava com 'anexo_comprovativo_iban');
--   * o conferir verifica ainda que TODOS os valores literais que as funcoes do
--     schema public passam a hr_registar_acesso_sensivel estao no CHECK -- e
--     esta a verificacao que teria apanhado o defeito.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Nao se reverte: reverter e voltar a partir as tres leituras auditadas.
--
-- Prerequisitos:
--   20261120040000  pessoas_acessos_sensiveis e a constraint
--   20261207004200  rpc_hr_falta_ver_justificacao
-- ==============================================================================

-- ---- A alteracao ------------------------------------------------------------
DO $altera$
DECLARE
  -- A lista COMPLETA, e a unica fonte desta migration. Quem acrescentar um
  -- valor novo no futuro acrescenta-o aqui, e no conferir.
  v_valores text[] := ARRAY[
    'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
    'documento', 'sindicalizacao', 'horas_contratadas',
    'anexo_cartao_cidadao', 'anexo_comprovativo_iban',
    'falta_justificacao', 'ausencia_justificacao', 'ausencia_motivo',
    'justificacao_dia'
  ];
  v_definicao text;
  v_actuais   text[];
  v_fora      text;
  v_ddl       text;
BEGIN
  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_acessos_sensiveis nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definicao
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname = 'pessoas_acessos_sensiveis_campo_valido';

  IF v_definicao IS NULL THEN
    RAISE EXCEPTION 'A constraint pessoas_acessos_sensiveis_campo_valido nao existe. Investigar antes de aplicar.';
  END IF;

  -- Os valores actuais, um a um, tirados da definicao ('x'::text).
  SELECT coalesce(array_agg(m[1] ORDER BY m[1]), '{}'::text[]) INTO v_actuais
    FROM regexp_matches(v_definicao, '''([a-z_]+)''::text', 'g') AS m;

  IF cardinality(v_actuais) = 0 THEN
    RAISE EXCEPTION 'Nao consegui ler os valores do CHECK actual (definicao: %). Investigar antes de aplicar.', v_definicao;
  END IF;

  -- A lista nova tem de conter TODOS os actuais. Se alguem acrescentou um valor
  -- entretanto, para-se aqui em vez de o perder (a licao de conta_bancaria).
  SELECT string_agg(a, ', ' ORDER BY a) INTO v_fora
    FROM unnest(v_actuais) AS a
   WHERE a <> ALL (v_valores);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION
      'O CHECK actual aceita valores que a lista desta migration nao tem: %. Acrescenta-los a v_valores (aqui e no conferir) antes de aplicar.', v_fora;
  END IF;

  -- Ja aceita tudo? Entao nao ha nada a fazer: a migration e idempotente.
  IF v_valores <@ v_actuais THEN
    RAISE NOTICE 'O CHECK ja aceita os % valores; nada a fazer.', cardinality(v_valores);
    RETURN;
  END IF;

  -- Nenhuma linha existente pode ficar ilegal (a lista nova e superconjunto,
  -- por isso nunca deve acontecer).
  SELECT string_agg(DISTINCT s.campo, ', ' ORDER BY s.campo) INTO v_fora
    FROM public.pessoas_acessos_sensiveis s
   WHERE s.campo <> ALL (v_valores);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Ha linhas com campo fora da lista nova: %. Acrescentar esses valores antes de aplicar.', v_fora;
  END IF;

  ALTER TABLE public.pessoas_acessos_sensiveis
    DROP CONSTRAINT pessoas_acessos_sensiveis_campo_valido;

  -- Construido a partir de v_valores, em forma ARRAY['x', ...]: e assim que
  -- pg_get_constraintdef o devolve como 'x'::text, que o conferir sabe ler.
  SELECT 'ALTER TABLE public.pessoas_acessos_sensiveis ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido CHECK (campo = ANY (ARRAY['
         || string_agg(quote_literal(v), ', ' ORDER BY o) || ']))'
    INTO v_ddl
    FROM unnest(v_valores) WITH ORDINALITY AS u(v, o);

  EXECUTE v_ddl;

  RAISE NOTICE 'CHECK reescrito com os % valores.', cardinality(v_valores);
END;
$altera$;

COMMENT ON CONSTRAINT pessoas_acessos_sensiveis_campo_valido ON public.pessoas_acessos_sensiveis IS
'Os campos cujo acesso se regista. ATENCAO a quem acrescentar um valor novo: esta constraint ja perdeu "conta_bancaria" duas vezes (listas de cor), e esteve sem "falta_justificacao", "ausencia_justificacao" e "ausencia_motivo" -- as tres RPCs de leitura auditada que os usam falhavam em todas as chamadas. Acrescentar sempre a lista COMPLETA e conferir todos os valores, e tambem que cada valor literal passado a hr_registar_acesso_sensivel esta aqui (ver 20261231790000).';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_valores text[] := ARRAY[
    'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
    'documento', 'sindicalizacao', 'horas_contratadas',
    'anexo_cartao_cidadao', 'anexo_comprovativo_iban',
    'falta_justificacao', 'ausencia_justificacao', 'ausencia_motivo',
    'justificacao_dia'
  ];
  v_definicao text;
  v_actuais   text[];
  v_falta     text;
  v_sobra     text;
  v_orfaos    text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_definicao
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname = 'pessoas_acessos_sensiveis_campo_valido';

  IF v_definicao IS NULL THEN
    RAISE EXCEPTION 'A constraint desapareceu depois da alteracao.';
  END IF;

  SELECT coalesce(array_agg(m[1] ORDER BY m[1]), '{}'::text[]) INTO v_actuais
    FROM regexp_matches(v_definicao, '''([a-z_]+)''::text', 'g') AS m;

  -- Conjunto EXACTO, nos dois sentidos.
  SELECT string_agg(v, ', ' ORDER BY v) INTO v_falta
    FROM unnest(v_valores) AS v WHERE v <> ALL (v_actuais);
  SELECT string_agg(a, ', ' ORDER BY a) INTO v_sobra
    FROM unnest(v_actuais) AS a WHERE a <> ALL (v_valores);

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'O CHECK nao aceita: %. Definicao actual: %', v_falta, v_definicao;
  END IF;
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'O CHECK aceita valores fora da lista esperada: %. Definicao actual: %', v_sobra, v_definicao;
  END IF;

  -- Todos os valores LITERAIS que as funcoes de public passam a
  -- hr_registar_acesso_sensivel(..., 'campo', 'revelar'|'alterar') tem de
  -- estar no CHECK. Foi a falta desta verificacao que deixou tres RPCs partidas.
  -- (As chamadas com o campo numa variavel -- anexos e revisao da admissao --
  -- passam valores que ja estao na lista; foram lidas a mao a 27/10.)
  SELECT string_agg(DISTINCT p.proname::text || ' -> ' || m[1], '; ') INTO v_orfaos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL regexp_matches(
      p.prosrc,
      'hr_registar_acesso_sensivel\s*\([^;]*?''([a-z_]+)''\s*,\s*''(revelar|alterar)''',
      'g') AS m
   WHERE n.nspname = 'public'
     AND m[1] <> ALL (v_actuais);

  IF v_orfaos IS NOT NULL THEN
    RAISE EXCEPTION
      'Ha funcoes que registam acessos com um campo que o CHECK recusa (falhariam sempre): %', v_orfaos;
  END IF;

  RAISE NOTICE 'OK: o CHECK aceita exactamente os % valores, e todas as funcoes que registam acessos usam valores aceites.', cardinality(v_valores);
END;
$conferir$;
