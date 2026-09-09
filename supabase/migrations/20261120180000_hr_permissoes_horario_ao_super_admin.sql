-- ==============================================================================
-- Atribui ao papel super_admin as permissoes hr.* da ronda 2 (locais e horario).
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261120120000 criou os 7 codigos novos e, de proposito, NAO os atribuiu a
-- papel nenhum: as chaves passavam a existir e a porta ficava fechada ate
-- alguem a abrir conscientemente.
--
-- Consequencia pratica enquanto isso nao acontece: as tres tabelas da ronda 2
-- estao criadas, com RLS activo, e sao invisiveis e inescriveis para TODO o
-- mundo -- incluindo o super_admin. Nao ha erro nenhum a dizer porque: uma
-- politica que chame has_anew_permission_in_org com um codigo que ninguem tem
-- devolve false e a tabela aparece vazia. Foi exactamente o que aconteceu na
-- ronda 1 entre 20261120020000 e 20261120100000.
--
-- 20261120100000 nao apanha estes codigos: foi um INSERT unico e nao um
-- trigger, por isso permissoes criadas depois dela ficam de fora. Tal como a
-- concessao em massa de 20260622114000 nao apanhou as 27 da ronda 1.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Mesmo desenho de 20261120100000, e deliberadamente o mesmo LIKE 'hr.%' e nao
-- uma lista dos sete codigos. Razao: o LIKE apanha as novas sem que ninguem se
-- lembre de as acrescentar aqui, o que e o defeito que esta migracao existe
-- para corrigir. O preco esta assumido e esta no aviso ao orquestrador, no fim.
--
-- Nenhuma das 7 e is_dangerous e vale a pena dizer o que isso significa: o
-- super_admin passa a poder ver e editar o catalogo de locais e os horarios
-- planeados e realizados de qualquer trabalhador nas organizacoes onde tem
-- associacao activa. Nao ha aqui salarios, dados bancarios nem saude -- esses
-- ja lhe tinham sido dados por 20261120100000, e essa decisao esta escrita la.
--
-- O que continua a valer, e nao e alterado aqui:
--
--   has_anew_permission_in_org exige associacao activa NA organizacao. Ter o
--   papel nao basta: um super_admin sem associacao a uma organizacao nao ve os
--   horarios dessa organizacao. Nao ha bypass por codigo de papel dentro da
--   funcao, e continua a nao haver.
--
-- Nenhum outro papel recebe nada. org_admin, worker, viewer e client ficam
-- exactamente como estavam.
--
-- system_admin continua deliberadamente de fora: 20260622114000_system_admin_
-- least_privilege existe precisamente para lhe retirar acesso automatico, e o
-- horario de um trabalhador nao e dado de operacao da plataforma.
--
--
-- -- PORQUE DESACTIVAR O TRIGGER -----------------------------------------------
--
-- trg_protect_system_role_perms impede alteracoes as permissoes dos papeis de
-- sistema, e super_admin e um deles. Desactiva-se em volta do INSERT e
-- reactiva-se logo, que e o padrao deste repositorio -- ver
-- 20260630120000_portal_permission_codes.sql linhas 89-100 e 20261120100000.
--
-- A reactivacao NAO esta protegida por bloco de excepcao, de proposito: se o
-- INSERT falhar, a transaccao inteira e revertida e o DISABLE tambem, por isso
-- o trigger nunca fica desligado. Um EXCEPTION aqui esconderia a falha.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se cria nem altera objecto de schema nenhum. So dados.
-- - Nao se atribui nada a nenhum outro papel. O pessoal de RH continua a
--   precisar de atribuicao explicita no ecra de Papeis -- e ATENCAO, ha um
--   bloqueador de interface para isso que NAO se corrige numa migration: a
--   categoria 'hr' nao esta na lista de categorias que o ecra de Papeis mostra,
--   por isso as 34 permissoes hr.* nao aparecem la de forma nenhuma. Enquanto
--   isso nao for corrigido no codigo (src/pages/Roles.tsx), o super_admin
--   desta migracao e o UNICO que consegue ter acesso ao modulo, porque nao ha
--   onde atribuir as permissoes a mais ninguem.
-- - Nao se altera has_anew_permission nem has_anew_permission_in_org.
-- - Nao se toca em system_admin.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito -- se la estivesse, seria
-- aplicado por engano no db push seguinte. A mao, e SO os sete desta ronda
-- (revogar todos os hr.% desfazia tambem 20261120100000):
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code IN ('hr.locais.view','hr.locais.edit',
--          'hr.pessoas.horario.view','hr.pessoas.horario.edit',
--          'hr.pessoas.horario_realizado.view','hr.pessoas.horario_realizado.edit',
--          'hr.pessoas.horario_realizado.validar')
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261120100000  as 27 permissoes hr.* da ronda 1 ja atribuidas
--   20261120120000  os 7 codigos novos no catalogo
--
-- Nao depende das tabelas (130000/150000/160000/170000) para correr, mas nao
-- serve para nada antes delas. Aplicar por ultimo, como esta numerado.
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_catalogo integer;
  v_papel    integer;
  v_falta    text;
  v_novos    text[] := ARRAY[
    'hr.locais.view',
    'hr.locais.edit',
    'hr.pessoas.horario.view',
    'hr.pessoas.horario.edit',
    'hr.pessoas.horario_realizado.view',
    'hr.pessoas.horario_realizado.edit',
    'hr.pessoas.horario_realizado.validar'
  ];
BEGIN
  IF to_regclass('public.anew_role_permissions') IS NULL THEN
    RAISE EXCEPTION 'public.anew_role_permissions nao existe. Estado da base inesperado.';
  END IF;

  -- Os sete codigos desta ronda tem de estar no catalogo. Se faltar algum, o
  -- LIKE 'hr.%' abaixo atribuia o resto e ninguem notava a falta.
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_falta
    FROM unnest(v_novos) AS c
   WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c);

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION
      'Faltam codigos da ronda 2 no catalogo: %. Aplicar 20261120120000 primeiro.', v_falta;
  END IF;

  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.%';

  IF v_catalogo <> 34 THEN
    RAISE EXCEPTION
      -- O %% e escapado de proposito: dentro de uma mensagem de RAISE, um %
      -- solitario e marcador de substituicao. Com "hr.%" a mensagem pedia dois
      -- argumentos e so lhe davam um, e o push falhava com 42601 (too few
      -- parameters specified for RAISE) -- ironicamente na propria guarda.
      'O catalogo hr.* tem % codigos e esperavam-se 34 (27 da ronda 1 + 7 da ronda 2). Esta migracao atribui ao super_admin TODOS os hr.%% que existirem, por isso um numero diferente significa que ha permissoes que este ficheiro nao conhece. PARAR E INVESTIGAR, nao forcar.',
      v_catalogo;
  END IF;

  SELECT count(*) INTO v_papel
    FROM public.anew_roles
   WHERE code = 'super_admin';

  IF v_papel = 0 THEN
    RAISE EXCEPTION 'Nao existe o papel super_admin. Investigar antes de aplicar.';
  END IF;

  -- O trigger que se vai desactivar tem de existir; se nao existir, o ALTER
  -- TABLE DISABLE TRIGGER falha e o push para a meio.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.anew_role_permissions')
       AND tgname = 'trg_protect_system_role_perms'
  ) THEN
    RAISE EXCEPTION
      'O trigger trg_protect_system_role_perms nao existe em anew_role_permissions. Esta migracao desactiva-o e reactiva-o; sem ele o estado nao e o esperado. Investigar.';
  END IF;

  RAISE NOTICE
    'Guardas passadas: 34 permissoes hr.* no catalogo, % papel(eis) super_admin, trigger de proteccao presente.',
    v_papel;
END;
$guardas$;

-- ---- A atribuicao ----------------------------------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

-- LIKE 'hr.%' e nao a lista dos sete, deliberadamente: e assim que as
-- permissoes de rondas futuras sao apanhadas sem que ninguem se lembre delas.
-- As 27 da ronda 1 estao ja atribuidas e caem no ON CONFLICT DO NOTHING.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
 CROSS JOIN public.anew_permissions p
 WHERE r.code = 'super_admin'
   AND p.code LIKE 'hr.%'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_catalogo  integer;
  v_atribuido integer;
  v_falta     text;
  v_outros    text;
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.%';

  -- count(DISTINCT permission_code), e nao count(*), porque HA MAIS DE UM papel
  -- com o codigo 'super_admin': o global (organization_id IS NULL, is_system) e
  -- pelo menos um preso a uma organizacao. Producao tinha 2 a 9/9/2026, e o
  -- ramo tambem. Com count(*) a verificacao devolvia 68 -- 34 codigos vezes 2
  -- papeis -- e abortava um push que estava correcto. O que importa e que os
  -- 34 codigos estejam atribuidos, nao quantas linhas isso da.
  SELECT count(DISTINCT rp.permission_code) INTO v_atribuido
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE r.code = 'super_admin'
     AND rp.permission_code LIKE 'hr.%';

  IF v_atribuido <> v_catalogo THEN
    SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_falta
      FROM public.anew_permissions p
     WHERE p.code LIKE 'hr.%'
       AND NOT EXISTS (
         SELECT 1
           FROM public.anew_role_permissions rp
           JOIN public.anew_roles r ON r.id = rp.role_id
          WHERE r.code = 'super_admin'
            AND rp.permission_code = p.code
       );

    RAISE EXCEPTION
      'super_admin ficou com % de % permissoes hr.*. Em falta: %',
      v_atribuido, v_catalogo, coalesce(v_falta, '(nenhuma identificada)');
  END IF;

  IF v_atribuido <> 34 THEN
    RAISE EXCEPTION
      'super_admin ficou com % permissoes hr.* e esperavam-se 34. O numero bate com o catalogo mas nao com o esperado -- ha permissoes hr.* no remoto que este ficheiro nao conhece. Investigar.',
      v_atribuido;
  END IF;

  -- O trigger de proteccao tem de ter ficado ligado. Deixa-lo desligado
  -- abriria as permissoes dos papeis de sistema a qualquer escrita.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.anew_role_permissions')
       AND tgname = 'trg_protect_system_role_perms'
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      'trg_protect_system_role_perms ficou DESACTIVADO. As permissoes dos papeis de sistema ficariam abertas a qualquer escrita -- reactivar imediatamente com ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;';
  END IF;

  -- Aviso e nao excepcao: pode ter sido atribuicao manual legitima no ecra de
  -- Papeis, e nao e esta migracao que decide isso.
  SELECT string_agg(DISTINCT r.code, ', ' ORDER BY r.code) INTO v_outros
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code LIKE 'hr.%'
     AND r.code <> 'super_admin';

  IF v_outros IS NOT NULL THEN
    RAISE WARNING
      'Ha permissoes hr.* atribuidas a papeis que nao o super_admin: %. Nao foi esta migracao a faze-lo -- confirmar se foi atribuicao manual no ecra de Papeis.',
      v_outros;
  END IF;

  RAISE NOTICE
    'super_admin ficou com as % permissoes hr.* do catalogo, incluindo as 7 de locais e horario. Nenhum outro papel recebeu nada. LEMBRETE: a categoria hr nao aparece no ecra de Papeis ate src/pages/Roles.tsx ser corrigido, por isso hoje nao ha como atribuir estas permissoes a mais ninguem.',
    v_atribuido;
END;
$conferir$;
