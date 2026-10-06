-- ============================================================
--  Operações — orçamento só vira obra se ASSINADO E CONTRATUALIZADO
--  (06/10/2026). Pronto a colar no Supabase SQL Editor da produção.
-- ============================================================
--  O mesmo que as secções 2b, 3 e 5b de db/orcamentos.sql — copiado
--  daí, sem mudar uma vírgula (tools/validar-atualizacao.mjs prova que a
--  produção fica igual a uma instalação limpa). Idempotente: pode correr-se
--  as vezes que for preciso. Só lê o CRM (client_contracts, quotes); não
--  escreve lá nada. As ordens que já existem não são tocadas.
--
--  O que faz:
--   · ops_orcamento_contrato(orçamento) — o contrato do CRM que cobre o
--     orçamento e se está assinado ('signed', 'assinado' ou 'active');
--   · ops_v_orcamento ganha contrato_id, contrato_numero, contrato_estado e
--     contratado (colunas no fim — a app publicada antes continua a funcionar);
--   · trigger em ops_ordem: nenhuma ordem nasce de um orçamento sem contrato
--     assinado, venha de onde vier.
-- ============================================================

BEGIN;

-- ============================================================
-- 2b. Assinado e contratualizado (regra de 06/10/2026)
-- ============================================================
-- "Tem de estar assinado e contratualizado, obrigatoriamente." Aceite no CRM
-- não chega: um orçamento só vira obra quando há um CONTRATO do CRM
-- (`client_contracts`) que o cobre, não apagado, e ASSINADO — estado
-- 'signed', 'assinado' ou 'active' (o mesmo critério da vista ops_v_contrato,
-- em obras.sql; 'active' é o que o CRM usa depois da assinatura).
--
-- Um contrato cobre o orçamento pelos MESMOS caminhos que o CRM usa para ir
-- do contrato ao orçamento (ver ops_contrato_orcamento, em obras.sql):
--   1. client_contracts.quote_id = o orçamento;
--   2. sem quote_id, pela proposta do contrato: a seleção da proposta
--      (proposal_quote_selections), o orçamento com quotes.proposal_id, ou
--      pipeline_links (proposta → orçamento, ou contrato → orçamento).
--
-- Devolve o contrato mais relevante (um assinado, se houver; senão o mais
-- recente, para o ecrã poder dizer "o contrato CC-… está por assinar").
-- Nenhuma linha = não há contrato nenhum.
--
-- Só leitura, e INVOKER (como ops_contrato_orcamento e ops_v_contrato): a RLS
-- do CRM continua a mandar. Cada caminho só se tenta se a tabela/coluna
-- existir — uma base sem o módulo de contratos instala na mesma (e aí nenhum
-- orçamento está contratualizado).
CREATE OR REPLACE FUNCTION public.ops_orcamento_contrato(_quote_id uuid)
RETURNS TABLE (contrato_id uuid, numero text, estado text, assinado boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_cond text := 'c.quote_id = $1';
  v_prop text := '';
  v_ordem text := '';
BEGIN
  IF _quote_id IS NULL OR to_regclass('public.client_contracts') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'client_contracts'
                AND column_name = 'proposal_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'quotes'
                  AND column_name = 'proposal_id') THEN
      v_prop := v_prop || ' OR c.proposal_id = (SELECT q.proposal_id FROM public.quotes q WHERE q.id = $1)';
    END IF;
    IF to_regclass('public.proposal_quote_selections') IS NOT NULL THEN
      v_prop := v_prop || ' OR EXISTS (SELECT 1 FROM public.proposal_quote_selections s
                                        WHERE s.proposal_id = c.proposal_id AND s.quote_id = $1
                                          AND s.selected)';
    END IF;
    IF to_regclass('public.pipeline_links') IS NOT NULL THEN
      v_prop := v_prop || ' OR EXISTS (SELECT 1 FROM public.pipeline_links pl
                                        WHERE pl.proposal_id = c.proposal_id AND pl.quote_id = $1)';
    END IF;
    IF v_prop <> '' THEN
      v_cond := v_cond || ' OR (c.quote_id IS NULL AND c.proposal_id IS NOT NULL AND (false'
                       || v_prop || '))';
    END IF;
  END IF;

  IF to_regclass('public.pipeline_links') IS NOT NULL THEN
    v_cond := v_cond || ' OR (c.quote_id IS NULL AND EXISTS (SELECT 1 FROM public.pipeline_links pl
                                                              WHERE pl.contract_id = c.id AND pl.quote_id = $1))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'client_contracts'
                AND column_name = 'created_at') THEN
    v_ordem := ', c.created_at DESC NULLS LAST';
  END IF;

  RETURN QUERY EXECUTE
    'SELECT c.id, c.contract_number::text, c.status::text,
            COALESCE(c.status IN (''signed'',''assinado'',''active''), false)
       FROM public.client_contracts c
      WHERE c.deleted_at IS NULL AND (' || v_cond || ')
      ORDER BY COALESCE(c.status IN (''signed'',''assinado'',''active''), false) DESC'
      || v_ordem || '
      LIMIT 1'
    USING _quote_id;
END
$$;

REVOKE ALL ON FUNCTION public.ops_orcamento_contrato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_orcamento_contrato(uuid) TO authenticated, service_role;


-- ============================================================
-- 3. Os orçamentos que já podem virar obra
-- ============================================================
-- `security_invoker` é obrigatório: sem ele, a vista corre com os direitos de
-- quem a criou e mostraria orçamentos de organizações que quem consulta não
-- pode ver. Com ele, a RLS do CRM aplica-se na mesma, como deve.
--
-- Mostra os aceites que ainda não têm obra. Um orçamento que já gerou obra
-- sai da lista sozinho — é a lista de "o que falta pôr a andar".
--
-- `contratado` diz se já pode mesmo andar (contrato assinado — ver 2b). Os
-- aceites sem contrato assinado continuam na lista, mas o ecrã mostra-os
-- bloqueados e diz porquê (`contrato_numero`/`contrato_estado`). As colunas
-- novas vão no FIM: CREATE OR REPLACE VIEW só deixa acrescentar no fim.

CREATE OR REPLACE VIEW public.ops_v_orcamento
WITH (security_invoker = true) AS
SELECT
  q.id,
  q.organization_id,
  q.cliente_id,
  COALESCE(q.quote_number, '—')                       AS numero,
  COALESCE(nullif(btrim(q.title), ''), 'Sem título')  AS titulo,
  q.obra_endereco,
  q.estado,
  q.accepted_at,
  q.total,
  q.moeda,
  -- O custo previsto, somado das linhas. É contra isto que o real se compara.
  COALESCE((
    SELECT sum((COALESCE(l.custo_material_unit,0) + COALESCE(l.custo_mao_obra_unit,0))
               * COALESCE(l.qt,1))
      FROM public.quote_lines l WHERE l.quote_id = q.id
  ), 0)::numeric(12,2)                                AS custo_previsto,
  (SELECT count(*) FROM public.quote_lines l WHERE l.quote_id = q.id)::integer AS linhas,
  EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.orcamento_id = q.id)        AS tem_obra,
  ct.contrato_id,
  ct.numero                                            AS contrato_numero,
  ct.estado                                            AS contrato_estado,
  COALESCE(ct.assinado, false)                         AS contratado
FROM public.quotes q
LEFT JOIN LATERAL public.ops_orcamento_contrato(q.id) ct ON true
WHERE q.deleted_at IS NULL
  AND q.estado IN ('aceite','finalizado');

REVOKE ALL ON public.ops_v_orcamento FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_orcamento TO authenticated, service_role;


-- ============================================================
-- 5b. Sem contrato assinado, não há obra — na base, não só no ecrã
-- ============================================================
-- A regra de 2b guardada onde nenhum caminho a contorna: qualquer ordem que
-- nasça (ou passe a estar) ligada a um orçamento tem de ter esse orçamento
-- contratualizado. Um trigger, e não uma linha na RPC, porque a RPC tem duas
-- versões (esta e a de seguranca.sql) e voltar a correr um ficheiro antigo
-- não pode desligar a regra.
--
-- DEFINER: a verificação lê o contrato com os direitos de quem instalou, para
-- não depender de quem pede ter `client_contracts.view` no CRM. Não devolve
-- nada do contrato a quem pede além do número e do estado do contrato DESTE
-- orçamento, e só depois de a RPC já ter verificado as permissões.
-- As ordens que já existiam não são tocadas (só INSERT e mudança de orçamento).
CREATE OR REPLACE FUNCTION public.ops_ordem_exigir_contrato()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c record;
BEGIN
  IF NEW.orcamento_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.orcamento_id IS NOT DISTINCT FROM OLD.orcamento_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_c FROM public.ops_orcamento_contrato(NEW.orcamento_id);

  IF v_c.contrato_id IS NULL THEN
    RAISE EXCEPTION 'Este orçamento ainda não tem contrato. Só se põe a andar um orçamento assinado e contratualizado: o contrato tem de estar assinado no CRM.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_c.assinado THEN
    RAISE EXCEPTION 'O contrato % deste orçamento ainda não está assinado (está "%"). Só se põe a andar um orçamento assinado e contratualizado.',
      COALESCE(v_c.numero, '(sem número)'), v_c.estado
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_ordem_exigir_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_ordem_exigir_contrato ON public.ops_ordem;
CREATE TRIGGER ops_ordem_exigir_contrato
  BEFORE INSERT OR UPDATE OF orcamento_id ON public.ops_ordem
  FOR EACH ROW EXECUTE FUNCTION public.ops_ordem_exigir_contrato();


COMMIT;

DO $v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'ops_ordem_exigir_contrato'
                    AND tgrelid = 'public.ops_ordem'::regclass) THEN
    RAISE EXCEPTION 'Falta o trigger ops_ordem_exigir_contrato.';
  END IF;
  RAISE NOTICE 'Feito: só vira obra um orçamento assinado e contratualizado.';
END
$v$;
