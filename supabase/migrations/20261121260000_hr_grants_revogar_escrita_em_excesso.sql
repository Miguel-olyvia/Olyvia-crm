-- =============================================================================
-- RH -- Retirar a authenticated os privilegios de tabela que o desenho nunca
--       lhe quis dar
-- =============================================================================
--
-- O QUE ACONTECEU
--
-- No Supabase o schema public tem ALTER DEFAULT PRIVILEGES que dao GRANT ALL a
-- authenticated em cada tabela nova. Uma migracao que faca so
--
--   REVOKE ALL ON TABLE x FROM anon;
--   GRANT SELECT, INSERT, UPDATE ON TABLE x TO authenticated;
--
-- nao esta a limitar nada: o GRANT acrescenta ao que ja la estava por omissao e
-- authenticated fica com DELETE, TRUNCATE, REFERENCES e TRIGGER por cima. O
-- padrao certo -- primeiro REVOKE ALL a authenticated, so depois o GRANT do que
-- se quer -- foi seguido em pessoas_dados_bancarios (20261120070000),
-- pessoas_acessos_sensiveis e pessoas_identificacao (20261120040000) e
-- pessoas_contas (20261120090000). Nas restantes tabelas de RH ja aplicadas
-- ficou por fazer, e esta migracao repoe-o.
--
-- Medido em information_schema.role_table_grants antes desta migracao:
--   pessoas                     -> DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   pessoas_retribuicoes        -> DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   hr_ausencias_tipos          -> DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   pessoas_ausencias_direitos  -> DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   pessoas_dados_bancarios     -> SELECT                       (o padrao certo)
--
-- ISTO ERA UM BURACO OU FALTA DE DEFESA EM PROFUNDIDADE?
--
-- Quase tudo era falta de defesa em profundidade, com uma excepcao a nomear.
--
-- - DELETE: as doze tabelas em causa tem todas uma politica RESTRICTIVE
--   FOR DELETE ... USING (false). Uma restritiva com USING (false) nao deixa
--   passar uma unica linha e nenhuma permissiva a anula. O apagar ja estava
--   negado pela RLS; o GRANT a mais nao abria caminho nenhum.
-- - REFERENCES e TRIGGER: so servem para criar chaves estrangeiras ou triggers
--   sobre a tabela, o que exige DDL. PostgREST nao expoe DDL e authenticated
--   nao tem CREATE no schema public.
-- - TRUNCATE: esta e a excepcao honesta. TRUNCATE NAO passa por row level
--   security -- e um privilegio de tabela e mais nada. Quem o tivesse e
--   conseguisse executar SQL arbitrario como authenticated esvaziava
--   public.pessoas de todas as organizacoes de uma vez, sem a RLS dizer nada.
--   O que faltava ao ataque era o caminho: PostgREST so emite
--   SELECT/INSERT/UPDATE/DELETE e nao ha RPC de RH que aceite SQL. Ou seja,
--   privilegio real e destrutivo, sem via de exploracao conhecida na superficie
--   actual da aplicacao. Nao foi um incidente; e uma mina por desarmar, e
--   desarma-se aqui.
--
-- A DECISAO, TABELA A TABELA
--
-- Nem todas se revogam. O criterio foi ler as politicas de escrita de cada
-- tabela e perguntar se a escrita passa pelo cliente ou so por RPC.
--
-- (A) A escrita passa pelo cliente -- fica SELECT, INSERT, UPDATE; sai DELETE,
--     TRUNCATE, REFERENCES, TRIGGER. Todas estas tem politicas PERMISSIVAS
--     FOR INSERT e FOR UPDATE TO authenticated com has_anew_permission_in_org e
--     uma RESTRICTIVE FOR DELETE USING (false):
--
--       pessoas                      (pessoas_insert_policy / _update_policy /
--                                     pessoas_delete_bloqueado, 20261120030000)
--       pessoas_dados_pessoais       (_insert / _update / _block_delete, 20261120040000)
--       pessoas_moradas              (_insert / _update / _block_delete, 20261120050000)
--       pessoas_contactos_emergencia (_insert / _update / _block_delete, 20261120050000)
--       pessoas_vinculos             (_insert / _update / _block_delete, 20261120060000)
--       pessoas_retribuicoes         (_insert / _update / _block_delete, 20261120060000)
--       pessoas_dados_saude          (_insert / _update / _block_delete, 20261120080000)
--       hr_locais_trabalho           (_insert / _update / _block_delete, 20261120130000)
--       pessoas_horario_planeado     (_insert / _update / _block_delete, 20261120150000)
--       pessoas_horario_realizado    (_insert / _update / _block_delete, 20261120160000)
--       hr_ausencias_tipos           (_insert / _update / _block_delete, 20261121020000)
--       pessoas_ausencias_direitos   (_insert / _update / _block_delete, 20261121030000)
--
--     Criar uma pessoa e editar a ficha passa pelo formulario: tirar-lhes
--     INSERT/UPDATE parava a aplicacao. Nao se revoga o que ela usa.
--
-- (B) A escrita e so por RPC SECURITY DEFINER -- fica SELECT e mais nada. Todas
--     estas tem as tres politicas de escrita RESTRICTIVE com false:
--
--       pessoas_acessos_sensiveis   (_block_insert/_update/_delete, 20261120040000)
--       pessoas_dados_bancarios     (_block_insert/_update/_delete, 20261120070000)
--       pessoas_contas              (_block_insert/_update/_delete, 20261120090000)
--
--     Ja estao correctas. Reafirmam-se na mesma, porque a instrucao e
--     idempotente e porque o dia em que deixarem de estar interessa saber.
--
-- (C) Fora do alcance desta migracao, de proposito:
--
--       pessoas_identificacao (20261120040000) -- os grants sao POR COLUNA
--       (o SELECT nao inclui o NISS em claro, o UPDATE nao inclui pessoa_id nem
--       organization_id). Um REVOKE ALL seguido de um GRANT ao nivel da tabela
--       apagaria essa mascara e alargaria a leitura ao NISS. Nao se toca; so se
--       verifica no fim que nao tem privilegios de TABELA a mais.
--
-- As tabelas do bloco 20261121* a partir de 20261121040000 nao entram aqui:
-- ainda nao estao aplicadas e foram corrigidas nos proprios ficheiros.
--
-- Reversibilidade: voltar atras seria
-- GRANT DELETE, TRUNCATE, REFERENCES, TRIGGER ... TO authenticated, coisa que
-- ninguem deve querer fazer.
-- =============================================================================

-- ---- (A) escrita pelo cliente: SELECT, INSERT, UPDATE e mais nada ----------
DO $$
DECLARE
  v_tabela text;
  v_alvos  text[] := ARRAY[
    'pessoas',
    'pessoas_dados_pessoais',
    'pessoas_moradas',
    'pessoas_contactos_emergencia',
    'pessoas_vinculos',
    'pessoas_retribuicoes',
    'pessoas_dados_saude',
    'hr_locais_trabalho',
    'pessoas_horario_planeado',
    'pessoas_horario_realizado',
    'hr_ausencias_tipos',
    'pessoas_ausencias_direitos'
  ];
BEGIN
  FOREACH v_tabela IN ARRAY v_alvos LOOP
    IF to_regclass('public.' || quote_ident(v_tabela)) IS NULL THEN
      RAISE EXCEPTION
        'A tabela public.% nao existe. Esta migracao pressupoe o bloco de RH ja aplicado.', v_tabela;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_tabela);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', v_tabela);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', v_tabela);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_tabela);
  END LOOP;
END;
$$;

-- ---- (B) escrita so por RPC: SELECT e mais nada -----------------------------
DO $$
DECLARE
  v_tabela text;
  v_alvos  text[] := ARRAY[
    'pessoas_acessos_sensiveis',
    'pessoas_dados_bancarios',
    'pessoas_contas'
  ];
BEGIN
  FOREACH v_tabela IN ARRAY v_alvos LOOP
    IF to_regclass('public.' || quote_ident(v_tabela)) IS NULL THEN
      RAISE EXCEPTION
        'A tabela public.% nao existe. Esta migracao pressupoe o bloco de RH ja aplicado.', v_tabela;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_tabela);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', v_tabela);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', v_tabela);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_tabela);
  END LOOP;
END;
$$;

-- ---- (C) pessoas_identificacao: so tirar o que sobra ao nivel da tabela -----
-- Os grants por coluna nao sao tocados. Revogar um privilegio ao nivel da
-- tabela nao mexe nos privilegios de coluna, por isso isto e seguro: tira
-- DELETE/TRUNCATE/REFERENCES/TRIGGER e deixa as colunas como estavam.
DO $$
BEGIN
  IF to_regclass('public.pessoas_identificacao') IS NOT NULL THEN
    EXECUTE 'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pessoas_identificacao FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.pessoas_identificacao FROM anon';
  END IF;
END;
$$;

-- ---- Conferir ---------------------------------------------------------------
DO $$
DECLARE
  v_tabela   text;
  v_em_falta text;
  v_a_mais   text;
  v_cliente  text[] := ARRAY[
    'pessoas',
    'pessoas_dados_pessoais',
    'pessoas_moradas',
    'pessoas_contactos_emergencia',
    'pessoas_vinculos',
    'pessoas_retribuicoes',
    'pessoas_dados_saude',
    'hr_locais_trabalho',
    'pessoas_horario_planeado',
    'pessoas_horario_realizado',
    'hr_ausencias_tipos',
    'pessoas_ausencias_direitos'
  ];
  v_so_rpc   text[] := ARRAY[
    'pessoas_acessos_sensiveis',
    'pessoas_dados_bancarios',
    'pessoas_contas'
  ];
BEGIN
  -- (A) tem de ter SELECT/INSERT/UPDATE e nada mais
  FOREACH v_tabela IN ARRAY v_cliente LOOP
    SELECT string_agg(g.privilege_type, ', ' ORDER BY g.privilege_type) INTO v_a_mais
      FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public'
       AND g.table_name = v_tabela
       AND g.grantee = 'authenticated'
       AND g.privilege_type NOT IN ('SELECT','INSERT','UPDATE');

    IF v_a_mais IS NOT NULL THEN
      RAISE EXCEPTION
        'authenticated continua com privilegios a mais em %: %. Esta tabela e SELECT, INSERT, UPDATE e mais nada: apagar nao se faz, e o TRUNCATE nao passa por RLS.',
        v_tabela, v_a_mais;
    END IF;

    SELECT string_agg(esperado, ', ' ORDER BY esperado) INTO v_em_falta
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) AS esperado
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public'
          AND g.table_name = v_tabela
          AND g.grantee = 'authenticated'
          AND g.privilege_type = esperado
     );

    IF v_em_falta IS NOT NULL THEN
      RAISE EXCEPTION
        'authenticated ficou sem privilegios de que a aplicacao precisa em %: %. O formulario deixaria de gravar.',
        v_tabela, v_em_falta;
    END IF;
  END LOOP;

  -- (B) tem de ter SELECT e nada mais
  FOREACH v_tabela IN ARRAY v_so_rpc LOOP
    SELECT string_agg(g.privilege_type, ', ' ORDER BY g.privilege_type) INTO v_a_mais
      FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public'
       AND g.table_name = v_tabela
       AND g.grantee = 'authenticated'
       AND g.privilege_type <> 'SELECT';

    IF v_a_mais IS NOT NULL THEN
      RAISE EXCEPTION
        'authenticated tem GRANT a mais em %: %. Esta tabela e SELECT e mais nada; a escrita entra por RPC.',
        v_tabela, v_a_mais;
    END IF;
  END LOOP;

  -- (C) pessoas_identificacao: nenhum privilegio ao nivel da tabela
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public'
       AND g.table_name = 'pessoas_identificacao'
       AND g.grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION
      'pessoas_identificacao tem privilegios ao nivel da TABELA para authenticated. Ali os grants sao por coluna, para o NISS em claro nao sair; um grant de tabela desfaz a mascara.';
  END IF;

  -- anon nao entra em RH em lado nenhum
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public'
       AND g.grantee = 'anon'
       AND g.table_name = ANY (v_cliente || v_so_rpc || ARRAY['pessoas_identificacao'])
  ) THEN
    RAISE EXCEPTION 'anon tem privilegios em tabelas de RH. Nao pode ter nenhum.';
  END IF;

  RAISE NOTICE 'Grants de RH conferidos: 12 tabelas de escrita pelo cliente, 3 so de leitura, pessoas_identificacao por coluna.';
END;
$$;
