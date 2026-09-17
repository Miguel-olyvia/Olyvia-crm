import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/integrations/supabase/client';
import { resolveEmitterCompany, resolveSaleClient } from '@/utils/generateProformaPdfBlob';
import {
  InternalSaleDocumentPDF,
  type InternalSaleHeader,
  type InternalSaleLine,
} from '@/components/directSales/InternalSaleDocumentPDF';

// Venda Direta — Fase 6A: gerador do documento interno de custo e margem.
//
// Molde: generateProformaPdfBlob.ts, com duas diferenças que são a razão de ser
// deste ficheiro:
//
//   1. Lê TODAS as linhas — sem o filtro `visible_to_client = true` que a
//      proforma aplica — e traz `cost_price`, que a proforma nunca carrega.
//   2. NÃO tem modo `prefetched`. A proforma tem-no porque o portal do cliente
//      também a gera; este documento nunca pode ser gerado a partir do portal,
//      nem por engano. Só existe o caminho CRM, com RLS de utilizador interno.
//
// Não exige `proforma_number`: ao contrário da proforma, este documento faz
// sentido antes da aceitação — é uma ferramenta de custeio, não um documento
// emitido. O acesso é controlado no frontend pela permissão `quotes.view_costs`.

export async function generateInternalSalePdfBlob(
  directSaleId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const { data: saleRow, error: saleError } = await (supabase as any)
    .from('direct_sales')
    .select(
      'id, organization_id, entity_id, client_id, sale_number, status, title, notes, currency, subtotal, total, created_at',
    )
    .eq('id', directSaleId)
    .maybeSingle();
  if (saleError) throw saleError;
  if (!saleRow) throw new Error('Venda direta não encontrada.');

  // Sem filtro de visibilidade, de propósito: as linhas internas têm custo e é
  // precisamente esse custo que este documento existe para mostrar.
  const { data: lineRows, error: linesError } = await (supabase as any)
    .from('direct_sale_lines')
    .select(
      'id, descricao_snapshot, qt, unidade, cost_price, retail_price_unit, total_sem_iva, total_com_desconto, visible_to_client, ordem',
    )
    .eq('direct_sale_id', directSaleId)
    .order('ordem', { ascending: true });
  if (linesError) throw linesError;

  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  const sale: InternalSaleHeader = {
    sale_number: saleRow.sale_number ?? null,
    status: saleRow.status ?? null,
    title: saleRow.title ?? null,
    notes: saleRow.notes ?? null,
    currency: saleRow.currency ?? null,
    subtotal: num(saleRow.subtotal),
    total: num(saleRow.total),
    created_at: saleRow.created_at ?? null,
  };

  const lines: InternalSaleLine[] = ((lineRows || []) as any[]).map((row) => ({
    id: row.id,
    descricao_snapshot: row.descricao_snapshot ?? null,
    qt: num(row.qt),
    unidade: row.unidade ?? null,
    cost_price: num(row.cost_price),
    retail_price_unit: num(row.retail_price_unit),
    total_sem_iva: num(row.total_sem_iva),
    total_com_desconto: num(row.total_com_desconto),
    // NOT NULL DEFAULT true na BD; o !== false protege de um undefined vindo
    // de um select que não traga a coluna.
    visible_to_client: row.visible_to_client !== false,
  }));

  const [company, client] = await Promise.all([
    resolveEmitterCompany(saleRow.organization_id ?? null),
    resolveSaleClient(saleRow.entity_id ?? null, saleRow.client_id ?? null),
  ]);

  const element = React.createElement(InternalSaleDocumentPDF, { sale, lines, company, client });
  const blob = await (pdf as any)(element).toBlob();

  const fileName = `Interno_${sale.sale_number || directSaleId}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName };
}
