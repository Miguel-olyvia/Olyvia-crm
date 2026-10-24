-- ==============================================================================
-- pessoas.estado_contrato passa a estado DERIVADO do vinculo. A coluna
-- larga-se depois do backfill; a fonte de verdade passa a ser
-- pessoas_vinculos.estado (agora com um quarto valor, 'suspenso').
--
-- POR APLICAR.
--
--
-- -- O DEFEITO QUE MOTIVA ISTO --------------------------------------------------
--
-- `pessoas.estado_contrato` era um enum independente ('em_curso', 'suspenso',
-- 'terminado'), escrito a mao no separador Detalhes laborais, sem NENHUMA
-- ligacao ao vinculo em `pessoas_vinculos`. Uma ficha podia dizer "Em curso"
-- sem ter vinculo nenhum -- o caso concreto que motivou esta migracao. A
-- fonte de verdade passa a ser sempre `pessoas_vinculos`; o calculo em si vive
-- em `src/lib/hr/estadoContrato.ts` (TypeScript, nao SQL -- e a unica forma de
-- o provar por `vitest` em vez de so pelo `db push` passar).
--
--
-- -- ORDEM INTERNA, OBRIGATORIA --------------------------------------------------
--
-- A. Alargar o CHECK de pessoas_vinculos.estado para aceitar 'suspenso'.
--    Tem de vir antes do backfill: o UPDATE do passo B para 'suspenso'
--    violava o CHECK antigo.
-- B. Backfill com guardas. Duas abortagens genuinas (nao ha onde pousar a
--    informacao sem inventar dados) e uma ambiguidade (mais do que um sitio
--    possivel). Se abortar, NAO se contorna aqui: quem orquestra escreve uma
--    migracao de dados a parte, revista a mao, ou corrige na aplicacao.
-- C. Recriar o indice unico -- so DEPOIS do backfill de proposito: e a
--    guarda final contra uma pessoa ficar com 'activo' e 'suspenso' ao
--    mesmo tempo.
-- D. Largar a coluna e o CHECK antigo. Sem CASCADE: nenhuma vista, funcao ou
--    RPC le `estado_contrato` (mapa confirmado antes de escrever isto).
-- E. Conferir.
--
--
-- -- O QUE NAO MUDA -------------------------------------------------------------
--
-- `estado='suspenso'` continua SEM datas proprias (sem `suspenso_desde` /
-- `suspenso_ate`): datas de ausencia ja tem casa propria em "licenca sem
-- vencimento", e duplicar o intervalo abria duas fontes para o mesmo periodo.
-- Quem manda no estado suspenso -- a licenca aprovada, ou a mao de quem edita
-- o contrato -- fica POR DECIDIR (registado em vault\registo-trabalho.md).
-- ==============================================================================


-- ==============================================================================
-- Passo A -- alargar o CHECK do vinculo para aceitar 'suspenso'
-- ==============================================================================
-- Alargar um CHECK nunca falha a validacao (todas as linhas existentes ja
-- cumprem um dominio mais permissivo). NOT VALID e desnecessario aqui: nao ha
-- nada por validar num alargamento.
ALTER TABLE public.pessoas_vinculos
  DROP CONSTRAINT IF EXISTS pessoas_vinculos_estado_valido;
ALTER TABLE public.pessoas_vinculos
  ADD CONSTRAINT pessoas_vinculos_estado_valido
  CHECK (estado IN ('activo', 'suspenso', 'terminado', 'futuro'));


-- ==============================================================================
-- Passo B -- guardas (abortam ANTES de qualquer UPDATE) e depois o backfill
-- ==============================================================================
DO $guardas$
DECLARE
  v_cnt bigint;
  v_ids text;
BEGIN
  IF to_regclass('public.pessoas') IS NULL
     OR to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas ou public.pessoas_vinculos nao existem -- 20261120030000 e 20261120060000 tem de ir a frente na fila.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas'
       AND column_name = 'estado_contrato'
  ) THEN
    RAISE NOTICE 'pessoas.estado_contrato ja nao existe. Segue idempotente.';
    RETURN;
  END IF;

  -- ---- Caso irreconciliavel 1: 'suspenso' e NENHUM vinculo nao-terminado ----
  -- (o caso concreto pedido). Nao ha onde pousar o estado='suspenso' sem
  -- inventar um vinculo com data_inicio adivinhada.
  SELECT count(*) INTO v_cnt
    FROM public.pessoas p
   WHERE p.deleted_at IS NULL
     AND p.estado_contrato = 'suspenso'
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_vinculos v
        WHERE v.pessoa_id = p.id AND v.deleted_at IS NULL
          AND v.estado IN ('activo', 'futuro')
     );
  IF v_cnt > 0 THEN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO v_ids
      FROM (
        SELECT p.id
          FROM public.pessoas p
         WHERE p.deleted_at IS NULL
           AND p.estado_contrato = 'suspenso'
           AND NOT EXISTS (
             SELECT 1 FROM public.pessoas_vinculos v
              WHERE v.pessoa_id = p.id AND v.deleted_at IS NULL
                AND v.estado IN ('activo', 'futuro')
           )
         ORDER BY p.id
         LIMIT 20
      ) sub;
    RAISE EXCEPTION
      'Backfill abortado: % pessoa(s) com estado_contrato = ''suspenso'' e SEM vinculo nao-terminado onde pousar a suspensao. Nao se inventa um vinculo, nem se apaga a suspensao em silencio -- escrever uma migracao de dados a parte, revista a mao, ou corrigir na aplicacao. IDs (ate 20): %',
      v_cnt, v_ids;
  END IF;

  -- ---- Caso irreconciliavel 2: 'suspenso' e MAIS DO QUE UM vinculo nao- ----
  -- ---- terminado -- ambiguo em qual pousar a suspensao. ---------------------
  SELECT count(*) INTO v_cnt
    FROM (
      SELECT p.id
        FROM public.pessoas p
        JOIN public.pessoas_vinculos v
          ON v.pessoa_id = p.id AND v.deleted_at IS NULL AND v.estado IN ('activo', 'futuro')
       WHERE p.deleted_at IS NULL AND p.estado_contrato = 'suspenso'
       GROUP BY p.id
      HAVING count(*) > 1
    ) ambiguos;
  IF v_cnt > 0 THEN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO v_ids
      FROM (
        SELECT p.id
          FROM public.pessoas p
          JOIN public.pessoas_vinculos v
            ON v.pessoa_id = p.id AND v.deleted_at IS NULL AND v.estado IN ('activo', 'futuro')
         WHERE p.deleted_at IS NULL AND p.estado_contrato = 'suspenso'
         GROUP BY p.id
        HAVING count(*) > 1
         ORDER BY p.id
         LIMIT 20
      ) sub;
    RAISE EXCEPTION
      'Backfill abortado: % pessoa(s) com estado_contrato = ''suspenso'' e MAIS DO QUE UM vinculo nao-terminado -- ambiguo em qual pousar a suspensao. Nao se adivinha: escrever uma migracao de dados a parte, revista a mao. IDs (ate 20): %',
      v_cnt, v_ids;
  END IF;

  -- ---- Caso irreconciliavel 3: 'terminado', vinculo em vigor, SEM data --
  -- ---- de saida na ficha nem data de fim no vinculo. Terminar sem data --
  -- ---- e perder a data. ------------------------------------------------
  SELECT count(*) INTO v_cnt
    FROM public.pessoas p
   WHERE p.deleted_at IS NULL
     AND p.estado_contrato = 'terminado'
     AND p.data_saida IS NULL
     AND EXISTS (
       SELECT 1 FROM public.pessoas_vinculos v
        WHERE v.pessoa_id = p.id AND v.deleted_at IS NULL
          AND v.estado IN ('activo', 'futuro') AND v.data_fim IS NULL
     );
  IF v_cnt > 0 THEN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO v_ids
      FROM (
        SELECT p.id
          FROM public.pessoas p
         WHERE p.deleted_at IS NULL
           AND p.estado_contrato = 'terminado'
           AND p.data_saida IS NULL
           AND EXISTS (
             SELECT 1 FROM public.pessoas_vinculos v
              WHERE v.pessoa_id = p.id AND v.deleted_at IS NULL
                AND v.estado IN ('activo', 'futuro') AND v.data_fim IS NULL
           )
         ORDER BY p.id
         LIMIT 20
      ) sub;
    RAISE EXCEPTION
      'Backfill abortado: % pessoa(s) com estado_contrato = ''terminado'', um vinculo em vigor e NEM pessoas.data_saida NEM pessoas_vinculos.data_fim preenchidos. Terminar sem data e perder a data -- escrever uma migracao de dados a parte, revista a mao. IDs (ate 20): %',
      v_cnt, v_ids;
  END IF;

  -- ---- Caso irreconciliavel 4: 'terminado', com data de saida na ficha --
  -- ---- ANTERIOR ao inicio do vinculo. -----------------------------------
  -- O backfill faz data_fim = coalesce(v.data_fim, p.data_saida). Se a data
  -- de saida for anterior ao inicio do contrato -- plausivel em quem saiu e
  -- tinha um contrato 'futuro' a comecar depois --, o UPDATE bateria no
  -- CHECK pessoas_vinculos_fim_depois_inicio e devolveria um erro cru de
  -- constraint, em vez da mensagem com IDs que estas guardas existem para
  -- dar. Nao ha data correcta a inventar aqui: aborta-se.
  SELECT count(*) INTO v_cnt
    FROM public.pessoas p
    JOIN public.pessoas_vinculos v
      ON v.pessoa_id = p.id AND v.deleted_at IS NULL
   WHERE p.deleted_at IS NULL
     AND p.estado_contrato = 'terminado'
     AND v.estado IN ('activo', 'futuro')
     AND v.data_fim IS NULL
     AND p.data_saida IS NOT NULL
     AND v.data_inicio IS NOT NULL
     AND p.data_saida < v.data_inicio;
  IF v_cnt > 0 THEN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO v_ids
      FROM (
        SELECT DISTINCT p.id
          FROM public.pessoas p
          JOIN public.pessoas_vinculos v
            ON v.pessoa_id = p.id AND v.deleted_at IS NULL
         WHERE p.deleted_at IS NULL
           AND p.estado_contrato = 'terminado'
           AND v.estado IN ('activo', 'futuro')
           AND v.data_fim IS NULL
           AND p.data_saida IS NOT NULL
           AND v.data_inicio IS NOT NULL
           AND p.data_saida < v.data_inicio
         ORDER BY p.id
         LIMIT 20
      ) sub;
    RAISE EXCEPTION
      'Backfill abortado: % pessoa(s) com estado_contrato = ''terminado'' cuja pessoas.data_saida e ANTERIOR ao inicio do vinculo. Fechar o contrato nessa data violaria o CHECK data_fim >= data_inicio, e nao ha data correcta a adivinhar. IDs (ate 20): %',
      v_cnt, v_ids;
  END IF;

  RAISE NOTICE 'Guardas do backfill de estado_contrato: sem casos irreconciliaveis. A seguir: copiar suspenso/terminado para o vinculo.';
END;
$guardas$;


-- ---- Backfill: 'suspenso' -> copia-se para o UNICO vinculo nao-terminado --
-- Depois das guardas acima, cada pessoa qualificada tem EXACTAMENTE um
-- vinculo em ('activo','futuro'): nao ha risco de marcar mais do que uma
-- linha por pessoa.
DO $backfill_suspenso$
DECLARE
  v_copiados bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'estado_contrato'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.pessoas_vinculos v
     SET estado = 'suspenso', updated_at = now()
    FROM public.pessoas p
   WHERE v.pessoa_id = p.id
     AND v.deleted_at IS NULL
     AND p.deleted_at IS NULL
     AND p.estado_contrato = 'suspenso'
     AND v.estado IN ('activo', 'futuro');

  GET DIAGNOSTICS v_copiados = ROW_COUNT;
  RAISE NOTICE 'Backfill: % vinculo(s) passaram a estado=''suspenso'' (copiado de pessoas.estado_contrato).', v_copiados;
END;
$backfill_suspenso$;


-- ---- Backfill: 'terminado' -> copia-se para o(s) vinculo(s) em vigor ------
-- data_fim = coalesce(data_fim, pessoas.data_saida): a guarda acima ja
-- garantiu que pelo menos um dos dois existe para cada vinculo tocado.
DO $backfill_terminado$
DECLARE
  v_copiados bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'estado_contrato'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.pessoas_vinculos v
     SET estado = 'terminado',
         data_fim = coalesce(v.data_fim, p.data_saida),
         updated_at = now()
    FROM public.pessoas p
   WHERE v.pessoa_id = p.id
     AND v.deleted_at IS NULL
     AND p.deleted_at IS NULL
     AND p.estado_contrato = 'terminado'
     AND v.estado IN ('activo', 'futuro');

  GET DIAGNOSTICS v_copiados = ROW_COUNT;
  RAISE NOTICE 'Backfill: % vinculo(s) passaram a estado=''terminado'' (copiado de pessoas.estado_contrato, data_fim preenchida a partir de pessoas.data_saida quando faltava).', v_copiados;
END;
$backfill_terminado$;


-- ==============================================================================
-- Passo C -- recriar o indice unico, DEPOIS do backfill de proposito
-- ==============================================================================
-- Um contrato suspenso continua a ser O contrato em vigor: um 'activo' e um
-- 'suspenso' na mesma pessoa seriam duas relacoes laborais a correr, que e
-- exactamente o que este indice sempre existiu para impedir.
DROP INDEX IF EXISTS public.idx_pessoas_vinculos_um_activo;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_vinculos_um_em_vigor
  ON public.pessoas_vinculos (pessoa_id)
  WHERE estado IN ('activo', 'suspenso') AND deleted_at IS NULL;

COMMENT ON COLUMN public.pessoas_vinculos.estado IS
'activo, suspenso, terminado ou futuro. Um so activo-ou-suspenso por pessoa, garantido por idx_pessoas_vinculos_um_em_vigor (20261122100000; antes so cobria ''activo'', em idx_pessoas_vinculos_um_activo). ''suspenso'' nao tem datas proprias -- ver comentario de 20261122100000 sobre a licenca sem vencimento.';


-- ==============================================================================
-- TERMINADO EXIGE DATA DE FIM -- NA BASE, NAO SO NO ECRA
-- ==============================================================================
-- O ecra ja recusa gravar 'terminado' sem data_fim. Isso nao e uma guarda:
-- um pedido directo ao PostgREST cria a linha na mesma. E e precisamente o
-- estado que as guardas do backfill acima classificam como irreconciliavel --
-- a migracao defendia-se contra dados que a propria aplicacao podia voltar a
-- produzir no dia seguinte.
--
-- Acrescenta-se VALIDADA se nao houver historico sujo, e NOT VALID se houver:
-- fechar a porta ao que vier a seguir vale mesmo quando o passado nao cumpre,
-- e rebentar a migracao por causa de linhas antigas seria trocar uma lacuna
-- por um bloqueio.
DO $terminado_com_data$
DECLARE
  v_sujas bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = to_regclass('public.pessoas_vinculos')
       AND conname = 'pessoas_vinculos_terminado_tem_data_fim'
  ) THEN
    RAISE NOTICE 'pessoas_vinculos_terminado_tem_data_fim ja existe; nada a fazer.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_sujas
    FROM public.pessoas_vinculos
   WHERE deleted_at IS NULL
     AND estado = 'terminado'
     AND data_fim IS NULL;

  IF v_sujas = 0 THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_terminado_tem_data_fim
      CHECK (estado <> 'terminado' OR data_fim IS NOT NULL);
    RAISE NOTICE 'pessoas_vinculos_terminado_tem_data_fim criada e validada: nao havia linhas por corrigir.';
  ELSE
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_terminado_tem_data_fim
      CHECK (estado <> 'terminado' OR data_fim IS NOT NULL) NOT VALID;
    RAISE NOTICE
      'pessoas_vinculos_terminado_tem_data_fim criada NOT VALID: % linha(s) terminadas sem data_fim ficam por corrigir. Escritas novas ja sao recusadas; as antigas precisam de uma migracao de dados revista a mao.',
      v_sujas;
  END IF;
END;
$terminado_com_data$;


-- ==============================================================================
-- Passo D -- largar a coluna e o CHECK antigo
-- ==============================================================================
-- Sem CASCADE: o mapa da aplicacao confirmou que nenhuma vista, funcao ou RPC
-- le pessoas.estado_contrato. Se algo tiver aparecido entretanto, o push
-- falha aqui e alguem olha, em vez de a levar atras em silencio.
ALTER TABLE public.pessoas DROP CONSTRAINT IF EXISTS pessoas_estado_contrato_valido;
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS estado_contrato;


-- ==============================================================================
-- Passo E -- conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_check_estado text;
  v_multiplos    bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'estado_contrato'
  ) THEN
    RAISE EXCEPTION 'pessoas.estado_contrato ainda existe depois do DROP.';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_check_estado
    FROM pg_constraint
   WHERE conname = 'pessoas_vinculos_estado_valido'
     AND conrelid = to_regclass('public.pessoas_vinculos');

  IF v_check_estado IS NULL OR v_check_estado NOT LIKE '%suspenso%' THEN
    RAISE EXCEPTION
      'pessoas_vinculos_estado_valido nao aceita ''suspenso''. Definicao actual: %', coalesce(v_check_estado, '<inexistente>');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relname = 'idx_pessoas_vinculos_um_em_vigor'
       AND c.relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'idx_pessoas_vinculos_um_em_vigor nao existe.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relname = 'idx_pessoas_vinculos_um_activo'
       AND c.relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'idx_pessoas_vinculos_um_activo ainda existe -- devia ter caido.';
  END IF;

  -- A guarda final: nenhuma pessoa com mais do que um vinculo vivo em
  -- ('activo','suspenso') -- o proprio indice ja garante isto, mas confirma-se
  -- aqui tambem, contra uma corrida entre o backfill e a criacao do indice.
  SELECT count(*) INTO v_multiplos
    FROM (
      SELECT pessoa_id
        FROM public.pessoas_vinculos
       WHERE deleted_at IS NULL AND estado IN ('activo', 'suspenso')
       GROUP BY pessoa_id
      HAVING count(*) > 1
    ) sub;
  IF v_multiplos > 0 THEN
    RAISE EXCEPTION '% pessoa(s) com mais do que um vinculo vivo em (activo,suspenso).', v_multiplos;
  END IF;

  RAISE NOTICE
    'OK: pessoas.estado_contrato largada, pessoas_vinculos.estado aceita suspenso, idx_pessoas_vinculos_um_em_vigor no lugar de idx_pessoas_vinculos_um_activo, nenhuma pessoa com activo+suspenso em simultaneo.';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. Se as guardas do Passo B dispararem (qualquer das tres EXCEPTIONs), NAO
--    contornar aqui: os IDs reportados (ate 20) sao o ponto de partida para
--    uma migracao de dados a parte, revista a mao, ou para corrigir na
--    aplicacao antes de repetir o push.
--
-- 2. O backfill toca linhas de TODAS as organizacoes (e preservacao de dados
--    dentro de uma migracao versionada, nao SQL avulso) -- ler antes de
--    aplicar. A regra "escritas so na org nike" continua a valer para
--    qualquer SQL corrido a mao FORA desta migracao.
--
-- 3. O FRONTEND TEM DE IR NO MESMO COMMIT, e antes desta migracao ser
--    aplicada: src/types/hr.ts, src/lib/hr/estadoContrato.ts (novo),
--    src/hooks/usePessoas.ts, src/hooks/usePessoa.ts, src/pages/PessoaDetail.tsx,
--    src/pages/Pessoas.tsx, src/components/hr/PessoaLaboraisTab.tsx,
--    src/components/hr/PessoaContratoTab.tsx,
--    src/components/hr/PessoasFuncoesTab.tsx, src/translations/index.ts
--    (5 linguas). O frontend novo ja nao le nem escreve estado_contrato, por
--    isso funciona ANTES e DEPOIS deste push -- o inverso nao e verdade:
--    aplicar a migracao antes do frontend parte o botao Guardar dos Detalhes
--    laborais para toda a gente (mandava estado_contrato num UPDATE contra
--    uma coluna que ja nao existe).
--
-- 4. NAO ha migracao de reversao guardada na pasta, por regra do projecto.
-- ==============================================================================
