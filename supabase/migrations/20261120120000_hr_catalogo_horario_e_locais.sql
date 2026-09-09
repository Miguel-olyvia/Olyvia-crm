-- ==============================================================================
-- Catalogo: as 7 permissoes novas de locais de trabalho e de horario.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A ronda 2 do modulo de RH acrescenta tres tabelas -- hr_locais_trabalho,
-- pessoas_horario_planeado e pessoas_horario_realizado -- e as politicas RLS
-- dessas tabelas referem codigos de permissao que ainda nao existem no
-- catalogo.
--
-- Uma politica que chame has_anew_permission_in_org com um codigo ausente do
-- catalogo nao rebenta: devolve simplesmente false para todos, sempre. A
-- tabela fica invisivel e inescrivel para todo o mundo, incluindo o
-- super_admin, e nao ha erro nenhum a dizer porque. Foi exactamente o que
-- aconteceu com as 27 permissoes de 20261120020000 antes de 20261120100000.
--
-- Por isso o catalogo vem PRIMEIRO, antes de qualquer tabela desta ronda.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Sete codigos novos, todos com category='hr', scope='organization' e
-- supports_scope=false, para cairem no mesmo grupo visual das 27 existentes:
--
--   hr.locais.view                          catalogo de locais de trabalho
--   hr.locais.edit
--   hr.pessoas.horario.view                 horario PLANEADO da pessoa
--   hr.pessoas.horario.edit
--   hr.pessoas.horario_realizado.view       tempo REALIZADO da pessoa
--   hr.pessoas.horario_realizado.edit
--   hr.pessoas.horario_realizado.validar
--
-- Nenhuma e is_dangerous: um horario nao e um salario nem um dado de saude.
-- Saber que alguem trabalha as tercas de manha nao e informacao de categoria
-- especial, e marcar tudo como perigoso esvazia a marca de significado.
--
-- A separacao entre horario PLANEADO e horario REALIZADO nao e cosmetica --
-- e a razao pela qual sao duas permissoes e nao uma. Quem planeia turnos nao
-- e necessariamente quem confirma que as horas foram cumpridas, e a
-- confirmacao de horas realizadas e o que sustenta um pagamento.
--
-- ATENCAO, e tem de ficar escrito tambem na propria permissao:
-- hr.pessoas.horario_realizado.validar NAO E VERIFICADA POR NADA HOJE.
-- Entra no catalogo agora para nao haver uma segunda migracao de catalogo
-- daqui a duas semanas, mas nenhuma politica RLS e nenhuma RPC a consulta. Na
-- pratica, quem tem hr.pessoas.horario_realizado.edit consegue por uma linha
-- em estado 'validado'. Atribuir esta permissao a alguem hoje nao lhe da poder
-- nenhum, e NAO atribui-la nao lhe tira nenhum. Quem construir a RPC de
-- validacao tem de ligar as duas coisas, e ate la esta permissao e uma
-- declaracao de intencao, nao uma guarda.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se atribui permissao nenhuma a papel nenhum aqui. Isso e
--   20261120180000, e de proposito e um ficheiro separado: criar a chave e
--   abrir a porta sao dois actos.
-- - Nao se cria nem altera objecto de schema nenhum. So dados.
-- - Nao se toca nas 27 permissoes existentes: o ON CONFLICT desta migracao e
--   DO NOTHING e nao DO UPDATE, ao contrario de 20261120020000. Se algum
--   destes sete codigos ja existir no remoto por drift, esta migracao NAO o
--   reescreve -- prefere-se um aviso no bloco de conferencia a uma alteracao
--   silenciosa de algo que nao se sabe de onde veio.
-- - Nao se acrescentam permissoes de picagens, ausencias, ferias, salarios,
--   recrutamento ou desempenho. Nada disso e construido nesta ronda.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito -- se la estivesse, seria
-- aplicado por engano no db push seguinte. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code IN ('hr.locais.view','hr.locais.edit',
--          'hr.pessoas.horario.view','hr.pessoas.horario.edit',
--          'hr.pessoas.horario_realizado.view','hr.pessoas.horario_realizado.edit',
--          'hr.pessoas.horario_realizado.validar');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_permissions WHERE code IN ( ...os mesmos sete... );
-- Apagar os codigos com as tabelas da ronda 2 ainda de pe deixa essas tabelas
-- inacessiveis a todos. Apagar as tabelas primeiro.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.* (hr.module.access e hr.pessoas.view sao
--                   parent_code de codigos desta migracao)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_hr integer;
BEGIN
  IF to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'public.anew_permissions nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'anew_permissions_code_unique'
      AND conrelid = to_regclass('public.anew_permissions')
  ) THEN
    RAISE EXCEPTION
      'anew_permissions nao tem a unique em code. O ON CONFLICT (code) desta migracao depende dela; confirmar o estado real.';
  END IF;

  -- Os parent_code desta migracao tem de existir, senao a arvore do ecra de
  -- Papeis fica com ramos pendurados no nada.
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.module.access') THEN
    RAISE EXCEPTION 'hr.module.access nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view') THEN
    RAISE EXCEPTION 'hr.pessoas.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  SELECT count(*) INTO v_hr FROM public.anew_permissions WHERE code LIKE 'hr.%';

  IF v_hr < 27 THEN
    RAISE EXCEPTION
      'Esperavam-se pelo menos as 27 permissoes hr.* da ronda 1, encontraram-se %. Aplicar 20261120020000 primeiro.', v_hr;
  END IF;

  RAISE NOTICE 'Guardas passadas: % permissoes hr.* no catalogo antes desta migracao.', v_hr;
END;
$guardas$;

-- ---- Os sete codigos novos -------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.locais.view', 'Ver locais de trabalho',
   'Ver o catalogo de locais de trabalho da organizacao: sedes, escritorios, lojas, armazens, obras e casas de cliente. Nao da acesso a ficha de pessoa nenhuma.',
   'hr', 'hr.module.access', 280, false, 'organization', false),

  ('hr.locais.edit', 'Editar locais de trabalho',
   'Criar, alterar e desactivar locais de trabalho da organizacao.',
   'hr', 'hr.locais.view', 290, false, 'organization', false),

  ('hr.pessoas.horario.view', 'Ver o horario planeado',
   'Ver o horario PLANEADO da pessoa: os intervalos previstos por dia da semana, as excepcoes por data e o local de cada intervalo. Cada um ve sempre o seu proprio horario se tiver hr.pessoas.view.own.',
   'hr', 'hr.pessoas.view', 300, false, 'organization', false),

  ('hr.pessoas.horario.edit', 'Editar o horario planeado',
   'Criar e alterar os intervalos de horario planeado da pessoa. Ninguem escreve o proprio horario: ver a propria ficha nao da para a editar.',
   'hr', 'hr.pessoas.horario.view', 310, false, 'organization', false),

  ('hr.pessoas.horario_realizado.view', 'Ver o tempo realizado',
   'Ver o tempo efectivamente trabalhado: intervalos por data, com local e estado de validacao. E o REALIZADO, nao o planeado -- sao duas coisas e duas permissoes.',
   'hr', 'hr.pessoas.horario.view', 320, false, 'organization', false),

  ('hr.pessoas.horario_realizado.edit', 'Registar e corrigir tempo realizado',
   'Registar intervalos trabalhados e corrigir os que estao errados. Enquanto nao existir a RPC de validacao, esta permissao tambem permite por uma linha em estado validado.',
   'hr', 'hr.pessoas.horario_realizado.view', 330, false, 'organization', false),

  ('hr.pessoas.horario_realizado.validar', 'Validar tempo realizado',
   'NAO E VERIFICADA POR NADA HOJE. Entra no catalogo para a RPC de validacao futura, mas nenhuma politica RLS e nenhuma funcao a consulta: quem tem hr.pessoas.horario_realizado.edit consegue validar sem ela. Atribui-la hoje nao concede poder nenhum, e nao a atribuir nao retira nenhum. Nao confundir com uma guarda activa.',
   'hr', 'hr.pessoas.horario_realizado.view', 340, false, 'organization', false)

-- DO NOTHING e nao DO UPDATE, ao contrario de 20261120020000: se algum destes
-- codigos ja estiver no remoto, nao veio desta migracao e nao se reescreve por
-- iniciativa propria. O bloco de conferencia avisa se isso acontecer.
ON CONFLICT (code) DO NOTHING;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_total integer;
  v_novas integer;
  v_falta text;
  v_orfas text;
  v_novos text[] := ARRAY[
    'hr.locais.view',
    'hr.locais.edit',
    'hr.pessoas.horario.view',
    'hr.pessoas.horario.edit',
    'hr.pessoas.horario_realizado.view',
    'hr.pessoas.horario_realizado.edit',
    'hr.pessoas.horario_realizado.validar'
  ];
BEGIN
  SELECT count(*) INTO v_novas
    FROM public.anew_permissions
   WHERE code = ANY (v_novos);

  IF v_novas <> 7 THEN
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_falta
      FROM unnest(v_novos) AS c
     WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c);
    RAISE EXCEPTION
      'Esperavam-se os 7 codigos novos, encontraram-se %. Em falta: %',
      v_novas, coalesce(v_falta, '(nenhum identificado)');
  END IF;

  -- Os sete tem de estar todos na categoria hr, senao nao aparecem no grupo de
  -- Recursos Humanos do ecra de Papeis e ficam sem sitio nenhum.
  IF EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = ANY (v_novos)
       AND (
         category IS DISTINCT FROM 'hr'
         OR scope IS DISTINCT FROM 'organization'
         OR supports_scope IS DISTINCT FROM false
       )
  ) THEN
    RAISE WARNING
      'Algum dos 7 codigos novos nao tem category=hr / scope=organization / supports_scope=false. Provavelmente ja existia no remoto por drift e o ON CONFLICT DO NOTHING nao o reescreveu. Confirmar a mao.';
  END IF;

  -- Nenhum parent_code pendurado no nada.
  SELECT string_agg(p.code || ' -> ' || p.parent_code, ', ' ORDER BY p.code) INTO v_orfas
    FROM public.anew_permissions p
   WHERE p.code = ANY (v_novos)
     AND p.parent_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.anew_permissions q WHERE q.code = p.parent_code);

  IF v_orfas IS NOT NULL THEN
    RAISE EXCEPTION 'Codigos com parent_code inexistente: %', v_orfas;
  END IF;

  SELECT count(*) INTO v_total FROM public.anew_permissions WHERE code LIKE 'hr.%';

  IF v_total <> 34 THEN
    RAISE WARNING
      'O catalogo hr.* tem % codigos e esperavam-se 34 (27 da ronda 1 + 7 desta). Se for mais, ha permissoes hr.* no remoto que este bloco nao conhece -- 20261120180000 vai atribui-las TODAS ao super_admin pelo LIKE. Parar e investigar antes de aplicar 20261120180000.',
      v_total;
  END IF;

  RAISE NOTICE
    'OK: 7 permissoes novas de locais e horario no catalogo; % codigos hr.* no total. Nenhuma foi atribuida a papel nenhum -- isso e 20261120180000.',
    v_total;
END;
$conferir$;
