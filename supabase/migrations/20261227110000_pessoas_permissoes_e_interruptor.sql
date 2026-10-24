-- ============================================================
-- 20261227110000_pessoas_permissoes_e_interruptor
-- ============================================================
-- O que faz (so dados de configuracao; nenhuma funcao nem tabela e alterada)
--   1. Cria no catalogo anew_permissions as 9 permissoes que a UI nova usa e
--      que a base de RH nao tinha: pessoas.view/create/edit/delete/config/
--      reopen, fleet.view, fleet.self, receiving.view. Definicoes copiadas do
--      catalogo da base principal (nome, descricao, categoria, ambito).
--   2. Da essas 9 ao papel GLOBAL de sistema super_admin (anew_roles.code =
--      'super_admin', is_system, organization_id nulo). Mais nenhum papel.
--   3. Liga o interruptor da pagina Pessoas (negocio_workflow_config) a
--      organizacao, mas so se a base tiver EXACTAMENTE uma organizacao e ainda
--      nenhuma linha; com mais organizacoes, sai com NOTICE e nao liga nada
--      (e decisao de produto por organizacao).
--
-- Porque
--   Sem pessoas.view o item "Pessoas" do menu e a rota /pessoas ficam
--   escondidos; sem linha em negocio_workflow_config a pagina fica inactiva
--   (useNegociosAtivos falha fechado). A migration 20261227100000 trouxe so a
--   estrutura, sem estes dados.
--
-- Fora de ambito: platform.auth_audit_log.view e platform.support_access.view
--   (nao existem nem no catalogo da principal). Nenhum outro papel recebe
--   estas permissoes.
--
-- Porque o set_config: anew_role_permissions tem o trigger
--   protect_system_role_permissions, que so deixa escrever em papeis de
--   sistema com request.jwt.claims->>'role' = 'service_role'. A claim e posta
--   LOCAL a transaccao, so a volta do INSERT, e restaurada depois (nunca
--   texto vazio: ''::jsonb rebenta). Nenhum trigger e desligado.
--
-- Idempotente: ON CONFLICT DO NOTHING / WHERE NOT EXISTS.
-- Reversao (NAO aplicar sem decisao; so como migration nova): apagar as 9
--   linhas de anew_role_permissions do super_admin, as 9 de anew_permissions
--   e a linha de negocio_workflow_config, com a mesma claim local.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1. Catalogo
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('pessoas.view', 'Ver negócios de pessoas', 'Ver a página Pessoas e os negócios (aberto, ganho, perdido) e o seu histórico', 'pessoas', NULL, 0, false, 'organization', true),
  ('pessoas.create', 'Criar negócios de pessoas', 'Criar um negócio para uma pessoa da organização', 'pessoas', NULL, 1, false, 'organization', false),
  ('pessoas.edit', 'Editar negócios de pessoas', 'Alterar um negócio: título, notas, comercial, estado, fase e motivo da perda', 'pessoas', NULL, 2, false, 'organization', true),
  ('pessoas.delete', 'Eliminar negócios de pessoas', 'Enviar um negócio para o lixo e restaurá-lo (soft delete; o apagamento definitivo não existe)', 'pessoas', NULL, 3, true, 'organization', true),
  ('pessoas.config', 'Configurar o workflow de Pessoas', 'Alterar a configuração do botão Workflow da página Pessoas (regras de qualificação MQL/SQL). Só o Super Admin.', 'pessoas', NULL, 4, false, 'organization', false),
  ('pessoas.reopen', 'Reabrir negócios ganhos', 'Botão «Reabrir negócio» na página Pessoas: reabrir à mão um negócio ganho. Não desfaz a conversão nem mexe nos documentos. Não se aplica à reabertura automática quando um documento muda (contrato substituído, proposta recusada depois de aceite, documento reaberto com alterações), que acontece sem esta permissão.', 'pessoas', NULL, 5, false, 'organization', false),
  ('fleet.view', 'Ver a Frota', 'Abre a Gestão de Frota e consulta viaturas, condutores, atribuições, manutenções, ocorrências e vencimentos da organização.', 'fleet', NULL, 0, false, 'organization', false),
  ('fleet.self', 'Registar na própria viatura', 'O condutor vê a viatura que tem atribuída e regista nela km, abastecimentos, ocorrências e pedidos de reposição da carrinha.', 'fleet', NULL, 3, false, 'organization', false),
  ('receiving.view', 'Aceder à receção no armazém', 'Permite abrir o ecrã Receção no armazém e consultar o que um código lido identifica (produto e linhas de encomenda em aberto). Os dados vêm das encomendas de compra: exige também Ver encomendas de compra (purchase_orders.view) ou Receber encomendas de compra (purchase_orders.receive).', 'receiving', NULL, 0, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_role       uuid;
  v_n          int;
  v_orgs       int;
  v_prev_claim text;
  v_codes      text[] := ARRAY['pessoas.view','pessoas.create','pessoas.edit','pessoas.delete','pessoas.config',
                               'pessoas.reopen','fleet.view','fleet.self','receiving.view'];
BEGIN
  -- Guarda: as 9 estao no catalogo.
  SELECT count(*) INTO v_n FROM public.anew_permissions p WHERE p.code = ANY (v_codes);
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'GUARDA: esperadas 9 permissoes no catalogo, encontradas %', v_n;
  END IF;

  -- 2. super_admin global
  SELECT count(*) INTO v_n
  FROM public.anew_roles r
  WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'Papel super_admin global nao existe nesta base: nao se concede nada.';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papeis super_admin globais de sistema (esperado 1)', v_n;
  ELSE
    SELECT r.id INTO v_role
    FROM public.anew_roles r
    WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;

    v_prev_claim := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_role, c, NULL::uuid
    FROM unnest(v_codes) AS c
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    PERFORM set_config(
      'request.jwt.claims',
      CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END,
      true);

    SELECT count(*) INTO v_n
    FROM public.anew_role_permissions rp
    WHERE rp.role_id = v_role AND rp.permission_code = ANY (v_codes);
    IF v_n <> 9 THEN
      RAISE EXCEPTION 'CONFERIR: o super_admin tem % de 9 permissoes novas', v_n;
    END IF;
  END IF;

  -- 3. Interruptor de Pessoas, so se houver uma unica organizacao.
  SELECT count(*) INTO v_orgs FROM public.anew_organizations;
  IF v_orgs = 1 THEN
    INSERT INTO public.negocio_workflow_config (organization_id)
    SELECT o.id
    FROM public.anew_organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = o.id
    );
    SELECT count(*) INTO v_n FROM public.negocio_workflow_config;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'CONFERIR: negocio_workflow_config devia ter 1 linha, tem %', v_n;
    END IF;
  ELSE
    RAISE NOTICE 'A base tem % organizacoes: o interruptor de Pessoas nao foi ligado.', v_orgs;
  END IF;

  -- 4. A claim nao ficou vazia nem em service_role.
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RAISE EXCEPTION 'CONFERIR: request.jwt.claims ficou vazia';
  END IF;
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS NOT DISTINCT FROM 'service_role'
     AND (nullif(v_prev_claim, '')::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'CONFERIR: a claim service_role ficou activa';
  END IF;
END $$;

COMMIT;
