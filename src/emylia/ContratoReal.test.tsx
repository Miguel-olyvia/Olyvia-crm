// 27/11/2026: o contrato real (PDF assinado) na janela do contrato.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const sbFrom = vi.fn();
const upload = vi.fn();
const download = vi.fn();
const remove = vi.fn();
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => sbFrom(...a),
    storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a), download: (...a: unknown[]) => download(...a), remove: (...a: unknown[]) => remove(...a) }) },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));
import { ContratoRealEMinuta } from "./ContratoReal";
import { DOC_CONTRATO_ASSINADO, porqueRecusarPdf, tamanhoLegivel } from "./contratoRealDados";
import { definirModoReal } from "./acessosPortal";

beforeAll(() => {
  // jsdom não tem createObjectURL
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:contrato";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});

/** Uma cadeia do supabase-js que regista as chamadas e resolve com `r`. */
function cadeia(r: unknown, log: [string, unknown[]][] = []) {
  const c: Record<string, unknown> = {};
  ["select", "eq", "is", "in", "order", "limit", "insert"].forEach((m) => { c[m] = (...a: unknown[]) => { log.push([m, a]); return c; }; });
  c.maybeSingle = async () => r;
  c.single = async () => r;
  (c as { then?: unknown }).then = (ok: (v: unknown) => void) => ok(r);
  return c;
}

function base(docs: unknown[], log: [string, unknown[]][] = [], inserir?: (v: unknown) => void) {
  sbFrom.mockImplementation((t: string) => {
    if (t === "negocios") return cadeia({ data: { id: "neg-1" } });
    if (t === "client_contracts") return cadeia({ data: [] });
    if (t === "proposals") return cadeia({ data: [{ id: "prop-1" }] });
    if (t === "documents") {
      const c = cadeia({ data: docs, error: null }, log);
      c.insert = (v: unknown) => { inserir?.(v); return cadeia({ data: { id: "doc-9", created_at: "2026-11-27T10:00:00Z" }, error: null }); };
      return c;
    }
    return cadeia({ data: null });
  });
}

const minuta = <div><p>Minuta da app</p></div>;

describe("ContratoRealEMinuta", () => {
  afterEach(() => { cleanup(); definirModoReal(null); sbFrom.mockReset(); upload.mockReset(); download.mockReset(); invoke.mockReset(); remove.mockReset(); });

  it("fora de uma organização real mostra só a minuta, sem ir à base", () => {
    render(<ContratoRealEMinuta numero={1022} cartao={<p>Partilhar</p>} folha={minuta} />);
    expect(screen.getByText("Minuta da app")).toBeTruthy();
    expect(screen.queryByText(/contrato assinado/i)).toBeNull();
    expect(sbFrom).not.toHaveBeenCalled();
  });

  it("com o PDF guardado, mostra o contrato assinado primeiro, com abrir e descarregar, e chama minuta ao resto", async () => {
    const log: [string, unknown[]][] = [];
    base([{ id: "d1", file_name: "Contrato CC-2026-0411 (MD 1598).pdf", file_url: "org-1/proposal/prop-1/x.pdf", file_size: 3_620_000, created_at: "2026-11-27T09:00:00Z" }], log);
    download.mockResolvedValue({ data: new Blob(["%PDF-1.4"], { type: "application/pdf" }), error: null });
    definirModoReal("org-1", "Mudelar");
    render(<ContratoRealEMinuta numero={1022} cartao={<p>Partilhar</p>} folha={minuta} />);
    expect(await screen.findByText("Contrato assinado pelo cliente")).toBeTruthy();
    expect(screen.getByText(/Contrato CC-2026-0411 \(MD 1598\)\.pdf · 3,5 MB · guardado a/)).toBeTruthy();
    expect(screen.getByText("Minuta gerada pela app")).toBeTruthy();
    const descarregar = await screen.findByRole("link", { name: /Descarregar/ });
    expect(descarregar.getAttribute("href")).toBe("blob:contrato");
    expect(descarregar.getAttribute("download")).toBe("Contrato CC-2026-0411 (MD 1598).pdf");
    expect(screen.getByTitle("Contrato assinado: Contrato CC-2026-0411 (MD 1598).pdf").getAttribute("src")).toBe("blob:contrato");
    expect(download).toHaveBeenCalledWith("org-1/proposal/prop-1/x.pdf");
    // procura só os contratos assinados da organização, ligados ao contrato ou à proposta do negócio
    expect(log).toContainEqual(["eq", ["document_type", DOC_CONTRATO_ASSINADO]]);
    expect(log).toContainEqual(["eq", ["organization_id", "org-1"]]);
    expect(log).toContainEqual(["in", ["entity_id", ["prop-1"]]]);
  });

  it("sem PDF, deixa anexar o contrato assinado e recusa o que não é PDF", async () => {
    base([]);
    definirModoReal("org-1", "Mudelar");
    render(<ContratoRealEMinuta numero={1022} cartao={<p>Partilhar</p>} folha={minuta} />);
    expect(await screen.findByText("Ainda não há o contrato assinado em PDF")).toBeTruthy();
    expect(screen.queryByText("Minuta gerada pela app")).toBeNull();
    expect(screen.getByRole("button", { name: "Anexar o contrato assinado (PDF)" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contrato assinado (PDF)"), { target: { files: [new File(["x"], "foto.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Não foi possível anexar: O contrato assinado tem de ser um PDF.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("anexar um PDF: quarentena, validate-upload e a linha interna ligada à proposta", async () => {
    let linha: Record<string, unknown> | null = null;
    base([], [], (v) => { linha = v as Record<string, unknown>; });
    upload.mockResolvedValue({ error: null });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    download.mockResolvedValue({ data: new Blob(["%PDF"], { type: "application/pdf" }), error: null });
    definirModoReal("org-1", "Mudelar");
    render(<ContratoRealEMinuta numero={1022} cartao={<p>Partilhar</p>} folha={minuta} />);
    await screen.findByText("Ainda não há o contrato assinado em PDF");
    fireEvent.change(screen.getByLabelText("Contrato assinado (PDF)"), { target: { files: [new File(["%PDF-1.4"], "Contrato assinado.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("Contrato assinado pelo cliente")).toBeTruthy();
    expect(upload.mock.calls[0][0]).toMatch(/^org-1\/proposal\/prop-1\/.+\.pdf$/);
    expect(invoke).toHaveBeenCalledWith("validate-upload", { body: expect.objectContaining({ quarantineBucket: "documents-quarantine", finalBucket: "documents" }) });
    expect(linha).toMatchObject({ organization_id: "org-1", entity_type: "proposal", entity_id: "prop-1", file_name: "Contrato assinado.pdf",
      document_type: DOC_CONTRATO_ASSINADO, visible_to_client: false });
    expect(screen.getByRole("status").textContent).toBe("«Contrato assinado.pdf» ficou guardado como o contrato assinado.");
  });
});

describe("contratoReal (regras)", () => {
  it("só aceita PDF até 20 MB", () => {
    expect(porqueRecusarPdf({ name: "c.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(porqueRecusarPdf({ name: "C.PDF", type: "", size: 1000 })).toBeNull();
    expect(porqueRecusarPdf({ name: "c.docx", type: "application/msword", size: 1000 })).toMatch(/PDF/);
    expect(porqueRecusarPdf({ name: "c.pdf", type: "application/pdf", size: 0 })).toMatch(/vazio/);
    expect(porqueRecusarPdf({ name: "c.pdf", type: "application/pdf", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
  });
  it("tamanho legível", () => {
    expect(tamanhoLegivel(3_620_000)).toBe("3,5 MB");
    expect(tamanhoLegivel(820_000)).toBe("801 KB");
    expect(tamanhoLegivel(null)).toBe("");
  });
});
