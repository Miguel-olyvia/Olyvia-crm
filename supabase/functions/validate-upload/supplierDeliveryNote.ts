/**
 * Anexo da guia de remessa do Portal do Fornecedor (validate-upload).
 *
 * TS puro, sem Deno nem rede: partilhado pelo index.ts e testado no vitest
 * (supplierDeliveryNote.vitest.test.ts).
 *
 * Caminho: {org_id}/supplier-delivery-notes/{delivery_note_id}/{ficheiro}
 * — o mesmo formato que sp_attach_delivery_note_file aceita
 * (migration 20261231850000_sp_expedir_encomenda.sql).
 */

export const SUPPLIER_DELIVERY_NOTES_SEGMENT = "supplier-delivery-notes";
export const SUPPLIER_DELIVERY_NOTE_MAX_BYTES = 10 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Igual à RPC: não começa por ponto (sem "." / ".."), sem barras.
const LEAF_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/;

/** Assinatura binária (detectSignature) → mime gravado no anexo. */
const MIME_BY_SIGNATURE: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** O caminho é do anexo da guia (2.º segmento)? Decide o ramo do validate-upload. */
export function isSupplierDeliveryNotePath(path: string): boolean {
  return path.split("/")[1] === SUPPLIER_DELIVERY_NOTES_SEGMENT;
}

export interface SupplierDeliveryNotePath {
  orgId: string;
  noteId: string;
  leaf: string;
}

/** Valida a forma do caminho; null = inválido. */
export function parseSupplierDeliveryNotePath(path: string): SupplierDeliveryNotePath | null {
  const parts = path.split("/");
  if (parts.length !== 4) return null;
  const [orgId, segment, noteId, leaf] = parts;
  if (segment !== SUPPLIER_DELIVERY_NOTES_SEGMENT) return null;
  if (!UUID_RE.test(orgId) || !UUID_RE.test(noteId) || !LEAF_RE.test(leaf)) return null;
  return { orgId, noteId, leaf };
}

/** Mime aceite para a assinatura detetada; null = tipo não permitido no anexo da guia. */
export function supplierDeliveryNoteMime(signature: string | null): string | null {
  return signature ? MIME_BY_SIGNATURE[signature] ?? null : null;
}

/** Nome a gravar: o enviado pelo cliente (limpo) ou o último segmento do caminho. */
export function supplierDeliveryNoteFileName(fileName: unknown, leaf: string): string {
  if (typeof fileName !== "string") return leaf;
  // eslint-disable-next-line no-control-regex
  const clean = fileName.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 255);
  return clean || leaf;
}

/** Hint da RPC → estado HTTP da resposta da Edge. */
export function httpStatusForSpHint(hint: string | null | undefined): number {
  switch (hint) {
    case "no_supplier_access":
      return 403;
    case "not_found":
      return 404;
    case "order_closed":
      return 409;
    case "validation":
      return 422;
    default:
      return 500;
  }
}
