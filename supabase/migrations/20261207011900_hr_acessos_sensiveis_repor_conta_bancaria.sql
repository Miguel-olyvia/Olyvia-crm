-- ==============================================================================
-- Repor 'conta_bancaria' no CHECK de pessoas_acessos_sensiveis.campo.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA, e esta VIVO -----------------------------------------------------
--
-- 20261120220000 alargou o dominio de `campo` para incluir 'conta_bancaria', e
-- o proprio bloco de conferir dessa migracao avisava, por escrito, o que
-- acontece sem ele: "rpc_hr_definir_conta rebenta na ultima linha e reverte
-- tudo -- deixando um segredo orfao no Vault a cada tentativa".
--
-- Duas migracoes posteriores fizeram DROP + ADD da constraint e REESCREVERAM A
-- LISTA INTEIRA, sem 'conta_bancaria':
--   20261123015000  ('niss','iban','incapacidade','retribuicao','documento')
--   20261124020000  (... ,'documento','sindicalizacao')
--
-- Nenhuma das duas o apanhou, porque os blocos de conferir de cada uma so
-- verificam os valores que ELA conhecia: a dos documentos testa niss,
-- retribuicao e documento; a da sindicalizacao testa esses tres mais o seu.
-- 'conta_bancaria' nunca foi testado por ninguem.
--
-- Consequencia HOJE: gravar dados bancarios de uma pessoa falha na ultima
-- instrucao -- depois de vault.create_secret ja ter criado o segredo. A
-- transaccao reverte a linha da tabela, mas o Vault e outro schema: o segredo
-- fica la, sem dono, a cada tentativa. Vale para rpc_hr_definir_conta e para a
-- submissao do convite de admissao.
--
--
-- -- A LICAO, escrita aqui para nao se repetir ----------------------------------
--
-- Uma migracao que faz DROP + ADD de um CHECK de lista tem de ACRESCENTAR ao
-- que la esta, e nao reescrever de cor o que julga que la estava. E o bloco de
-- conferir tem de verificar TODOS os valores esperados, e nao so o que essa
-- migracao acrescenta -- foi precisamente esse ponto cego que deixou passar
-- isto duas vezes seguidas.
--
-- Por isso esta migracao confere a lista COMPLETA, valor a valor, a partir de
-- uma unica fonte, e falha se faltar qualquer um. Quem acrescentar o proximo
-- valor tem de o acrescentar tambem a essa lista -- e ai o teste apanha-o.
--
--
-- -- OS SEGREDOS ORFAOS QUE JA LA ESTAO -----------------------------------------
--
-- Esta migracao NAO os limpa. Nao ha, na aplicacao, forma de saber quais dos
-- segredos do Vault ficaram sem dono, e apagar por aproximacao num cofre e
-- pior do que deixar lixo. Fica registado como coisa a fazer a mao, com o
-- inventario feito por quem tem acesso ao Vault:
--   SELECT id, name, created_at FROM vault.secrets
--    WHERE id NOT IN (SELECT conta_secret_id FROM public.pessoas_dados_bancarios
--                      WHERE conta_secret_id IS NOT NULL);
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Nao se reverte: reverter e voltar a partir a gravacao de dados bancarios.
--
-- Prerequisitos:
--   20261120040000  pessoas_acessos_sensiveis e a constraint
--   20261120220000  o valor 'conta_bancaria' e rpc_hr_definir_conta
-- ==============================================================================

-- ---- A alteracao ------------------------------------------------------------
DO $altera$
DECLARE
  -- A lista COMPLETA, e a unica fonte desta migracao. Quem acrescentar um
  -- valor novo no futuro acrescenta-o aqui tambem.
  v_valores text[] := ARRAY[
    'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
    'documento', 'sindicalizacao'
  ];
  v_definicao text;
  v_lista     text;
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

  -- Ja aceita tudo? Entao nao ha nada a fazer -- a migracao e idempotente.
  IF (SELECT bool_and(v_definicao LIKE '%' || v || '%') FROM unnest(v_valores) AS v) THEN
    RAISE NOTICE 'O CHECK ja aceita os % valores esperados; nada a fazer.', array_length(v_valores, 1);
    RETURN;
  END IF;

  -- Nenhuma linha existente pode ficar ilegal: a lista nova e um SUPERCONJUNTO
  -- da actual, por isso isto nunca deve acontecer -- mas se acontecer, e
  -- porque alguem gravou um valor fora de qualquer das listas, e ai para-se.
  SELECT string_agg(DISTINCT campo, ', ' ORDER BY campo) INTO v_lista
    FROM public.pessoas_acessos_sensiveis
   WHERE campo <> ALL (v_valores);

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION
      'Ha linhas com campo fora da lista nova: %. Acrescentar esses valores a lista desta migracao antes de aplicar.',
      v_lista;
  END IF;

  ALTER TABLE public.pessoas_acessos_sensiveis
    DROP CONSTRAINT pessoas_acessos_sensiveis_campo_valido;

  ALTER TABLE public.pessoas_acessos_sensiveis
    ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido
    CHECK (campo = ANY (ARRAY[
      'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
      'documento', 'sindicalizacao'
    ]));

  RAISE NOTICE 'CHECK reposto com os 7 valores, incluindo conta_bancaria.';
END;
$altera$;

COMMENT ON CONSTRAINT pessoas_acessos_sensiveis_campo_valido ON public.pessoas_acessos_sensiveis IS
'Os campos cujo acesso se regista. ATENCAO a quem acrescentar um valor novo: esta constraint ja perdeu "conta_bancaria" duas vezes, porque cada migracao reescreveu a lista de cor em vez de acrescentar a que la estava, e o bloco de conferir de cada uma so verificava o valor que ela propria acrescentava. Acrescentar sempre a lista COMPLETA, e conferir todos os valores.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_valores text[] := ARRAY[
    'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
    'documento', 'sindicalizacao'
  ];
  v_definicao text;
  v_valor     text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_definicao
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname = 'pessoas_acessos_sensiveis_campo_valido';

  IF v_definicao IS NULL THEN
    RAISE EXCEPTION 'A constraint desapareceu depois da alteracao.';
  END IF;

  -- TODOS os valores, e nao so o que esta migracao repoe. E o ponto cego que
  -- deixou passar o defeito duas vezes.
  FOREACH v_valor IN ARRAY v_valores
  LOOP
    IF v_definicao NOT LIKE '%' || v_valor || '%' THEN
      RAISE EXCEPTION
        'pessoas_acessos_sensiveis_campo_valido nao aceita "%". Definicao actual: %',
        v_valor, v_definicao;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: o CHECK aceita os 7 valores, conta_bancaria incluido. Gravar dados bancarios volta a funcionar.';
END;
$conferir$;
