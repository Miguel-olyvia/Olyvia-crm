-- ==============================================================================
-- 20261210400000_hr_admissao_permissoes_e_prazo_portal.sql
--
-- V1 DA ADMISSAO (etapa E2): as quatro permissoes hr.onboarding.* no catalogo
-- global e o prazo do portal por organizacao (portal_validade_dias, 7 por
-- omissao).
--
-- POR APLICAR. Ordem na dev: 20261210390000 (V0, so da dev) -> ESTA ->
-- 20261210410000 (atribuicao ao super_admin, so da dev) -> 20261210420000 (V2).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. anew_permissions ganha, todas perigosas e SEM papel nenhum:
--      hr.onboarding.approve        aprovar um processo submetido (promove para a ficha)
--      hr.onboarding.sign_employer  assinar o contrato pela entidade empregadora
--      hr.onboarding.sensitive      abrir o conteudo declarado e os anexos
--      hr.onboarding.restrito       consultar processos cancelados ou rejeitados
--    Ficam penduradas em hr.pessoas.convite.enviar (a arvore so serve o ecra de
--    papeis; has_anew_permission_in_org nao herda pelo parent_code).
--    Nesta etapa NENHUMA funcao as usa ainda: entram ja para a E3 (aprovar,
--    consulta restrita) e a E5 (assinatura), e para o ecra de papeis as mostrar.
-- 2. organization_admissao_settings ganha portal_validade_dias (integer, NOT
--    NULL, DEFAULT 7, entre 1 e 90). Controla so o ACESSO ao portal, nao a
--    duracao do processo. Uma organizacao sem linha nesta tabela usa 7 (quem le
--    faz coalesce). A coluna herda as regras da tabela: le e altera quem tem
--    hr.admissao.obrigatorios.gerir na organizacao (RLS e grants de tabela
--    existentes, sem mudanca).
--
--
-- -- CODIGO QUE ENTRA JUNTO ------------------------------------------------------
--
-- - 20261210420000 (V2): rpc_hr_convite_admissao_criar passa a calcular a
--   validade a partir de portal_validade_dias.
-- - Traducoes dos nomes das permissoes, se o ecra de papeis as traduzir por
--   codigo (confirmar no ecra de papeis; sem traducao aparece o "name" daqui).
-- - O que o utilizador ve: no ecra de papeis aparecem quatro permissoes novas
--   em RH, desligadas para todos os papeis. Nada mais muda.
--
--
-- -- IMPACTO NUMA PUBLICACAO FUTURA (PRODUCAO / MUDELAR) -----------------------
--
-- O catalogo anew_permissions e GLOBAL: as quatro permissoes aparecem no ecra
-- de papeis de TODAS as organizacoes, incluindo a Mudelar, mas sem papel
-- nenhum (ninguem as ganha por esta migration). A coluna nova tem DEFAULT, por
-- isso as linhas existentes de organization_admissao_settings ficam com 7 sem
-- reescrita visivel. Publicar precisa de autorizacao explicita.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao (so se nenhum papel
-- tiver as permissoes):
--   DELETE FROM public.anew_permissions WHERE code IN ('hr.onboarding.approve',
--     'hr.onboarding.sign_employer','hr.onboarding.sensitive','hr.onboarding.restrito');
--   ALTER TABLE public.organization_admissao_settings DROP COLUMN portal_validade_dias;
--   (so depois de repor a rpc_hr_convite_admissao_criar anterior a V2).
--
--
-- Prerequisitos:
--   20261124010000  catalogo: hr.pessoas.convite.enviar
--   20261201050000  organization_admissao_settings
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'public.anew_permissions nao existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.convite.enviar') THEN
    RAISE EXCEPTION 'hr.pessoas.convite.enviar nao esta no catalogo. Aplicar 20261124010000 primeiro.';
  END IF;
  IF to_regclass('public.organization_admissao_settings') IS NULL THEN
    RAISE EXCEPTION 'public.organization_admissao_settings nao existe. Aplicar 20261201050000 primeiro.';
  END IF;
  -- Se alguma das permissoes ja existir, tem de ser exactamente a deste ficheiro
  -- (o conferir le os valores); aqui so se avisa.
  IF EXISTS (SELECT 1 FROM public.anew_permissions WHERE code LIKE 'hr.onboarding.%') THEN
    RAISE NOTICE 'Ja existem permissoes hr.onboarding.* no catalogo; o INSERT ignora-as e o conferir valida-as.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. As permissoes (perigosas, sem papel)
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.onboarding.approve', 'Aprovar admissoes',
   'Aprovar um processo de admissao submetido, na organizacao empregadora. A aprovacao promove para a ficha da pessoa os dados declarados no portal. So aprova com os obrigatorios preenchidos e os documentos validados.',
   'hr', 'hr.pessoas.convite.enviar', 281, true, 'organization', false),
  ('hr.onboarding.sign_employer', 'Assinar contratos de admissao pela empresa',
   'Disponibilizar o contrato de um processo de admissao e assina-lo em nome da entidade empregadora. Assinatura electronica basica: nao e uma assinatura qualificada.',
   'hr', 'hr.pessoas.convite.enviar', 282, true, 'organization', false),
  ('hr.onboarding.sensitive', 'Ver dados sensiveis de admissoes',
   'Abrir o conteudo declarado num processo de admissao (incluindo NISS e IBAN) e os documentos anexados. Num processo cancelado ou rejeitado exige tambem hr.onboarding.restrito. Cada abertura fica registada.',
   'hr', 'hr.pessoas.convite.enviar', 283, true, 'organization', false),
  ('hr.onboarding.restrito', 'Consultar admissoes canceladas ou rejeitadas',
   'Consultar processos de admissao cancelados ou rejeitados, que saem do uso normal: estado, datas, autor, motivo interno e historico. Nao mostra o conteudo declarado nem os anexos (para isso e preciso tambem hr.onboarding.sensitive).',
   'hr', 'hr.pessoas.convite.enviar', 284, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- 2. O prazo do portal, por organizacao
-- ==============================================================================
ALTER TABLE public.organization_admissao_settings
  ADD COLUMN IF NOT EXISTS portal_validade_dias integer NOT NULL DEFAULT 7;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'organization_admissao_settings_portal_validade_dias_intervalo'
       AND conrelid = to_regclass('public.organization_admissao_settings')
  ) THEN
    ALTER TABLE public.organization_admissao_settings
      ADD CONSTRAINT organization_admissao_settings_portal_validade_dias_intervalo
      CHECK (portal_validade_dias BETWEEN 1 AND 90);
  END IF;
END;
$chk$;

COMMENT ON COLUMN public.organization_admissao_settings.portal_validade_dias IS
'Dias de acesso ao portal de admissao a contar da criacao do processo (7 por omissao, entre 1 e 90). Controla so o acesso, nao a duracao do processo: expirar nao apaga, nao cancela nem rejeita; o RH pode prolongar. Sem linha nesta tabela, vale 7. Lido por rpc_hr_convite_admissao_criar desde 20261210420000.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_codigos text[] := ARRAY['hr.onboarding.approve', 'hr.onboarding.sign_employer',
                            'hr.onboarding.sensitive', 'hr.onboarding.restrito'];
  v_codigo  text;
  v_perm    record;
  v_n       integer;
  v_def     text;
BEGIN
  FOREACH v_codigo IN ARRAY v_codigos LOOP
    SELECT * INTO v_perm FROM public.anew_permissions WHERE code = v_codigo;
    IF v_perm.code IS NULL THEN
      RAISE EXCEPTION '% nao ficou no catalogo.', v_codigo;
    END IF;
    IF v_perm.is_dangerous IS NOT TRUE THEN
      RAISE EXCEPTION '% devia ser perigosa (is_dangerous).', v_codigo;
    END IF;
    IF v_perm.category IS DISTINCT FROM 'hr' OR v_perm.scope IS DISTINCT FROM 'organization' THEN
      RAISE EXCEPTION '% devia ter category hr e scope organization; tem % e %.', v_codigo, v_perm.category, v_perm.scope;
    END IF;
  END LOOP;

  -- No repositorio nascem sem papel. A atribuicao ao super_admin do branch vem
  -- num ficheiro so da dev, DEPOIS deste.
  SELECT count(*) INTO v_n FROM public.anew_role_permissions WHERE permission_code = ANY (v_codigos);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'As permissoes hr.onboarding.* estao atribuidas a % papel(eis); deviam nascer sem nenhum.', v_n;
  END IF;

  -- A coluna: integer, NOT NULL, default 7.
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_def
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = to_regclass('public.organization_admissao_settings')
     AND a.attname = 'portal_validade_dias'
     AND a.atttypid = 'integer'::regtype
     AND a.attnotnull;
  IF v_def IS DISTINCT FROM '7' THEN
    RAISE EXCEPTION 'portal_validade_dias devia ser integer NOT NULL DEFAULT 7; default lido: %.', coalesce(v_def, '(nenhum)');
  END IF;

  -- O CHECK, pelo nome e pelo tipo (contype e "char": ::text).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'organization_admissao_settings_portal_validade_dias_intervalo'
       AND conrelid = to_regclass('public.organization_admissao_settings')
       AND contype::text = 'c'
  ) THEN
    RAISE EXCEPTION 'O CHECK de portal_validade_dias nao existe.';
  END IF;

  SELECT count(*) INTO v_n FROM public.organization_admissao_settings WHERE portal_validade_dias <> 7;
  RAISE NOTICE 'OK: 4 permissoes hr.onboarding.* no catalogo (perigosas, sem papel); portal_validade_dias com default 7 (% linha(s) com outro valor).', v_n;
END;
$conferir$;
