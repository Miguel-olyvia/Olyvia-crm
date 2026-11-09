-- ==============================================================================
-- Custos de um mes fechado: o fecho da folha GRAVA as horas planeadas e
-- realizadas de cada pessoa (e o nome dela), e a leitura dos resultados
-- devolve-as. Desenho fechado: desenho-custos-fecho.md (pontos 1, 2, 3 e 6).
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth), e
-- confirmar que 20270112500000 fica acima do maximo aplicado e e o UNICO
-- pendente; (2) correr a prova na nike em transaccao desfeita ANTES do push
-- (o conferir abaixo e essa prova, e mede o tempo do fecho e da leitura);
-- (3) revisao ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- BLOQUEIO: o ALTER TABLE segura ACCESS EXCLUSIVE em hr_processamento_resultados
-- ate ao COMMIT, e o conferir (fecho de todas as pessoas activas da nike, leitura
-- em paginas, EXPLAIN) corre dentro da mesma transaccao: durante esses segundos a
-- leitura e o fecho esperam (lock_timeout 5 s). Aplicar FORA de horas de folha.
-- ORDEM: push da migration e SO DEPOIS o cliente novo (um cliente novo com o
-- validador antigo falha com 'campos desconhecidos', 22023).
--
-- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- SIM. Os campos planeado_minutos e realizado_minutos passam a ser
-- OBRIGATORIOS em cada objecto de p_resultados. O cliente de hoje nao os
-- envia: ENTRE O PUSH E A PUBLICACAO DO CLIENTE NOVO, FECHAR UM PERIODO E
-- RECUSADO com processamento_fechar_resultado_mal_formado (22023, "falta o
-- campo planeado_minutos"), o periodo continua aberto e NADA SE GRAVA. O ecra
-- antigo ja traduz este codigo ("Atualize a pagina e tente de novo"). Ler os
-- resultados continua a funcionar no ecra antigo (as colunas a mais sao
-- ignoradas). Fazer o push e o deploy do cliente seguidos, fora de horas de
-- processamento salarial. O cliente novo tem de:
--   - enviar em cada resultado planeado_minutos e realizado_minutos: numeros
--     inteiros de 0 a 89280, e nao mais do que os minutos do proprio periodo
--     ((data_fim - data_inicio + 1) * 1440) -- os mesmos minutos que o ecra
--     Custos usa (totais.planeadoMinutos / realizadoMinutos), arredondados;
--   - ler planeado_minutos, realizado_minutos e pessoa_nome de
--     rpc_hr_processamento_resultados_ler (colunas novas, no fim).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. hr_processamento_resultados ganha tres colunas NOT NULL sem DEFAULT (so
--    possivel com a tabela VAZIA; guarda G1, sem plano B automatico):
--      planeado_minutos  integer, CHECK 0..89280 (62 dias x 1440)
--      realizado_minutos integer, CHECK 0..89280
--      pessoa_nome       text,    CHECK length(btrim) 1..300; preenchida PELO
--                        SERVIDOR no INSERT a partir de pessoas.nome_completo
--                        (o cliente nunca a envia).
--    Os triggers de imutabilidade existentes cobrem as colunas novas.
--    A FK da pessoa, pessoa_id e o resto da tabela ficam como estao (largar a
--    FK da pessoa e uma migration a parte, nao feita aqui).
--
-- 2. hr_processamento_resultado_erro(jsonb): troca de texto (guarda md5).
--    planeado_minutos e realizado_minutos entram na lista de campos
--    obrigatorios e tem de ser number inteiro de 0 a 89280. Falta ou forma
--    errada: a mensagem do validador, que o fecho devolve como
--    processamento_fechar_resultado_mal_formado (22023).
--
-- 3. rpc_hr_processamento_periodo_fechar(uuid, jsonb): troca de texto no
--    corpo do remoto (guarda md5), mesma assinatura. (a) Antes de gravar,
--    recusa minutos acima dos do periodo com
--    processamento_fechar_resultado_mal_formado (22023). (b) O INSERT grava
--    planeado_minutos, realizado_minutos e pessoa_nome. Mantem tudo o resto,
--    SECURITY DEFINER, search_path vazio e EXECUTE so a authenticated.
--
-- 4. rpc_hr_processamento_resultados_ler(uuid, uuid): o RETURNS TABLE muda,
--    por isso DROP + CREATE do texto de pg_get_functiondef com duas trocas:
--    tres colunas no FIM (planeado_minutos integer, realizado_minutos
--    integer, pessoa_nome text) e as mesmas no SELECT. Mesma assinatura de
--    entrada, mesmas permissoes (hr.processamento.periodo.view E
--    hr.pessoas.retribuicao.view), mesmo dono, mesmo comentario mais uma
--    frase; REVOKE/GRANT repostos e conferidos contra os de antes.
--
-- Taxas, equipamentos, excecoes e banco de horas continuam a ler-se em vivo
-- (nao se tocam aqui).
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Fechar passa a gravar tambem horas e nome; ler devolve tres colunas a mais;
-- ninguem perde acesso. Durante a janela entre o push e o cliente novo
-- ninguem fecha periodos (recusa 22023, nada gravado). A Mudelar nao esta
-- nesta base; a prova so le e escreve na nike, e tudo o que escreve e desfeito.
--
--
-- -- CODIGOS DE ERRO (prefixo da mensagem; ERRCODE) ---------------------------
--
--   processamento_fechar_resultado_mal_formado (22023): falta de
--     planeado_minutos / realizado_minutos, forma errada, ou acima dos minutos
--     do periodo. Nenhum codigo novo.
--   hr_fecho_horas_fora_de_transaccao (25000): a migration nao correu numa
--     so transaccao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova (e com o
-- cliente antigo): tirar as trocas do fecho e do validador, recriar a leitura
-- sem as tres colunas, e largar as colunas (os minutos gravados perdem-se;
-- exportar antes).
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'hr_fecho_horas_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- As trocas de texto: funcao, ancora (uma linha), substituto, vezes -------
-- As ancoras contam-se no texto de pg_get_functiondef (o que se troca).
CREATE TEMP TABLE tmp_hm_trocas (ordem integer PRIMARY KEY, fn text NOT NULL, ancora text NOT NULL,
                                 novo text NOT NULL, vezes integer NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_hm_trocas (ordem, fn, ancora, novo, vezes) VALUES
-- F1. O fecho: as colunas novas na lista do INSERT.
(1, 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
 '    retribuicao_id, cargo_periodo_id, regra_salarial_id, fechado_por, fechado_em',
 '    retribuicao_id, cargo_periodo_id, regra_salarial_id, planeado_minutos, realizado_minutos, pessoa_nome, fechado_por, fechado_em',
 1),
-- F2. O fecho: os valores das colunas novas, a seguir a v_regra_id. Cast por
--     numeric: o texto de um number jsonb pode vir como 480.0.
(2, 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
 '         v_regra_id,',
$blk$         v_regra_id,
         ((e.value ->> 'planeado_minutos')::numeric)::integer,
         ((e.value ->> 'realizado_minutos')::numeric)::integer,
         (SELECT left(p.nome_completo, 300)
            FROM public.pessoas p
           WHERE p.id = (e.value ->> 'pessoa_id')::uuid
             AND p.organization_id = v_periodo.organization_id),$blk$,
 1),
-- F3. O fecho: o limite fino (minutos do periodo) antes de "Gravar e fechar".
(3, 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
 '  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------',
$blk$  -- ---- Minutos dentro do periodo (desde 20270112500000) -----------------------
  -- planeado_minutos e realizado_minutos (o validador ja os quer inteiros de 0
  -- a 89280) nao passam dos minutos do proprio periodo.
  SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
    FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
   WHERE (e.value ->> 'planeado_minutos')::numeric  > (v_periodo.data_fim - v_periodo.data_inicio + 1) * 1440
      OR (e.value ->> 'realizado_minutos')::numeric > (v_periodo.data_fim - v_periodo.data_inicio + 1) * 1440
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: pessoa %: planeado_minutos ou realizado_minutos acima dos minutos do periodo (%).',
      v_exemplo, (v_periodo.data_fim - v_periodo.data_inicio + 1) * 1440
      USING ERRCODE = '22023';
  END IF;

  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------$blk$,
 1),
-- V1. O validador: os dois campos passam a obrigatorios (linha de continuacao
--     de k_chaves; a de k_uuids comeca por ARRAY[ e nao casa).
(4, 'public.hr_processamento_resultado_erro(jsonb)',
 $x$                                     'retribuicao_id', 'cargo_periodo_id', 'regra_salarial_id'];$x$,
 $x$                                     'retribuicao_id', 'cargo_periodo_id', 'regra_salarial_id', 'planeado_minutos', 'realizado_minutos'];$x$,
 1),
-- V2. O validador: a forma dos dois campos, antes de valor_hora. O tipo e
--     verificado ANTES de qualquer cast (IF separado: um OR nao garante a ordem).
(5, 'public.hr_processamento_resultado_erro(jsonb)',
 '  -- valor_hora: number >= 0 e <= 10000, ou null',
$blk$  -- planeado_minutos / realizado_minutos: inteiro de minutos, 0 a 89280 (desde 20270112500000)
  FOREACH v_k IN ARRAY ARRAY['planeado_minutos', 'realizado_minutos'] LOOP
    IF pg_catalog.jsonb_typeof(_r -> v_k) IS DISTINCT FROM 'number' THEN
      RETURN v_k || ' tem de ser um numero inteiro de minutos (0 a 89280)';
    END IF;
    IF (_r ->> v_k)::numeric <> pg_catalog.trunc((_r ->> v_k)::numeric)
       OR (_r ->> v_k)::numeric < 0 OR (_r ->> v_k)::numeric > 89280 THEN
      RETURN v_k || ' tem de ser um numero inteiro de minutos (0 a 89280)';
    END IF;
  END LOOP;

  -- valor_hora: number >= 0 e <= 10000, ou null$blk$,
 1),
-- L1. A leitura: tres colunas no FIM do RETURNS TABLE (no cabecalho de
--     pg_get_functiondef, que escreve TABLE(... , fechado_por_nome text)).
(6, 'public.rpc_hr_processamento_resultados_ler(uuid, uuid)',
 ', fechado_por_nome text)',
 ', fechado_por_nome text, planeado_minutos integer, realizado_minutos integer, pessoa_nome text)',
 1),
-- L2. A leitura: as mesmas tres no SELECT, pela mesma ordem.
(7, 'public.rpc_hr_processamento_resultados_ler(uuid, uuid)',
 'u.name::text',
 'u.name::text, r.planeado_minutos, r.realizado_minutos, r.pessoa_nome',
 1);

-- ---- Os corpos esperados no remoto (md5 do prosrc SEM \r) ------------------
-- fecho: o de 20270110710000 com a troca 1 de 20270111410000. O md5 BRUTO
--   (com \r) medido no remoto, da11a8504f518255e96b3d1220303ecb, e o md5
--   bruto do mesmo corpo reconstruido dos ficheiros CRLF; sem \r da
--   e70eaf2c9233d4dc6f17c85e4522dc12, que e o que a guarda usa.
-- validador: o de 20270110710000 com as trocas 2 e 3 de 20270111410000
--   (calculado dos ficheiros, nao medido; bruto 95f2e7c887bcdbbb43ea76e65cff301c).
-- leitura: o de 20270109900000, nunca trocado depois (calculado dos
--   ficheiros, nao medido; bruto 86c26e9c49783f80c389de5c27bc9e61).
CREATE TEMP TABLE tmp_hm_esperado (fn text PRIMARY KEY, md5_sem_cr text NOT NULL, md5_bruto text NOT NULL,
                                   definer boolean NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_hm_esperado (fn, md5_sem_cr, md5_bruto, definer) VALUES
('public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)', 'e70eaf2c9233d4dc6f17c85e4522dc12', 'da11a8504f518255e96b3d1220303ecb', true),
('public.hr_processamento_resultado_erro(jsonb)',            '8e36f164baa351801f6efe78672882fb', '95f2e7c887bcdbbb43ea76e65cff301c', false),
('public.rpc_hr_processamento_resultados_ler(uuid, uuid)',   '3b395abc2e81b76ca29346031229aa6b', '86c26e9c49783f80c389de5c27bc9e61', true);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_r     record;
  v_src   text;
  v_def   text;
  v_cod   text;
BEGIN
  -- G0. Quem aplica passa a RLS (a tabela e FORCE RLS: sem isto a contagem de
  --     G1 podia dar zero com linhas escondidas, e as RPCs definer nao leriam).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; a contagem da tabela nao seria fiavel.', current_user::text;
  END IF;

  -- G1. A tabela existe, ainda nao tem as colunas nem os CHECK novos, e esta
  --     VAZIA (NOT NULL sem DEFAULT so assim). Se nao estiver vazia, para:
  --     a escolha (DEFAULT, nullable, preencher) vai ao utilizador.
  IF to_regclass('public.hr_processamento_resultados') IS NULL THEN
    RAISE EXCEPTION 'G1: falta public.hr_processamento_resultados (20270109900000).';
  END IF;
  SELECT string_agg(a.attname::text, ', ') INTO v_lista
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_processamento_resultados')
     AND a.attname::text IN ('planeado_minutos', 'realizado_minutos', 'pessoa_nome') AND NOT a.attisdropped;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: hr_processamento_resultados ja tem: %. Ler o que la esta.', v_lista;
  END IF;
  SELECT string_agg(c.conname::text, ', ') INTO v_lista
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_processamento_resultados')
     AND c.conname::text IN ('hr_processamento_resultados_planeado_intervalo',
                             'hr_processamento_resultados_realizado_intervalo',
                             'hr_processamento_resultados_pessoa_nome_valido');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem os CHECK: %.', v_lista;
  END IF;
  SELECT count(*)::integer INTO v_n FROM public.hr_processamento_resultados;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G1: ja ha periodos fechados com resultados (% linha(s)); NOT NULL sem DEFAULT deixou de ser possivel. Voltar ao desenho (decisao do utilizador).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.pessoas')
                    AND a.attname::text = 'nome_completo' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'G1: falta pessoas.nome_completo (o fecho le-o para pessoa_nome).';
  END IF;

  -- G2. As tres funcoes existem com UMA so assinatura, a lida; SECURITY
  --     DEFINER como esperado; search_path vazio.
  SELECT string_agg(f.proname || ' (' || f.n::text || ')', ', ') INTO v_lista
    FROM (SELECT x.proname, (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                              WHERE ns.nspname::text = 'public' AND p.proname::text = x.proname) AS n
            FROM unnest(ARRAY['rpc_hr_processamento_periodo_fechar', 'hr_processamento_resultado_erro',
                              'rpc_hr_processamento_resultados_ler']) AS x(proname)) f
   WHERE f.n <> 1;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: estas funcoes nao existem ou tem mais de uma assinatura: %.', v_lista;
  END IF;
  FOR v_r IN SELECT * FROM tmp_hm_esperado ORDER BY fn LOOP
    IF to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'G2: % nao existe com esta assinatura.', v_r.fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_r.fn)::oid
                      AND p.prosecdef = v_r.definer
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'G2: % devia ter SECURITY DEFINER = % e search_path vazio. Reler.', v_r.fn, v_r.definer::text;
    END IF;
  END LOOP;

  -- G3. Os corpos sao os lidos: md5 do prosrc SEM \r dos dois lados (o mesmo
  --     metodo de 20270111410000 e 20270111810000).
  FOR v_r IN SELECT * FROM tmp_hm_esperado ORDER BY fn LOOP
    SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF md5(v_src) IS DISTINCT FROM v_r.md5_sem_cr THEN
      RAISE EXCEPTION 'G3: o corpo de % no remoto (md5 sem \r %) nao e o lido (md5 sem \r %). Reler a versao mais recente antes de aplicar.',
        v_r.fn, md5(v_src), v_r.md5_sem_cr;
    END IF;
  END LOOP;

  -- G4. Cada ancora aparece o numero exacto de vezes no texto de
  --     pg_get_functiondef (o que se troca).
  FOR v_r IN SELECT * FROM tmp_hm_trocas ORDER BY ordem LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_r.fn)::oid);
    v_n := (length(v_def) - length(replace(v_def, v_r.ancora, ''))) / length(v_r.ancora);
    IF v_n <> v_r.vezes THEN
      RAISE EXCEPTION 'G4: em %, a ancora % aparece % vez(es), esperavam-se %. Reler o corpo do remoto.',
        v_r.fn, v_r.ordem::text, v_n, v_r.vezes;
    END IF;
  END LOOP;

  -- G5. A leitura e largada e recriada: ninguem depende dela (pg_depend), mais
  --     nenhuma funcao a chama pelo nome, e o dono e quem aplica (o CREATE
  --     novo fica com o dono de quem aplica).
  SELECT count(*)::integer INTO v_n
    FROM pg_depend d
   WHERE d.refclassid = 'pg_proc'::regclass
     AND d.refobjid = to_regprocedure('public.rpc_hr_processamento_resultados_ler(uuid, uuid)')::oid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: ha % objecto(s) que dependem de rpc_hr_processamento_resultados_ler; o DROP falharia ou levaria-os.', v_n;
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND regexp_replace(p.prosrc, '--[^\n]*', '', 'g') LIKE '%rpc_hr_processamento_resultados_ler%'
     AND p.proname::text <> 'rpc_hr_processamento_resultados_ler';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G5: outras funcoes chamam rpc_hr_processamento_resultados_ler: %. Rever antes de mudar o RETURNS TABLE.', v_lista;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
                  WHERE p.oid = to_regprocedure('public.rpc_hr_processamento_resultados_ler(uuid, uuid)')::oid
                    AND r.rolname::text = current_user::text) THEN
    RAISE EXCEPTION 'G5: o dono de rpc_hr_processamento_resultados_ler nao e quem aplica (%); recriar mudaria o dono.', current_user::text;
  END IF;

  -- G6. Codigos de permissao usados na prova.
  FOREACH v_cod IN ARRAY ARRAY['hr.processamento.periodo.view', 'hr.processamento.periodo.gerir',
                               'hr.pessoas.retribuicao.view', 'hr.assiduidade.view'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G6: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;
END;
$guardas$;

-- O estado de antes das trocas, para o conferir provar que so mudou o pedido
-- (e para recriar a leitura com o mesmo comentario). Os privilegios guardam-se
-- como conjunto ordenado (a ordem do aclitem[] nao e significativa).
CREATE TEMP TABLE tmp_hm_antes ON COMMIT DROP AS
SELECT e.fn,
       p.prosrc,
       p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce((SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(p.proacl) AS x), '') AS proacl,
       p.proowner,
       pg_get_function_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid) AS resultado,
       pg_get_functiondef(p.oid) AS def,
       obj_description(p.oid, 'pg_proc') AS comentario
  FROM tmp_hm_esperado e
  JOIN pg_proc p ON p.oid = to_regprocedure(e.fn)::oid;


-- ==============================================================================
-- 1. As colunas (a tabela esta vazia: G1; uma insercao concorrente entre a
--    guarda e o ALTER faz o ALTER falhar com "contains null values", e a
--    migration inteira e desfeita)
-- ==============================================================================
ALTER TABLE public.hr_processamento_resultados
  ADD COLUMN planeado_minutos  integer NOT NULL,
  ADD COLUMN realizado_minutos integer NOT NULL,
  ADD COLUMN pessoa_nome       text    NOT NULL,
  ADD CONSTRAINT hr_processamento_resultados_planeado_intervalo
    CHECK (planeado_minutos BETWEEN 0 AND 89280),
  ADD CONSTRAINT hr_processamento_resultados_realizado_intervalo
    CHECK (realizado_minutos BETWEEN 0 AND 89280),
  ADD CONSTRAINT hr_processamento_resultados_pessoa_nome_valido
    CHECK (length(btrim(pessoa_nome)) BETWEEN 1 AND 300);

COMMENT ON COLUMN public.hr_processamento_resultados.planeado_minutos IS
'Minutos planeados da pessoa no periodo, tal como o ecra os calculou no instante do fecho (os que o ecra Custos usa). Inteiro de 0 a 89280; o fecho recusa mais do que os minutos do proprio periodo. Desde 20270112500000.';
COMMENT ON COLUMN public.hr_processamento_resultados.realizado_minutos IS
'Minutos realizados da pessoa no periodo, tal como o ecra os calculou no instante do fecho. Inteiro de 0 a 89280; o fecho recusa mais do que os minutos do proprio periodo. Desde 20270112500000.';
COMMENT ON COLUMN public.hr_processamento_resultados.pessoa_nome IS
'pessoas.nome_completo no instante do fecho, preenchido pelo SERVIDOR (o cliente nao o envia). Identifica a linha mesmo que a ficha mude ou desapareca. Desde 20270112500000.';


-- ==============================================================================
-- 2. As trocas (via pg_get_functiondef: o fecho e o validador por CREATE OR
--    REPLACE, que mantem dono, privilegios, SECURITY DEFINER e search_path; a
--    leitura por DROP + CREATE, porque o RETURNS TABLE muda)
-- ==============================================================================
DO $trocas$
DECLARE
  v_fn  text;
  v_def text;
  v_r   record;
BEGIN
  FOR v_fn IN SELECT DISTINCT t.fn FROM tmp_hm_trocas t ORDER BY 1 LOOP
    SELECT a.def INTO v_def FROM tmp_hm_antes a WHERE a.fn = v_fn;
    FOR v_r IN SELECT * FROM tmp_hm_trocas t WHERE t.fn = v_fn ORDER BY t.ordem LOOP
      v_def := replace(v_def, v_r.ancora, v_r.novo);
    END LOOP;
    IF v_fn = 'public.rpc_hr_processamento_resultados_ler(uuid, uuid)' THEN
      EXECUTE 'DROP FUNCTION public.rpc_hr_processamento_resultados_ler(uuid, uuid)';
    END IF;
    EXECUTE v_def;
  END LOOP;
END;
$trocas$;

-- A leitura recriada: as permissoes de antes (o conferir compara-as).
REVOKE ALL ON FUNCTION public.rpc_hr_processamento_resultados_ler(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_resultados_ler(uuid, uuid) TO authenticated;

-- Os comentarios: o de cada funcao ganha uma frase no fim (o da leitura e o
-- guardado antes do DROP).
DO $comentarios$
DECLARE
  v_r record;
BEGIN
  FOR v_r IN
    SELECT t.fn, t.extra, a.comentario
      FROM (VALUES
        ('public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
         ' Desde 20270112500000: cada resultado traz planeado_minutos e realizado_minutos (obrigatorios, inteiros de 0 a 89280, nao mais do que os minutos do periodo; senao processamento_fechar_resultado_mal_formado, 22023), gravados com o nome da pessoa (pessoa_nome, de pessoas.nome_completo, pelo servidor).'),
        ('public.hr_processamento_resultado_erro(jsonb)',
         ' Desde 20270112500000: planeado_minutos e realizado_minutos sao obrigatorios, number inteiro de 0 a 89280.'),
        ('public.rpc_hr_processamento_resultados_ler(uuid, uuid)',
         ' Desde 20270112500000: devolve tambem, no fim, planeado_minutos, realizado_minutos e pessoa_nome gravados no fecho.')
      ) AS t(fn, extra)
      JOIN tmp_hm_antes a ON a.fn = t.fn
  LOOP
    EXECUTE format('COMMENT ON FUNCTION %s IS %L',
                   to_regprocedure(v_r.fn)::text,
                   coalesce(v_r.comentario, '') || v_r.extra);
  END LOOP;
END;
$comentarios$;


-- ==============================================================================
-- 3. Conferir (estrutura, trocas, privilegios e comportamento na nike,
--    desfeito; mede o fecho e a leitura so para informacao)
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_ini       constant date := DATE '2099-04-01';
  k_fim       constant date := DATE '2099-04-30';
  k_ini2      constant date := DATE '2099-03-01';
  k_fim2      constant date := DATE '2099-03-31';
  k_min_per   constant integer := 30 * 1440;   -- 2099-04: 30 dias
  k_fechar    constant text := 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)';
  k_erro      constant text := 'public.hr_processamento_resultado_erro(jsonb)';
  k_ler       constant text := 'public.rpc_hr_processamento_resultados_ler(uuid, uuid)';
  v_papel     text := current_user::text;
  v_r         record;
  v_t         record;
  v_new       record;
  v_esperado  text;
  v_lista     text;
  v_n         integer;
  v_total     integer;
  v_msg       text;
  v_st        text;
  v_uid       uuid;
  v_autor     uuid;
  v_uid_sem   uuid;
  v_prova_p9  text;
  v_prova_papel text;
  v_prova_desvios text;
  v_pode_papel boolean;
  v_obrig     uuid[];
  v_pessoas   integer;
  v_primeira  uuid;
  v_per       uuid;
  v_per2      uuid;
  v_regra_id  uuid;
  v_he_desde  date;
  v_he_ligado boolean;
  v_n_desvios integer;
  v_payload   jsonb;
  v_row       public.hr_processamento_resultados%ROWTYPE;
  v_nome      text;
  v_estado    text;
  v_lido      jsonb;
  v_gravado   jsonb;
  v_depois    uuid;
  v_pag_n     integer;
  v_pag_ult   uuid;
  v_paginas   integer;
  v_t0        timestamptz;
  v_ms_fecho  numeric;
  v_ms_ler    numeric;
  v_plano     text;
  v_linha     text;
BEGIN
  -- C1. As colunas: tipo, NOT NULL, sem DEFAULT; os 3 CHECK por nome.
  SELECT count(DISTINCT a.attname::text)::integer INTO v_n
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_processamento_resultados') AND NOT a.attisdropped
     AND a.attnotnull AND NOT a.atthasdef
     AND ((a.attname::text IN ('planeado_minutos', 'realizado_minutos') AND format_type(a.atttypid, a.atttypmod) = 'integer')
          OR (a.attname::text = 'pessoa_nome' AND format_type(a.atttypid, a.atttypmod) = 'text'));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: das 3 colunas novas (integer, integer, text, NOT NULL sem DEFAULT) so % estao certas.', v_n;
  END IF;
  SELECT count(DISTINCT c.conname::text)::integer INTO v_n
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_processamento_resultados')
     AND c.contype::text = 'c' AND c.convalidated
     AND c.conname::text IN ('hr_processamento_resultados_planeado_intervalo',
                             'hr_processamento_resultados_realizado_intervalo',
                             'hr_processamento_resultados_pessoa_nome_valido');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: dos 3 CHECK novos so % existem.', v_n;
  END IF;

  -- C2. As trocas: corpo novo = corpo antigo com as trocas (sem \r dos dois
  --     lados); SECURITY DEFINER, search_path, privilegios, dono e argumentos
  --     iguais; e, desfeitas as trocas, o corpo volta ao md5 lido nas guardas.
  FOR v_r IN SELECT a.*, e.md5_sem_cr FROM tmp_hm_antes a JOIN tmp_hm_esperado e ON e.fn = a.fn ORDER BY a.fn LOOP
    IF to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: % deixou de existir.', v_r.fn;
    END IF;
    v_esperado := v_r.prosrc;
    FOR v_t IN SELECT * FROM tmp_hm_trocas t WHERE t.fn = v_r.fn ORDER BY t.ordem LOOP
      v_esperado := replace(v_esperado, v_t.ancora, v_t.novo);
    END LOOP;
    SELECT p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
           coalesce((SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(p.proacl) AS x), '') AS proacl,
           p.proowner, pg_get_function_arguments(p.oid) AS argumentos
      INTO v_new FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF replace(v_new.prosrc, chr(13), '') IS DISTINCT FROM replace(v_esperado, chr(13), '')
       OR v_new.prosecdef IS DISTINCT FROM v_r.prosecdef
       OR v_new.proconfig IS DISTINCT FROM v_r.proconfig
       OR v_new.proacl IS DISTINCT FROM v_r.proacl
       OR v_new.proowner IS DISTINCT FROM v_r.proowner
       OR v_new.argumentos IS DISTINCT FROM v_r.argumentos THEN
      RAISE EXCEPTION 'Conferir: % mudou mais do que as trocas (corpo, SECURITY DEFINER, search_path, privilegios, dono ou argumentos).', v_r.fn;
    END IF;
    v_esperado := replace(v_new.prosrc, chr(13), '');
    FOR v_t IN SELECT * FROM tmp_hm_trocas t WHERE t.fn = v_r.fn ORDER BY t.ordem DESC LOOP
      v_esperado := replace(v_esperado, replace(v_t.novo, chr(13), ''), v_t.ancora);
    END LOOP;
    IF md5(v_esperado) IS DISTINCT FROM v_r.md5_sem_cr THEN
      RAISE EXCEPTION 'Conferir: sem as trocas, % devia voltar ao corpo lido (md5 sem \r %), e da %.', v_r.fn, v_r.md5_sem_cr, md5(v_esperado);
    END IF;
  END LOOP;
  -- A leitura: o resultado e o de antes com as tres colunas no fim.
  SELECT replace(a.resultado, ', fechado_por_nome text)',
                 ', fechado_por_nome text, planeado_minutos integer, realizado_minutos integer, pessoa_nome text)')
    INTO v_esperado FROM tmp_hm_antes a WHERE a.fn = k_ler;
  IF pg_get_function_result(to_regprocedure(k_ler)::oid) IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'Conferir: o RETURNS da leitura devia ser % e e %.', v_esperado, pg_get_function_result(to_regprocedure(k_ler)::oid);
  END IF;
  -- Uma so assinatura de cada; EXECUTE por aclexplode.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname::text = 'public'
         AND p.proname::text IN ('rpc_hr_processamento_periodo_fechar', 'hr_processamento_resultado_erro',
                                 'rpc_hr_processamento_resultados_ler')) <> 3 THEN
    RAISE EXCEPTION 'Conferir: o fecho, o validador e a leitura deviam ter uma so assinatura cada.';
  END IF;
  FOR v_r IN SELECT f.fn, f.esperado FROM (VALUES (k_fechar, 'authenticated'), (k_ler, 'authenticated'), (k_erro, '')) AS f(fn, esperado) LOOP
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',') INTO v_lista
      FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_r.fn)::oid
       AND a.privilege_type::text = 'EXECUTE'
       AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
    IF coalesce(v_lista, '') IS DISTINCT FROM v_r.esperado THEN
      RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser so "%", e "%".', v_r.fn, v_r.esperado, coalesce(v_lista, '');
    END IF;
  END LOOP;

  -- C3. O validador (puro): 480.0 e inteiro; os dois campos sao obrigatorios.
  v_payload := jsonb_build_object(
    'pessoa_id', gen_random_uuid(), 'valor_hora', 8, 'total_bruto', 1000,
    'totais', jsonb_build_object(
      'base_mes', 1000, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
      'total_regras', 0, 'desconto_faltas', 0, 'subsidio_alimentacao', 0, 'lancamentos_pontuais', NULL),
    'linhas', jsonb_build_array(), 'avisos', jsonb_build_array(),
    'retribuicao_id', NULL, 'cargo_periodo_id', NULL, 'regra_salarial_id', NULL,
    'planeado_minutos', 480, 'realizado_minutos', 0);
  IF public.hr_processamento_resultado_erro(v_payload) IS NOT NULL
     OR public.hr_processamento_resultado_erro(jsonb_set(v_payload, '{planeado_minutos}', '480.0'::jsonb)) IS NOT NULL
     OR public.hr_processamento_resultado_erro(jsonb_set(v_payload, '{realizado_minutos}', '89280'::jsonb)) IS NOT NULL
     OR public.hr_processamento_resultado_erro(v_payload || jsonb_build_object('desvios_assinatura', NULL, 'horas_extra_assinatura', NULL)) IS NOT NULL
     OR coalesce(position('falta o campo realizado_minutos' IN public.hr_processamento_resultado_erro(v_payload - 'realizado_minutos')), 0) <> 1
     OR coalesce(position('campos desconhecidos' IN public.hr_processamento_resultado_erro(v_payload || '{"contado_minutos": 1}'::jsonb)), 0) <> 1 THEN
    RAISE EXCEPTION 'Conferir: o validador devia aceitar minutos inteiros de 0 a 89280 (480.0 incluido) e os opcionais, e recusar a falta e campos desconhecidos.';
  END IF;

  -- P. Comportamento na nike, em 2099-03/04, DESFEITO no fim (sentinela P0099).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- Quem fecha e le: gerir, ver o periodo e ver a retribuicao NA NIKE.
    SELECT au.auth_user_id, au.id INTO v_uid, v_autor
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.gerir', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.view', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.retribuicao.view', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.processamento.periodo.gerir, .view e hr.pessoas.retribuicao.view.';
    END IF;
    -- P9: quem ve a assiduidade mas NAO a retribuicao, na nike.
    SELECT au.auth_user_id INTO v_uid_sem
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike), false)
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.retribuicao.view', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_sem IS NULL THEN
      v_uid_sem := gen_random_uuid();
      v_prova_p9 := 'nao provado com utilizador real: a nike nao tem um activo com hr.assiduidade.view sem hr.pessoas.retribuicao.view; provado com um utilizador sem permissoes';
    ELSE
      v_prova_p9 := 'provado com um utilizador da nike com hr.assiduidade.view e sem hr.pessoas.retribuicao.view';
    END IF;

    -- O papel authenticated pode ser assumido? (no db push o utilizador de
    -- sessao e cli_login_postgres; volta-se ao papel de antes com SET LOCAL
    -- ROLE, NUNCA RESET ROLE).
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      EXECUTE format('SET LOCAL ROLE %I', v_papel);
      v_pode_papel := true;
    EXCEPTION WHEN OTHERS THEN
      v_pode_papel := false;
    END;
    v_prova_papel := CASE WHEN v_pode_papel THEN 'leitura chamada como authenticated'
                          ELSE 'nao provado: o papel authenticated nao se pode assumir aqui; leitura chamada como ' || v_papel END;

    IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
                WHERE pp.organization_id = k_nike AND pp.data_fim >= k_ini2 AND pp.data_inicio <= k_fim) THEN
      RAISE EXCEPTION 'Conferir: a nike ja tem folhas entre % e %; a prova precisa desse intervalo livre.', k_ini2, k_fim;
    END IF;

    -- As obrigatorias de 2099-04 (o fecho exige o resultado de todas).
    SELECT array_agg(x.id ORDER BY x.id) INTO v_obrig
      FROM (SELECT DISTINCT p.id
              FROM public.pessoas p
              JOIN public.pessoas_vinculos v
                ON v.pessoa_id = p.id AND v.organization_id = p.organization_id AND v.deleted_at IS NULL
               AND v.data_inicio <= k_fim AND (v.data_fim IS NULL OR v.data_fim >= k_ini)
             WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo') x;
    v_pessoas := coalesce(cardinality(v_obrig), 0);
    IF v_pessoas < 1 THEN
      RAISE EXCEPTION 'Conferir: na nike nao ha pessoas activas com vinculo em %-%.', k_ini, k_fim;
    END IF;
    v_primeira := v_obrig[1];

    -- Desvios fora da prova: margem em vigor no intervalo desliga-se (desfeito).
    SELECT count(*)::integer INTO v_n_desvios FROM public.hr_desvios_config k WHERE k.organization_id = k_nike;
    IF EXISTS (SELECT 1 FROM public.hr_desvios_config k
                WHERE k.organization_id = k_nike AND k.substituida_em IS NULL AND k.margem_min IS NOT NULL
                  AND k.valido_de <= k_fim AND (k.valido_ate IS NULL OR k.valido_ate >= k_ini2)) THEN
      BEGIN
        PERFORM public.hr_desvios_config_guardar_core(k_nike, k_ini2, NULL, v_autor);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Conferir: a nike tem margem de desvios em vigor em 2099 e a prova nao a conseguiu desligar (%).', SQLERRM;
      END;
      v_prova_desvios := 'margem dos desvios desligada na prova a partir de ' || to_char(k_ini2, 'YYYY-MM-DD');
    ELSE
      v_prova_desvios := 'sem margem dos desvios em 2099';
    END IF;

    -- Horas extra: com o interruptor ligado ate 2099-04-30, cada resultado
    -- leva a assinatura certa (e nao pode haver pendentes de obrigatorias).
    SELECT c.aprovacao_conta_desde INTO v_he_desde
      FROM public.hr_horas_extra_config c WHERE c.organization_id = k_nike;
    v_he_ligado := v_he_desde IS NOT NULL AND v_he_desde <= k_fim;
    IF v_he_ligado AND EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                                WHERE x.organization_id = k_nike AND x.estado = 'pendente'
                                  AND x.data BETWEEN k_ini AND k_fim AND x.pessoa_id = ANY (v_obrig)) THEN
      RAISE EXCEPTION 'Conferir: a nike tem horas extra pendentes em %-%; a prova nao fecharia.', k_ini, k_fim;
    END IF;

    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 4, 'aberto', k_ini, k_fim)
    RETURNING id INTO v_per;
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 3, 'aberto', k_ini2, k_fim2)
    RETURNING id INTO v_per2;

    v_regra_id := (public.hr_regras_salariais_em(k_nike, k_fim) ->> 'id')::uuid;

    -- O resultado de cada obrigatoria; a primeira (indice 0) com o maximo do
    -- periodo em realizado_minutos (30 x 1440 = 43200, aceite).
    SELECT jsonb_agg(jsonb_build_object(
             'pessoa_id', o.id, 'valor_hora', 8, 'total_bruto', 1000,
             'totais', jsonb_build_object(
               'base_mes', 1000, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
               'total_regras', 0, 'desconto_faltas', 0, 'subsidio_alimentacao', 0, 'lancamentos_pontuais', NULL),
             'linhas', jsonb_build_array(), 'avisos', jsonb_build_array(),
             'retribuicao_id', NULL, 'cargo_periodo_id', NULL, 'regra_salarial_id', v_regra_id,
             'planeado_minutos', CASE WHEN o.id = v_primeira THEN 480 ELSE 9600 END,
             'realizado_minutos', CASE WHEN o.id = v_primeira THEN k_min_per ELSE 9000 END) ORDER BY o.ord)
      INTO v_payload
      FROM unnest(v_obrig) WITH ORDINALITY AS o(id, ord);
    IF v_he_ligado THEN
      SELECT jsonb_agg(e.value || jsonb_build_object('horas_extra_assinatura', s.assinatura) ORDER BY e.ord)
        INTO v_payload
        FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)
        LEFT JOIN public.hr_horas_extra_assinaturas_periodo(k_nike, k_ini, k_fim, v_obrig) AS s
          ON s.pessoa_id = (e.value ->> 'pessoa_id')::uuid;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- P1-P6. Recusas com 22023 e processamento_fechar_resultado_mal_formado.
    FOR v_t IN
      SELECT t.nome, t.payload, t.texto
        FROM (VALUES
          ('P1 sem planeado_minutos',    v_payload #- '{0,planeado_minutos}',                         'falta o campo planeado_minutos'),
          ('P1 sem realizado_minutos',   v_payload #- '{0,realizado_minutos}',                        'falta o campo realizado_minutos'),
          ('P1 cliente antigo (nenhum)', (SELECT jsonb_agg(e.value - 'planeado_minutos' - 'realizado_minutos' ORDER BY e.ord)
                                            FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)),
                                                                                                      'falta o campo planeado_minutos'),
          ('P2 nao inteiro',             jsonb_set(v_payload, '{0,planeado_minutos}', '480.5'::jsonb), 'planeado_minutos tem de ser um numero inteiro'),
          ('P3 negativo',                jsonb_set(v_payload, '{0,planeado_minutos}', '-1'::jsonb),    'planeado_minutos tem de ser um numero inteiro'),
          ('P4 texto',                   jsonb_set(v_payload, '{0,planeado_minutos}', '"480"'::jsonb), 'planeado_minutos tem de ser um numero inteiro'),
          ('P4 null',                    jsonb_set(v_payload, '{0,realizado_minutos}', 'null'::jsonb), 'realizado_minutos tem de ser um numero inteiro'),
          ('P5 acima de 89280',          jsonb_set(v_payload, '{0,planeado_minutos}', '89281'::jsonb), 'planeado_minutos tem de ser um numero inteiro'),
          ('P6 realizado acima do periodo', jsonb_set(v_payload, '{0,realizado_minutos}', to_jsonb(k_min_per + 1)),
                                                                                                      'acima dos minutos do periodo (43200)'),
          ('P6 planeado acima do periodo',  jsonb_set(v_payload, '{0,planeado_minutos}', to_jsonb(k_min_per + 1)),
                                                                                                      'acima dos minutos do periodo (43200)')
        ) AS t(nome, payload, texto)
    LOOP
      v_msg := NULL;
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_t.payload);
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '22023'
         OR coalesce(position('processamento_fechar_resultado_mal_formado' IN v_msg), 0) <> 1
         OR coalesce(position(v_t.texto IN v_msg), 0) = 0 THEN
        RAISE EXCEPTION 'Conferir: "%" devia dar 22023 processamento_fechar_resultado_mal_formado com "%"; deu % %.',
          v_t.nome, v_t.texto, coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
    END LOOP;
    SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
    SELECT count(*)::integer INTO v_n FROM public.hr_processamento_resultados r WHERE r.periodo_id = v_per AND r.organization_id = k_nike;
    IF v_estado IS DISTINCT FROM 'aberto' OR v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: depois das recusas o periodo devia continuar aberto e sem resultados (% / %).', v_estado, v_n;
    END IF;

    -- P7. O caminho bom (realizado = 43200 aceite): grava os minutos enviados e
    --     o nome da ficha; o periodo fecha. Medido.
    v_t0 := clock_timestamp();
    PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    v_ms_fecho := round((extract(epoch FROM clock_timestamp() - v_t0) * 1000)::numeric, 1);
    SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
    SELECT count(DISTINCT r.pessoa_id)::integer INTO v_n
      FROM public.hr_processamento_resultados r
     WHERE r.periodo_id = v_per AND r.organization_id = k_nike AND r.fechado_por = v_autor;
    IF v_estado IS DISTINCT FROM 'fechado' OR v_n <> v_pessoas THEN
      RAISE EXCEPTION 'Conferir: fechar devia deixar o periodo fechado com % pessoas (estado %, % pessoas).', v_pessoas, v_estado, v_n;
    END IF;
    SELECT * INTO v_row FROM public.hr_processamento_resultados r
     WHERE r.periodo_id = v_per AND r.organization_id = k_nike AND r.pessoa_id = v_primeira;
    SELECT p.nome_completo INTO v_nome FROM public.pessoas p WHERE p.id = v_primeira AND p.organization_id = k_nike;
    IF v_row.planeado_minutos IS DISTINCT FROM 480 OR v_row.realizado_minutos IS DISTINCT FROM k_min_per
       OR v_row.pessoa_nome IS DISTINCT FROM v_nome THEN
      RAISE EXCEPTION 'Conferir: a linha gravada devia ter 480 / % / nome da ficha; tem % / % / %.',
        k_min_per, v_row.planeado_minutos, v_row.realizado_minutos, coalesce(v_row.pessoa_nome, 'NULL');
    END IF;
    SELECT count(DISTINCT r.pessoa_id)::integer INTO v_n
      FROM public.hr_processamento_resultados r
      JOIN public.pessoas p ON p.id = r.pessoa_id AND p.organization_id = r.organization_id
     WHERE r.periodo_id = v_per AND r.organization_id = k_nike
       AND r.pessoa_nome = p.nome_completo
       AND ((r.pessoa_id = v_primeira AND r.planeado_minutos = 480 AND r.realizado_minutos = k_min_per)
            OR (r.pessoa_id <> v_primeira AND r.planeado_minutos = 9600 AND r.realizado_minutos = 9000));
    IF v_n <> v_pessoas THEN
      RAISE EXCEPTION 'Conferir: so % de % pessoas tem os minutos enviados e o nome da ficha.', v_n, v_pessoas;
    END IF;

    -- P8. Ler com as duas permissoes (como authenticated, se possivel), em
    --     paginas: as colunas novas e as antigas iguais ao gravado. Medido.
    v_total := 0;
    v_paginas := 0;
    v_depois := NULL;
    v_t0 := clock_timestamp();
    IF v_pode_papel THEN
      EXECUTE 'SET LOCAL ROLE authenticated';
    END IF;
    LOOP
      SELECT count(*)::integer, (array_agg(x.pessoa_id ORDER BY x.pessoa_id DESC))[1] INTO v_pag_n, v_pag_ult
        FROM public.rpc_hr_processamento_resultados_ler(v_per, v_depois) AS x;
      v_total := v_total + v_pag_n;
      v_paginas := v_paginas + 1;
      EXIT WHEN v_pag_n < 500;
      v_depois := v_pag_ult;
    END LOOP;
    v_ms_ler := round((extract(epoch FROM clock_timestamp() - v_t0) * 1000)::numeric, 1);
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.pessoa_id) INTO v_lido
      FROM public.rpc_hr_processamento_resultados_ler(v_per) AS x;
    IF v_pode_papel THEN
      EXECUTE format('SET LOCAL ROLE %I', v_papel);
    END IF;
    IF v_total <> v_pessoas THEN
      RAISE EXCEPTION 'Conferir: ler em paginas devia devolver % linhas e devolveu % (% paginas).', v_pessoas, v_total, v_paginas;
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
             'pessoa_id', r.pessoa_id, 'valor_hora', r.valor_hora, 'total_bruto', r.total_bruto,
             'totais', r.totais, 'linhas', r.linhas, 'avisos', r.avisos,
             'retribuicao_id', r.retribuicao_id, 'cargo_periodo_id', r.cargo_periodo_id,
             'regra_salarial_id', r.regra_salarial_id, 'fechado_em', r.fechado_em,
             'fechado_por_nome', u.name::text,
             'planeado_minutos', r.planeado_minutos, 'realizado_minutos', r.realizado_minutos,
             'pessoa_nome', r.pessoa_nome) ORDER BY r.pessoa_id)
      INTO v_gravado
      FROM (SELECT * FROM public.hr_processamento_resultados r0
             WHERE r0.periodo_id = v_per AND r0.organization_id = k_nike
             ORDER BY r0.pessoa_id LIMIT 500) r
      LEFT JOIN public.anew_users u ON u.id = r.fechado_por;
    IF v_lido IS DISTINCT FROM v_gravado THEN
      RAISE EXCEPTION 'Conferir: o que a leitura devolve nao e o gravado (colunas antigas ou novas).';
    END IF;

    -- P9. Sem hr.pessoas.retribuicao.view: ler recusado (42501) e a tabela
    --     directa nao mostra nada.
    PERFORM set_config('request.jwt.claim.sub', v_uid_sem::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid_sem, 'role', 'authenticated')::text, true);
    v_msg := NULL;
    v_st := NULL;
    BEGIN
      IF v_pode_papel THEN
        EXECUTE 'SET LOCAL ROLE authenticated';
      END IF;
      PERFORM 1 FROM public.rpc_hr_processamento_resultados_ler(v_per);
      IF v_pode_papel THEN
        EXECUTE format('SET LOCAL ROLE %I', v_papel);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- a subtransaccao desfeita repoe tambem o papel de antes
      v_msg := SQLERRM;
      v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM '42501'
       OR coalesce(position('processamento_resultados_sem_permissao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: ler sem hr.pessoas.retribuicao.view devia dar 42501 processamento_resultados_sem_permissao; deu % %.',
        coalesce(v_st, 'aceite'), coalesce(v_msg, '');
    END IF;
    IF v_pode_papel THEN
      v_n := NULL;
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*)::integer INTO v_n FROM public.hr_processamento_resultados r
       WHERE r.periodo_id = v_per AND r.organization_id = k_nike;
      EXECUTE format('SET LOCAL ROLE %I', v_papel);
      IF v_n IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'Conferir: sem hr.pessoas.retribuicao.view o select directo devia dar 0 linhas e deu %.', v_n;
      END IF;
    ELSE
      v_prova_p9 := v_prova_p9 || '; select directo a tabela nao provado (papel authenticated nao assumivel)';
    END IF;

    -- Periodo fechado: fechar outra vez recusado.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('ja esta fechado' IN v_msg), 0) = 0 THEN
      RAISE EXCEPTION 'Conferir: fechar um periodo fechado devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- P10. Imutavel: UPDATE de cada coluna nova recusado (mesmo ao dono);
    --      INSERT num periodo fechado recusado.
    v_n := 0;
    BEGIN UPDATE public.hr_processamento_resultados SET planeado_minutos = 0 WHERE periodo_id = v_per AND organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE = '22000' AND position('processamento_resultados_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN UPDATE public.hr_processamento_resultados SET realizado_minutos = 0 WHERE periodo_id = v_per AND organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE = '22000' AND position('processamento_resultados_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN UPDATE public.hr_processamento_resultados SET pessoa_nome = 'outro' WHERE periodo_id = v_per AND organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE = '22000' AND position('processamento_resultados_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN
      INSERT INTO public.hr_processamento_resultados (organization_id, periodo_id, pessoa_id, totais, linhas, fechado_por,
                                                      planeado_minutos, realizado_minutos, pessoa_nome)
      VALUES (k_nike, v_per, v_primeira, '{}'::jsonb, '[]'::jsonb, v_autor, 0, 0, 'prova');
    EXCEPTION WHEN OTHERS THEN IF position('processamento_resultados_periodo_fechado' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'Conferir: das 4 escritas proibidas (3 UPDATE das colunas novas, INSERT em periodo fechado) so % foram recusadas.', v_n;
    END IF;

    -- P12. Os CHECK e o NOT NULL da tabela (ultima linha de defesa), num
    --      periodo ABERTO (2099-03), escrevendo como dono.
    v_n := 0;
    BEGIN
      INSERT INTO public.hr_processamento_resultados (organization_id, periodo_id, pessoa_id, totais, linhas, fechado_por,
                                                      planeado_minutos, realizado_minutos, pessoa_nome)
      VALUES (k_nike, v_per2, v_primeira, '{}'::jsonb, '[]'::jsonb, v_autor, 89281, 0, 'prova');
    EXCEPTION WHEN check_violation THEN v_n := v_n + 1; END;
    BEGIN
      INSERT INTO public.hr_processamento_resultados (organization_id, periodo_id, pessoa_id, totais, linhas, fechado_por,
                                                      planeado_minutos, realizado_minutos, pessoa_nome)
      VALUES (k_nike, v_per2, v_primeira, '{}'::jsonb, '[]'::jsonb, v_autor, 0, -1, 'prova');
    EXCEPTION WHEN check_violation THEN v_n := v_n + 1; END;
    BEGIN
      INSERT INTO public.hr_processamento_resultados (organization_id, periodo_id, pessoa_id, totais, linhas, fechado_por,
                                                      planeado_minutos, realizado_minutos, pessoa_nome)
      VALUES (k_nike, v_per2, v_primeira, '{}'::jsonb, '[]'::jsonb, v_autor, 0, 0, '   ');
    EXCEPTION WHEN check_violation THEN v_n := v_n + 1; END;
    BEGIN
      INSERT INTO public.hr_processamento_resultados (organization_id, periodo_id, pessoa_id, totais, linhas, fechado_por,
                                                      realizado_minutos, pessoa_nome)
      VALUES (k_nike, v_per2, v_primeira, '{}'::jsonb, '[]'::jsonb, v_autor, 0, 'prova');
    EXCEPTION WHEN not_null_violation THEN v_n := v_n + 1; END;
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'Conferir: dos 4 INSERT invalidos (minutos fora do intervalo x2, nome vazio, sem minutos) so % foram recusados pela tabela.', v_n;
    END IF;

    -- Desempenho (so informacao): o plano da pagina de leitura.
    v_plano := '';
    FOR v_linha IN EXECUTE format(
      'EXPLAIN SELECT r.pessoa_id FROM public.hr_processamento_resultados r WHERE r.periodo_id = %L::uuid AND r.organization_id = %L::uuid ORDER BY r.pessoa_id LIMIT 500',
      v_per, k_nike)
    LOOP
      v_plano := v_plano || ' | ' || v_linha;
    END LOOP;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Medida (so informacao, nao falha): fecho de % pessoa(s) da nike em % ms; leitura em % pagina(s) em % ms; indice periodo_pessoa no plano: %. Plano:%',
      v_pessoas, v_ms_fecho, v_paginas, v_ms_ler,
      CASE WHEN position('hr_processamento_resultados_periodo_pessoa_key' IN v_plano) > 0 THEN 'sim' ELSE 'nao (poucas linhas: o planeador pode preferir outro caminho)' END,
      v_plano;
    RAISE NOTICE 'Conferir: prova na nike em 2099-03/04; %; %; P9: %; horas extra: %.',
      v_prova_papel, v_prova_desvios, v_prova_p9,
      CASE WHEN v_he_ligado THEN 'interruptor ligado, assinaturas enviadas' ELSE 'interruptor desligado' END;
    RAISE EXCEPTION 'teste_fecho_grava_horas_ok' USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF current_user::text IS DISTINCT FROM v_papel THEN
    RAISE EXCEPTION 'Conferir: o papel no fim (%) nao e o do inicio (%).', current_user::text, v_papel;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
              WHERE pp.organization_id = k_nike AND pp.ano = 2099 AND pp.mes IN (3, 4))
     OR EXISTS (SELECT 1 FROM public.hr_processamento_resultados r WHERE r.organization_id = k_nike)
     OR (SELECT count(*) FROM public.hr_desvios_config k WHERE k.organization_id = k_nike) IS DISTINCT FROM v_n_desvios THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: colunas planeado_minutos, realizado_minutos (integer 0..89280) e pessoa_nome (text 1..300) NOT NULL com CHECK; fecho, validador e leitura = corpos lidos + trocas, com SECURITY DEFINER, search_path, privilegios e dono iguais; fecho recusa minutos em falta, nao inteiros, negativos, texto, null, acima de 89280 e acima do periodo (22023, nada gravado, periodo aberto) e grava os enviados com o nome da ficha; leitura devolve as colunas novas no fim; sem retribuicao recusa (42501); imutavel; tabela recusa fora do intervalo e sem minutos.';
END;
$conferir$;

COMMIT;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): so este ficheiro
--    pendente, com carimbo acima do maximo do remoto.
-- 2. Prova na nike ANTES do push: correr este ficheiro numa transaccao
--    terminada por ROLLBACK (trocar o COMMIT final): as guardas confirmam os
--    corpos do remoto e a tabela vazia, o conferir prova o resto e mede o
--    fecho e a leitura (NOTICE).
-- 3. O cliente (resultadosFecho.ts, Visao geral, Fluxo e Custos) entra no
--    MESMO envio e e publicado logo a seguir ao push: entre os dois, fechar e
--    recusado com 22023 e nada se grava.
-- ==============================================================================
