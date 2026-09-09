-- ==============================================================================
-- Apaga do catalogo as duas permissoes que so serviam os dispositivos de
-- picagem, agora removidos pela 20261122030000.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- hr.assiduidade.dispositivos.view e hr.assiduidade.dispositivos.edit, criadas
-- em 20261121140000, guardavam a autoridade sobre hr_picagens_dispositivos e
-- sobre o ecra /rh/definicoes/assiduidade-dispositivos. Confirmado por grep nas
-- migrations desta pasta que os UNICOS consumidores eram as quatro politicas
-- RLS dessa tabela (que ja caiu na migracao anterior) e o ecra (que sai pelo
-- lado da aplicacao nesta mesma ronda). Uma permissao que guarda um objecto que
-- ja nao existe e pior do que nenhuma: continua a aparecer no ecra de Papeis,
-- alguem atribui-a, e nao faz nada.
--
-- Este e o caso DIFERENTE do de hr.ausencias.tipos.edit (20261122020000): ali o
-- objecto (a tabela) continua a existir e so a politica deixou de a consultar
-- -- por isso aquela permissao ficou no catalogo, sem efeito, com a descricao
-- corrigida. Aqui o objecto que a permissao guardava foi ele proprio apagado, e
-- por isso o codigo sai tambem.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- DELETE dos dois codigos, com a mesma coreografia ja usada em 20261120180000,
-- 20260622114000, 20260622181000, 20260623120000 e 20260630120000:
--
--   1. desligar trg_protect_system_role_perms;
--   2. apagar as atribuicoes em anew_role_permissions (pode haver alguma no
--      super_admin, da 20261121270000, que atribuiu 'hr.assiduidade%' inteiro);
--   3. religar o trigger;
--   4. so depois apagar de anew_permissions -- NUM SO STATEMENT com os dois
--      codigos, porque .edit tem .view como parent_code e o Postgres so
--      verifica a FK de parent_code no FIM do statement. Apagar .view antes de
--      .edit num statement separado falharia a meio.
--
-- hr.assiduidade.equipa.view NAO se toca aqui: confirmado por leitura que
-- continua consultada na politica pessoas_picagens_select (20261121160000,
-- ramo da chefia) e usada em dois separadores da ficha da pessoa no lado da
-- aplicacao. So os dispositivos saem.
--
--
-- -- CONTAR CODIGOS, NAO LINHAS --------------------------------------------------
--
-- A verificacao final usa count(DISTINCT permission_code) contra
-- anew_role_permissions antes do DELETE, e count(DISTINCT code) contra
-- anew_permissions depois. Ha MAIS DE UM papel com o codigo super_admin (o
-- global, is_system, organization_id NULL, e pelo menos um preso a uma
-- organizacao) -- contar linhas em vez de codigos distintos dava um numero
-- errado, como ja aconteceu em 20261120180000.
--
--
-- -- O QUE FICA DE FORA ---------------------------------------------------------
--
-- - hr.assiduidade.equipa.view: fica, ver acima.
-- - Qualquer outro codigo hr.assiduidade.*: nao se toca.
-- - Nao se cria nem altera nenhuma tabela, funcao ou politica nesta migracao.
--
--
-- -- COMO SE REVERTE -------------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao -- so faz sentido
-- se a 20261122030000 tambem for revertida e a tabela recriada:
--   INSERT INTO public.anew_permissions
--     (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
--   VALUES
--     ('hr.assiduidade.dispositivos.view', 'Ver dispositivos de picagem',
--      'Ver o catalogo de dispositivos de picagem da organizacao: quiosques, leitores, relogios de ponto.',
--      'hr', 'hr.assiduidade.view', 590, false, 'organization', false),
--     ('hr.assiduidade.dispositivos.edit', 'Editar dispositivos de picagem',
--      'Registar, alterar e desactivar dispositivos de picagem, e rodar a chave de registo de cada um.',
--      'hr', 'hr.assiduidade.dispositivos.view', 600, false, 'organization', false)
--   ON CONFLICT (code) DO NOTHING;
--
--
-- Prerequisitos:
--   20261121140000  catalogo de assiduidade (cria os dois codigos)
--   20261122030000  hr_picagens_dispositivos removida
-- ==============================================================================

-- ---- Guardas ------------------------------------------------------------------
DO $guardas$
DECLARE
  v_catalogo integer;
BEGIN
  IF to_regclass('public.hr_picagens_dispositivos') IS NOT NULL THEN
    RAISE EXCEPTION
      'public.hr_picagens_dispositivos ainda existe. Aplicar 20261122030000 primeiro -- enquanto a tabela existir, o codigo ainda podia ser a autoridade consultada por alguma politica.';
  END IF;

  SELECT count(DISTINCT code) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code IN ('hr.assiduidade.dispositivos.view', 'hr.assiduidade.dispositivos.edit');

  IF v_catalogo = 0 THEN
    RAISE EXCEPTION
      'Nenhum dos dois codigos de dispositivos esta no catalogo. Confirmar se esta migracao ja foi aplicada antes de a repetir.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION
      'O trigger trg_protect_system_role_perms nao existe. Esta migracao desactiva-o e reactiva-o; sem ele o estado nao e o esperado.';
  END IF;

  RAISE NOTICE 'Guardas passadas: % dos 2 codigos de dispositivos presentes no catalogo.', v_catalogo;
END;
$guardas$;

-- ---- Apagar as atribuicoes primeiro --------------------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

DELETE FROM public.anew_role_permissions
 WHERE permission_code IN ('hr.assiduidade.dispositivos.view', 'hr.assiduidade.dispositivos.edit');

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ---- Apagar os dois codigos, num so statement -----------------------------
-- .edit tem .view como parent_code; a FK de parent_code so e verificada no FIM
-- do statement, por isso os dois saem juntos e nao um de cada vez.
DELETE FROM public.anew_permissions
 WHERE code IN ('hr.assiduidade.dispositivos.view', 'hr.assiduidade.dispositivos.edit');

-- ---- Conferir -------------------------------------------------------------
DO $conferir$
DECLARE
  v_catalogo   integer;
  v_atribuido  integer;
  v_orfaos     text;
  v_activo     boolean;
BEGIN
  SELECT count(DISTINCT code) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code IN ('hr.assiduidade.dispositivos.view', 'hr.assiduidade.dispositivos.edit');

  IF v_catalogo <> 0 THEN
    RAISE EXCEPTION 'Ainda ha % dos 2 codigos de dispositivos no catalogo.', v_catalogo;
  END IF;

  SELECT count(DISTINCT permission_code) INTO v_atribuido
    FROM public.anew_role_permissions
   WHERE permission_code IN ('hr.assiduidade.dispositivos.view', 'hr.assiduidade.dispositivos.edit');

  IF v_atribuido <> 0 THEN
    RAISE EXCEPTION 'Ainda ha % atribuicao(oes) aos codigos de dispositivos em anew_role_permissions.', v_atribuido;
  END IF;

  -- hr.assiduidade.equipa.view NAO se apaga.
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.equipa.view') THEN
    RAISE EXCEPTION
      'hr.assiduidade.equipa.view desapareceu do catalogo -- esta migracao so devia apagar os dois codigos de dispositivos.';
  END IF;

  -- Nenhum codigo orfao de parent_code no dominio hr.assiduidade.*
  SELECT string_agg(p.code || ' -> ' || p.parent_code, ', ' ORDER BY p.code) INTO v_orfaos
    FROM public.anew_permissions p
   WHERE p.code LIKE 'hr.assiduidade.%' AND p.parent_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.anew_permissions q WHERE q.code = p.parent_code);

  IF v_orfaos IS NOT NULL THEN
    RAISE EXCEPTION 'Codigos hr.assiduidade.* com parent_code inexistente depois do DELETE: %', v_orfaos;
  END IF;

  SELECT tgenabled <> 'D' INTO v_activo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms'
     AND tgrelid = to_regclass('public.anew_role_permissions');

  IF NOT coalesce(v_activo, false) THEN
    RAISE EXCEPTION
      'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar imediatamente: ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;';
  END IF;

  RAISE NOTICE
    'Conferido: os 2 codigos de dispositivos e as suas atribuicoes desapareceram, hr.assiduidade.equipa.view continua no catalogo, nenhum codigo hr.assiduidade.* ficou orfao de parent_code.';
END;
$conferir$;
