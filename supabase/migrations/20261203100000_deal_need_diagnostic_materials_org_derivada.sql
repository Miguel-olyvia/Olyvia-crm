-- deal_need_diagnostic_materials — o organization_id passa a ser DERIVADO, não
-- confiado ao cliente.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- O PROBLEMA (consistência de dados, não permissões)
-- ---------------------------------------------------
-- Em 20261203010000 as policies de INSERT/UPDATE validam apenas
-- `organization_id IN get_user_visible_org_ids(auth.uid())`, ou seja: validam o
-- rótulo que o cliente envia, nunca o confrontam com a necessidade a que a linha
-- fica agarrada. Nada impede gravar um material com organization_id = A pendurado
-- numa necessidade da organização B.
--
-- Isto NÃO é uma escalada de privilégios: quem vê as duas organizações já podia
-- legitimamente editar necessidades de ambas — não ganha acesso a nada. O estrago é
-- de consistência, e é silencioso: como a policy de SELECT filtra por
-- organization_id, essa linha fica INVISÍVEL para quem só vê B. O armazém abre a
-- necessidade e falta-lhe material, sem erro nenhum, sem sinal nenhum.
--
-- Repare-se que validar "a necessidade pertence a uma organização visível" não
-- resolveria nada: no cenário problemático AMBAS as organizações são visíveis, logo
-- essa verificação passaria à mesma. A verificação certa é de IGUALDADE — o
-- organization_id da linha tem de ser exatamente o da organização da necessidade.
--
-- PORQUÊ DERIVAR (trigger) E NÃO SÓ REJEITAR
-- -------------------------------------------
-- Escolheu-se um trigger BEFORE INSERT OR UPDATE que ESCREVE o organization_id
-- correto, em vez de uma verificação que devolve erro:
--   · elimina a classe de erro em vez de a apanhar — o frontend deixa de poder
--     enganar-se, e deixa de precisar de saber qual é a organização da necessidade;
--   · vale para TODOS os escritores (frontend, RPCs SECURITY DEFINER, service_role,
--     edge functions, seeds), ao contrário de uma policy, que o service_role salta;
--   · não parte importações em curso — corrige em vez de falhar.
-- Uma CHECK constraint estava fora de questão: precisa de subconsulta a deal_needs
-- e deals, e o Postgres não admite subconsultas em CHECK.
--
-- O caminho de derivação, confirmado no schema:
--   deal_need_diagnostic_materials.deal_need_id
--     -> deal_needs.deal_id            (deal_needs.deal_id é NOT NULL, baseline)
--       -> deals.organization_id       (NULLABLE no baseline — ver secção 2)
-- É exatamente o mesmo caminho que fn_audit_deal_child() usa para deal_need_items e
-- que as policies auth_*_deal_need_items usam desde o baseline.
--
-- LINHAS JÁ GRAVADAS
-- ------------------
-- Uma constraint nova falharia se existissem linhas com rótulo inconsistente. A
-- tabela é nova (20261203010000) e, quando esta migração correr a seguir, deve estar
-- vazia — mas "deve" não é garantia: 010000 pode já ter sido aplicada há dias e ter
-- recebido escritas. Por isso a secção 1 faz o realinhamento ANTES de instalar o
-- trigger. É um UPDATE idempotente e no-op numa tabela vazia — custa nada e remove a
-- dependência de uma suposição.
--
-- Prerequisites:
--   20261203010000_diagnostico_deal_needs_campos_e_materiais.sql — a tabela e as
--                                                                  policies originais
--   20260615130000_baseline_new_database.sql — deal_needs, deals,
--                                              get_user_visible_org_ids()
--
-- Só acrescenta (as policies de INSERT/UPDATE são recriadas com o mesmo nome e um
-- predicado mais apertado). Nenhuma tabela, coluna ou assinatura alterada.

-- ============================================================
-- 1. Realinhar linhas já gravadas (no-op se a tabela estiver vazia)
-- ============================================================
-- Só toca em linhas onde a organização derivada existe E diverge do rótulo atual.
-- Nunca escreve NULL: deals.organization_id é nullable e um negócio sem organização
-- não pode apagar um rótulo válido que já lá esteja.

UPDATE public.deal_need_diagnostic_materials m
SET organization_id = src.org_id,
    updated_at      = now()
FROM (
  SELECT dn.id AS need_id, d.organization_id AS org_id
  FROM public.deal_needs dn
  JOIN public.deals d ON d.id = dn.deal_id
  WHERE d.organization_id IS NOT NULL
) src
WHERE m.deal_need_id = src.need_id
  AND m.organization_id IS DISTINCT FROM src.org_id;

-- ============================================================
-- 2. Trigger de derivação
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_deal_need_diagnostic_materials_set_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id  uuid;
  v_found   boolean := false;
BEGIN
  -- LEFT JOIN de propósito: distingue "a necessidade não existe" (nenhuma linha —
  -- a FK NOT NULL de deal_need_id trata disso a seguir, com uma mensagem melhor do
  -- que qualquer coisa que se levantasse aqui) de "a necessidade existe mas o
  -- negócio não tem organização" (linha com v_org_id NULL).
  SELECT d.organization_id, true
  INTO   v_org_id, v_found
  FROM   public.deal_needs dn
  LEFT   JOIN public.deals d ON d.id = dn.deal_id
  WHERE  dn.id = NEW.deal_need_id
  LIMIT  1;

  IF v_found AND v_org_id IS NOT NULL THEN
    -- O caso normal: a organização da linha é a do negócio da necessidade, ponto
    -- final. O que o cliente enviou é ignorado — não é uma opinião que interesse.
    NEW.organization_id := v_org_id;
  END IF;
  -- Caso contrário mantém-se o que veio: deals.organization_id é nullable no
  -- baseline e há negócios antigos sem organização. Aí o rótulo enviado é a única
  -- informação disponível, e continua sujeito ao WITH CHECK de visibilidade da
  -- policy. Nunca se escreve NULL por cima de um valor válido — a coluna é NOT NULL.

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_deal_need_diagnostic_materials_set_org() IS
  'Deriva deal_need_diagnostic_materials.organization_id da organização do negócio da necessidade (deal_need_id -> deal_needs.deal_id -> deals.organization_id), ignorando o valor enviado pelo cliente. Impede que um material fique rotulado com uma organização diferente da necessidade — o que o tornaria invisível na policy de SELECT e faria material desaparecer do armazém sem erro.';

REVOKE ALL ON FUNCTION public.fn_deal_need_diagnostic_materials_set_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_deal_need_diagnostic_materials_set_org()
  TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_deal_need_diagnostic_materials_set_org
  ON public.deal_need_diagnostic_materials;
CREATE TRIGGER trg_deal_need_diagnostic_materials_set_org
  BEFORE INSERT OR UPDATE ON public.deal_need_diagnostic_materials
  FOR EACH ROW EXECUTE FUNCTION public.fn_deal_need_diagnostic_materials_set_org();

-- ============================================================
-- 3. Policies de INSERT e UPDATE — a igualdade também no WITH CHECK
-- ============================================================
-- Com o trigger instalado, este predicado nunca deveria falhar para uma escrita
-- legítima: o trigger BEFORE corre primeiro e o WITH CHECK avalia a linha já
-- derivada. Fica na mesma como rede de segurança declarativa — se um dia alguém
-- desativar ou substituir o trigger, a policy continua a recusar a linha
-- inconsistente em vez de a aceitar em silêncio.
--
-- A validação de visibilidade que já existia mantém-se intacta e em primeiro lugar.
-- As policies de SELECT e DELETE ficam exatamente como estavam.
--
-- Limitação assumida deste NOT EXISTS: o predicado corre com os direitos de quem
-- escreve, logo o RLS de deal_needs/deals aplica-se lá dentro. Se a necessidade for
-- invisível para o utilizador, o EXISTS não encontra nada e o predicado passa por
-- vacuidade. Não se resolveu com uma função SECURITY DEFINER de propósito: quem
-- garante a consistência é o trigger da secção 2, que corre sempre e não depende de
-- visibilidade nenhuma. A policy é a segunda linha, não a primeira.

DROP POLICY IF EXISTS deal_need_diagnostic_materials_insert_policy ON public.deal_need_diagnostic_materials;
CREATE POLICY deal_need_diagnostic_materials_insert_policy ON public.deal_need_diagnostic_materials
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND NOT EXISTS (
      SELECT 1
      FROM public.deal_needs dn
      JOIN public.deals d ON d.id = dn.deal_id
      WHERE dn.id = deal_need_diagnostic_materials.deal_need_id
        AND d.organization_id IS NOT NULL
        AND d.organization_id IS DISTINCT FROM deal_need_diagnostic_materials.organization_id
    )
  );

DROP POLICY IF EXISTS deal_need_diagnostic_materials_update_policy ON public.deal_need_diagnostic_materials;
CREATE POLICY deal_need_diagnostic_materials_update_policy ON public.deal_need_diagnostic_materials
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
  WITH CHECK (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND NOT EXISTS (
      SELECT 1
      FROM public.deal_needs dn
      JOIN public.deals d ON d.id = dn.deal_id
      WHERE dn.id = deal_need_diagnostic_materials.deal_need_id
        AND d.organization_id IS NOT NULL
        AND d.organization_id IS DISTINCT FROM deal_need_diagnostic_materials.organization_id
    )
  );

-- ============================================================
-- 4. Auditoria — porque NÃO se acrescenta aqui o trigger
-- ============================================================
-- O padrão do projeto para filhos de deals é trg_audit_* -> fn_audit_deal_child()
-- (20260626200000). Essa função NÃO é genérica: resolve a organização e o entity_id
-- num `IF TG_TABLE_NAME = 'deal_needs' ... ELSIF 'deal_need_items'`, e para qualquer
-- outra tabela sai com v_org_id NULL e não escreve nada. Pendurar o trigger em
-- deal_need_diagnostic_materials sem mais seria um no-op silencioso — pior do que
-- não o ter, porque pareceria auditado e não estaria.
--
-- Cobri-la a sério obrigaria a CREATE OR REPLACE de fn_audit_deal_child(), que é
-- partilhada por trg_audit_deal_needs e trg_audit_deal_need_items — os dois triggers
-- de auditoria centrais do módulo de negócios — e que já foi reescrita pelo menos
-- três vezes depois da versão original (20260913010000 bypass, 20261110440000
-- entity_id nullable, entre outras). Reconstruí-la a partir das migrações antigas
-- deixaria cair correções posteriores em silêncio, que é exatamente o erro que este
-- projeto já pagou antes. Sem a definição VIVA da função em mão, não se toca.
--
-- Fica por fazer, deliberadamente e de forma isolável: uma migração própria que
-- parta de pg_get_functiondef('public.fn_audit_deal_child'::regproc) e acrescente um
-- ramo ELSIF para 'deal_need_diagnostic_materials' (resolução idêntica à de
-- deal_need_items: deal_need_id -> deal_needs.deal_id -> deals), e só depois crie o
-- trigger.
