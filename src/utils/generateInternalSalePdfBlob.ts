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
    // product_id/service_id são indispensáveis: é por eles que o custo se vai
    // buscar ao catálogo. Sem eles no select, resolveUnitCost não encontra nada
    // e o documento inteiro sai "sem preço de compra".
    .select(
      'id, descricao_snapshot, qt, unidade, cost_price, retail_price_unit, total_sem_iva, total_com_desconto, visible_to_client, ordem, product_id, service_id',
    )
    .eq('direct_sale_id', directSaleId)
    .order('ordem', { ascending: true });
  if (linesError) throw linesError;

  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  // ── Custo: lido SEMPRE do catálogo, nunca de direct_sale_lines.cost_price ──
  // O custo vive no produto/serviço, e é de lá que os orçamentos o leem
  // (InlineQuoteBuilder.tsx:349-357, AddItemsDialog.tsx:545-552). A coluna
  // `cost_price` da linha não é de confiança: fica a 0 em tudo o que venha da
  // expansão de um bundle (DirectSaleEditor.tsx:292), e uma venda com bundles
  // sairia com 100% de margem — confiantemente errada.
  //
  // Consequência assumida: a margem é calculada ao custo de HOJE, não ao da
  // data da venda. Se o fornecedor mudar de preço, a margem histórica muda com
  // ele. É o comportamento pedido e é o mesmo dos orçamentos.
  const rawLines = (lineRows || []) as any[];
  const productIds = Array.from(
    new Set(rawLines.map((r) => r.product_id).filter(Boolean)),
  ) as string[];
  const serviceIds = Array.from(
    new Set(rawLines.map((r) => r.service_id).filter(Boolean)),
  ) as string[];

  const [productCosts, serviceCosts] = await Promise.all([
    productIds.length > 0
      ? (supabase as any)
          .from('product_prices')
          .select('product_id, price')
          .eq('price_type', 'purchase')
          .in('product_id', productIds)
      : Promise.resolve({ data: [] as any[] }),
    serviceIds.length > 0
      ? (supabase as any)
          .from('service_prices')
          .select('service_id, price')
          .eq('price_type', 'purchase')
          .in('service_id', serviceIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Erros aqui NÃO podem ser engolidos: uma falha de RLS ou de permissão
  // produziria zero linhas, o documento diria "sem preço de compra em tudo" e
  // anunciaria 100% de margem — indistinguível de um catálogo por preencher.
  // Mais vale não sair documento nenhum do que sair um documento a mentir.
  if (productCosts?.error) throw productCosts.error;
  if (serviceCosts?.error) throw serviceCosts.error;

  const costByProduct = new Map<string, number>();
  for (const row of (productCosts?.data || []) as any[]) {
    costByProduct.set(row.product_id, Number(row.price) || 0);
  }
  const costByService = new Map<string, number>();
  for (const row of (serviceCosts?.data || []) as any[]) {
    costByService.set(row.service_id, Number(row.price) || 0);
  }

  /**
   * Custo unitário da linha. `null` quando o catálogo não tem preço de compra
   * para aquele artigo — e aí o documento diz "sem custo" em vez de imprimir um
   * zero que se leria como "de graça". Uma linha sem produto nem serviço (lançada
   * à mão) cai no valor gravado, que é a única fonte que tem.
   */
  const resolveUnitCost = (row: any): number | null => {
    if (row.product_id) return costByProduct.get(row.product_id) ?? null;
    if (row.service_id) return costByService.get(row.service_id) ?? null;
    const stored = num(row.cost_price);
    return stored && stored > 0 ? stored : null;
  };

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

  const lines: InternalSaleLine[] = rawLines.map((row) => ({
    id: row.id,
    descricao_snapshot: row.descricao_snapshot ?? null,
    qt: num(row.qt),
    unidade: row.unidade ?? null,
    cost_price: resolveUnitCost(row),
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
