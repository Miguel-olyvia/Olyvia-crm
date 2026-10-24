-- ==============================================================================
-- Catalogo de permissoes do dominio novo "Vencimento" (RH): 4 codigos.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261201190000 e 20261201200000 criam duas tabelas de CONFIGURACAO (sem
-- calculo nenhum ainda -- o calculo ligado a assiduidade fica para depois):
--   hr_codigos_processamento          catalogo de codigos de processamento
--   hr_regras_subsidio_alimentacao     regra do subsidio de alimentacao por empresa
-- As politicas dessas tabelas vao pedir estes 4 codigos a
-- has_anew_permission_in_org / has_anew_permission. Se nao existirem primeiro
-- em anew_permissions, a interface de papeis nao os mostra e ninguem os
-- consegue atribuir -- mesmo problema que 20261123010000 documenta.
--
--
-- -- OS QUATRO CODIGOS -----------------------------------------------------------
--
--   hr.vencimento.codigos.view    ver o catalogo de codigos de processamento
--   hr.vencimento.codigos.gerir   criar/desactivar codigos de processamento da PROPRIA organizacao
--   hr.vencimento.subsidio.view   ver a regra do subsidio de alimentacao da organizacao
--   hr.vencimento.subsidio.gerir  configurar a regra do subsidio de alimentacao da organizacao
--
-- Parent code hr.pessoas.retribuicao.view (20261120020000) -- e a mesma
-- familia de dados (o que uma pessoa ganha), o vencimento e so mais um lado
-- dessa mesma arvore. is_dangerous=true nos dois .gerir, MESMO PADRAO de
-- hr.admissao.obrigatorios.gerir (20261201050000): afectam o processamento
-- salarial e o subsidio de alimentacao de TODA a organizacao, nao a ficha de
-- uma pessoa so. Os dois .view nao sao dangerous -- so leitura de catalogo.
--
--
-- -- NENHUMA ATRIBUICAO A PAPEL, DE PROPOSITO -----------------------------------
--
-- Mesmo padrao de 20261201050000: o catalogo entra vazio de atribuicoes.
-- Alguem tem de as atribuir depois pelo ecra de Papeis.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- 20261201190000 e 20261201200000 estarem revertidas (as tabelas referenciam
-- estes codigos nas suas RLS):
--   DELETE FROM public.anew_permissions WHERE code LIKE 'hr.vencimento.%';
--
--
-- Prerequisitos:
--   20261120020000  catalogo hr.* (parent_code 'hr.pessoas.retribuicao.view')
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.view nao esta no catalogo -- parent_code invalido. Aplicar 20261120020000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code LIKE 'hr.vencimento.%' AND NOT is_dangerous
      AND code LIKE '%.gerir'
  ) THEN
    RAISE EXCEPTION 'Ja existe um codigo hr.vencimento.%%.gerir sem estar marcado is_dangerous -- investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ---- Os quatro codigos -------------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.vencimento.codigos.view', 'Ver codigos de processamento',
   'Ver o catalogo de codigos de processamento salarial -- os transversais a todo o grupo (ex.: 100, 200) e os proprios desta organizacao.',
   'hr', 'hr.pessoas.retribuicao.view', 700, false, 'organization', false),

  ('hr.vencimento.codigos.gerir', 'Configurar codigos de processamento',
   'Criar e desactivar codigos de processamento PROPRIOS desta organizacao (ex.: recibos verdes, horas nocturnas). Nunca afecta os codigos transversais ao grupo (100, 200), que sao geridos fora desta organizacao.',
   'hr', 'hr.vencimento.codigos.view', 710, true, 'organization', false),

  ('hr.vencimento.subsidio.view', 'Ver a regra do subsidio de alimentacao',
   'Ver o valor diario, o modo de pagamento e o minimo de minutos trabalhados que a organizacao exige para o subsidio de alimentacao.',
   'hr', 'hr.pessoas.retribuicao.view', 720, false, 'organization', false),

  ('hr.vencimento.subsidio.gerir', 'Configurar a regra do subsidio de alimentacao',
   'Definir o valor diario, o modo de pagamento e o minimo de minutos trabalhados para o subsidio de alimentacao de TODA a organizacao -- nao a ficha de uma pessoa so (essa excepcao por pessoa continua em pessoas_retribuicoes, permissao hr.pessoas.retribuicao.edit).',
   'hr', 'hr.vencimento.subsidio.view', 730, true, 'organization', false)

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
BEGIN
  SELECT count(*) INTO v_total FROM public.anew_permissions WHERE code LIKE 'hr.vencimento.%';
  IF v_total <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 codigos hr.vencimento.%%, encontraram-se %.', v_total;
  END IF;

  SELECT count(*) INTO v_total FROM public.anew_permissions
   WHERE code IN ('hr.vencimento.codigos.gerir', 'hr.vencimento.subsidio.gerir') AND is_dangerous;
  IF v_total <> 2 THEN
    RAISE EXCEPTION 'Os dois codigos .gerir deviam estar marcados is_dangerous.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_role_permissions WHERE permission_code LIKE 'hr.vencimento.%'
  ) THEN
    RAISE EXCEPTION 'Um codigo hr.vencimento.%% ja esta atribuido a um papel -- esta migracao so cria o catalogo.';
  END IF;

  RAISE NOTICE 'Guardas passadas: 4 codigos hr.vencimento.* no catalogo, os dois .gerir marcados is_dangerous, nenhum atribuido a papel.';
END;
$conferir$;
