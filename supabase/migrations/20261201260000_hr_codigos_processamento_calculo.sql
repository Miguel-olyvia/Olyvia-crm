-- ==============================================================================
-- hr_codigos_processamento -- COMO cada codigo se calcula (so o parametro, sem
-- ligacao nenhuma a assiduidade ainda).
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- hr_codigos_processamento (20261201190000, organization_id obrigatorio desde
-- 20261201250000) e so um catalogo: codigo, nome, descricao, activo. Nao diz
-- COMO um codigo se traduz em dinheiro -- percentagem sobre a hora normal,
-- valor fixo por ocorrencia, valor fixo mensal, ou so manual (o utilizador
-- escreve o valor a mao no processamento, como ate agora). Este passo so
-- acrescenta esse parametro ao catalogo. NENHUM CALCULO AINDA -- a ligacao a
-- assiduidade/picagens fica para uma fase seguinte, confirmada com o
-- utilizador.
--
--
-- -- OS QUATRO MODOS --------------------------------------------------------
--
-- manual                    -- sem parametro nenhum, como sempre foi.
-- percentagem_hora_normal   -- percentagem sobre o valor da hora normal
--                              (ex.: 150 = paga a 1.5x).
-- valor_fixo_ocorrencia     -- um valor fixo por cada ocorrencia (ex.: cada
--                              vez que o codigo e usado).
-- valor_fixo_mensal         -- um valor fixo por mes, independente de
--                              ocorrencias.
--
-- CHECK cruzado A: cada modo so aceita o SEU parametro -- manual nenhum,
-- percentagem_hora_normal so percentagem, os dois valor_fixo_* so valor_fixo.
-- Nunca os dois parametros preenchidos ao mesmo tempo, nunca o parametro
-- errado para o modo escolhido.
--
--
-- -- ORIGEM AUTOMATICA --------------------------------------------------------
--
-- origem_automatica marca que um codigo e alimentado automaticamente por uma
-- deteccao de assiduidade (quando essa ligacao existir) em vez de escrito a
-- mao todos os meses. So faz sentido para percentagem_hora_normal e
-- valor_fixo_ocorrencia (algo que se conta por ocorrencia) -- manual (por
-- definicao, escrito a mao) e valor_fixo_mensal (um valor fixo do mes, nao
-- por ocorrencia) NUNCA podem ter origem_automatica. CHECK cruzado B garante
-- isto. Continua OPCIONAL nos dois modos que podem te-la: um codigo pode ser
-- percentagem_hora_normal sem estar ligado a deteccao nenhuma.
--
-- horas_extra_noturnas E TRANSVERSAL, por decisao de produto: conta-se
-- SEMPRE, em cima de qualquer outra origem, nunca em vez dela -- nao e a
-- mesma particao que horas_extra/feriado_trabalhado/descanso_trabalhado, e
-- um EIXO DIFERENTE. Exemplo dado pelo utilizador: 10h de feriado trabalhado
-- com 3h dessas nocturnas paga as 10h ao codigo de feriado_trabalhado MAIS as
-- 3h ao codigo de horas_extra_noturnas -- nao 7h a um e 3h ao outro. Por isso
-- o indice unico abaixo e por origem_automatica isolada (nao ha combinacao
-- nenhuma a impedir entre horas_extra_noturnas e as outras tres).
--
--
-- -- PORQUE O INDICE UNICO E SO ACTIVO=TRUE ------------------------------------
--
-- Uma origem automatica so pode alimentar UM codigo activo por organizacao
-- (senao um evento detectado nao saberia para onde ir). Mas trocar a taxa de
-- um codigo (ex.: mudar horas_extra de 150% para 175%) sem perder o
-- historico do codigo antigo significa desactivar o antigo e criar um novo
-- com a mesma origem -- por isso o indice e PARCIAL (WHERE activo), dois
-- codigos INACTIVOS podem repetir a origem sem problema nenhum.
--
--
-- -- O QUE FICA DE FORA, DE PROPOSITO -------------------------------------------
--
-- - Nenhuma ligacao a assiduidade/picagens -- so o parametro fica gravado.
-- - Nenhum GRANT novo: a tabela ja tem GRANT SELECT,INSERT,UPDATE a
--   `authenticated` a nivel de tabela (20261201190000), que cobre colunas
--   novas automaticamente. Reconfirmado no bloco de conferir.
-- - Nenhuma UI (ConfiguracaoVencimento.tsx) -- so tipos e leitura
--   (useCodigosProcessamento), passo a parte.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.hr_codigos_processamento
--     DROP COLUMN origem_automatica, DROP COLUMN valor_fixo, DROP COLUMN percentagem, DROP COLUMN modo_calculo;
--   DROP INDEX IF EXISTS public.hr_codigos_processamento_origem_unica_key;
--
--
-- Prerequisitos:
--   20261201190000  hr_codigos_processamento
--   20261201250000  organization_id NOT NULL, UNIQUE(organization_id, codigo), 4 politicas
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_notnull boolean;
BEGIN
  IF to_regclass('public.hr_codigos_processamento') IS NULL THEN
    RAISE EXCEPTION 'public.hr_codigos_processamento nao existe. Aplicar 20261201190000 primeiro.';
  END IF;

  SELECT attnotnull INTO v_notnull
    FROM pg_attribute
   WHERE attrelid = 'public.hr_codigos_processamento'::regclass
     AND attname = 'organization_id';

  IF v_notnull IS NULL THEN
    RAISE EXCEPTION 'hr_codigos_processamento.organization_id nao foi encontrada -- investigar antes de aplicar.';
  ELSIF NOT v_notnull THEN
    RAISE EXCEPTION 'hr_codigos_processamento.organization_id ainda e nullable -- aplicar 20261201250000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento'
       AND column_name IN ('modo_calculo', 'percentagem', 'valor_fixo', 'origem_automatica')
  ) THEN
    RAISE EXCEPTION 'hr_codigos_processamento ja tem alguma das colunas de calculo (modo_calculo/percentagem/valor_fixo/origem_automatica) -- esta migracao ja foi aplicada.';
  END IF;

  RAISE NOTICE 'Guardas passadas: hr_codigos_processamento existe, organization_id NOT NULL, colunas de calculo ainda nao existem.';
END;
$guardas$;

-- ==============================================================================
-- 1. As quatro colunas novas, com os seus CHECKs.
-- ==============================================================================
ALTER TABLE public.hr_codigos_processamento
  ADD COLUMN modo_calculo      text    NOT NULL DEFAULT 'manual',
  ADD COLUMN percentagem       numeric(7,3),
  ADD COLUMN valor_fixo        numeric(10,2),
  ADD COLUMN origem_automatica text,
  ADD CONSTRAINT hr_codigos_processamento_modo_calculo_valido CHECK (
    modo_calculo IN ('manual', 'percentagem_hora_normal', 'valor_fixo_ocorrencia', 'valor_fixo_mensal')
  ),
  ADD CONSTRAINT hr_codigos_processamento_percentagem_intervalo CHECK (
    percentagem IS NULL OR (percentagem >= 0 AND percentagem <= 1000)
  ),
  ADD CONSTRAINT hr_codigos_processamento_valor_fixo_intervalo CHECK (
    valor_fixo IS NULL OR (valor_fixo >= 0 AND valor_fixo <= 100000)
  ),
  ADD CONSTRAINT hr_codigos_processamento_origem_automatica_valida CHECK (
    origem_automatica IS NULL
    OR origem_automatica IN ('horas_extra', 'horas_extra_noturnas', 'feriado_trabalhado', 'descanso_trabalhado')
  ),
  -- Cruzado A: cada modo so aceita o SEU parametro, nunca os dois, nunca o
  -- errado.
  ADD CONSTRAINT hr_codigos_processamento_modo_parametro_coerente CHECK (
    (modo_calculo = 'manual' AND percentagem IS NULL AND valor_fixo IS NULL)
    OR (modo_calculo = 'percentagem_hora_normal' AND percentagem IS NOT NULL AND valor_fixo IS NULL)
    OR (modo_calculo IN ('valor_fixo_ocorrencia', 'valor_fixo_mensal') AND valor_fixo IS NOT NULL AND percentagem IS NULL)
  ),
  -- Cruzado B: origem_automatica so em modos que fazem sentido ligar a uma
  -- ocorrencia (percentagem_hora_normal, valor_fixo_ocorrencia) -- manual e
  -- valor_fixo_mensal nunca. Continua OPCIONAL nesses dois.
  ADD CONSTRAINT hr_codigos_processamento_origem_modo_coerente CHECK (
    origem_automatica IS NULL OR modo_calculo IN ('percentagem_hora_normal', 'valor_fixo_ocorrencia')
  );

-- Uma origem automatica alimenta, no maximo, UM codigo ACTIVO por
-- organizacao -- ver o porque no cabecalho. Dois codigos INACTIVOS podem
-- repetir a origem (e assim que se troca a taxa sem perder o historico).
CREATE UNIQUE INDEX hr_codigos_processamento_origem_unica_key
  ON public.hr_codigos_processamento (organization_id, origem_automatica)
  WHERE activo AND origem_automatica IS NOT NULL;

-- ==============================================================================
-- 2. Comentarios.
-- ==============================================================================
COMMENT ON TABLE public.hr_codigos_processamento IS
'Catalogo de codigos de processamento salarial, PROPRIO de cada organizacao (organization_id obrigatorio, UNIQUE por organizacao+codigo desde 20261201250000). Desde 20261201260000 tambem guarda COMO cada codigo se calcula (modo_calculo e os seus parametros) -- ainda SEM ligacao nenhuma a assiduidade/picagens, isso fica para uma fase seguinte.';

COMMENT ON COLUMN public.hr_codigos_processamento.modo_calculo IS
'Como este codigo se traduz em dinheiro. "manual" (default): sem parametro, o valor escreve-se a mao no processamento, como sempre foi. "percentagem_hora_normal": percentagem sobre o valor da hora normal (usa "percentagem"). "valor_fixo_ocorrencia": um valor fixo por cada ocorrencia (usa "valor_fixo"). "valor_fixo_mensal": um valor fixo por mes, independente de ocorrencias (usa "valor_fixo"). Ver a constraint hr_codigos_processamento_modo_parametro_coerente para a coerencia entre modo e parametro.';

COMMENT ON COLUMN public.hr_codigos_processamento.percentagem IS
'Percentagem sobre o valor da hora normal (ex.: 150 = paga a 1.5x) -- so preenchida quando modo_calculo = ''percentagem_hora_normal''. Intervalo 0 a 1000.';

COMMENT ON COLUMN public.hr_codigos_processamento.valor_fixo IS
'Valor fixo em euros -- por ocorrencia (modo_calculo = ''valor_fixo_ocorrencia'') ou por mes (modo_calculo = ''valor_fixo_mensal''). Intervalo 0 a 100000.';

COMMENT ON COLUMN public.hr_codigos_processamento.origem_automatica IS
'Marca que este codigo, quando a ligacao a assiduidade existir, e alimentado automaticamente por uma deteccao em vez de escrito a mao -- so faz sentido em modo_calculo IN (''percentagem_hora_normal'', ''valor_fixo_ocorrencia''), e continua OPCIONAL nesses dois (ver hr_codigos_processamento_origem_modo_coerente). ''horas_extra_noturnas'' e TRANSVERSAL por decisao de produto: conta-se SEMPRE, empilhando com feriado_trabalhado ou descanso_trabalhado, nunca em vez deles -- e um EIXO DIFERENTE, nao a mesma particao que ''horas_extra''/''feriado_trabalhado''/''descanso_trabalhado''. Exemplo: 10h de feriado trabalhado com 3h dessas nocturnas paga as 10h ao codigo de feriado_trabalhado MAIS as 3h ao codigo de horas_extra_noturnas. No maximo um codigo ACTIVO por organizacao para cada origem (hr_codigos_processamento_origem_unica_key) -- dois codigos inactivos podem repetir a origem, e assim que se troca a taxa sem perder historico.';

-- ---- Conferir: estrutural ----------------------------------------------------
DO $conferir$
DECLARE
  v_n           integer;
  v_notnull     boolean;
  v_default     text;
  v_tipo        text;
  v_privilegios text;
  v_n_fora_manual integer;
BEGIN
  -- 1. As quatro colunas existem, com o tipo certo; modo_calculo NOT NULL DEFAULT 'manual'.
  SELECT is_nullable = 'NO', column_default, data_type
    INTO v_notnull, v_default, v_tipo
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento' AND column_name = 'modo_calculo';
  IF NOT coalesce(v_notnull, false) OR v_tipo IS DISTINCT FROM 'text' OR v_default NOT LIKE '%manual%' THEN
    RAISE EXCEPTION 'modo_calculo nao ficou text NOT NULL DEFAULT ''manual'' (notnull=%, tipo=%, default=%).', v_notnull, v_tipo, v_default;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento'
       AND column_name = 'percentagem' AND data_type = 'numeric' AND numeric_precision = 7 AND numeric_scale = 3
  ) THEN
    RAISE EXCEPTION 'percentagem nao ficou numeric(7,3).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento'
       AND column_name = 'valor_fixo' AND data_type = 'numeric' AND numeric_precision = 10 AND numeric_scale = 2
  ) THEN
    RAISE EXCEPTION 'valor_fixo nao ficou numeric(10,2).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento'
       AND column_name = 'origem_automatica' AND data_type = 'text' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'origem_automatica nao ficou text nullable.';
  END IF;

  -- 2. As 3 constraints de dominio + as 2 cruzadas existem.
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.hr_codigos_processamento'::regclass
     AND conname IN (
       'hr_codigos_processamento_modo_calculo_valido',
       'hr_codigos_processamento_percentagem_intervalo',
       'hr_codigos_processamento_valor_fixo_intervalo',
       'hr_codigos_processamento_origem_automatica_valida',
       'hr_codigos_processamento_modo_parametro_coerente',
       'hr_codigos_processamento_origem_modo_coerente'
     );
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Esperavam-se as 6 constraints de calculo (4 dominio + 2 cruzadas), encontraram-se %.', v_n;
  END IF;

  -- 3. O indice unico parcial existe.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento'
     AND indexname = 'hr_codigos_processamento_origem_unica_key'
  ) THEN
    RAISE EXCEPTION 'Falta o indice hr_codigos_processamento_origem_unica_key.';
  END IF;

  -- 4. Grants exactos -- nenhum GRANT novo, so reconfirmar o que 20261201190000 ja deixou.
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento' AND grantee = 'authenticated';
  IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'hr_codigos_processamento: authenticated tem "%", esperava-se exactamente INSERT,SELECT,UPDATE.',
      coalesce(v_privilegios, '(nenhum)');
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento' AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'hr_codigos_processamento ficou com grant a anon.';
  END IF;

  -- 5. Zero linhas com modo_calculo <> 'manual' logo apos o ALTER -- nada foi
  -- tocado nos dados existentes (corre ANTES do bloco de RLS ao vivo, que e
  -- que insere codigos de teste com outros modos).
  SELECT count(*) INTO v_n_fora_manual FROM public.hr_codigos_processamento WHERE modo_calculo <> 'manual';
  IF v_n_fora_manual <> 0 THEN
    RAISE EXCEPTION 'Encontraram-se % linhas existentes com modo_calculo <> ''manual'' logo apos o ALTER -- os dados existentes deviam ter ficado intocados.', v_n_fora_manual;
  END IF;

  -- 6. 4 politicas continuam 4, sem has_anew_permission( de 2 argumentos.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'hr_codigos_processamento ficou com % politicas, esperavam-se 4.', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento'
       AND (coalesce(qual, '') LIKE '%has_anew_permission(%' OR coalesce(with_check, '') LIKE '%has_anew_permission(%')
  ) THEN
    RAISE EXCEPTION 'Uma politica de hr_codigos_processamento ainda chama has_anew_permission( de 2 argumentos.';
  END IF;

  RAISE NOTICE 'Verificacoes estruturais passadas: 4 colunas com o tipo certo, 6 constraints de calculo, indice unico parcial, grants exactos (sem grant novo), dados existentes intocados, 4 politicas.';
END;
$conferir$;

-- ---- Conferir: RLS ao vivo, contra a organizacao nike ------------------------
DO $conferir_rls$
DECLARE
  v_org_nike       uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_uid_real       uuid;
  v_id_1           uuid;
  v_falhou_2       boolean := false;
  v_falhou_3       boolean := false;
  v_falhou_4       boolean := false;
  v_falhou_5       boolean := false;
  v_falhou_7       boolean := false;
  v_falhou_9       boolean := false;
  v_n_linhas       integer;
BEGIN
  SELECT au.auth_user_id
    INTO v_uid_real
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
    JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
   WHERE am.organization_id = v_org_nike
     AND am.status = 'active'
     AND au.auth_user_id IS NOT NULL
   ORDER BY au.auth_user_id
   LIMIT 1;

  IF v_uid_real IS NULL THEN
    RAISE NOTICE 'CONFERIR RLS SALTADO: nenhum utilizador com membership activo e papel super_admin na nike foi encontrado -- as asserções de calculo desta migracao nao foram exercitadas ao vivo (so as verificacoes estruturais acima correram).';
    RETURN;
  END IF;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

    -- 1) percentagem_hora_normal com percentagem=150 -- aceite.
    INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem)
    VALUES (v_org_nike, 'ZZZ_CALC1_20261201260000', 'Teste calculo 1', 'percentagem_hora_normal', 150)
    RETURNING id INTO v_id_1;
    IF v_id_1 IS NULL THEN
      RAISE EXCEPTION 'INSERT percentagem_hora_normal com percentagem=150 devia ter sido aceite.' USING ERRCODE = 'HR961';
    END IF;

    -- 2) percentagem_hora_normal com valor_fixo TAMBEM preenchido -- check_violation.
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem, valor_fixo)
      VALUES (v_org_nike, 'ZZZ_CALC2_20261201260000', 'Teste calculo 2', 'percentagem_hora_normal', 150, 10);
      v_falhou_2 := false;
    EXCEPTION WHEN check_violation THEN
      v_falhou_2 := true;
    END;
    IF NOT v_falhou_2 THEN
      RAISE EXCEPTION 'INSERT com percentagem E valor_fixo preenchidos foi aceite -- a constraint cruzada A nao esta a bloquear.' USING ERRCODE = 'HR962';
    END IF;

    -- 3) manual com origem_automatica='horas_extra' -- check_violation.
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, origem_automatica)
      VALUES (v_org_nike, 'ZZZ_CALC3_20261201260000', 'Teste calculo 3', 'manual', 'horas_extra');
      v_falhou_3 := false;
    EXCEPTION WHEN check_violation THEN
      v_falhou_3 := true;
    END;
    IF NOT v_falhou_3 THEN
      RAISE EXCEPTION 'INSERT modo_calculo=manual com origem_automatica foi aceite -- a constraint cruzada B nao esta a bloquear.' USING ERRCODE = 'HR963';
    END IF;

    -- 4) valor_fixo_mensal com origem_automatica preenchida -- check_violation.
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, valor_fixo, origem_automatica)
      VALUES (v_org_nike, 'ZZZ_CALC4_20261201260000', 'Teste calculo 4', 'valor_fixo_mensal', 100, 'horas_extra');
      v_falhou_4 := false;
    EXCEPTION WHEN check_violation THEN
      v_falhou_4 := true;
    END;
    IF NOT v_falhou_4 THEN
      RAISE EXCEPTION 'INSERT modo_calculo=valor_fixo_mensal com origem_automatica foi aceite -- a constraint cruzada B nao esta a bloquear.' USING ERRCODE = 'HR964';
    END IF;

    -- 5) dois codigos ACTIVOS da nike com origem_automatica='horas_extra' -- o segundo recusado.
    INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem, origem_automatica, activo)
    VALUES (v_org_nike, 'ZZZ_CALC5A_20261201260000', 'Teste calculo 5a', 'percentagem_hora_normal', 150, 'horas_extra', true);
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem, origem_automatica, activo)
      VALUES (v_org_nike, 'ZZZ_CALC5B_20261201260000', 'Teste calculo 5b', 'percentagem_hora_normal', 175, 'horas_extra', true);
      v_falhou_5 := false;
    EXCEPTION WHEN unique_violation THEN
      v_falhou_5 := true;
    END;
    IF NOT v_falhou_5 THEN
      RAISE EXCEPTION 'Um segundo codigo ACTIVO com a mesma origem_automatica foi aceite -- o indice unico parcial nao esta a bloquear.' USING ERRCODE = 'HR965';
    END IF;

    -- 6) o mesmo, mas o primeiro INACTIVO -- o segundo passa (troca de taxa sem perder historico).
    UPDATE public.hr_codigos_processamento SET activo = false WHERE codigo = 'ZZZ_CALC5A_20261201260000' AND organization_id = v_org_nike;
    GET DIAGNOSTICS v_n_linhas = ROW_COUNT;
    IF v_n_linhas <> 1 THEN
      RAISE EXCEPTION 'O UPDATE que desactiva ZZZ_CALC5A_20261201260000 afectou % linhas, esperava-se 1 -- a RLS pode estar a bloquear o UPDATE em silencio.', v_n_linhas USING ERRCODE = 'HR967';
    END IF;
    INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem, origem_automatica, activo)
    VALUES (v_org_nike, 'ZZZ_CALC6_20261201260000', 'Teste calculo 6', 'percentagem_hora_normal', 175, 'horas_extra', true);

    -- 7) percentagem=1001 -- check_violation.
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem)
      VALUES (v_org_nike, 'ZZZ_CALC7_20261201260000', 'Teste calculo 7', 'percentagem_hora_normal', 1001);
      v_falhou_7 := false;
    EXCEPTION WHEN check_violation THEN
      v_falhou_7 := true;
    END;
    IF NOT v_falhou_7 THEN
      RAISE EXCEPTION 'INSERT com percentagem=1001 foi aceite -- a constraint de intervalo nao esta a bloquear.' USING ERRCODE = 'HR966';
    END IF;

    -- 8) empilhamento entre origens diferentes: feriado_trabalhado ACTIVO e
    -- horas_extra_noturnas ACTIVO, ambos na mesma organizacao -- os DOIS
    -- aceites (o indice unico e por origem isolada, nao ha combinacao
    -- nenhuma a impedir entre horas_extra_noturnas e as outras tres -- ver
    -- cabecalho).
    INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem, origem_automatica, activo)
    VALUES (v_org_nike, 'ZZZ_CALC8A_20261201260000', 'Teste calculo 8a', 'percentagem_hora_normal', 200, 'feriado_trabalhado', true);
    INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo, percentagem, origem_automatica, activo)
    VALUES (v_org_nike, 'ZZZ_CALC8B_20261201260000', 'Teste calculo 8b', 'percentagem_hora_normal', 25, 'horas_extra_noturnas', true);
    IF (
      SELECT count(*) FROM public.hr_codigos_processamento
       WHERE organization_id = v_org_nike
         AND codigo IN ('ZZZ_CALC8A_20261201260000', 'ZZZ_CALC8B_20261201260000')
         AND activo
    ) <> 2 THEN
      RAISE EXCEPTION 'Os dois codigos ACTIVOS de origens diferentes (feriado_trabalhado, horas_extra_noturnas) na mesma organizacao deviam ter sido ambos aceites.' USING ERRCODE = 'HR968';
    END IF;

    -- 9) percentagem_hora_normal com percentagem NULL -- check_violation (a
    -- metade "obrigatorio" da constraint cruzada A, ate agora nao testada).
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, modo_calculo)
      VALUES (v_org_nike, 'ZZZ_CALC9_20261201260000', 'Teste calculo 9', 'percentagem_hora_normal');
      v_falhou_9 := false;
    EXCEPTION WHEN check_violation THEN
      v_falhou_9 := true;
    END;
    IF NOT v_falhou_9 THEN
      RAISE EXCEPTION 'INSERT percentagem_hora_normal com percentagem NULL foi aceite -- a constraint cruzada A nao esta a exigir o parametro obrigatorio para este modo.' USING ERRCODE = 'HR969';
    END IF;

    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', NULL, true);

    RAISE NOTICE 'CONFERIR RLS: percentagem_hora_normal aceite, percentagem+valor_fixo recusado, manual+origem recusado, valor_fixo_mensal+origem recusado, segunda origem ACTIVA recusada, segunda origem aceite apos desactivar a primeira (UPDATE confirmado com 1 linha), percentagem=1001 recusado, origens diferentes empilham (feriado_trabalhado + horas_extra_noturnas ambos activos), percentagem_hora_normal sem percentagem recusado. Tudo desfeito a seguir (uid=%).', v_uid_real;

    RAISE EXCEPTION 'teste_hr_codigos_processamento_calculo_20261201260000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, tudo desfeito pela subtransaccao implicita (role incluido).
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION
        'Um dos testes de calculo desta migracao (hr_codigos_processamento) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;
END;
$conferir_rls$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr `supabase migration list --linked` e confirmar a ordem de
--    aplicacao real contra o remoto imediatamente antes de empurrar.
-- 2. Correr os testes de vitest tocados (useCodigosProcessamento) ANTES deste
--    push -- e aqui, contra o estado ANTIGO, que o vermelho legitimo aparece
--    se algo estiver mal.
-- 3. Os tipos (src/types/hr.ts) e o hook (useCodigosProcessamento.ts) entram
--    no MESMO commit, fora do SQL. A UI (ConfiguracaoVencimento.tsx) fica
--    para um passo seguinte, a parte.
-- ==============================================================================
