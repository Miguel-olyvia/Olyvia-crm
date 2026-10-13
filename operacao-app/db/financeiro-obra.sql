-- ============================================================
--  Operações — obra por criar quando o Financeiro recebe o 1.º pagamento
-- ============================================================
--  Correr DEPOIS de: obras.sql, e da migration do CRM
--  supabase/migrations/20261214100000_financeiro_faturas_recibos.sql
--  (sem ela instala na mesma: a lista vem sempre vazia).
--
--  A decisão de 13/10/2026: o 1.º pagamento validado põe a obra a andar.
--  O Financeiro valida o pagamento no CRM (rpc_fin_validar_pagamento) e
--  isso grava uma linha em `client_finance_events` (tipo
--  'primeiro_pagamento'), uma vez por contrato. Daqui para a frente:
--
--   · `rpc_ops_obras_por_criar(org)` — os contratos com o 1.º pagamento
--     recebido e ainda sem obra. A lista Obras mostra-os no topo, cada um
--     com um botão que abre a "Nova obra" já no contrato. A obra nasce
--     'planeada' (o plano por aprovar pelo gestor), pelo caminho de sempre
--     (rpc_ops_obra_criar) — nada aqui cria obras sozinho, porque as tarefas
--     são revistas no passo "Serviços do contrato" e falta escolher a data e
--     o supervisor.
--   · um gatilho em `ops_obra`: quando a obra do contrato nasce, o aviso
--     "Criar obra: <cliente>" que o Financeiro pôs no sino fica resolvido.
--
--  Escreve fora de `ops_*`? Só isto: marca como resolvidos os avisos
--  `financeiro_criar_obra` desse contrato em `public.notifications` (a
--  mesma exceção do "Avisos no sino do CRM" de obras.sql). Lê
--  `client_finance_events`, `client_contracts`, `anew_clients` e
--  `anew_entities`, nunca lhes escreve.
--
--  Permissões: reutiliza operations.orders.create (quem abre obras). Nenhum
--  código novo no catálogo.
--  Idempotente: corre duas vezes sem erro e sem duplicar nada.
-- ============================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.ops_obra') IS NULL THEN
    RAISE EXCEPTION 'Falta ops_obra. Corre db/obras.sql antes de db/financeiro-obra.sql.';
  END IF;
  IF to_regprocedure('public.ops_pode(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta ops_pode(). Corre db/seguranca.sql antes de db/financeiro-obra.sql.';
  END IF;
  IF to_regclass('public.client_finance_events') IS NULL THEN
    RAISE NOTICE 'client_finance_events não existe (migration 20261214100000 por aplicar): a lista de obras por criar fica vazia até lá.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Os contratos pagos à espera de obra
-- ============================================================
-- SECURITY DEFINER: quem planeia obras não tem (nem precisa de ter)
-- finance.view; vê só isto — cliente, contrato e quando chegou o pagamento,
-- sem valores de faturas. Uma obra cancelada não conta: o contrato volta à
-- lista.
CREATE OR REPLACE FUNCTION public.rpc_ops_obras_por_criar(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.ops_pode(p_org, 'operations.orders.create') THEN
    RAISE EXCEPTION 'Sem permissão (operations.orders.create) nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF to_regclass('public.client_finance_events') IS NULL
     OR to_regclass('public.client_contracts') IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  EXECUTE $q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'contrato_id',  e.contract_id,
             'numero',       COALESCE(c.contract_number, '—'),
             'cliente_id',   c.client_id,
             'cliente_nome', COALESCE(nullif(btrim(e.cliente_nome), ''), 'Cliente'),
             'pago_em',      e.created_at)
           ORDER BY e.created_at), '[]'::jsonb)
      FROM public.client_finance_events e
      JOIN public.client_contracts c ON c.id = e.contract_id AND c.deleted_at IS NULL
     WHERE e.organization_id = $1
       AND e.tipo = 'primeiro_pagamento'
       AND c.status IN ('signed','assinado','active')
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra o
                        WHERE o.contrato_id = e.contract_id AND o.estado <> 'cancelada')
  $q$ INTO v USING p_org;

  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obras_por_criar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obras_por_criar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_ops_obras_por_criar(uuid) IS
  'Operações: contratos com o 1.º pagamento validado pelo Financeiro (client_finance_events) e ainda sem obra. '
  'Exige operations.orders.create.';


-- ============================================================
-- 2. A obra nasceu: o aviso "Criar obra" fica resolvido
-- ============================================================
-- Nunca rebenta: um aviso por resolver não pode impedir a obra de nascer.
CREATE OR REPLACE FUNCTION public.ops_obra_fin_resolver_aviso()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.contrato_id IS NULL OR to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.notifications
     SET is_resolved = true, resolved_at = now(), resolved_reason = 'obra_criada'
   WHERE type = 'financeiro_criar_obra'
     AND entity_id = NEW.contrato_id
     AND organization_id = NEW.organization_id
     AND NOT is_resolved;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso "Criar obra" não resolvido: %', SQLERRM;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_fin_resolver_aviso() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_obra_fin_resolver_aviso ON public.ops_obra;
CREATE TRIGGER ops_obra_fin_resolver_aviso
  AFTER INSERT ON public.ops_obra
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_fin_resolver_aviso();

COMMIT;
