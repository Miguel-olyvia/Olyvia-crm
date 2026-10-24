import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/integrations/supabase/client';
import { downloadBlob, resolveEmitterCompany } from '@/utils/generateProformaPdfBlob';
import {
  ReceiptProofPDFDocument,
  type ReceiptProofCompany,
  type ReceiptProofModel,
  type ReceiptProofRow,
} from '@/components/receiving/ReceiptProofPDFDocument';
import {
  fetchDeliveryNote,
  noteErrorMessage,
  noteLabel,
  type DeliveryNoteFull,
  type DeliveryNoteProduct,
  type DeliveryNoteReceipt,
} from '@/components/receiving/deliveryNotes';

// Comprovativo de receção de uma guia do fornecedor (Fase 2 — fatia 3).
//
// Só leitura: relê a guia pela RPC (rpc_delivery_note_get, que já traz o
// resumo de fn_delivery_note_summary) e completa com leituras diretas que a
// RLS pode recusar — nesse caso o campo sai "—", o documento sai na mesma.
// Quantidades em unidades base (summary.products), nunca recalculadas aqui.
// Receções revertidas não contam (o resumo já as exclui dos totais).

const DASH = '—';

/** Campos que o RPC devolve mas que os tipos de deliveryNotes.ts ainda não têm. */
type ReceiptExt = DeliveryNoteReceipt & { received_by?: string | null };
export type ReceiptProofNote = Omit<DeliveryNoteFull, 'summary'> & {
  created_by?: string | null;
  closed_by?: string | null;
  summary: (Omit<NonNullable<DeliveryNoteFull['summary']>, 'receipts'> & { receipts: ReceiptExt[] }) | null;
};

/** Tudo o que o modelo precisa, já lido. Mapas vazios = leitura falhou/sem dados. */
export interface ReceiptProofRaw {
  note: ReceiptProofNote;
  company: ReceiptProofCompany | null;
  supplierTaxId: string | null;
  /** warehouse_id → nome */
  warehouses: Record<string, string>;
  /** anew_users.id → nome */
  users: Record<string, string>;
  issuerName: string | null;
  /** product_id → código da unidade base */
  productUnits: Record<string, string>;
  /** product_id → referência do fornecedor */
  supplierSkus: Record<string, string>;
  now: Date;
}

// ── Formatadores manuais (sem Intl: ver nota em ProformaPDFDocument.tsx) ──

/** Até 4 casas, vírgula decimal, milhares com ponto. */
export function fmtQtyPdf(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const negative = safe < 0;
  const [intPart, decPart = ''] = Math.abs(safe).toFixed(4).split('.');
  const dec = decPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

const pad = (x: number) => String(x).padStart(2, '0');

/** 'YYYY-MM-DD…' → 'DD/MM/AAAA' sem passar por Date (sem desvios de fuso). */
function fmtDayPdf(s: string | null | undefined): string {
  if (!s) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : DASH;
}

/** Data/hora local 'DD/MM/AAAA HH:MM'. */
function fmtDateTimePdf(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Tokens compridos sem espaços (SKUs, refs): o modelo guarda o texto intacto e
// é o documento que os parte em pedaços de 12 no layout (splitLongWord em
// ReceiptProofPDFDocument.tsx). Inserir U+00AD aqui desalinhava o texto no
// @react-pdf 4 (o wrapWords tira-o da string mas os offsets ficam com ele).
const txt = (s: string | null | undefined) => (s && s.trim() ? s.trim() : DASH);

function differenceLabel(p: DeliveryNoteProduct): string {
  switch (p.status) {
    case 'ok':
      return 'OK';
    case 'falta':
      return `Falta ${fmtQtyPdf(p.missing_units)}`;
    case 'excesso':
      return `+${fmtQtyPdf(p.excess_units)} a mais`;
    case 'nao_anunciado':
      return 'Não consta da guia';
    case 'nao_encomendado':
      return `Falta ${fmtQtyPdf(p.missing_units)} (não encomendado)`;
    default:
      // 'recebido' (guia sem linhas): não há termo de comparação.
      return DASH;
  }
}

/** Modelo do PDF. Puro: sem leituras, sem relógio (o `now` vem de fora). */
export function buildReceiptProofModel(raw: ReceiptProofRaw): ReceiptProofModel {
  const { note } = raw;
  const summary = note.summary;
  const hasLines = !!summary?.has_lines;
  const products = summary?.products ?? [];
  const active = (summary?.receipts ?? []).filter((r) => !r.reverted);
  const revertedCount = (summary?.receipts ?? []).length - active.length;
  const provisional = note.status === 'open';
  const userName = (id: string | null | undefined) => (id && raw.users[id] ? raw.users[id] : null);

  // Embalagens anunciadas (linhas com unidade ≠ base): "2 × PK10".
  const packagingByProduct = new Map<string, string[]>();
  for (const l of note.lines) {
    if (Number(l.units_per_uom) === 1 || !l.product_id) continue;
    const label = `${fmtQtyPdf(l.quantity)} × ${l.uom_code || `${fmtQtyPdf(l.units_per_uom)} un`}`;
    const list = packagingByProduct.get(l.product_id) ?? [];
    list.push(label);
    packagingByProduct.set(l.product_id, list);
  }

  const rows: ReceiptProofRow[] = products.map((p, i) => {
    const supplierRef = raw.supplierSkus[p.product_id];
    return {
      key: `${p.product_id ?? 'p'}-${i}`,
      ref: txt(p.sku),
      supplierRef: supplierRef && supplierRef !== p.sku ? supplierRef : null,
      description: txt(p.name),
      unit: raw.productUnits[p.product_id] || DASH,
      packaging: packagingByProduct.get(p.product_id)?.join(', ') ?? null,
      announced: hasLines ? fmtQtyPdf(p.announced_units) : DASH,
      received: fmtQtyPdf(p.received_units),
      difference: hasLines ? differenceLabel(p) : DASH,
      divergent: !!p.divergent,
    };
  });

  const t = summary?.totals;
  const totals: ReceiptProofModel['totals'] = [];
  if (t) {
    if (hasLines) totals.push({ label: 'Anunciado', value: fmtQtyPdf(t.announced_units) });
    totals.push({ label: 'Recebido', value: fmtQtyPdf(t.received_units) });
    if (hasLines) {
      totals.push({ label: 'Em falta', value: fmtQtyPdf(t.missing_units) });
      totals.push({ label: 'A mais', value: fmtQtyPdf(t.excess_units) });
    }
    totals.push({ label: 'Produtos', value: String(t.products ?? products.length) });
    if (hasLines) totals.push({ label: 'Com divergência', value: String(t.divergences ?? 0) });
  }

  const notices: string[] = [];
  if (active.length === 0) notices.push('Ainda nada recebido com esta guia.');
  if (!hasLines) notices.push('A guia não tem linhas anunciadas: lista-se apenas o recebido.');

  const remarks: string[] = [];
  for (const p of products) {
    if (!p.divergent) continue;
    const ref = p.sku ? ` (${p.sku})` : '';
    remarks.push(`${p.name ?? 'Produto'}${ref}: ${differenceLabel(p)}`);
  }
  if (note.status === 'closed') {
    const by = userName(note.closed_by) ?? DASH;
    remarks.push(`Fechada em ${fmtDateTimePdf(note.closed_at)} por ${by}${note.close_notes ? `: ${note.close_notes}` : ''}`);
  }
  if (note.notes && note.notes.trim()) remarks.push(`Notas da guia: ${note.notes.trim()}`);
  if (note.changed_since_close) remarks.push('O recebido mudou depois do fecho; valores atuais.');
  if (revertedCount > 0) {
    remarks.push(
      revertedCount === 1
        ? '1 receção revertida não conta neste comprovativo.'
        : `${revertedCount} receções revertidas não contam neste comprovativo.`,
    );
  }

  // Receção: armazéns, recetores e período (só receções ativas).
  const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
  const whIds = uniq(active.map((r) => r.warehouse_id).filter((x): x is string => !!x));
  const whNames = whIds.map((id) => raw.warehouses[id]).filter(Boolean);
  const receiverIds = uniq(active.map((r) => r.received_by).filter((x): x is string => !!x));
  const receiverNames = receiverIds.map((id) => raw.users[id]).filter(Boolean);
  const times = active
    .map((r) => new Date(r.received_at).getTime())
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  const first = times.length ? fmtDateTimePdf(new Date(times[0])) : null;
  const last = times.length ? fmtDateTimePdf(new Date(times[times.length - 1])) : null;

  const company = raw.company ?? { name: null, vat: null, address: null };

  return {
    provisional,
    company: {
      ...company,
      name: company.name || null,
      address: company.address || null,
    },
    noteLabel: noteLabel(note.note_number),
    documentDate: fmtDayPdf(note.document_date),
    statusLabel: note.status === 'open' ? 'Aberta' : note.status === 'closed' ? 'Fechada' : 'Cancelada',
    issuedAt: fmtDateTimePdf(raw.now),
    issuedBy: txt(raw.issuerName),
    supplierName: txt(note.supplier_name),
    supplierVat: txt(raw.supplierTaxId),
    // Armazém por ler (RLS) fica "—" no seu lugar; todos por ler = "—".
    warehouses: whNames.length ? txt(whIds.map((id) => raw.warehouses[id] || DASH).join(', ')) : DASH,
    receivedBy: receiverNames.length ? txt(receiverNames.join(', ')) : DASH,
    period: !first ? DASH : first === last ? first : `${first} a ${last}`,
    orders: note.purchase_orders.map((p) =>
      `${p.order_number ?? 'PO'}${p.deleted ? ' (apagada)' : p.status === 'cancelled' ? ' (cancelada)' : ''}`,
    ),
    hasLines,
    rows,
    totals,
    notices,
    remarks,
    signatureReceiverName: receiverIds.length === 1 && receiverNames.length === 1 ? receiverNames[0] : '',
  };
}

/** Nome do ficheiro: nº da guia sanitizado; "-provisorio" se a guia está aberta. */
export function receiptProofFileName(noteNumber: string | null | undefined, provisional: boolean): string {
  const safe = (noteNumber ?? '').trim().replace(/[\\/:*?"<>|\s]+/g, '-') || 'guia';
  return `Comprovativo-rececao-${safe}${provisional ? '-provisorio' : ''}.pdf`;
}

// ── Leituras (todas toleram falha: devolvem vazio/null) ──

const IN_CHUNK = 100;

/** `.in()` em blocos (URLs do PostgREST com centenas de ids ficam compridas demais). */
async function selectIn(table: string, cols: string, column: string, ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const { data, error } = await (supabase as any).from(table).select(cols).in(column, chunk);
        if (error) return [];
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('[generateReceiptProofPdf] leitura falhou:', error);
    return fallback;
  }
}

async function readIssuer(): Promise<{ id: string | null; name: string | null }> {
  const { data } = await supabase.auth.getUser();
  const authUser = data?.user;
  if (!authUser) return { id: null, name: null };
  const { data: u } = await (supabase as any)
    .from('anew_users')
    .select('id, name')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  return { id: u?.id ?? null, name: u?.name || authUser.email || null };
}

const uniqIds = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => !!x)));

/** Gera o comprovativo de receção de uma guia. Recusa guias canceladas. */
export async function generateReceiptProofPdf(noteId: string): Promise<{ blob: Blob; fileName: string }> {
  const { note: fetched, error } = await fetchDeliveryNote(noteId);
  if (!fetched) throw new Error(noteErrorMessage(error));
  if (fetched.status === 'cancelled') throw new Error('Guia cancelada.');
  const note = fetched as unknown as ReceiptProofNote;

  const receipts = note.summary?.receipts ?? [];
  const active = receipts.filter((r) => !r.reverted);
  const productIds = uniqIds((note.summary?.products ?? []).map((p) => p.product_id));
  const poiIds = uniqIds([
    ...note.lines.map((l) => l.purchase_order_item_id),
    ...active.map((r) => r.purchase_order_item_id),
  ]);
  const userIds = uniqIds([...active.map((r) => r.received_by), note.closed_by]);

  const [company, supplierTaxId, warehouseRows, userRows, issuer, productRows, poiRows] = await Promise.all([
    safe(() => resolveEmitterCompany(note.organization_id ?? null), null),
    safe(async () => {
      const { data } = await (supabase as any).from('suppliers').select('tax_id').eq('id', note.supplier_id).maybeSingle();
      return (data?.tax_id as string | null) ?? null;
    }, null),
    safe(() => selectIn('warehouses', 'id,name', 'id', uniqIds(active.map((r) => r.warehouse_id))), []),
    safe(() => selectIn('anew_users', 'id,name', 'id', userIds), []),
    safe(readIssuer, { id: null, name: null }),
    safe(() => selectIn('products', 'id, uom:uom_id(code)', 'id', productIds), []),
    safe(() => selectIn('purchase_order_items', 'id,product_id,supplier_sku', 'id', poiIds), []),
  ]);

  const warehouses: Record<string, string> = {};
  for (const w of warehouseRows) if (w?.id && w?.name) warehouses[w.id] = String(w.name);
  const users: Record<string, string> = {};
  for (const u of userRows) if (u?.id && u?.name) users[u.id] = String(u.name);
  if (issuer.id && issuer.name) users[issuer.id] ??= issuer.name;
  const productUnits: Record<string, string> = {};
  for (const p of productRows) {
    const code = Array.isArray(p?.uom) ? p.uom[0]?.code : p?.uom?.code;
    if (p?.id && code) productUnits[p.id] = String(code);
  }
  const skuSets = new Map<string, Set<string>>();
  for (const r of poiRows) {
    const sku = typeof r?.supplier_sku === 'string' ? r.supplier_sku.trim() : '';
    if (!r?.product_id || !sku) continue;
    const set = skuSets.get(r.product_id) ?? new Set<string>();
    set.add(sku);
    skuSets.set(r.product_id, set);
  }
  const supplierSkus: Record<string, string> = {};
  for (const [pid, set] of skuSets) supplierSkus[pid] = Array.from(set).join(' / ');

  const model = buildReceiptProofModel({
    note,
    company,
    supplierTaxId,
    warehouses,
    users,
    issuerName: issuer.name,
    productUnits,
    supplierSkus,
    now: new Date(),
  });

  const blob = await renderReceiptProofBlob(model);
  return { blob, fileName: receiptProofFileName(note.note_number, model.provisional) };
}

/** PDF a partir de um modelo já construído. */
export async function renderReceiptProofBlob(model: ReceiptProofModel): Promise<Blob> {
  const element = React.createElement(ReceiptProofPDFDocument, { model });
  return await (pdf as any)(element).toBlob();
}

/** Gera e descarrega o comprovativo. */
export async function downloadReceiptProof(noteId: string): Promise<void> {
  const { blob, fileName } = await generateReceiptProofPdf(noteId);
  downloadBlob(blob, fileName);
}
