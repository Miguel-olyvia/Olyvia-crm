-- ==============================================================================
-- Nao pode haver dois cargos com o mesmo nome na mesma organizacao -- mesmo que
-- se escrevam de maneira diferente.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO MESMO COMMIT: o ecra dos cargos (CargosGestao) tem de
-- traduzir a recusa nova, HRC14 (mensagem "cargo_nome_duplicado: ja existe o
-- cargo ..."), e avisar antes de gravar. Sem o codigo novo, quem cria ou renomeia
-- um cargo com um nome repetido ve o erro em bruto em vez do aviso. O codigo novo
-- sozinho (sem esta migration) nao parte nada: so avisa antes de gravar.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Hoje so existe UNIQUE (organization_id, nome) EXACTO (constraint
-- hr_cargos_nome_unico_por_org, 20261202070000). Foi confirmado ao vivo que
-- "administrativo(a)", "Administrativo(a) " (espaco no fim) e "Administrativo
-- (a)" foram ACEITES ao lado de "Administrativo(a)": quatro cargos que a pessoa
-- que os escolhe nao distingue, e as pessoas ficam espalhadas por eles.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Dois nomes sao o mesmo se tiverem a mesma CHAVE: minusculas, sem acentos e sem
-- tudo o que nao seja letra ou digito. "Tecnico(a)", "tecnico a" e "Tecnico (a)"
-- (com acento) colidem. Vale tambem para cargos desactivados (o ecra diz "existe,
-- desactivado"). Em organizacoes diferentes o mesmo nome e permitido.
--
-- 1. public.hr_cargo_nome_chave(text): IMMUTABLE, STRICT, PARALLEL SAFE. Tira os
--    acentos com translate() e uma lista fechada de letras latinas (minusculas E
--    maiusculas, para nao depender do locale), poe em minusculas e tira o que nao
--    e letra nem digito. Nao usa a extensao unaccent. Espelho exacto:
--    src/lib/hr/cargosNome.ts (chaveDoNomeDoCargo); a paridade tem teste.
-- 2. Verificacao previa: se ja houver duplicados por chave, a migration ABORTA e
--    lista-os (organizacao, ids, nomes). Resolvem-se a mao (renomear ou
--    desactivar) e volta-se a correr. Nao ha como escolher sozinho qual fica.
-- 3. Normaliza os nomes existentes (espacos das pontas tirados, os do meio
--    colapsados). Nao pode colidir: a verificacao previa ja garantiu que nenhuma
--    chave esta repetida.
-- 4. UNIQUE INDEX (organization_id, hr_cargo_nome_chave(nome)). O constraint
--    antigo fica (inofensivo: o que ele recusa o indice novo tambem recusa).
-- 5. Trigger BEFORE INSERT OR UPDATE OF nome: grava o nome normalizado, recusa um
--    nome vazio ou sem nenhuma letra ou digito (HRC03, cargo_dados_invalidos) e,
--    se existir OUTRO cargo da mesma organizacao com a mesma chave, lanca HRC14
--    (cargo_nome_duplicado), com " (desactivado)" na mensagem quando e o caso.
--
-- O trigger corre com os direitos de QUEM GRAVA (SECURITY INVOKER), de proposito:
-- um BEFORE ROW corre antes da politica de INSERT, e um SECURITY DEFINER deixaria
-- qualquer utilizador autenticado descobrir os nomes dos cargos de OUTRA
-- organizacao pondo o organization_id dela no INSERT. Em INVOKER so se ve o que a
-- RLS deixa ver (hr.pessoas.laborais.view). Se a RLS esconder o cargo, quem
-- decide e o indice unico (23505, que o ecra traduz da mesma maneira). Le so
-- colunas que authenticated pode ler (nao toca em salario_base nem em
-- periodicidade) e esta migration nao mexe nas grants de hr_cargos.
--
-- HRC14 e novo: o maior codigo HRC ate aqui era o HRC13.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER IF EXISTS trg_hr_cargos_nome_sem_duplicados ON public.hr_cargos;
--   DROP FUNCTION IF EXISTS public.hr_cargos_nome_sem_duplicados();
--   DROP INDEX IF EXISTS public.hr_cargos_nome_chave_unica_por_org;
--   DROP FUNCTION IF EXISTS public.hr_cargo_nome_chave(text);
-- (os nomes ja normalizados ficam como estao.)
--
--
-- -- ATENCAO: MUDAR O CORPO DE hr_cargo_nome_chave ---------------------------
--
-- O indice hr_cargos_nome_chave_unica_por_org guarda o RESULTADO de
-- hr_cargo_nome_chave(nome) para cada linha. Qualquer mudanca ao corpo desta
-- funcao (uma letra a mais na lista de acentos, outra regex) obriga a:
--   1. REINDEX do indice (senao as chaves guardadas ficam desfasadas das novas e
--      o indice deixa de recusar duplicados, ou recusa o que nao devia); e
--   2. actualizar o espelho src/lib/hr/cargosNome.ts (chaveDoNomeDoCargo) e os
--      casos partilhados, no mesmo commit.
-- Antes de mudar, verificar tambem que nao nascem duplicados com a chave nova.
--
--
-- Prerequisitos:
--   hr_cargos vem de 20261202070000 (hr_cargos_salario_igual) no repositorio, e
--   da copia renumerada 20261207022100 no branch onde a migration foi escrita. O
--   que interessa e a tabela existir (a guarda abaixo confirma-o); nao aplicar
--   as duas.
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_cargos') IS NULL THEN
    RAISE EXCEPTION 'hr_cargos nao existe. Aplicar 20261202070000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A chave do nome
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_cargo_nome_chave(nome text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path TO 'pg_catalog', 'pg_temp'
SET standard_conforming_strings TO on
AS $$
  SELECT regexp_replace(
    lower(translate(nome, U&'\00e0\00c0\00e1\00c1\00e2\00c2\00e3\00c3\00e4\00c4\00e5\00c5\0101\0100\0103\0102\0105\0104\00e7\00c7\0107\0106\010d\010c\010f\010e\0111\0110\00e8\00c8\00e9\00c9\00ea\00ca\00eb\00cb\0113\0112\011b\011a\0119\0118\011f\011e\00ec\00cc\00ed\00cd\00ee\00ce\00ef\00cf\012b\012a\0142\0141\00f1\00d1\0144\0143\0148\0147\00f2\00d2\00f3\00d3\00f4\00d4\00f5\00d5\00f6\00d6\00f8\00d8\014d\014c\0151\0150\0161\0160\015b\015a\015f\015e\0163\0162\0165\0164\00f9\00d9\00fa\00da\00fb\00db\00fc\00dc\016b\016a\016f\016e\0171\0170\0173\0172\00fd\00dd\00ff\0178\017e\017d\017a\0179\017c\017b', 'aaaaaaaaaaaaaaaaaaccccccddddeeeeeeeeeeeeeeggiiiiiiiiiillnnnnnnoooooooooooooooossssssttttuuuuuuuuuuuuuuuuyyyyzzzzzz')),
    '[^[:alnum:]]', '', 'g')
$$;

COMMENT ON FUNCTION public.hr_cargo_nome_chave(text) IS
'A chave de um nome de cargo: sem acentos (lista fechada de letras latinas, minusculas e maiusculas), em minusculas e sem tudo o que nao seja letra ou digito. Dois nomes sao o mesmo cargo se tiverem a mesma chave. IMMUTABLE (serve de indice); NULL da NULL. Espelho exacto de chaveDoNomeDoCargo em src/lib/hr/cargosNome.ts.';

REVOKE ALL ON FUNCTION public.hr_cargo_nome_chave(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_cargo_nome_chave(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_cargo_nome_chave(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_cargo_nome_chave(text) TO service_role;

-- ==============================================================================
-- 2. Verificacao previa: ja ha cargos duplicados? Aborta, sem alterar nada.
-- ==============================================================================
DO $duplicados$
DECLARE
  v_grupos integer;
  v_lista  text;
BEGIN
  WITH grupos AS (
    SELECT c.organization_id,
           public.hr_cargo_nome_chave(c.nome) AS chave,
           string_agg(
             format('"%s" (id %s, %s)', c.nome, c.id,
                    CASE WHEN c.activo THEN 'activo' ELSE 'desactivado' END),
             '; ' ORDER BY c.created_at, c.id) AS cargos
      FROM public.hr_cargos c
     GROUP BY c.organization_id, public.hr_cargo_nome_chave(c.nome)
    HAVING count(*) > 1
  )
  SELECT (SELECT count(*) FROM grupos),
         (SELECT string_agg(format('organizacao %s: %s', g.organization_id, g.cargos), E'\n'
                            ORDER BY g.organization_id, g.chave)
            FROM (SELECT * FROM grupos ORDER BY organization_id, chave LIMIT 20) g)
    INTO v_grupos, v_lista;

  IF v_grupos > 0 THEN
    RAISE EXCEPTION
      E'Ha % grupos de cargos duplicados (mesmo nome depois de tirar acentos, maiusculas, espacos e pontuacao). Renomear ou desactivar os repetidos e voltar a correr. Nada foi alterado. Primeiros 20:\n%',
      v_grupos, v_lista;
  END IF;
END;
$duplicados$;

-- Um cargo existente cujo nome nao tenha nenhuma letra ou digito (so espacos ou
-- pontuacao) tem chave vazia: o trigger novo recusaria qualquer gravacao dele e
-- o indice juntaria todos os cargos assim. Aborta, sem alterar nada.
DO $vazios$
DECLARE
  v_vazios integer;
  v_lista  text;
BEGIN
  WITH vazios AS (
    SELECT c.id, c.organization_id, c.nome, c.created_at
      FROM public.hr_cargos c
     WHERE public.hr_cargo_nome_chave(c.nome) = ''
  )
  SELECT (SELECT count(*) FROM vazios),
         (SELECT string_agg(format('id %s, organizacao %s, nome "%s"', v.id, v.organization_id, v.nome), E'\n'
                            ORDER BY v.organization_id, v.created_at, v.id)
            FROM (SELECT * FROM vazios ORDER BY organization_id, created_at, id LIMIT 20) v)
    INTO v_vazios, v_lista;

  IF v_vazios > 0 THEN
    RAISE EXCEPTION
      E'Ha % cargos sem nenhuma letra ou digito no nome (so espacos ou pontuacao). Renomear cada um e voltar a correr. Nada foi alterado. Primeiros 20:\n%',
      v_vazios, v_lista;
  END IF;
END;
$vazios$;

-- ==============================================================================
-- 3. Normalizar os nomes existentes (so espacos: nao muda maiusculas nem acentos)
-- ==============================================================================
UPDATE public.hr_cargos
   SET nome = btrim(regexp_replace(nome, '[[:space:]]+', ' ', 'g'))
 WHERE nome IS DISTINCT FROM btrim(regexp_replace(nome, '[[:space:]]+', ' ', 'g'));

-- ==============================================================================
-- 4. O indice unico por (organizacao, chave). O constraint antigo fica.
-- ==============================================================================
-- O IF NOT EXISTS abaixo saltaria em silencio um indice com este nome mas outra
-- definicao (ou nao unico). Recusa-se antes.
DO $indice_previo$
BEGIN
  IF to_regclass('public.hr_cargos_nome_chave_unica_por_org') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_index i
        WHERE i.indexrelid = to_regclass('public.hr_cargos_nome_chave_unica_por_org')
          AND i.indrelid = to_regclass('public.hr_cargos')
          AND i.indisunique AND i.indpred IS NULL
          AND position('hr_cargo_nome_chave' IN pg_get_indexdef(i.indexrelid)) > 0
          AND position('organization_id' IN pg_get_indexdef(i.indexrelid)) > 0
     ) THEN
    RAISE EXCEPTION 'Ja existe um indice hr_cargos_nome_chave_unica_por_org que nao e o esperado (UNIQUE sobre organization_id e hr_cargo_nome_chave(nome)). Apagar ou renomear esse indice e voltar a correr.';
  END IF;
END;
$indice_previo$;

CREATE UNIQUE INDEX IF NOT EXISTS hr_cargos_nome_chave_unica_por_org
  ON public.hr_cargos (organization_id, public.hr_cargo_nome_chave(nome));

-- ==============================================================================
-- 5. O trigger: nome normalizado, sem nomes vazios, sem duplicados (HRC03, HRC14)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_cargos_nome_sem_duplicados()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_nome  text;
  v_chave text;
  v_outro record;
BEGIN
  v_nome := btrim(regexp_replace(coalesce(NEW.nome, ''), '[[:space:]]+', ' ', 'g'));
  v_chave := public.hr_cargo_nome_chave(v_nome);

  IF v_chave = '' THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o nome do cargo tem de ter pelo menos uma letra ou um digito.'
      USING ERRCODE = 'HRC03',
            HINT = 'Escrever um nome com pelo menos uma letra ou um digito.';
  END IF;

  NEW.nome := v_nome;

  SELECT c.nome, c.activo
    INTO v_outro
    FROM public.hr_cargos c
   WHERE c.organization_id = NEW.organization_id
     AND c.id IS DISTINCT FROM NEW.id
     AND public.hr_cargo_nome_chave(c.nome) = v_chave
   ORDER BY c.activo DESC, c.created_at, c.id
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'cargo_nome_duplicado: ja existe o cargo "%"%',
      v_outro.nome,
      CASE WHEN v_outro.activo THEN '' ELSE ' (desactivado)' END
      USING ERRCODE = 'HRC14',
            HINT = 'Usar o cargo que ja existe (ou reactiva-lo, se estiver desactivado) ou escolher outro nome.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_cargos_nome_sem_duplicados() IS
'BEFORE INSERT OR UPDATE OF nome em hr_cargos. Grava o nome normalizado (espacos das pontas tirados e os do meio colapsados), recusa um nome sem nenhuma letra ou digito (HRC03) e recusa o nome de um cargo cuja chave (hr_cargo_nome_chave) ja existe noutro cargo da MESMA organizacao, activo ou desactivado (HRC14, com (desactivado) na mensagem quando e o caso). SECURITY INVOKER de proposito: so ve o que a RLS deixa ver, para nao revelar nomes de cargos de outra organizacao. Se a RLS esconder o outro cargo, o indice unico decide (23505).';

DROP TRIGGER IF EXISTS trg_hr_cargos_nome_sem_duplicados ON public.hr_cargos;
CREATE TRIGGER trg_hr_cargos_nome_sem_duplicados
  BEFORE INSERT OR UPDATE OF nome ON public.hr_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_cargos_nome_sem_duplicados();

-- ==============================================================================
-- Conferir. Estrutura + teste fabricado (duas organizacoes proprias). Bloco
-- aninhado que TERMINA sempre em HR900: tudo o que o teste cria e desfeito.
-- Nao testa a RLS (numa migration auth.uid() e nulo e o papel ignora-a): o
-- trigger em INVOKER sob RLS confirma-se ao vivo na nike.
-- ==============================================================================
DO $conferir$
DECLARE
  v_acessivel text;
BEGIN
  -- 1. Estrutura
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.hr_cargo_nome_chave(text)')
       AND p.provolatile = 'i' AND p.proisstrict AND p.proparallel = 's'
  ) THEN
    RAISE EXCEPTION 'hr_cargo_nome_chave devia ser IMMUTABLE, STRICT e PARALLEL SAFE.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'hr_cargos_nome_chave_unica_por_org'
       AND c.relnamespace = 'public'::regnamespace
       AND i.indrelid = to_regclass('public.hr_cargos')
       AND i.indisunique AND i.indpred IS NULL
       AND position('hr_cargo_nome_chave' IN pg_get_indexdef(i.indexrelid)) > 0
       AND position('organization_id' IN pg_get_indexdef(i.indexrelid)) > 0
  ) THEN
    RAISE EXCEPTION 'O indice hr_cargos_nome_chave_unica_por_org nao existe, ou nao e UNIQUE sobre (organization_id, hr_cargo_nome_chave(nome)).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_cargos_nome_unico_por_org' AND conrelid = to_regclass('public.hr_cargos')
  ) THEN
    RAISE EXCEPTION 'O constraint antigo hr_cargos_nome_unico_por_org devia continuar la.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_hr_cargos_nome_sem_duplicados' AND tgrelid = to_regclass('public.hr_cargos')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_hr_cargos_nome_sem_duplicados nao ficou criado.';
  END IF;

  -- 2. Privilegios: a funcao da chave so para authenticated e service_role
  IF has_function_privilege('anon', 'public.hr_cargo_nome_chave(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargo_nome_chave nao devia ser executavel por anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hr_cargo_nome_chave(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_cargo_nome_chave(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargo_nome_chave devia ser executavel por authenticated e service_role (o indice usa-a em cada INSERT).';
  END IF;

  -- authenticated continua sem ler as colunas de salario de hr_cargos
  SELECT string_agg(a.attname, ', ') INTO v_acessivel
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_cargos')
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN ('salario_base', 'periodicidade')
     AND has_column_privilege('authenticated', 'public.hr_cargos', a.attname, 'SELECT');
  IF v_acessivel IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated nao devia poder ler: %.', v_acessivel;
  END IF;

  -- 3. Teste fabricado
  DECLARE
    v_org    uuid;
    v_org2   uuid;
    v_c1     uuid;
    v_c2     uuid;
    v_c3     uuid;
    v_nome   text;
    v_msg    text;
    v_gravado text;
    v_caso   record;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210160000 A (descartavel)')
    RETURNING id INTO v_org;
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210160000 B (descartavel)')
    RETURNING id INTO v_org2;

    -- A. A chave: os mesmos casos de src/lib/hr/__tests__/cargosNomeCasos.ts
    --    (um teste confirma que esta lista e igual a do TypeScript).
    FOR v_caso IN
      SELECT * FROM (VALUES
        -- CASOS-CHAVE-INICIO
        ('Administrativo(a)', 'administrativoa'),
        ('administrativo(a)', 'administrativoa'),
        ('Administrativo(a) ', 'administrativoa'),
        ('Administrativo (a)', 'administrativoa'),
        ('Tecnico(a)', 'tecnicoa'),
        ('tecnico a', 'tecnicoa'),
        (U&'T\00e9cnico (a)', 'tecnicoa'),
        (U&'Concei\00e7\00e3o', 'conceicao'),
        (U&'A\00c7\00c3O \00d1andu', 'acaonandu'),
        (U&'\0141\00f3d\017a', 'lodz'),
        ('Diretor/a', 'diretora'),
        (U&'Gestor de Opera\00e7\00f5es 2', 'gestordeoperacoes2'),
        (U&'Gestor de Opera\00e7\00f5es 3', 'gestordeoperacoes3'),
        ('', ''),
        ('   ', ''),
        ('---', ''),
        ('(  )', '')
        -- CASOS-CHAVE-FIM
      ) AS t(nome, chave)
    LOOP
      IF public.hr_cargo_nome_chave(v_caso.nome) IS DISTINCT FROM v_caso.chave THEN
        RAISE EXCEPTION 'A chave de "%" devia ser "%", e "%".',
          v_caso.nome, v_caso.chave, public.hr_cargo_nome_chave(v_caso.nome) USING ERRCODE = 'HR901';
      END IF;
    END LOOP;
    IF public.hr_cargo_nome_chave(NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'A chave de NULL devia ser NULL (STRICT).' USING ERRCODE = 'HR902';
    END IF;

    -- B. O primeiro cargo grava-se, com o nome normalizado.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, '  Administrativo(a)  ', 0, 'mensal') RETURNING id, nome INTO v_c1, v_gravado;
    IF v_gravado <> 'Administrativo(a)' THEN
      RAISE EXCEPTION 'O nome devia ter sido gravado normalizado ("Administrativo(a)"), e "%".', v_gravado
        USING ERRCODE = 'HR903';
    END IF;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, E'Gestor \t  de   Loja', 0, 'mensal') RETURNING id, nome INTO v_c2, v_gravado;
    IF v_gravado <> 'Gestor de Loja' THEN
      RAISE EXCEPTION 'Os espacos do meio deviam ter sido colapsados ("Gestor de Loja"), e "%".', v_gravado
        USING ERRCODE = 'HR904';
    END IF;

    -- C. Os quatro nomes do problema, e as variantes com acentos, sao recusados.
    FOREACH v_nome IN ARRAY ARRAY[
      'administrativo(a)', 'Administrativo(a) ', 'Administrativo (a)', 'ADMINISTRATIVO A',
      U&'Administr\00e1tivo(a)', U&'ADMINISTR\00c1TIVO (A)'
    ]
    LOOP
      BEGIN
        INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
        VALUES (v_org, v_nome, 0, 'mensal');
        RAISE EXCEPTION 'O nome "%" devia ter sido recusado (HRC14).', v_nome USING ERRCODE = 'HR905';
      EXCEPTION
        WHEN SQLSTATE 'HRC14' THEN
          GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
          IF v_msg <> 'cargo_nome_duplicado: ja existe o cargo "Administrativo(a)"' THEN
            RAISE EXCEPTION 'A mensagem do HRC14 devia dizer o cargo existente; foi: %.', v_msg USING ERRCODE = 'HR906';
          END IF;
      END;
    END LOOP;

    -- D. Renomear OUTRO cargo para um nome repetido tambem e recusado.
    BEGIN
      UPDATE public.hr_cargos SET nome = 'administrativo (a)' WHERE id = v_c2;
      RAISE EXCEPTION 'Renomear para um nome repetido devia ter sido recusado (HRC14).' USING ERRCODE = 'HR907';
    EXCEPTION
      WHEN SQLSTATE 'HRC14' THEN NULL;
    END;

    -- E. Um cargo nao colide consigo proprio: mudar so as maiusculas passa, e o
    --    nome igual ao actual tambem.
    UPDATE public.hr_cargos SET nome = 'ADMINISTRATIVO (A)' WHERE id = v_c1 RETURNING nome INTO v_gravado;
    IF v_gravado <> 'ADMINISTRATIVO (A)' THEN
      RAISE EXCEPTION 'Mudar so as maiusculas do proprio cargo devia passar, e ficou "%".', v_gravado
        USING ERRCODE = 'HR908';
    END IF;
    UPDATE public.hr_cargos SET nome = nome WHERE id = v_c1;

    -- F. Um cargo DESACTIVADO conta, e a mensagem di-lo.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade, activo)
    VALUES (v_org, U&'Antigo Cargo \00c9', 0, 'mensal', false) RETURNING id INTO v_c3;
    BEGIN
      INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
      VALUES (v_org, 'antigo  cargo e', 0, 'mensal');
      RAISE EXCEPTION 'Um nome igual ao de um cargo desactivado devia ter sido recusado (HRC14).' USING ERRCODE = 'HR909';
    EXCEPTION
      WHEN SQLSTATE 'HRC14' THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg <> U&'cargo_nome_duplicado: ja existe o cargo "Antigo Cargo \00c9" (desactivado)' THEN
          RAISE EXCEPTION 'A mensagem devia dizer (desactivado); foi: %.', v_msg USING ERRCODE = 'HR910';
        END IF;
    END;

    -- F2. Um cargo com deleted_at preenchido continua a contar como existente.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade, deleted_at)
    VALUES (v_org, 'Cargo Apagado X', 0, 'mensal', now());
    BEGIN
      INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
      VALUES (v_org, 'cargo  apagado x', 0, 'mensal');
      RAISE EXCEPTION 'Um nome igual ao de um cargo com deleted_at devia ter sido recusado (HRC14).' USING ERRCODE = 'HR915';
    EXCEPTION
      WHEN SQLSTATE 'HRC14' THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg <> 'cargo_nome_duplicado: ja existe o cargo "Cargo Apagado X"' THEN
          RAISE EXCEPTION 'A recusa contra o cargo com deleted_at devia citar o seu nome; foi: %.', v_msg USING ERRCODE = 'HR916';
        END IF;
    END;

    -- G. Sem letra nem digito (ou vazio) e recusado com HRC03.
    FOREACH v_nome IN ARRAY ARRAY['', '   ', '---', '(  )']
    LOOP
      BEGIN
        INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
        VALUES (v_org, v_nome, 0, 'mensal');
        RAISE EXCEPTION 'O nome "%" devia ter sido recusado (HRC03).', v_nome USING ERRCODE = 'HR911';
      EXCEPTION
        WHEN SQLSTATE 'HRC03' THEN NULL;
      END;
    END LOOP;
    BEGIN
      UPDATE public.hr_cargos SET nome = '...' WHERE id = v_c2;
      RAISE EXCEPTION 'Renomear para so pontuacao devia ter sido recusado (HRC03).' USING ERRCODE = 'HR912';
    EXCEPTION
      WHEN SQLSTATE 'HRC03' THEN NULL;
    END;

    -- H. Noutra organizacao o mesmo nome e permitido -- e a recusa nao fala dos
    --    cargos da primeira.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org2, 'Administrativo(a)', 0, 'mensal');
    BEGIN
      INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
      VALUES (v_org2, 'administrativo (a)', 0, 'mensal');
      RAISE EXCEPTION 'Dois nomes iguais na organizacao B (mesma chave) deviam ter sido recusados.' USING ERRCODE = 'HR913';
    EXCEPTION
      WHEN SQLSTATE 'HRC14' THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg <> 'cargo_nome_duplicado: ja existe o cargo "Administrativo(a)"' THEN
          RAISE EXCEPTION 'A recusa na organizacao B devia citar o cargo da propria B; foi: %.', v_msg USING ERRCODE = 'HR914';
        END IF;
    END;

    RAISE EXCEPTION 'teste_cargos_nome_sem_duplicados_20261210160000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo o que o teste criou e desfeito pela subtransaccao
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migration (nomes de cargos sem duplicados) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE
    'OK: hr_cargo_nome_chave e IMMUTABLE e igual ao espelho do TypeScript nos casos fixos; o indice unico e o trigger recusam o mesmo nome na mesma organizacao (maiusculas, espacos, pontuacao e acentos) com HRC14, tambem contra cargos desactivados; nome vazio ou sem letras da HRC03; o proprio cargo nao colide consigo; outra organizacao pode repetir o nome; o nome fica gravado normalizado.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes: so pode estar
--    pendente este ficheiro (alem dos que ja estavam combinados).
-- 2. Esta migration ABORTA se a organizacao ja tiver cargos duplicados por chave
--    (por exemplo "Administrativo(a)" e "administrativo(a)", que foram aceites
--    ao vivo). Ler primeiro, so com select, que cargos ha e resolver a mao: a
--    escolha de qual fica e de quem gere os cargos. Nao ha como a migration
--    escolher sozinha.
-- 3. Migration e codigo entram juntos (CargosGestao e errosCargo).
-- 4. Quando for para a base partilhada, chega a todas as organizacoes: o nome de
--    um cargo passa a ser guardado sem espacos a mais, e nomes repetidos deixam
--    de se poder criar. Dizer ao Miguel e esperar autorizacao.
-- ==============================================================================
