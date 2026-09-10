-- ==============================================================================
-- Tres permissoes novas do fluxo de admissao: enviar convite, e ver/editar
-- filiacao sindical. NENHUMA e atribuida a papel nenhum.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O convite de admissao escreve dentro da ficha de uma pessoa antes de essa
-- pessoa ter conta nenhuma; enviar esse link e uma autoridade propria, que nao
-- e nem "criar ficha" (hr.pessoas.create) nem "editar dentro da aplicacao"
-- (hr.pessoas.edit) -- e abrir um caminho de escrita a um terceiro por fora da
-- aplicacao. A filiacao sindical (art. 9.o RGPD) precisa do mesmo tratamento
-- ja dado a hr.pessoas.saude.*: permissao propria, is_dangerous, sem mascara
-- possivel (nao ha "ultimos 4 caracteres de um sindicato").
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- hr.pessoas.convite.enviar   parent_code = hr.pessoas.view      (nao create,
--                             nao edit -- ver ficheiro do plano, seccao 3)
-- hr.pessoas.sindicalizacao.view   parent_code = hr.pessoas.view
-- hr.pessoas.sindicalizacao.edit   parent_code = hr.pessoas.sindicalizacao.view
--
-- As tres is_dangerous = true. display_order 280/290/300, a seguir a
-- hr.pessoas.acessos_sensiveis.view (270), a ultima do catalogo em
-- 20261120020000.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- Nenhuma atribuicao a papel. A atribuicao e um acto consciente, organizacao a
-- organizacao, feito no ecra de papeis.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DELETE FROM public.anew_permissions
--   WHERE code IN ('hr.pessoas.convite.enviar', 'hr.pessoas.sindicalizacao.view', 'hr.pessoas.sindicalizacao.edit');
-- So depois de confirmar que nenhuma tabela ou politica os referencia (ver
-- 20261124120000 em diante, que os pressupoem).
--
--
-- Prerequisitos:
--   20261120020000  catalogo hr.* (hr.pessoas.view, display_order ate 270)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view') THEN
    RAISE EXCEPTION 'hr.pessoas.view nao existe no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_permissions
    WHERE code IN ('hr.pessoas.convite.enviar','hr.pessoas.sindicalizacao.view','hr.pessoas.sindicalizacao.edit')
      AND NOT is_dangerous
  ) THEN
    RAISE EXCEPTION 'Uma das tres permissoes ja existe sem estar marcada is_dangerous. Investigar antes de aplicar -- nao sobrepor uma decisao ja tomada.';
  END IF;
END;
$guardas$;

-- ---- O catalogo, aditivo ----------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.convite.enviar', 'Enviar convite de admissao',
   'Gerar e enviar um link de admissao a um destinatario externo, que passa a poder preencher e submeter a ficha de uma pessoa sem ter conta na aplicacao. Nao e a mesma autoridade que criar uma ficha nem editar uma ficha existente: abre um caminho de escrita a um terceiro.',
   'hr', 'hr.pessoas.view', 280, true, 'organization', false),

  ('hr.pessoas.sindicalizacao.view', 'Ver filiacao sindical',
   'Ver se a pessoa e sindicalizada e em que sindicato. Dado de categoria especial (art. 9.o RGPD), sem forma mascarada possivel.',
   'hr', 'hr.pessoas.view', 290, true, 'organization', false),

  ('hr.pessoas.sindicalizacao.edit', 'Editar filiacao sindical',
   'Registar ou alterar a filiacao sindical da pessoa. Cada alteracao fica registada em pessoas_acessos_sensiveis.',
   'hr', 'hr.pessoas.sindicalizacao.view', 300, true, 'organization', false)

ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  parent_code    = EXCLUDED.parent_code,
  display_order  = EXCLUDED.display_order,
  is_dangerous   = EXCLUDED.is_dangerous,
  scope          = EXCLUDED.scope,
  supports_scope = EXCLUDED.supports_scope;

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.anew_permissions
  WHERE code IN ('hr.pessoas.convite.enviar','hr.pessoas.sindicalizacao.view','hr.pessoas.sindicalizacao.edit')
    AND is_dangerous AND category = 'hr' AND scope = 'organization' AND NOT supports_scope;

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 permissoes novas is_dangerous/organization/hr, encontraram-se %.', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.permission_code IN ('hr.pessoas.convite.enviar','hr.pessoas.sindicalizacao.view','hr.pessoas.sindicalizacao.edit')
  ) THEN
    RAISE EXCEPTION 'Alguma das tres permissoes ja esta atribuida a um papel. Esta migracao so cria o catalogo -- a atribuicao nao devia ter vindo daqui.';
  END IF;

  RAISE NOTICE 'OK: 3 permissoes novas no catalogo, nenhuma atribuida a papel.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. So insere/actualiza linhas de anew_permissions por ON CONFLICT (code);
--    nao altera nenhuma tabela nem politica existente -- sem janela de estado
--    defeituoso na base partilhada.
-- 2. As migrations seguintes (pessoas_sindicalizacao, convites de admissao)
--    pressupoem estes tres codigos. Aplicar esta primeiro.
-- ==============================================================================
