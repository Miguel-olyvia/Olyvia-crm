// A barra de leitura da Receção (protótipo: resolverCodigoRececao em rececao.ts): o que se leu ou escreveu é, pela
// primeira regra que serve, (1) o nº de uma PO inteiro, (2) o nº de uma guia do fornecedor, (3) os últimos dígitos do
// nº da PO, (4) um artigo (EAN/SKU/código aprendido — rpc_receiving_lookup) ou (5) um fornecedor (≥ 3 letras).
// As consultas à BD são injetadas (testável sem Supabase); as POs são as já carregadas em "Por receber".
import { poRecebivel, type ReceivablePo } from "./porReceber";

export interface NoteMatch {
  id: string;
  noteNumber: string;
  status: string;
  supplierId: string;
  supplierName: string;
  /** POs ligadas à guia (supplier_delivery_note_orders); vazio = todas as do fornecedor. */
  poIds: string[];
}

export interface ProductMatch {
  productId: string;
  name: string;
}

/** Estado da lista "Por receber": só com ela pronta se pode dizer que uma PO "já não está por receber". */
export type ListState = "ready" | "loading" | "error" | "no_permission";

const LIST_STATE_MSG: Record<Exclude<ListState, "ready">, string> = {
  loading: "A lista de encomendas ainda está a carregar — tente de novo daqui a um instante.",
  error: "Não foi possível carregar as encomendas por receber.",
  no_permission: "Sem permissão para ver encomendas: use «Ler artigo a artigo».",
};

export interface ResolveDeps {
  /** As POs da lista (as recebíveis são filtradas aqui). */
  pos: readonly ReceivablePo[];
  /** Por omissão "ready". */
  listState?: ListState;
  suppliers: readonly { id: string; name: string }[];
  /** PO com este nº que já não está na lista (recebida/cancelada) — para o aviso. Opcional. */
  findPoByNumber?: (text: string) => Promise<{ orderNumber: string } | null>;
  findNote: (text: string) => Promise<NoteMatch | null>;
  /** Produtos com este código; { error } quando não se pode procurar (p.ex. sem armazém). */
  lookupProduct: (code: string) => Promise<ProductMatch[] | { error: string }>;
}

export type ReadResult =
  | { t: "po"; po: string; productId?: string; noteId?: string }
  | { t: "guia"; noteId: string; noteNumber: string; supplierId: string; supplierName: string; pos: string[] }
  | { t: "pos"; pos: string[] }
  | { t: "artigos"; names: string[]; pos: string[] }
  | { t: "forn"; supplierId: string; supplierName: string }
  | { t: "nada"; aviso?: string };

const digits = (s: string) => s.replace(/\D/g, "");

export async function resolveReceivingCode(text: string, deps: ResolveDeps): Promise<ReadResult> {
  const t = String(text ?? "").trim();
  if (!t) return { t: "nada" };
  const lc = t.toLowerCase();
  const open = deps.pos.filter(poRecebivel);
  const listState = deps.listState ?? "ready";

  // 1. O nº da PO, inteiro.
  const exact = open.find((p) => p.orderNumber.toLowerCase() === lc);
  if (exact) return { t: "po", po: exact.id };
  if (deps.findPoByNumber && listState === "ready") {
    const gone = await deps.findPoByNumber(t);
    if (gone) return { t: "nada", aviso: `${gone.orderNumber} já não está por receber.` };
  }

  // 2. A guia do fornecedor.
  const note = await deps.findNote(t);
  if (note) {
    if (note.status !== "open") return { t: "nada", aviso: `A guia ${note.noteNumber} não está aberta.` };
    const L = note.poIds.length
      ? open.filter((p) => note.poIds.includes(p.id))
      : open.filter((p) => p.supplierId === note.supplierId);
    if (L.length === 1) return { t: "po", po: L[0].id, noteId: note.id };
    return {
      t: "guia",
      noteId: note.id,
      noteNumber: note.noteNumber,
      supplierId: note.supplierId,
      supplierName: note.supplierName,
      pos: L.map((p) => p.id),
    };
  }

  // 3. Os últimos dígitos do nº da PO ("0146").
  if (/^\d{2,6}$/.test(t)) {
    const L = open.filter((p) => digits(p.orderNumber).endsWith(t));
    if (L.length === 1) return { t: "po", po: L[0].id };
    if (L.length > 1) return { t: "pos", pos: L.map((p) => p.id) };
  }

  // 4. Um artigo (de qualquer fornecedor).
  const found = await deps.lookupProduct(t);
  let lookupError: string | null = null;
  if (Array.isArray(found)) {
    if (found.length) {
      const ids = new Set(found.map((f) => f.productId));
      const L = open.filter((p) => p.lines.some((l) => ids.has(l.productId) && l.open > 0));
      const names = [...new Set(found.map((f) => f.name))];
      if (L.length === 1) {
        const line = L[0].lines.find((l) => ids.has(l.productId) && l.open > 0);
        return { t: "po", po: L[0].id, productId: line?.productId };
      }
      if (L.length > 1) return { t: "artigos", names, pos: L.map((p) => p.id) };
      return { t: "nada", aviso: `«${t}» é ${names.join(" ou ")}, mas não há encomendas por receber com esse artigo.` };
    }
  } else {
    lookupError = found.error;
  }

  // 5. O fornecedor (nome inteiro, ou parte com 3 ou mais letras).
  const F = deps.suppliers.filter((s) => {
    const n = s.name.toLowerCase();
    return n === lc || (lc.length >= 3 && n.includes(lc));
  });
  const exactSup = F.filter((s) => s.name.toLowerCase() === lc);
  const S = exactSup.length === 1 ? exactSup : F;
  if (S.length === 1) return { t: "forn", supplierId: S[0].id, supplierName: S[0].name };
  if (S.length > 1) return { t: "nada", aviso: `«${t}» serve ${S.length} fornecedores: escreva mais do nome.` };

  if (listState !== "ready") return { t: "nada", aviso: `Não encontrei «${t}». ${LIST_STATE_MSG[listState]}` };
  return { t: "nada", aviso: lookupError ? `Não encontrei «${t}». ${lookupError}` : undefined };
}
