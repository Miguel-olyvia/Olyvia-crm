-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Venda Direta — Fase 6B: registo da fatura fiscal                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Em Portugal emitir faturas exige software certificado pela AT. A Olyvia não
-- emite: gera a proforma e REGISTA os dados da fatura real, emitida à parte.
-- As colunas invoice_number/series/issued_at/atcud/hash/external_invoice_id
-- já existiam reservadas desde 20261130230000; esta migration dá-lhes o
-- caminho de escrita.
--
-- ── Porque é preciso `invoice_source` ───────────────────────────────────────
-- Hoje quem escreve estes campos é uma pessoa. Um dia será um módulo
-- certificado. São coisas diferentes e têm de se distinguir:
--   · um número escrito à mão PODE estar errado e tem de continuar corrigível;
--   · um número emitido por software certificado NÃO se toca — é registo fiscal.
-- Sem esta coluna, no dia em que o módulo entrar ficam os dois tipos de registo
-- misturados e a única saída seria assumir "tudo antes da data X foi manual" —
-- um palpite, em dados fiscais. É mais barato registar a proveniência agora do
-- que a adivinhar depois.
--
-- Deliberadamente NÃO se acrescenta mais nada "para o futuro": sem um módulo
-- especificado, qualquer campo de fornecedor ou payload genérico seria um
-- palpite sobre uma integração que ninguém desenhou. A coluna de proveniência
-- e a regra de edição são o que se sabe hoje; o resto fica por escrever.

ALTER TABLE public.direct_sales
  ADD COLUMN IF NOT EXISTS invoice_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.direct_sales'::regclass
       AND conname = 'direct_sales_invoice_source_check'
  ) THEN
    ALTER TABLE public.direct_sales
      ADD CONSTRAINT direct_sales_invoice_source_check
      CHECK (invoice_source IS NULL OR invoice_source IN ('manual', 'integracao'));
  END IF;
END $$;

COMMENT ON COLUMN public.direct_sales.invoice_source IS
  'Quem escreveu os dados da fatura: ''manual'' (uma pessoa, via '
  'rpc_register_direct_sale_invoice) ou ''integracao'' (futuro módulo '
  'certificado). NULL = ainda não há fatura registada. Um registo de origem '
  '''integracao'' não pode ser reescrito manualmente.';

-- ── Escrita ─────────────────────────────────────────────────────────────────
-- Uma RPC em vez de um UPDATE directo do frontend: a validação fica num sítio
-- só ("a venda tem de estar aceite", "não se sobrescreve o que é da
-- integração") em vez de espalhada por cada ecrã que venha a escrever isto.
-- É também o encaixe óbvio para o módulo futuro — sem prometer que serve tal
-- e qual, porque a forma dessa integração ainda não existe.

CREATE OR REPLACE FUNCTION public.rpc_register_direct_sale_invoice(
  p_direct_sale_id uuid,
  p_invoice jsonb
)
RETURNS public.direct_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor   uuid;
  v_sale    public.direct_sales;
  v_number  text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'direct_sales.edit') THEN
    RAISE EXCEPTION 'Sem permissão para registar a fatura' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmo âmbito organizacional que a RLS de direct_sales aplica na leitura:
  -- ter a permissão não chega, a venda tem de ser de uma organização visível.
  IF v_sale.organization_id NOT IN (
    SELECT public.get_user_visible_org_ids(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Venda direta fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Uma fatura só existe depois de o cliente aceitar. Registá-la antes seria
  -- documentar uma venda que ainda pode ser rejeitada.
  IF v_sale.status IS DISTINCT FROM 'aceite' THEN
    RAISE EXCEPTION 'A fatura só pode ser registada depois de a venda ser aceite (estado actual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A regra que justifica a coluna: o que veio do módulo certificado é registo
  -- fiscal e não se corrige à mão.
  IF v_sale.invoice_source = 'integracao' THEN
    RAISE EXCEPTION 'Esta fatura foi emitida pelo módulo de faturação e não pode ser alterada manualmente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_number := nullif(btrim(coalesce(p_invoice ->> 'invoice_number', '')), '');
  IF v_number IS NULL THEN
    RAISE EXCEPTION 'O número da fatura é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- Dentro da função: set_audit_context usa set_config(..., true), que é LOCAL
  -- à transação. Chamada de fora, noutro pedido, não chegaria aqui.
  PERFORM public.set_audit_context(v_actor, 'crm');

  UPDATE public.direct_sales
     SET invoice_number      = v_number,
         invoice_series      = nullif(btrim(coalesce(p_invoice ->> 'invoice_series', '')), ''),
         invoice_issued_at   = coalesce(
                                 nullif(p_invoice ->> 'invoice_issued_at', '')::timestamptz,
                                 now()
                               ),
         invoice_atcud       = nullif(btrim(coalesce(p_invoice ->> 'invoice_atcud', '')), ''),
         invoice_hash        = nullif(btrim(coalesce(p_invoice ->> 'invoice_hash', '')), ''),
         external_invoice_id = nullif(btrim(coalesce(p_invoice ->> 'external_invoice_id', '')), ''),
         invoice_pdf_url     = nullif(btrim(coalesce(p_invoice ->> 'invoice_pdf_url', '')), ''),
         invoice_status      = 'emitida',
         invoice_source      = 'manual'
   WHERE id = v_sale.id
  RETURNING * INTO v_sale;

  RETURN v_sale;
END;
$function$;

COMMENT ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) IS
  'Venda Direta Fase 6B: regista os dados da fatura fiscal emitida à parte '
  '(a Olyvia não emite faturas — ver a proforma). Exige direct_sales.edit, '
  'venda aceite e âmbito organizacional. Marca invoice_source=''manual'' e '
  'recusa sobrescrever um registo de origem ''integracao''.';

REVOKE ALL ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) TO service_role;
