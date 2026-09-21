import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/integrations/supabase/client';
import { callNifRevealSingle } from '@/lib/nif/callNifReveal';
import { resolveQuotePdfClient } from '@/utils/quotePdfClient';
import {
  ProformaPDFDocument,
  type ProformaPdfClient,
  type ProformaPdfCompany,
  type ProformaPdfLine,
  type ProformaPdfSale,
} from '@/components/directSales/ProformaPDFDocument';

// Venda Direta — Fase 4b: gerador do PDF da proforma.
//
// Molde: generateProposalPdfBlob.ts (assinatura `(id, prefetched?)` e a mesma
// divisão entre "modo CRM" e "modo portal").

/**
 * Venda, linhas, empresa emitente e cliente já carregados pelo chamador.
 *
 * MODO PORTAL — ZERO QUERIES. O portal do cliente não consegue ler
 * `direct_sales`/`direct_sale_lines`/`anew_organizations` (RLS): os dados têm
 * de chegar da Edge Function `client-portal-action`, já sem cost_price/
 * margem_percent e já só com as linhas visible_to_client = true.
 *
 * Isto inclui o LOGÓTIPO: `company.logo_url` tem de vir já em base64 (data
 * URI). O `generateQuotePdfBlob` existente, mesmo em modo prefetched, continua
 * a ir buscar o logótipo e o cliente ao Supabase — o que no portal falha em
 * silêncio por RLS e produz um documento sem marca e sem cliente. Este gerador
 * não repete esse erro: quando `prefetched` é passado, NÃO se faz uma única
 * query, seja para o que for.
 */
export interface ProformaPdfPrefetch {
  /** Cabeçalho da venda direta, tal como gravado (subtotal/total do cabeçalho, nunca somas de linhas). */
  sale: ProformaPdfSale;
  /** Apenas as linhas visíveis ao cliente, já ordenadas por `ordem`. */
  lines: ProformaPdfLine[];
  /** Empresa emitente, com o logótipo JÁ convertido para base64 (data URI). */
  company: ProformaPdfCompany;
  /** Cliente da venda (nome, NIF e morada já formatada numa linha). */
  client: ProformaPdfClient;
}

const EMPTY_COMPANY: ProformaPdfCompany = {
  name: null,
  vat: null,
  address: null,
  email: null,
  phone: null,
  logo_url: null,
};

/** Igual ao de generateQuotePdfBlob.ts:9-19 — o logótipo nunca pode pendurar a geração do PDF. */
const fetchBlobWithTimeout = async (url: string, timeoutMs = 5000): Promise<Blob> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Falha ao carregar imagem (${response.status})`);
    return await response.blob();
  } finally {
    window.clearTimeout(timeout);
  }
};

/** Converte o logótipo para data URI; devolve null (sem rebentar) se falhar. */
async function toBase64OrNull(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const blob = await fetchBlobWithTimeout(url);
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[generateProformaPdfBlob] Error converting logo to base64:', error);
    return null;
  }
}

function joinAddress(a: any): string {
  if (!a || typeof a !== 'object') return '';
  return [a.street, a.number, a.postal_code, a.city]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(', ');
}

/**
 * Empresa emitente (modo CRM apenas).
 *
 * Segue a MESMA ordem canónica de `useOrgHeaderData` (src/components/contracts/
 * useOrgHeaderData.ts:32-44) — morada: anew_org_addresses (fiscal primeiro) ->
 * anew_entity_addresses (primária) -> metadata.address; NIF: fiscal_entities
 * via anew_entity_fiscal_entities -> metadata.vat/nif. Replicado aqui em vez de
 * reutilizado porque aquilo é um hook de React (useQuery) e isto é uma função
 * de utilidade chamada fora da árvore de componentes.
 *
 * Nunca deita a geração abaixo: qualquer falha degrada para os campos que se
 * conseguiram obter.
 */
// Exportada para o gerador do documento interno (Fase 6A): é a mesma empresa
// emitente, resolvida da mesma maneira e com o logótipo tratado da mesma forma.
// Duplicá-la levaria os dois documentos a divergirem no cabeçalho.
export async function resolveEmitterCompany(organizationId: string | null): Promise<ProformaPdfCompany> {
  if (!organizationId) return { ...EMPTY_COMPANY };

  const { data: org } = await (supabase as any)
    .from('anew_organizations')
    .select('name, entity_id, metadata, phone, logo_url')
    .eq('id', organizationId)
    .maybeSingle();

  if (!org) return { ...EMPTY_COMPANY };

  const meta = (org.metadata || {}) as Record<string, any>;
  const company: ProformaPdfCompany = {
    name: org.name || null,
    vat: meta.vat || meta.nif || null,
    address: null,
    email: meta.email || null,
    phone: org.phone || meta.phone || null,
    logo_url: null,
  };

  try {
    const { data: orgAddr } = await (supabase as any)
      .from('anew_org_addresses')
      .select('anew_addresses(street, number, postal_code, city)')
      .eq('org_id', organizationId)
      .is('valid_to', null)
      .order('is_fiscal', { ascending: false })
      .limit(1);
    const joined = joinAddress(orgAddr?.[0]?.anew_addresses);
    if (joined) company.address = joined;
  } catch (error) {
    console.error('[generateProformaPdfBlob] Error loading org address:', error);
  }

  if (org.entity_id) {
    try {
      const [fiscalRes, phoneRes, emailRes, entAddrRes] = await Promise.all([
        (supabase as any)
          .from('anew_entity_fiscal_entities')
          .select('fiscal_entity_id')
          .eq('entity_id', org.entity_id)
          .eq('is_primary', true)
          .limit(1),
        (supabase as any)
          .from('anew_entity_phones')
          .select('phone_number')
          .eq('entity_id', org.entity_id)
          .order('is_primary', { ascending: false })
          .limit(1),
        (supabase as any)
          .from('anew_entity_emails')
          .select('email')
          .eq('entity_id', org.entity_id)
          .order('is_primary', { ascending: false })
          .limit(1),
        (supabase as any)
          .from('anew_entity_addresses')
          .select('anew_addresses(street, number, postal_code, city)')
          .eq('entity_id', org.entity_id)
          .order('is_primary', { ascending: false })
          .limit(1),
      ]);

      const fiscalEntityId = fiscalRes?.data?.[0]?.fiscal_entity_id;
      if (fiscalEntityId) {
        const nif = await callNifRevealSingle(fiscalEntityId);
        if (nif) company.vat = String(nif).trim();
      }
      if (!company.phone) company.phone = phoneRes?.data?.[0]?.phone_number || null;
      if (!company.email) company.email = emailRes?.data?.[0]?.email || null;
      if (!company.address) {
        const joined = joinAddress(entAddrRes?.data?.[0]?.anew_addresses);
        if (joined) company.address = joined;
      }
    } catch (error) {
      console.error('[generateProformaPdfBlob] Error loading org entity data:', error);
    }
  }

  if (!company.address && meta.address) company.address = String(meta.address);

  company.logo_url = await toBase64OrNull(org.logo_url);

  return company;
}

/** Morada do cliente numa linha — mesma composição usada nos PDFs de orçamento. */
function formatClientAddress(client: any): string {
  const addresses = client?.client_addresses || [];
  const primary = addresses.find((a: any) => a?.is_primary) || addresses[0];
  if (!primary) return '';
  return [primary.street, primary.number, primary.postal_code, primary.city]
    .filter(Boolean)
    .join(', ');
}

/**
 * Cliente da venda direta (modo CRM apenas), via o resolver já usado pelos PDFs
 * de orçamento. Exportada pela mesma razão que `resolveEmitterCompany`: o
 * documento interno da Fase 6A tem de identificar o cliente exatamente igual.
 */
export async function resolveSaleClient(
  entityId: string | null,
  clientId: string | null,
): Promise<ProformaPdfClient> {
  if (!entityId && !clientId) return { name: null, vat: null, address: null };
  try {
    const { client } = await resolveQuotePdfClient({ entityId, clientId });
    if (!client) return { name: null, vat: null, address: null };
    return {
      name: client.company_name || client.display_name || null,
      vat: client.vat || null,
      address: formatClientAddress(client) || null,
    };
  } catch (error) {
    // Um cliente por resolver não pode impedir a emissão do documento.
    console.error('[generateProformaPdfBlob] Error resolving client:', error);
    return { name: null, vat: null, address: null };
  }
}

/**
 * Gera o PDF da proforma de uma venda direta.
 *
 * - Sem `prefetched` (CRM): lê `direct_sales`, `direct_sale_lines`,
 *   `anew_organizations` e a entidade/cliente. A RLS do CRM permite-o.
 * - Com `prefetched` (portal): usa exclusivamente os dados injetados e não faz
 *   nenhuma query (ver `ProformaPdfPrefetch`).
 *
 * Falha com mensagem legível quando a venda ainda não tem `proforma_number` —
 * não existe proforma sem número, e emitir um documento sem ele seria pior do
 * que não o emitir.
 */
export async function generateProformaPdfBlob(
  directSaleId: string,
  prefetched?: ProformaPdfPrefetch,
): Promise<{ blob: Blob; fileName: string }> {
  let sale: ProformaPdfSale;
  let lines: ProformaPdfLine[];
  let company: ProformaPdfCompany;
  let client: ProformaPdfClient;

  if (prefetched) {
    if (!prefetched.sale) {
      throw new Error('Dados da venda direta em falta para gerar a proforma.');
    }
    sale = prefetched.sale;
    lines = prefetched.lines || [];
    company = prefetched.company || { ...EMPTY_COMPANY };
    client = prefetched.client || { name: null, vat: null, address: null };
  } else {
    const { data: saleRow, error: saleError } = await (supabase as any)
      .from('direct_sales')
      .select(
        'id, organization_id, entity_id, client_id, sale_number, title, client_notes, currency, subtotal, total, iva_rate, proforma_number, proforma_issued_at',
      )
      .eq('id', directSaleId)
      .maybeSingle();
    if (saleError) throw saleError;
    if (!saleRow) throw new Error('Venda direta não encontrada.');

    if (!saleRow.proforma_number) {
      throw new Error(
        'Esta venda direta ainda não tem proforma. O número é emitido quando o cliente aceita a venda.',
      );
    }

    // Só as linhas visíveis ao cliente: as internas (visible_to_client = false)
    // também não entram no subtotal/total gravados no cabeçalho, logo mostrá-las
    // faria o documento não bater certo consigo próprio.
    const { data: lineRows, error: linesError } = await (supabase as any)
      .from('direct_sale_lines')
      .select(
        'id, descricao_snapshot, qt, unidade, retail_price_unit, iva_percent, total_sem_iva, total_com_iva, total_com_desconto, ordem',
      )
      .eq('direct_sale_id', directSaleId)
      .eq('visible_to_client', true)
      .order('ordem', { ascending: true });
    if (linesError) throw linesError;

    sale = {
      sale_number: saleRow.sale_number ?? null,
      proforma_number: saleRow.proforma_number ?? null,
      proforma_issued_at: saleRow.proforma_issued_at ?? null,
      title: saleRow.title ?? null,
      client_notes: saleRow.client_notes ?? null,
      currency: saleRow.currency ?? null,
      subtotal: saleRow.subtotal === null || saleRow.subtotal === undefined ? null : Number(saleRow.subtotal),
      total: saleRow.total === null || saleRow.total === undefined ? null : Number(saleRow.total),
      iva_rate: saleRow.iva_rate === null || saleRow.iva_rate === undefined ? null : Number(saleRow.iva_rate),
    };

    lines = ((lineRows || []) as any[]).map((row) => ({
      id: row.id,
      descricao_snapshot: row.descricao_snapshot ?? null,
      qt: row.qt === null || row.qt === undefined ? null : Number(row.qt),
      unidade: row.unidade ?? null,
      retail_price_unit:
        row.retail_price_unit === null || row.retail_price_unit === undefined
          ? null
          : Number(row.retail_price_unit),
      iva_percent:
        row.iva_percent === null || row.iva_percent === undefined ? null : Number(row.iva_percent),
      total_sem_iva:
        row.total_sem_iva === null || row.total_sem_iva === undefined ? null : Number(row.total_sem_iva),
      total_com_iva:
        row.total_com_iva === null || row.total_com_iva === undefined ? null : Number(row.total_com_iva),
      total_com_desconto:
        row.total_com_desconto === null || row.total_com_desconto === undefined
          ? null
          : Number(row.total_com_desconto),
    }));

    [company, client] = await Promise.all([
      resolveEmitterCompany(saleRow.organization_id ?? null),
      resolveSaleClient(saleRow.entity_id ?? null, saleRow.client_id ?? null),
    ]);
  }

  // Guarda comum aos dois modos: o portal injeta os dados, mas a regra de não
  // emitir um documento sem número é a mesma.
  if (!sale.proforma_number) {
    throw new Error(
      'Esta venda direta ainda não tem proforma. O número é emitido quando o cliente aceita a venda.',
    );
  }

  const element = React.createElement(ProformaPDFDocument, { sale, lines, company, client });
  const blob = await (pdf as any)(element).toBlob();

  const fileName = `Proforma_${sale.proforma_number}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName };
}

/**
 * Descarrega um blob já gerado.
 *
 * Cópia deliberada de `downloadBlob` (generateProposalPdfBlob.ts:265-274), com
 * o mesmo comportamento linha a linha. Importá-lo de lá arrastava, para
 * qualquer chunk que tocasse na proforma, todo o gerador de propostas —
 * pdf-lib, generateQuotePdfBlob, os templates de orçamento e as respetivas
 * dependências — que nada têm a ver com a venda direta (e menos ainda com o
 * portal do cliente). São 8 linhas de DOM sem lógica de negócio; o custo da
 * duplicação é menor do que o do acoplamento.
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
