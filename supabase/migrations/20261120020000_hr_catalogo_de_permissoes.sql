-- ==============================================================================
-- Catalogo de permissoes hr.*: as 27 permissoes do modulo de Colaboradores
-- entram em anew_permissions. NENHUMA e atribuida a papel nenhum.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- As politicas das tabelas de RH (20261120030000 em diante) vao pedir codigos
-- como 'hr.pessoas.view' a has_anew_permission_in_org. Se o codigo nao existir
-- em anew_permissions, a interface de papeis nao o mostra e ninguem o consegue
-- atribuir -- as tabelas ficam invisiveis para toda a gente, sem explicacao.
-- O catalogo tem de existir ANTES das tabelas.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 26 codigos, todos com category='hr' e scope='organization'.
--
-- supports_scope = false em TODAS nesta ronda. O ambito de dono em RH nao vem
-- de crm_scope_keys (que e o mecanismo do CRM, assente em assigned_to /
-- created_by de leads e clientes); vem da clausula de ficha-propria que
-- 20261120090000 acrescenta as politicas de SELECT. Marcar supports_scope=true
-- aqui poria selectores de ambito na interface de papeis que nao teriam efeito
-- nenhum sobre estas tabelas -- pior do que nao os ter.
--
-- is_dangerous = true nas que expoem dados sensiveis ou dinheiro: revelar o
-- NISS em claro, ver e editar retribuicao, ver e editar dados bancarios, ver e
-- editar dados de saude, arquivar uma pessoa, ligar/desligar uma pessoa a uma
-- conta de utilizador, e ver o registo de quem acedeu a dados sensiveis de
-- outrem.
--
-- A hierarquia de parent_code segue a mesma forma do resto do catalogo: a
-- permissao de editar pendura na de ver, a de ver pendura no bloco, e o bloco
-- pendura em hr.module.access.
--
--
-- -- ZERO ATRIBUICOES A PAPEIS --------------------------------------------------
--
-- Esta migracao NAO toca em anew_role_permissions e NAO desactiva
-- trg_protect_system_role_perms. Nem super_admin, nem system_admin, nem o
-- papel worker (cujo nome na interface e "Colaborador", baseline linha 934, e
-- em que NAO se mexe nesta ronda) recebem coisa nenhuma.
--
-- Isto e deliberado, nao um esquecimento. Enquanto ninguem tiver hr.*, as
-- tabelas de RH sao invisiveis para todos os utilizadores da aplicacao e o
-- unico caminho de leitura e service_role. A atribuicao e um acto consciente,
-- feito no ecra de papeis, organizacao a organizacao, por quem responde pelos
-- dados. A guarda final deste ficheiro aborta se alguem tiver juntado um
-- backfill por engano.
--
--
-- -- ALCANCE -------------------------------------------------------------------
--
-- Um unico INSERT ... ON CONFLICT (code) DO UPDATE sobre anew_permissions.
-- Idempotente: reaplicar actualiza nome, descricao, hierarquia e flags, e nao
-- duplica nada (anew_permissions_code_unique UNIQUE (code), baseline 12841).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - hr.pessoas.bancarios.reveal NAO existe. O IBAN em claro nunca e devolvido
--   a aplicacao (ver 20261120070000): nao ha RPC de leitura, logo nao faz
--   sentido uma permissao que nada consome.
-- - Nada de ponto/picagens, ausencias, ferias, salarios, recrutamento,
--   desempenho ou denuncias. Esses modulos trarao os seus proprios codigos.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so depois de
-- confirmar que nenhuma politica os usa (ou seja, depois de remover as tabelas
-- de RH):
--   DELETE FROM public.anew_permissions WHERE code LIKE 'hr.%';
-- Se houver linhas em anew_role_permissions a apontar para eles, apagar essas
-- primeiro -- mas se houver, alguem atribuiu permissoes de RH e convem
-- perceber quem antes de apagar.
--
--
-- Prerequisitos:
--   20260615130000  baseline (anew_permissions, anew_permissions_code_unique)
--   20261120010000  has_anew_permission_in_org
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_anew_permission_in_org'
      AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'anew_permissions_code_unique'
      AND conrelid = 'public.anew_permissions'::regclass
  ) THEN
    RAISE EXCEPTION
      'anew_permissions nao tem a unique em code. O ON CONFLICT (code) desta migracao depende dela; confirmar o estado real.';
  END IF;
END;
$guardas$;

-- ---- O catalogo ------------------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.module.access', 'Aceder ao modulo de Recursos Humanos',
   'Permite abrir o modulo de Recursos Humanos. Por si so nao da acesso a ficha nenhuma.',
   'hr', NULL, 10, false, 'organization', false),

  ('hr.pessoas.view', 'Ver pessoas da organizacao',
   'Ver a lista de pessoas e a identificacao interna de cada ficha, na organizacao onde tem membership activo.',
   'hr', 'hr.module.access', 20, false, 'organization', false),

  ('hr.pessoas.view.own', 'Ver a propria ficha',
   'Ver a ficha da propria pessoa, quando a conta esta ligada a uma pessoa. Nao da acesso as fichas de terceiros nem permite editar.',
   'hr', 'hr.module.access', 30, false, 'organization', false),

  ('hr.pessoas.create', 'Criar pessoa',
   'Criar uma ficha de pessoa nova na organizacao.',
   'hr', 'hr.pessoas.view', 40, false, 'organization', false),

  ('hr.pessoas.edit', 'Editar dados de identificacao interna',
   'Editar o nucleo da ficha: nomes, cargo, local de trabalho, datas, estado do contrato.',
   'hr', 'hr.pessoas.view', 50, false, 'organization', false),

  ('hr.pessoas.archive', 'Arquivar pessoa',
   'Passar uma ficha ao estado arquivado. Nao apaga dados.',
   'hr', 'hr.pessoas.view', 60, true, 'organization', false),

  ('hr.pessoas.laborais.view', 'Ver detalhes laborais',
   'Ver reporta a, entidade legal, numero interno, datas de admissao e antiguidade.',
   'hr', 'hr.pessoas.view', 70, false, 'organization', false),

  ('hr.pessoas.laborais.edit', 'Editar detalhes laborais',
   'Editar reporta a, entidade legal, numero interno e datas.',
   'hr', 'hr.pessoas.laborais.view', 80, false, 'organization', false),

  ('hr.pessoas.pessoais.view', 'Ver dados pessoais',
   'Ver data de nascimento, genero, nacionalidade, estado civil, dependentes e contactos pessoais.',
   'hr', 'hr.pessoas.view', 90, false, 'organization', false),

  ('hr.pessoas.pessoais.edit', 'Editar dados pessoais',
   'Editar os dados pessoais da ficha.',
   'hr', 'hr.pessoas.pessoais.view', 100, false, 'organization', false),

  ('hr.pessoas.identificacao.view', 'Ver documento de identificacao (NISS mascarado)',
   'Ver tipo e numero do documento, validade e NIF. O NISS aparece sempre mascarado, so com os ultimos quatro digitos.',
   'hr', 'hr.pessoas.pessoais.view', 110, false, 'organization', false),

  ('hr.pessoas.identificacao.edit', 'Editar documento de identificacao',
   'Editar documento, validade, NIF e NISS. A escrita do NISS passa obrigatoriamente pela RPC dedicada e fica registada.',
   'hr', 'hr.pessoas.identificacao.view', 120, false, 'organization', false),

  ('hr.pessoas.identificacao.reveal', 'Ver o NISS em claro',
   'Revelar o NISS completo. Cada revelacao fica registada em pessoas_acessos_sensiveis, com quem revelou e quando.',
   'hr', 'hr.pessoas.identificacao.view', 130, true, 'organization', false),

  ('hr.pessoas.morada.view', 'Ver morada',
   'Ver as moradas da pessoa, incluindo a morada de residencia.',
   'hr', 'hr.pessoas.pessoais.view', 140, false, 'organization', false),

  ('hr.pessoas.morada.edit', 'Editar morada',
   'Acrescentar e alterar moradas da pessoa.',
   'hr', 'hr.pessoas.morada.view', 150, false, 'organization', false),

  ('hr.pessoas.emergencia.view', 'Ver contacto de emergencia',
   'Ver os contactos de emergencia da pessoa.',
   'hr', 'hr.pessoas.pessoais.view', 160, false, 'organization', false),

  ('hr.pessoas.emergencia.edit', 'Editar contacto de emergencia',
   'Acrescentar e alterar contactos de emergencia.',
   'hr', 'hr.pessoas.emergencia.view', 170, false, 'organization', false),

  ('hr.pessoas.vinculos.view', 'Ver vinculos e contratos',
   'Ver o historico de contratos: tipo, regime, horas, datas e periodo experimental.',
   'hr', 'hr.pessoas.view', 180, false, 'organization', false),

  ('hr.pessoas.vinculos.edit', 'Editar vinculos e contratos',
   'Criar e alterar contratos da pessoa.',
   'hr', 'hr.pessoas.vinculos.view', 190, false, 'organization', false),

  ('hr.pessoas.retribuicao.view', 'Ver retribuicao',
   'Ver o historico de retribuicao: valor base, periodicidade e subsidio de alimentacao.',
   'hr', 'hr.pessoas.vinculos.view', 200, true, 'organization', false),

  ('hr.pessoas.retribuicao.edit', 'Editar retribuicao',
   'Criar e alterar versoes de retribuicao. Cada alteracao fica registada.',
   'hr', 'hr.pessoas.retribuicao.view', 210, true, 'organization', false),

  ('hr.pessoas.bancarios.view', 'Ver dados bancarios (IBAN mascarado)',
   'Ver titular, banco e os ultimos quatro digitos do IBAN. O IBAN em claro nunca e devolvido a aplicacao.',
   'hr', 'hr.pessoas.view', 220, true, 'organization', false),

  ('hr.pessoas.bancarios.edit', 'Editar dados bancarios',
   'Definir o IBAN da pessoa. A escrita passa obrigatoriamente pela RPC dedicada, que guarda o IBAN no Vault e regista a alteracao.',
   'hr', 'hr.pessoas.bancarios.view', 230, true, 'organization', false),

  ('hr.pessoas.saude.view', 'Ver dados de saude (incapacidade)',
   'Ver grau de incapacidade, validade do comprovativo e necessidades de adaptacao do posto de trabalho. Dado de categoria especial (art. 9.o RGPD).',
   'hr', 'hr.pessoas.view', 240, true, 'organization', false),

  ('hr.pessoas.saude.edit', 'Editar dados de saude',
   'Editar incapacidade e necessidades de adaptacao. Cada alteracao fica registada.',
   'hr', 'hr.pessoas.saude.view', 250, true, 'organization', false),

  ('hr.pessoas.conta.link', 'Ligar/desligar pessoa a conta de utilizador',
   'Ligar uma ficha de pessoa a uma conta de utilizador da organizacao, ou revogar essa ligacao. NAO cria memberships nem atribui papeis: ligar nao da acesso nenhum.',
   'hr', 'hr.pessoas.edit', 260, true, 'organization', false),

  ('hr.pessoas.acessos_sensiveis.view', 'Ver o registo de acessos sensiveis',
   'Ver quem revelou ou alterou NISS, IBAN, retribuicao ou dados de incapacidade de uma ficha, e quando. E um registo de auditoria, nao a lista de colegas: quem so tem hr.pessoas.view NAO ve isto.',
   'hr', 'hr.pessoas.view', 270, true, 'organization', false)

ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  parent_code    = EXCLUDED.parent_code,
  display_order  = EXCLUDED.display_order,
  is_dangerous   = EXCLUDED.is_dangerous,
  scope          = EXCLUDED.scope,
  supports_scope = EXCLUDED.supports_scope,
  updated_at     = now();

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_total integer;
  v_perigosas integer;
  v_atribuidas integer;
  v_com_scope integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.anew_permissions WHERE code LIKE 'hr.%';

  IF v_total <> 27 THEN
    RAISE EXCEPTION
      'Esperavam-se 27 permissoes hr.* no catalogo, encontraram-se %. Conferir a lista antes de continuar.', v_total;
  END IF;

  SELECT count(*) INTO v_perigosas
  FROM public.anew_permissions WHERE code LIKE 'hr.%' AND is_dangerous;

  -- As 10 perigosas: archive, identificacao.reveal, retribuicao.view/edit,
  -- bancarios.view/edit, saude.view/edit, conta.link, acessos_sensiveis.view.
  IF v_perigosas <> 10 THEN
    RAISE EXCEPTION
      'Esperavam-se 10 permissoes hr.* marcadas is_dangerous, encontraram-se %.', v_perigosas;
  END IF;

  SELECT count(*) INTO v_com_scope
  FROM public.anew_permissions WHERE code LIKE 'hr.%' AND supports_scope;

  IF v_com_scope <> 0 THEN
    RAISE EXCEPTION
      'Nenhuma permissao hr.* devia ter supports_scope=true nesta ronda, mas % tem. O ambito de dono em RH vem da clausula de ficha-propria nas politicas, nao de crm_scope_keys.', v_com_scope;
  END IF;

  -- Esta e a guarda que interessa: ninguem recebe hr.* nesta migracao.
  SELECT count(*) INTO v_atribuidas
  FROM public.anew_role_permissions
  WHERE permission_code LIKE 'hr.%';

  IF v_atribuidas > 0 THEN
    RAISE EXCEPTION
      'Existem % atribuicoes de permissoes hr.* a papeis. Esta migracao NAO atribui nenhuma, de proposito -- alguem juntou um backfill. Remover antes de aplicar.', v_atribuidas;
  END IF;

  RAISE NOTICE 'OK: 27 permissoes hr.* no catalogo, 10 marcadas perigosas, 0 atribuidas a papeis.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list". Se 20261120* colidir com algo ja
--    aplicado no remoto, renumerar o bloco inteiro mantendo a ordem.
--
-- 2. Confirmar que 20261120010000 vai a frente desta na fila. A guarda do topo
--    aborta se nao for o caso, mas mais vale ver a lista.
--
-- 3. Esta migracao acrescenta linhas ao catalogo e NAO atribui permissoes.
--    Depois de aplicada, as permissoes hr.* aparecem no ecra de papeis por
--    atribuir -- e assim que devem ficar ate alguem decidir, organizacao a
--    organizacao, quem as recebe.
-- ==============================================================================
