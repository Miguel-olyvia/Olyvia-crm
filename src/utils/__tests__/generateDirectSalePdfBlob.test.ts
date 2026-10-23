import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuotePDFDocument } from '@/components/QuotePDFDocument';

// PDF da venda direta: totais a partir do cabeçalho gravado, rótulos próprios
// no QuotePDFDocument (sem mexer nos de orçamento/proposta) e geração completa
// sem rebentar, com o Supabase simulado.

const tables: Record<string, any> = {};
const selects: Record<string, string[]> = {};

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b: any = {
      select: (cols: string) => { (selects[table] ||= []).push(cols); return b; },
      eq: () => b,
      order: () => b,
      maybeSingle: () => Promise.resolve({ data: Array.isArray(tables[table]) ? tables[table][0] : tables[table], error: null }),
      then: (ok: any, err: any) => Promise.resolve({ data: tables[table], error: null }).then(ok, err),
    };
    return b;
  };
  return { supabase: { from: (t: string) => builder(t), auth: { getUser: async () => ({ data: { user: null } }) } } };
});

vi.mock('@/utils/generateProformaPdfBlob', () => ({
  resolveEmitterCompany: vi.fn(async () => ({ name: 'Empresa X', vat: '500000000', address: 'Rua A, 1, 1000-001, Lisboa', email: 'a@x.pt', phone: '210000000', logo_url: null })),
}));
vi.mock('@/utils/quotePdfClient', () => ({
  resolveQuotePdfClient: vi.fn(async () => ({ entityId: 'e1', client: { display_name: 'Cliente Y', company_name: '', vat: '123456789', email: 'c@y.pt', phone: '910000000', client_addresses: [{ street: 'Rua B', city: 'Porto', is_primary: true }] } })),
}));
vi.mock('@/utils/quotePdfCommercialUser', () => ({
  resolveQuotePdfCommercialUser: vi.fn(async () => ({ id: 'u1', name: 'Comercial Z', email: 'z@x.pt', phone: '' })),
}));
vi.mock('@/utils/quotePdfTemplate', async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    fetchDefaultQuotePdfTemplate: vi.fn(async () => ({
      primary_color: '#111111',
      sections: [
        { id: 'header', type: 'header', visible: true, settings: { customTitle: 'ORÇAMENTO' } },
        { id: 'client_info', type: 'client_info', visible: true, settings: { sectionLabel: 'CLIENTE' } },
        { id: 'notes', type: 'notes', visible: true, settings: { sectionLabel: 'NOTAS' } },
        { id: 'quote_items', type: 'quote_items', visible: true, settings: { sectionLabel: 'DETALHES DO ORÇAMENTO' } },
        { id: 'validity', type: 'validity', visible: true, settings: {} },
        { id: 'footer', type: 'footer', visible: true, settings: {} },
      ],
    })),
    fetchDefaultProposalBrandingTemplate: vi.fn(async () => ({
      primary_color: '#8b5cf6',
      footer_text: 'Rodapé da proposta',
      sections: [{ id: 'header', type: 'header', settings: { customTitle: 'PROPOSTA' } }],
    })),
  };
});

import { buildDirectSaleTotals, generateDirectSalePdfBlob, type DirectSalePdfLine } from '@/utils/generateDirectSalePdfBlob';

const line = (over: Partial<DirectSalePdfLine>): DirectSalePdfLine => ({
  id: 'l', descricao_snapshot: 'Artigo', qt: 1, unidade: 'UN', retail_price_unit: 10, iva_percent: 23,
  total_sem_iva: 10, ordem: 1, products: null, services: null, ...over,
});

/** Todo o texto de uma árvore de elementos React (componentes-função expandidos). */
function collectText(node: any, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (typeof node.type === 'function') return collectText(node.type(node.props), out);
  return collectText(node.props?.children, out);
}
const render = (props: any) => collectText(QuotePDFDocument(props)).join('|');

const baseProps = {
  quote: { quote_number: 'VD-2026-0001', created_at: '2026-09-01T10:00:00Z', estado: 'enviada', validade_dias: 30 },
  company: { name: 'Empresa X' },
  client: { display_name: 'Cliente Y' },
  lines: [line({})],
  proposalTemplate: {
    sections: [
      { id: 'header', type: 'header', visible: true, settings: { customTitle: 'PROPOSTA' } },
      { id: 'quote_items', type: 'quote_items', visible: true, settings: { sectionLabel: 'DETALHES DO ORÇAMENTO' } },
      { id: 'validity', type: 'validity', visible: true, settings: {} },
      { id: 'value', type: 'value', visible: true, settings: { sectionLabel: 'Valor da Proposta' } },
    ],
  },
};

describe('buildDirectSaleTotals', () => {
  it('usa o subtotal/total gravados e fecha o IVA por taxa com total − subtotal', () => {
    // Total gravado com 1 cêntimo a mais do que o IVA por taxa sobre a soma (o
    // editor arredonda linha a linha): o ajuste vai para a taxa de maior base.
    const lines = [line({ total_sem_iva: 100, iva_percent: 23 }), line({ total_sem_iva: 50, iva_percent: 6 })];
    const t = buildDirectSaleTotals({ subtotal: 150, total: 176.01 }, lines);
    expect(t.subtotalWithFees).toBe(150);
    expect(t.total).toBe(176.01);
    expect(t.totalIva).toBe(26.01);
    expect(t.vatBreakdown.reduce((s, v) => s + v.vat, 0)).toBeCloseTo(26.01, 10);
    expect(t.vatBreakdown.find((v) => v.rate === 23)!.vat).toBe(23.01);
    expect(t.discountValue).toBe(0);
    expect(t.fees).toEqual([]);
  });

  it('sem totais gravados cai para a soma das linhas', () => {
    const t = buildDirectSaleTotals({ subtotal: null, total: null }, [line({ total_sem_iva: 100, iva_percent: 23 })]);
    expect(t.subtotalWithFees).toBe(100);
    expect(t.total).toBe(123);
  });
});

describe('QuotePDFDocument — contexto de venda direta', () => {
  it('venda direta: título, rótulos e validade por data', () => {
    const text = render({ ...baseProps, documentContext: { kind: 'direct_sale', number: 'VD-2026-0001', validUntil: '2026-10-15' } });
    expect(text).toContain('VENDA DIRETA');
    expect(text).not.toContain('PROPOSTA');
    expect(text).toContain('DETALHES DA VENDA DIRETA');
    expect(text).toContain('VALOR DA VENDA DIRETA');
    expect(text).toContain('15/10/2026');
    expect(text).not.toContain('Este orçamento é válido');
  });

  it('venda direta sem valid_until: sem bloco de validade', () => {
    const text = render({ ...baseProps, documentContext: { kind: 'direct_sale', number: 'VD-2026-0001', validUntil: null } });
    expect(text).not.toContain('VALIDADE');
    expect(text).not.toContain('válid');
  });

  it('proposta e orçamento continuam como estavam', () => {
    const proposal = render({ ...baseProps, documentContext: { kind: 'proposal', number: 'P-1' } });
    expect(proposal).toContain('PROPOSTA');
    expect(proposal).toContain('DETALHES DO ORÇAMENTO');
    expect(proposal).toContain('Valor da Proposta');
    expect(proposal).toContain('P-1');
    expect(proposal).toContain('Este orçamento é válido por ');
    const quote = render({ ...baseProps, proposalTemplate: null });
    expect(quote).toContain('ORÇAMENTO');
    expect(quote).toContain('DETALHES DO ORÇAMENTO');
  });
});

describe('generateDirectSalePdfBlob', () => {
  beforeEach(() => {
    Object.keys(selects).forEach((k) => delete selects[k]);
    tables.direct_sales = {
      id: 's1', organization_id: 'o1', entity_id: 'e1', client_id: null, sale_number: 'VD-2026-0007',
      title: 'Venda', status: 'rascunho', client_notes: 'Nota para o cliente', subtotal: 110, total: 135.3,
      valid_until: '2026-10-15', assigned_to: 'u1', created_by: 'u1', created_at: '2026-09-20T10:00:00Z',
    };
    tables.direct_sale_lines = [
      { id: 'l1', descricao_snapshot: 'Torneira', qt: 2, unidade: 'UN', retail_price_unit: 50, iva_percent: 23, total_sem_iva: 90, ordem: 1, products: { sku: 'TOR-1' }, services: null },
      { id: 'l2', descricao_snapshot: 'Montagem', qt: 1, unidade: 'H', retail_price_unit: 20, iva_percent: 23, total_sem_iva: 20, ordem: 2, products: null, services: { sku: 'SRV-1' } },
    ];
    tables.anew_organizations = { metadata: { brand_color: '#123456' } };
  });

  it('gera um PDF sem rebentar e nunca pede colunas internas', async () => {
    const { blob, fileName } = await generateDirectSalePdfBlob('s1');
    expect(blob.size).toBeGreaterThan(1000);
    expect(fileName).toMatch(/^VendaDireta_VD-2026-0007_\d{4}-\d{2}-\d{2}\.pdf$/);
    const all = Object.values(selects).flat().join(',');
    expect(all).not.toMatch(/\bnotes\b(?<!client_notes)/);
    expect(all).not.toMatch(/cost_price|margem_percent|proforma|invoice/);
  }, 30000);
});
