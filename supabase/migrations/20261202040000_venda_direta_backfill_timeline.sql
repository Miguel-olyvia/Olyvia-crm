-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Venda Direta — backfill dos marcos na timeline                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- O trg_direct_sale_timeline_history (20261202030000) só dispara em transições
-- NOVAS. As vendas que já existiam passaram por "criada/enviada/aceite" antes
-- de ele existir, portanto não têm marco nenhum — na ficha do cliente só se
-- viam os diffs em bruto do entity_audit_log ("Editou estado", "Editou
-- accepted at"), sem nada que dissesse que aquilo era uma venda direta.
--
-- Este backfill reconstrói os marcos a partir dos carimbos temporais que a
-- própria venda guarda: created_at, sent_at, accepted_at, rejected_at,
-- invoice_issued_at. Não se inventa nada — um marco só é escrito se o carimbo
-- correspondente existir.
--
-- Não se usa fn_write_entity_history porque essa escreve sempre com created_at
-- = now(), e os eventos apareceriam todos empilhados em cima, hoje, em vez de
-- na data em que aconteceram. Aqui o INSERT é directo, com a data verdadeira.
--
-- Idempotente: o NOT EXISTS por (entity_id, change_type, direct_sale_id) evita
-- duplicar se a migration for reaplicada num ambiente que já a tenha corrido.

DO $$
DECLARE
  v_sale   record;
  v_actor  uuid;
  v_meta   jsonb;
BEGIN
  FOR v_sale IN
    SELECT id, entity_id, sale_number, total, currency, status,
           created_at, sent_at, accepted_at, rejected_at,
           proforma_number, invoice_number, invoice_issued_at, invoice_status,
           rejection_reason, assigned_to, created_by
      FROM public.direct_sales
     WHERE deleted_at IS NULL
       AND entity_id IS NOT NULL
  LOOP
    v_actor := COALESCE(v_sale.assigned_to, v_sale.created_by);
    v_meta := jsonb_build_object(
      'direct_sale_id', v_sale.id,
      'sale_number',    v_sale.sale_number,
      'total',          v_sale.total,
      'currency',       COALESCE(v_sale.currency, 'EUR'),
      'backfilled',     true
    );

    -- criada
    INSERT INTO public.anew_entity_history
      (entity_id, change_type, field_name, changed_by, metadata, created_at)
    SELECT v_sale.entity_id, 'direct_sale_created', 'direct_sale', v_actor, v_meta, v_sale.created_at
    WHERE NOT EXISTS (
      SELECT 1 FROM public.anew_entity_history h
       WHERE h.entity_id = v_sale.entity_id
         AND h.change_type = 'direct_sale_created'
         AND h.metadata ->> 'direct_sale_id' = v_sale.id::text
    );

    -- enviada
    IF v_sale.sent_at IS NOT NULL THEN
      INSERT INTO public.anew_entity_history
        (entity_id, change_type, field_name, changed_by, metadata, created_at)
      SELECT v_sale.entity_id, 'direct_sale_sent', 'direct_sale', v_actor, v_meta, v_sale.sent_at
      WHERE NOT EXISTS (
        SELECT 1 FROM public.anew_entity_history h
         WHERE h.entity_id = v_sale.entity_id
           AND h.change_type = 'direct_sale_sent'
           AND h.metadata ->> 'direct_sale_id' = v_sale.id::text
      );
    END IF;

    -- aceite (com o número da proforma, que é emitido nesse momento)
    IF v_sale.accepted_at IS NOT NULL THEN
      INSERT INTO public.anew_entity_history
        (entity_id, change_type, field_name, changed_by, metadata, created_at)
      SELECT v_sale.entity_id, 'direct_sale_accepted', 'direct_sale', v_actor,
             v_meta || jsonb_build_object('proforma_number', v_sale.proforma_number),
             v_sale.accepted_at
      WHERE NOT EXISTS (
        SELECT 1 FROM public.anew_entity_history h
         WHERE h.entity_id = v_sale.entity_id
           AND h.change_type = 'direct_sale_accepted'
           AND h.metadata ->> 'direct_sale_id' = v_sale.id::text
      );
    END IF;

    -- rejeitada
    IF v_sale.rejected_at IS NOT NULL THEN
      INSERT INTO public.anew_entity_history
        (entity_id, change_type, field_name, changed_by, metadata, created_at)
      SELECT v_sale.entity_id, 'direct_sale_rejected', 'direct_sale', v_actor,
             v_meta || jsonb_build_object('rejection_reason', v_sale.rejection_reason),
             v_sale.rejected_at
      WHERE NOT EXISTS (
        SELECT 1 FROM public.anew_entity_history h
         WHERE h.entity_id = v_sale.entity_id
           AND h.change_type = 'direct_sale_rejected'
           AND h.metadata ->> 'direct_sale_id' = v_sale.id::text
      );
    END IF;

    -- faturada
    IF v_sale.invoice_status = 'emitida' AND v_sale.invoice_issued_at IS NOT NULL THEN
      INSERT INTO public.anew_entity_history
        (entity_id, change_type, field_name, changed_by, metadata, created_at)
      SELECT v_sale.entity_id, 'direct_sale_invoiced', 'direct_sale', v_actor,
             v_meta || jsonb_build_object('invoice_number', v_sale.invoice_number),
             v_sale.invoice_issued_at
      WHERE NOT EXISTS (
        SELECT 1 FROM public.anew_entity_history h
         WHERE h.entity_id = v_sale.entity_id
           AND h.change_type = 'direct_sale_invoiced'
           AND h.metadata ->> 'direct_sale_id' = v_sale.id::text
      );
    END IF;
  END LOOP;
END $$;
