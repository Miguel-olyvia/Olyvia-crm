import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// Comprovativo de receção de uma guia do fornecedor: modelo puro (estados,
// divergências, embalagens, revertidas) e geração completa com o Supabase
// simulado (RLS a falhar não rebenta; cancelada recusada; várias páginas).

const tables: Record<string, any> = {};
const failing = new Set<string>();
let rpcData: any = null;

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let byAuth = false;
    const result = () =>
      failing.has(table)
        ? { data: null, error: { code: '42501', message: 'RLS' } }
        : { data: tables[table] ?? [], error: null };
    const b: any = {
      select: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      eq: (col: string) => {
        if (col === 'auth_user_id') byAuth = true;
        return b;
      },
      maybeSingle: () => {
        const r = result();
        if (r.error) return Promise.resolve(r);
        const rows = Array.isArray(r.data) ? r.data : [r.data];
        const row = byAuth ? rows.find((x: any) => x.auth_user_id === 'auth-1') : rows[0];
        return Promise.resolve({ data: row ?? null, error: null });
      },
      then: (ok: any, err: any) => Promise.resolve(result()).then(ok, err),
    };
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: async () => ({ data: rpcData, error: null }),
      auth: { getUser: async () => ({ data: { user: { id: 'auth-1', email: 'emissor@x.pt' } } }) },
    },
  };
});

vi.mock('@/utils/generateProformaPdfBlob', () => ({
  resolveEmitterCompany: vi.fn(async () => ({
    name: 'Empresa X, Lda',
    vat: '500000000',
    address: 'Rua A, 1, 1000-001, Lisboa',
    email: 'geral@x.pt',
    phone: '210000000',
    logo_url: null,
  })),
  downloadBlob: vi.fn(),
}));

import {
  buildReceiptProofModel,
  generateReceiptProofPdf,
  receiptProofFileName,
  renderReceiptProofBlob,
  type ReceiptProofNote,
  type ReceiptProofRaw,
} from '@/utils/generateReceiptProofPdf';
import { ReceiptProofPDFDocument, RECEIPT_PROOF_NOTICE, splitLongWord } from '@/components/receiving/ReceiptProofPDFDocument';

/** Todo o texto de uma árvore de elementos React (componentes-função expandidos). */
function collectText(node: any, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return out;
  }
  if (typeof node.type === 'function') return collectText(node.type(node.props), out);
  return collectText(node.props?.children, out);
}
const renderText = (model: any) => collectText(ReceiptProofPDFDocument({ model })).join('|');

const product = (over: Record<string, any>) => ({
  product_id: 'p1',
  name: 'Torneira',
  sku: 'TOR-1',
  announced_units: 10,
  received_units: 10,
  missing_units: 0,
  excess_units: 0,
  on_order: true,
  status: 'ok',
  divergent: false,
  ...over,
});

const receipt = (over: Record<string, any>) => ({
  id: 'r1',
  purchase_order_id: 'po1',
  order_number: 'PO-2026-0001',
  purchase_order_item_id: 'poi1',
  product_id: 'p1',
  product_name: 'Torneira',
  quantity: 10,
  units_per_uom: 1,
  units: 10,
  units_to_order: 0,
  units_to_stock: 10,
  warehouse_id: 'w1',
  received_at: '2026-10-06T09:15:00Z',
  received_by: 'u1',
  reverted: false,
  reverted_at: null,
  revert_reason: null,
  ...over,
});

function closedNote(): ReceiptProofNote {
  const products = [
    product({ product_id: 'p1', name: 'Torneira', sku: 'TOR-1', announced_units: 20, received_units: 20, status: 'ok' }),
    product({ product_id: 'p2', name: 'Lavatório', sku: 'LAV-1', announced_units: 5, received_units: 3, missing_units: 2, status: 'falta', divergent: true }),
    product({ product_id: 'p3', name: 'Sifão', sku: 'SIF-1', announced_units: 4, received_units: 6, excess_units: 2, status: 'excesso', divergent: true }),
    product({ product_id: 'p4', name: 'Válvula', sku: 'VAL-1', announced_units: 0, received_units: 1, status: 'nao_anunciado', divergent: true }),
  ];
  return {
    id: 'n1',
    organization_id: 'o1',
    supplier_id: 's1',
    supplier_name: 'Fornecedor Y',
    note_number: 'GR 2026/123',
    document_date: '2026-10-05',
    notes: 'Paletes com filme rasgado.',
    status: 'closed',
    created_at: '2026-10-06T08:00:00Z',
    updated_at: '2026-10-06T11:00:00Z',
    created_by: 'u1',
    closed_at: '2026-10-06T11:00:00Z',
    closed_by: 'u2',
    close_notes: 'Fornecedor avisado da falta.',
    cancelled_at: null,
    cancel_reason: null,
    history: [],
    purchase_orders: [
      { purchase_order_id: 'po1', order_number: 'PO-2026-0001', status: 'partial', deleted: false, expected_delivery: null },
      { purchase_order_id: 'po2', order_number: 'PO-2026-0002', status: 'cancelled', deleted: false, expected_delivery: null },
      { purchase_order_id: 'po3', order_number: 'PO-2026-0003', status: 'draft', deleted: true, expected_delivery: null },
    ],
    lines: [
      { id: 'l1', position: 1, product_id: 'p1', product_name: 'Torneira', sku: 'TOR-1', uom_id: 'pk10', uom_code: 'PK10', units_per_uom: 10, quantity: 2, units: 20, purchase_order_item_id: 'poi1', order_number: 'PO-2026-0001', description: null },
      { id: 'l2', position: 2, product_id: 'p2', product_name: 'Lavatório', sku: 'LAV-1', uom_id: 'un', uom_code: 'UN', units_per_uom: 1, quantity: 5, units: 5, purchase_order_item_id: 'poi2', order_number: 'PO-2026-0001', description: null },
      { id: 'l3', position: 3, product_id: 'p3', product_name: 'Sifão', sku: 'SIF-1', uom_id: 'un', uom_code: 'UN', units_per_uom: 1, quantity: 4, units: 4, purchase_order_item_id: null, order_number: null, description: null },
    ],
    summary: {
      has_lines: true,
      products: products as any,
      receipts: [
        receipt({ id: 'r1', product_id: 'p1', units: 20, quantity: 20, received_at: '2026-10-06T09:15:00Z', received_by: 'u1' }),
        receipt({ id: 'r2', product_id: 'p2', units: 3, quantity: 3, received_at: '2026-10-06T10:40:00Z', received_by: 'u1' }),
        receipt({ id: 'r3', product_id: 'p3', units: 6, quantity: 6, received_at: '2026-10-06T10:00:00Z', received_by: 'u1' }),
        receipt({ id: 'r4', product_id: 'p4', units: 1, quantity: 1, received_at: '2026-10-06T10:05:00Z', received_by: 'u1' }),
        receipt({ id: 'r5', product_id: 'p2', units: 2, quantity: 2, received_at: '2026-10-06T10:10:00Z', received_by: 'u3', warehouse_id: 'w2', reverted: true, reverted_at: '2026-10-06T10:30:00Z', revert_reason: 'Engano' }),
      ],
      totals: {
        announced_units: 29,
        received_units: 30,
        missing_units: 2,
        excess_units: 2,
        products: 4,
        divergences: 3,
        active_receipts: 4,
        reverted_receipts: 1,
      },
      has_divergences: true,
    },
    changed_since_close: true,
  };
}

function raw(note: ReceiptProofNote, over: Partial<ReceiptProofRaw> = {}): ReceiptProofRaw {
  return {
    note,
    company: { name: 'Empresa X, Lda', vat: '500000000', address: 'Rua A, 1, 1000-001, Lisboa' },
    supplierTaxId: '501234567',
    warehouses: { w1: 'Armazém Central', w2: 'Armazém Norte' },
    users: { u1: 'Ana Recetora', u2: 'Bruno Chefe', u3: 'Carla Outra' },
    issuerName: 'Emissor Z',
    productUnits: { p1: 'UN', p2: 'UN', p3: 'UN', p4: 'UN' },
    supplierSkus: { p2: 'FORN-LAV-99' },
    now: new Date(2026, 9, 7, 14, 30),
    ...over,
  };
}

describe('buildReceiptProofModel', () => {
  it('guia fechada com divergências: diferenças, notas, revertidas excluídas', () => {
    const m = buildReceiptProofModel(raw(closedNote()));
    expect(m.provisional).toBe(false);
    expect(m.statusLabel).toBe('Fechada');
    expect(m.noteLabel).toBe('GR 2026/123');
    expect(m.documentDate).toBe('05/10/2026');
    expect(m.issuedAt).toBe('07/10/2026 14:30');
    expect(m.issuedBy).toBe('Emissor Z');
    expect(m.supplierName).toBe('Fornecedor Y');
    expect(m.supplierVat).toBe('501234567');
    expect(m.rows.map((r) => r.difference)).toEqual(['OK', 'Falta 2', '+2 a mais', 'Não consta da guia']);
    expect(m.rows[1].supplierRef).toBe('FORN-LAV-99');
    expect(m.orders).toEqual(['PO-2026-0001', 'PO-2026-0002 (cancelada)', 'PO-2026-0003 (apagada)']);
    // Receção revertida (u3, w2) não entra em armazém/recetor.
    expect(m.warehouses).toBe('Armazém Central');
    expect(m.receivedBy).toBe('Ana Recetora');
    expect(m.signatureReceiverName).toBe('Ana Recetora');
    expect(m.period).toMatch(/^06\/10\/2026 \d{2}:\d{2} a 06\/10\/2026 \d{2}:\d{2}$/);
    expect(m.remarks).toEqual([
      'Lavatório (LAV-1): Falta 2',
      'Sifão (SIF-1): +2 a mais',
      'Válvula (VAL-1): Não consta da guia',
      expect.stringMatching(/^Fechada em 06\/10\/2026 \d{2}:\d{2} por Bruno Chefe: Fornecedor avisado da falta\.$/),
      'Notas da guia: Paletes com filme rasgado.',
      'O recebido mudou depois do fecho; valores atuais.',
      '1 receção revertida não conta neste comprovativo.',
    ]);
    expect(m.notices).toEqual([]);

    const text = renderText(m);
    expect(text).toContain('COMPROVATIVO DE RECEÇÃO');
    expect(text).not.toContain('PROVISÓRIO');
    expect(text).toContain('DIVERGÊNCIAS E NOTAS');
    expect(text).toContain(RECEIPT_PROOF_NOTICE);
    expect(text).toContain('Entregue por — motorista');
    expect(text).toContain('Matrícula');
  });

  it('guia aberta: provisório no título, faixa e rodapé', () => {
    const note = { ...closedNote(), status: 'open' as const, closed_at: null, closed_by: null, close_notes: null, changed_since_close: false };
    const m = buildReceiptProofModel(raw(note));
    expect(m.provisional).toBe(true);
    expect(m.statusLabel).toBe('Aberta');
    expect(m.remarks.some((r) => r.startsWith('Fechada em'))).toBe(false);
    const text = renderText(m);
    expect(text.match(/PROVISÓRIO — guia em aberto/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('guia sem linhas: Anunciado/Diferença "—" e aviso', () => {
    const note = closedNote();
    note.lines = [];
    note.summary = {
      ...note.summary!,
      has_lines: false,
      products: [product({ announced_units: 0, received_units: 7, status: 'recebido', divergent: false })] as any,
      receipts: [receipt({ units: 7 })],
      totals: { ...note.summary!.totals, announced_units: 0, received_units: 7, missing_units: 0, excess_units: 0, products: 1, divergences: 0, active_receipts: 1, reverted_receipts: 0 },
      has_divergences: false,
    };
    note.changed_since_close = false;
    const m = buildReceiptProofModel(raw(note));
    expect(m.hasLines).toBe(false);
    expect(m.rows[0]).toMatchObject({ announced: '—', received: '7', difference: '—' });
    expect(m.notices).toContain('A guia não tem linhas anunciadas: lista-se apenas o recebido.');
    expect(m.totals.map((t) => t.label)).toEqual(['Recebido', 'Produtos']);
  });

  it('sem receções ativas: "Ainda nada recebido com esta guia."; recetor em branco', () => {
    const note = closedNote();
    note.summary = { ...note.summary!, receipts: [receipt({ reverted: true }), receipt({ id: 'r9', reverted: true })] };
    const m = buildReceiptProofModel(raw(note));
    expect(m.notices).toContain('Ainda nada recebido com esta guia.');
    expect(m.receivedBy).toBe('—');
    expect(m.warehouses).toBe('—');
    expect(m.period).toBe('—');
    expect(m.signatureReceiverName).toBe('');
    expect(m.remarks).toContain('2 receções revertidas não contam neste comprovativo.');
  });

  it('embalagem PK10: sublinha "2 × PK10" no produto', () => {
    const m = buildReceiptProofModel(raw(closedNote()));
    expect(m.rows[0].packaging).toBe('2 × PK10');
    expect(m.rows[1].packaging).toBeNull();
    expect(renderText(m)).toContain('2 × PK10');
  });

  it('document_date null e leituras falhadas → "—"', () => {
    const note = { ...closedNote(), document_date: null };
    const m = buildReceiptProofModel(raw(note, { supplierTaxId: null, users: {}, warehouses: {}, productUnits: {}, issuerName: null }));
    expect(m.documentDate).toBe('—');
    expect(m.supplierVat).toBe('—');
    expect(m.issuedBy).toBe('—');
    expect(m.receivedBy).toBe('—');
    expect(m.rows[0].unit).toBe('—');
    expect(m.remarks.find((r) => r.startsWith('Fechada em'))).toMatch(/ por —: /);
  });

  it('dois recetores: lista ambos e a assinatura fica em branco', () => {
    const note = closedNote();
    note.summary!.receipts[1] = receipt({ id: 'r2', received_by: 'u2', warehouse_id: 'w2' });
    const m = buildReceiptProofModel(raw(note));
    expect(m.receivedBy).toBe('Ana Recetora, Bruno Chefe');
    expect(m.warehouses).toBe('Armazém Central, Armazém Norte');
    expect(m.signatureReceiverName).toBe('');
  });

  it('parte tokens compridos sem espaços em pedaços de 12 (só no layout)', () => {
    expect(splitLongWord('curto')).toEqual(['curto']);
    expect(splitLongWord('A'.repeat(24))).toEqual(['A'.repeat(24)]);
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
    expect(splitLongWord(long)).toEqual(['ABCDEFGHIJKL', 'MNOPQRSTUVWX', 'YZ0123']);
    expect(splitLongWord(long).join('')).toBe(long);
    // O modelo guarda o texto intacto (sem U+00AD).
    const note = closedNote();
    note.summary!.products[0] = { ...note.summary!.products[0], sku: long };
    const m = buildReceiptProofModel(raw(note));
    expect(m.rows[0].ref).toBe(long);
  });

  it('nome do ficheiro sanitizado', () => {
    expect(receiptProofFileName('Guia teste 3', false)).toBe('Comprovativo-rececao-Guia-teste-3.pdf');
    expect(receiptProofFileName('GR 2026/12:a', true)).toBe('Comprovativo-rececao-GR-2026-12-a-provisorio.pdf');
  });
});

/**
 * Grava um PDF de exemplo quando a variável de ambiente está definida. Sem
 * tipos de node no tsconfig.app: import dinâmico e process via globalThis.
 */
async function writeSample(envVar: string, bytes: Uint8Array) {
  const out = (globalThis as any).process?.env?.[envVar];
  if (!out) return;
  const fs: any = await import(/* @vite-ignore */ ['node', 'fs'].join(':'));
  fs.writeFileSync(out, bytes);
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof (blob as any).arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

describe('generateReceiptProofPdf', () => {
  beforeEach(() => {
    failing.clear();
    Object.keys(tables).forEach((k) => delete tables[k]);
    tables.suppliers = [{ tax_id: '501234567' }];
    tables.warehouses = [{ id: 'w1', name: 'Armazém Central' }];
    tables.anew_users = [
      { id: 'u1', name: 'Ana Recetora', auth_user_id: 'auth-x' },
      { id: 'u2', name: 'Bruno Chefe', auth_user_id: 'auth-1' },
    ];
    tables.products = [{ id: 'p1', uom: { code: 'UN' } }];
    tables.purchase_order_items = [{ id: 'poi2', product_id: 'p2', supplier_sku: 'FORN-LAV-99' }];
  });

  it('guia fechada: gera PDF com nome sanitizado', async () => {
    rpcData = { ...closedNote(), note_number: 'Guia teste 3' };
    const { blob, fileName } = await generateReceiptProofPdf('n1');
    expect(fileName).toBe('Comprovativo-rececao-Guia-teste-3.pdf');
    expect(blob.size).toBeGreaterThan(1000);
    await writeSample('RECEIPT_PROOF_SAMPLE', await blobBytes(blob));
  }, 30000);

  it('guia aberta: sufixo -provisorio', async () => {
    rpcData = { ...closedNote(), status: 'open', note_number: 'GR-5' };
    const { fileName } = await generateReceiptProofPdf('n1');
    expect(fileName).toBe('Comprovativo-rececao-GR-5-provisorio.pdf');
  }, 30000);

  it('leituras recusadas pela RLS não rebentam', async () => {
    ['suppliers', 'warehouses', 'anew_users', 'products', 'purchase_order_items'].forEach((t) => failing.add(t));
    rpcData = closedNote();
    const { blob } = await generateReceiptProofPdf('n1');
    expect(blob.size).toBeGreaterThan(1000);
  }, 30000);

  it('guia cancelada: recusa', async () => {
    rpcData = { ...closedNote(), status: 'cancelled' };
    await expect(generateReceiptProofPdf('n1')).rejects.toThrow('Guia cancelada.');
  });

  it('150 produtos: mais de uma página', async () => {
    const note = closedNote();
    const products = Array.from({ length: 150 }, (_, i) =>
      product({
        product_id: `px${i}`,
        name: `Produto de teste número ${i + 1} com descrição comprida`,
        sku: i === 0 ? 'SKU-MUITO-COMPRIDO-SEM-ESPACOS-0123456789' : `SKU-${i + 1}`,
        announced_units: 3,
        received_units: i % 7 === 0 ? 2 : 3,
        missing_units: i % 7 === 0 ? 1 : 0,
        status: i % 7 === 0 ? 'falta' : 'ok',
        divergent: i % 7 === 0,
      }),
    );
    note.summary = {
      ...note.summary!,
      products: products as any,
      totals: { ...note.summary!.totals, announced_units: 450, received_units: 428, missing_units: 22, excess_units: 0, products: 150, divergences: 22 },
    };
    const blob = await renderReceiptProofBlob(buildReceiptProofModel(raw(note)));
    const bytes = await blobBytes(blob);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    await writeSample('RECEIPT_PROOF_SAMPLE_BIG', bytes);
  }, 60000);
});
