-- ==============================================================================
-- Atribui as permissoes hr.* ao papel super_admin.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261120020000 criou o catalogo hr.* e, de proposito, NAO atribuiu nenhuma
-- permissao a papel nenhum: as chaves passavam a existir e a porta ficava
-- fechada ate alguem a abrir conscientemente.
--
-- Consequencia pratica: ninguem -- nem o super_admin -- consegue abrir o ecra
-- de pessoas. O item nao aparece no menu e /rh/pessoas responde "Access
-- Denied". O modulo esta aplicado na base e invisivel na aplicacao.
--
-- A concessao em massa de 20260622114000 (todas as permissoes NOT LIKE
-- 'platform.%' ao super_admin) foi um INSERT unico, nao um trigger, por isso
-- permissoes criadas depois dela -- como estas -- nao sao apanhadas.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O papel super_admin recebe todos os codigos hr.*, incluindo os marcados
-- perigosos: retribuicao, dados bancarios, saude, contactos de emergencia,
-- revelacao de NISS e o registo de acessos sensiveis.
--
-- Isto e uma DECISAO, tomada explicitamente, e nao um efeito colateral. Vale a
-- pena que fique escrito o que ela significa: todo o super_admin, em todas as
-- organizacoes onde tenha associacao activa, passa a poder ler salarios,
-- contas bancarias e dados de saude de trabalhadores. A revisao independente
-- deste modulo tinha levantado exactamente este ponto como decisao em aberto.
--
-- O que continua a valer, e nao e alterado aqui:
--
--   has_anew_permission_in_org exige associacao activa NA organizacao. Ter o
--   papel nao basta: um super_admin sem associacao a uma organizacao nao ve as
--   fichas dessa organizacao. Nao ha bypass por codigo de papel dentro da
--   funcao, e continua a nao haver.
--
-- Nenhum outro papel recebe nada. org_admin, worker, viewer e client ficam
-- exactamente como estavam, e o pessoal de RH continua a precisar de
-- atribuicao explicita no ecra de Papeis.
--
--
-- -- PORQUE DESACTIVAR O TRIGGER -----------------------------------------------
--
-- trg_protect_system_role_perms impede alteracoes as permissoes dos papeis de
-- sistema, e super_admin e um deles. Desactiva-se em volta do INSERT e
-- reactiva-se logo, que e o padrao deste repositorio -- ver
-- 20260630120000_portal_permission_codes.sql linhas 89-100.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se cria nem altera nenhum objecto de schema. So dados.
-- - Nao se toca em system_admin: 20260622114000_system_admin_least_privilege
--   existe precisamente para lhe retirar acesso automatico, e as fichas de RH
--   nao sao dados de operacao da plataforma.
-- - Nao se altera has_anew_permission nem has_anew_permission_in_org.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito -- se la estivesse, seria
-- aplicado por engano no push seguinte. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code LIKE 'hr.%'
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261120020000  catalogo hr.*
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_permissoes integer;
  v_papel      integer;
BEGIN
  SELECT count(*) INTO v_permissoes
    FROM public.anew_permissions
   WHERE code LIKE 'hr.%';

  IF v_permissoes = 0 THEN
    RAISE EXCEPTION
      'Nao ha permissoes hr.* no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  SELECT count(*) INTO v_papel
    FROM public.anew_roles
   WHERE code = 'super_admin';

  IF v_papel = 0 THEN
    RAISE EXCEPTION 'Nao existe o papel super_admin. Investigar antes de aplicar.';
  END IF;

  RAISE NOTICE
    'Guardas passadas: % permissoes hr.* no catalogo, % papel(eis) super_admin.',
    v_permissoes, v_papel;
END;
$guardas$;

-- ---- A atribuicao ----------------------------------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

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
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.%';

  SELECT count(*) INTO v_atribuido
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

  IF EXISTS (
    SELECT 1
      FROM public.anew_role_permissions rp
      JOIN public.anew_roles r ON r.id = rp.role_id
     WHERE rp.permission_code LIKE 'hr.%'
       AND r.code <> 'super_admin'
  ) THEN
    RAISE WARNING
      'Ha permissoes hr.* atribuidas a papeis que nao o super_admin. Nao foi esta migracao a faze-lo -- confirmar se foi atribuicao manual no ecra de Papeis.';
  END IF;

  RAISE NOTICE
    'super_admin ficou com as % permissoes hr.* do catalogo.', v_atribuido;
END;
$conferir$;
