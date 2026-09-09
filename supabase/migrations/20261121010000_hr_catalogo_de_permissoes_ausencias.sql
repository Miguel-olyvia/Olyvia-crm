-- ==============================================================================
-- Catalogo: as 13 permissoes novas de ausencias e ferias.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A ronda 3 do modulo de RH acrescenta sete tabelas de ausencias e ferias, e
-- todas as politicas RLS dessas tabelas referem codigos de permissao que ainda
-- nao existem no catalogo.
--
-- Uma politica que chame has_anew_permission_in_org com um codigo ausente do
-- catalogo NAO rebenta: devolve false para todos, sempre. A tabela fica
-- invisivel e inescrivel para todo o mundo, incluindo o super_admin, e nao ha
-- erro nenhum a dizer porque. Foi o que aconteceu com as 27 permissoes de
-- 20261120020000 antes de 20261120100000.
--
-- Por isso o catalogo vem PRIMEIRO, antes de qualquer tabela desta ronda.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Treze codigos novos, todos category='hr', scope='organization',
-- supports_scope=false, display_order 350 a 470 (a seguir aos 340 da ronda 2):
--
--   hr.ausencias.view                 ver as ausencias da organizacao
--   hr.ausencias.view.own             ver as suas proprias
--   hr.ausencias.pedir                pedir para si
--   hr.ausencias.pedir.outros         pedir em nome de outra pessoa
--   hr.ausencias.aprovar.chefia       decidir o passo de chefia
--   hr.ausencias.aprovar.rh           decidir o passo de RH
--   hr.ausencias.tipos.view           catalogo de tipos de ausencia
--   hr.ausencias.tipos.edit
--   hr.ausencias.direitos.view        o direito por pessoa e periodo
--   hr.ausencias.direitos.edit
--   hr.ausencias.ajustar              somar ou subtrair dias ao contador
--   hr.ausencias.historico.editar     mexer em ausencias ja aprovadas
--   hr.ausencias.justificacao.view    ler o atestado / o diagnostico
--
-- Tres sao is_dangerous: ajustar, historico.editar e justificacao.view. As
-- duas primeiras porque reescrevem um contador e um passado com efeito legal;
-- a terceira porque um atestado medico e dado de saude, e ja existe o padrao
-- do NISS e do IBAN a dizer como se trata isso.
--
-- Duas decisoes que ficam escritas para nao serem redescobertas:
--
-- 1. NAO ha permissao de "cancelar". Cancelar um pedido PENDENTE e direito de
--    quem o fez (hr.ausencias.pedir sobre a propria ficha, verificado dentro
--    da RPC); cancelar um APROVADO e mexer no historico, logo
--    hr.ausencias.historico.editar. Uma terceira permissao no meio daria duas
--    maneiras de exprimir a mesma autoridade.
--
-- 2. hr.ausencias.ajustar e separada de hr.ausencias.direitos.edit de
--    proposito. Definir o direito anual de alguem e subtrair-lhe dias do
--    contador sao autoridades diferentes: a primeira e configuracao, a segunda
--    tira dias a uma pessoa concreta e exige rasto de quem e porque.
--
-- hr.pessoas.horario_realizado.validar, que a ronda 2 deixou decorativa, NAO e
-- reaproveitada aqui nem verificada por esta ronda. E da ronda das picagens
-- fecha-la; criar outra ao lado seria duplicar a autoridade.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se atribui permissao nenhuma a papel nenhum. Criar a chave e abrir a
--   porta sao dois actos, e o segundo nao e desta ronda.
-- - Nao se cria nem altera objecto de schema nenhum. So dados.
-- - Nao se toca nas permissoes hr.* existentes: ON CONFLICT (code) DO NOTHING,
--   nao DO UPDATE. Se algum destes codigos ja estiver no remoto por drift, nao
--   veio desta migracao e nao se reescreve por iniciativa propria.
-- - Nao se acrescentam permissoes de picagens, assiduidade, salarios,
--   recrutamento ou desempenho.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito: se la estivesse, seria
-- aplicado por engano no db push seguinte. A mao, e SO depois de apagar as
-- tabelas da ronda 3 (apagar os codigos com as tabelas de pe deixa-as
-- inacessiveis a todos, super_admin incluido):
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions WHERE permission_code LIKE 'hr.ausencias.%';
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_permissions WHERE code LIKE 'hr.ausencias.%';
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120020000  catalogo hr.* (hr.module.access e parent_code de dois
--                   codigos desta migracao)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_hr integer;
BEGIN
  -- to_regclass e nao ::regclass: um cast literal rebenta com erro em vez de
  -- devolver NULL quando a tabela nao existe.
  IF to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'public.anew_permissions nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'anew_permissions_code_unique'
       AND conrelid = to_regclass('public.anew_permissions')
  ) THEN
    RAISE EXCEPTION
      'anew_permissions nao tem a unique em code. O ON CONFLICT (code) desta migracao depende dela.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.module.access') THEN
    RAISE EXCEPTION 'hr.module.access nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  -- A funcao COM organizacao. has_anew_permission (global) nunca e usada em RH.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org'
       AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  SELECT count(DISTINCT code) INTO v_hr FROM public.anew_permissions WHERE code LIKE 'hr.%';

  IF v_hr < 34 THEN
    RAISE EXCEPTION
      'Esperavam-se pelo menos os 34 codigos hr.* das rondas 1 e 2, encontraram-se %. Aplicar 20261120020000 e 20261120120000 primeiro.', v_hr;
  END IF;

  RAISE NOTICE 'Guardas passadas: % codigos hr.* distintos antes desta migracao.', v_hr;
END;
$guardas$;

-- ---- Os treze codigos novos ------------------------------------------------
-- Ordem de insercao pensada para o parent_code existir sempre antes do filho.
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.ausencias.view', 'Ver ausencias e ferias',
   'Ver os pedidos de ausencia, os dias marcados e o historico de decisoes de toda a organizacao. Nao da acesso a justificacao clinica, que tem permissao propria.',
   'hr', 'hr.module.access', 350, false, 'organization', false),

  ('hr.ausencias.view.own', 'Ver as suas ausencias',
   'Ver os seus proprios pedidos, os seus dias marcados e o seu contador de saldo. Nao mostra as ausencias de mais ninguem.',
   'hr', 'hr.module.access', 360, false, 'organization', false),

  ('hr.ausencias.pedir', 'Pedir ausencia',
   'Criar pedidos de ausencia para si proprio, e cancelar os que ainda estao pendentes. Cancelar um pedido JA APROVADO exige hr.ausencias.historico.editar.',
   'hr', 'hr.ausencias.view.own', 370, false, 'organization', false),

  ('hr.ausencias.pedir.outros', 'Pedir ausencia em nome de outra pessoa',
   'Criar pedidos de ausencia na ficha de outra pessoa -- o caso de quem nao tem conta na aplicacao e entrega o pedido em papel.',
   'hr', 'hr.ausencias.view', 380, false, 'organization', false),

  ('hr.ausencias.aprovar.chefia', 'Decidir o passo de chefia',
   'Aprovar, recusar, devolver ou ajustar os pedidos de quem esta na sua cadeia de chefia. Da tambem leitura dos pedidos, dos dias e dos direitos dessas pessoas -- nao dos ajustes de saldo nem das justificacoes.',
   'hr', 'hr.ausencias.view', 390, false, 'organization', false),

  ('hr.ausencias.aprovar.rh', 'Decidir o passo de RH',
   'Aprovar ou recusar os pedidos no segundo passo, depois da chefia. E o passo que fecha o pedido e o inscreve no calendario.',
   'hr', 'hr.ausencias.view', 400, false, 'organization', false),

  ('hr.ausencias.tipos.view', 'Ver tipos de ausencia',
   'Ver o catalogo de tipos de ausencia da organizacao: ferias, doenca, parentalidade, faltas, e as regras de cada um.',
   'hr', 'hr.ausencias.view', 410, false, 'organization', false),

  ('hr.ausencias.tipos.edit', 'Editar tipos de ausencia',
   'Criar, alterar e desactivar tipos de ausencia, e as regras de cada um: se desconta saldo, se exige aprovacao, se conta para o minimo legal.',
   'hr', 'hr.ausencias.tipos.view', 420, false, 'organization', false),

  ('hr.ausencias.direitos.view', 'Ver o direito a ausencia',
   'Ver quantos dias cada pessoa tem direito, por periodo e por tipo. E a base do contador de saldo.',
   'hr', 'hr.ausencias.view', 430, false, 'organization', false),

  ('hr.ausencias.direitos.edit', 'Definir o direito a ausencia',
   'Criar e alterar as linhas de direito por pessoa, periodo e tipo. NAO permite ajustar o contador com dias somados ou subtraidos -- isso e hr.ausencias.ajustar.',
   'hr', 'hr.ausencias.direitos.view', 440, false, 'organization', false),

  ('hr.ausencias.ajustar', 'Ajustar o saldo de ausencias',
   'PERIGOSA. Somar ou subtrair dias ao contador de uma pessoa: correccoes, transporte do periodo anterior, troca de ferias por dinheiro, acertos de admissao e de cessacao. Cada ajuste fica com autor e motivo obrigatorios e nao se apaga, anula-se. A troca por dinheiro esta limitada pelo minimo legal de 20 dias uteis gozaveis.',
   'hr', 'hr.ausencias.direitos.edit', 450, true, 'organization', false),

  ('hr.ausencias.historico.editar', 'Corrigir ausencias passadas',
   'PERIGOSA. Cancelar ou corrigir ausencias JA APROVADAS, inclusive de periodos fechados. Muda contadores para tras e por isso deixa sempre rasto de quem e porque.',
   'hr', 'hr.ausencias.view', 460, true, 'organization', false),

  ('hr.ausencias.justificacao.view', 'Ler a justificacao da ausencia',
   'PERIGOSA. Revela o documento justificativo e o seu texto -- atestados, declaracoes medicas, diagnosticos. Dado de saude: cada revelacao fica registada em pessoas_acessos_sensiveis, como no NISS e no IBAN. Quem aprova um pedido NAO precisa disto e nao o ve.',
   'hr', 'hr.ausencias.view', 470, true, 'organization', false)

-- DO NOTHING e nao DO UPDATE: se algum codigo ja estiver no remoto, nao veio
-- desta migracao e nao se reescreve por iniciativa propria.
ON CONFLICT (code) DO NOTHING;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_novas    integer;
  v_falta    text;
  v_orfaos   text;
  v_perigo   integer;
  v_novos    text[] := ARRAY[
    'hr.ausencias.view',
    'hr.ausencias.view.own',
    'hr.ausencias.pedir',
    'hr.ausencias.pedir.outros',
    'hr.ausencias.aprovar.chefia',
    'hr.ausencias.aprovar.rh',
    'hr.ausencias.tipos.view',
    'hr.ausencias.tipos.edit',
    'hr.ausencias.direitos.view',
    'hr.ausencias.direitos.edit',
    'hr.ausencias.ajustar',
    'hr.ausencias.historico.editar',
    'hr.ausencias.justificacao.view'
  ];
BEGIN
  -- CODIGOS DISTINTOS, nunca linhas: contar linhas ja abortou um push correcto
  -- neste repositorio, porque existem dois papeis com o codigo super_admin.
  SELECT count(DISTINCT code) INTO v_novas
    FROM public.anew_permissions
   WHERE code = ANY (v_novos);

  IF v_novas <> 13 THEN
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_falta
      FROM unnest(v_novos) AS c
     WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c);
    RAISE EXCEPTION
      'Esperavam-se os 13 codigos novos, encontraram-se %. Em falta: %',
      v_novas, coalesce(v_falta, '(nenhum identificado)');
  END IF;

  -- Todos na categoria hr, senao nao aparecem no grupo de Recursos Humanos do
  -- ecra de Papeis e ficam sem sitio nenhum.
  IF EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = ANY (v_novos) AND coalesce(category, '') <> 'hr'
  ) THEN
    RAISE EXCEPTION
      'Algum dos 13 codigos novos nao tem category=hr e nao apareceria no ecra de Papeis.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = ANY (v_novos)
       AND (coalesce(scope, '') <> 'organization' OR coalesce(supports_scope, true) <> false)
  ) THEN
    RAISE EXCEPTION
      'Algum dos 13 codigos novos nao esta em scope=organization / supports_scope=false.';
  END IF;

  -- Os parent_code tem de existir todos, senao a arvore fica com ramos
  -- pendurados no nada e o ecra de Papeis esconde as permissoes.
  SELECT string_agg(p.code || ' -> ' || p.parent_code, ', ' ORDER BY p.code)
    INTO v_orfaos
    FROM public.anew_permissions p
   WHERE p.code = ANY (v_novos)
     AND p.parent_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.anew_permissions q WHERE q.code = p.parent_code);

  IF v_orfaos IS NOT NULL THEN
    RAISE EXCEPTION 'Codigos com parent_code inexistente: %', v_orfaos;
  END IF;

  -- Exactamente tres perigosas. Se este numero mudar, alguem desmarcou uma
  -- delas -- e as tres revelam saude, contadores ou passado com efeito legal.
  SELECT count(DISTINCT code) INTO v_perigo
    FROM public.anew_permissions
   WHERE code = ANY (v_novos) AND is_dangerous = true;

  IF v_perigo <> 3 THEN
    RAISE EXCEPTION
      'Esperavam-se 3 permissoes is_dangerous (ajustar, historico.editar, justificacao.view), encontraram-se %.', v_perigo;
  END IF;

  -- Nenhuma atribuida a papel nenhum: criar a chave e abrir a porta sao dois
  -- actos, e o segundo nao e desta migracao.
  IF EXISTS (
    SELECT 1 FROM public.anew_role_permissions
     WHERE permission_code = ANY (v_novos)
  ) THEN
    RAISE EXCEPTION
      'Algum dos 13 codigos novos ja esta atribuido a um papel. Esta migracao nao atribui permissoes; investigar de onde veio.';
  END IF;

  RAISE NOTICE 'Conferido: 13 codigos de ausencias no catalogo, 3 perigosos, nenhum atribuido a papel.';
END;
$conferir$;
