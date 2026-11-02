import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  buildStoragePath,
  checkFile,
  jsonActionSchema,
  maskEmail,
  rpcErrorBody,
  sanitizeFileName,
  sha256Hex,
  uploadFieldsSchema,
} from "./logic";
import {
  buildSignatureRequestEmail,
  contractLabel,
  formatDatePt,
  inviteContractParagraph,
} from "../_shared/supplierContractEmail";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
// HEIC: "ftypheic" a partir do byte 4 (o detector vê-o como mp4) → recusado.
const HEIC = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

describe("checkFile — tipo real e tamanho", () => {
  it("contrato do fornecedor: só PDF", () => {
    expect(checkFile(PDF, "contrato_fornecedor")).toMatchObject({ ok: true, type: { mime: "application/pdf", ext: "pdf" } });
    for (const b of [PNG, JPEG, WEBP, HEIC, ZIP, HTML]) {
      expect(checkFile(b, "contrato_fornecedor")).toMatchObject({ ok: false, status: 415 });
    }
  });

  it("anexos: PDF, JPEG e PNG; sem HEIC, WEBP, ZIP/Office nem HTML", () => {
    expect(checkFile(PDF, "anexo")).toMatchObject({ ok: true, type: { mime: "application/pdf" } });
    expect(checkFile(JPEG, "anexo")).toMatchObject({ ok: true, type: { mime: "image/jpeg", ext: "jpg" } });
    expect(checkFile(PNG, "anexo")).toMatchObject({ ok: true, type: { mime: "image/png", ext: "png" } });
    for (const b of [WEBP, HEIC, ZIP, HTML]) {
      expect(checkFile(b, "anexo")).toMatchObject({ ok: false, status: 415, error: "file_type_not_allowed" });
    }
  });

  it("vazio e acima de 15 MB são recusados", () => {
    expect(checkFile(new Uint8Array(0), "anexo")).toMatchObject({ ok: false, status: 400, error: "empty_file" });
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(PDF);
    expect(checkFile(big, "anexo")).toMatchObject({ ok: false, status: 413, error: "file_too_large" });
    const edge = new Uint8Array(MAX_FILE_BYTES);
    edge.set(PDF);
    expect(checkFile(edge, "anexo").ok).toBe(true);
  });
});

describe("sha256Hex", () => {
  it("é o SHA-256 dos bytes em hex minúsculo", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 olá");
    expect(await sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(await sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sanitizeFileName", () => {
  it("tira barras e controlo e fica com a extensão do tipo real", () => {
    expect(sanitizeFileName("../../etc/passwd", "pdf")).toBe(".. .. etc passwd.pdf");
    expect(sanitizeFileName("contrato\u0000final.exe", "pdf")).toBe("contrato final.pdf");
    expect(sanitizeFileName("Fatura.PNG", "png")).toBe("Fatura.png");
    expect(sanitizeFileName("foto.jpeg", "jpg")).toBe("foto.jpg");
    expect(sanitizeFileName("", "pdf")).toBe("documento.pdf");
    expect(sanitizeFileName(undefined, "png")).toBe("imagem.png");
    expect(sanitizeFileName("   ", "jpg")).toBe("imagem.jpg");
  });

  it("até 255 caracteres", () => {
    const n = sanitizeFileName("a".repeat(400), "pdf");
    expect(n.length).toBe(255);
    expect(n.endsWith(".pdf")).toBe(true);
  });
});

describe("buildStoragePath", () => {
  it("{org}/{contrato}/{uuid}.{ext} com folha válida para register_file", () => {
    const p = buildStoragePath("o-1", "c-1", "3f2b6c1e-0000-4000-8000-000000000001", "pdf");
    expect(p).toBe("o-1/c-1/3f2b6c1e-0000-4000-8000-000000000001.pdf");
    const leaf = p.split("/").pop()!;
    expect(leaf).toMatch(/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/);
  });
});

describe("schemas", () => {
  const id = "3f2b6c1e-0000-4000-8000-000000000001";
  it("ações JSON", () => {
    expect(jsonActionSchema.safeParse({ action: "download_url", file_id: id }).success).toBe(true);
    expect(jsonActionSchema.safeParse({ action: "resend_signature_request", contract_id: id }).success).toBe(true);
    expect(jsonActionSchema.safeParse({ action: "download_url", file_id: "x" }).success).toBe(false);
    expect(jsonActionSchema.safeParse({ action: "delete", file_id: id }).success).toBe(false);
    expect(jsonActionSchema.safeParse({ action: "upload", contract_id: id }).success).toBe(false);
  });
  it("campos do upload", () => {
    expect(uploadFieldsSchema.safeParse({ action: "upload", contract_id: id, kind: "anexo" }).success).toBe(true);
    expect(uploadFieldsSchema.safeParse({ action: "upload", contract_id: id, kind: "outro" }).success).toBe(false);
    expect(uploadFieldsSchema.safeParse({ action: "upload", contract_id: null, kind: "anexo" }).success).toBe(false);
  });
});

describe("rpcErrorBody", () => {
  it("HINT conhecido passa a mensagem da BD; desconhecido fica genérico", () => {
    expect(rpcErrorBody({ hint: "not_found", message: "Contrato não encontrado" })).toEqual({
      status: 404, body: { error: "not_found", message: "Contrato não encontrado" },
    });
    expect(rpcErrorBody({ hint: "invalid_state", message: "x" }).status).toBe(409);
    expect(rpcErrorBody({ hint: "not_owner", message: "x" }).status).toBe(403);
    const r = rpcErrorBody({ message: 'duplicate key value violates unique constraint "x"' });
    expect(r.status).toBe(500);
    expect(r.body.message).not.toContain("duplicate");
  });
});

describe("emails", () => {
  const c = { contract_number: "CF-2027-0001", version: 2, title: "Fornecimento <b>x</b>", valid_until: "2027-12-31" };
  it("rótulo, data e escape", () => {
    expect(contractLabel(c)).toBe("CF-2027-0001 (versão 2)");
    expect(contractLabel({ ...c, version: 1 })).toBe("CF-2027-0001");
    expect(formatDatePt("2027-12-31")).toBe("31/12/2027");
    expect(formatDatePt(null)).toBe(null);
    const { subject, html } = buildSignatureRequestEmail({
      orgName: "ACME & Filhos", recipientName: "<img src=x>", loginUrl: "https://www.olyvia-ai.com/auth", contract: c,
    });
    expect(subject).toContain("CF-2027-0001 (versão 2)");
    expect(html).toContain("ACME &amp; Filhos");
    expect(html).toContain("Fornecimento &lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("31/12/2027");
    expect(inviteContractParagraph(c)).toContain("CF-2027-0001 (versão 2)");
  });
  it("maskEmail", () => {
    expect(maskEmail("joana@exemplo.pt")).toBe("jo***@exemplo.pt");
    expect(maskEmail("x")).toBe("***");
  });
});
