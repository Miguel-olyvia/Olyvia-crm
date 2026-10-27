import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc, upload, invoke, from } = vi.hoisted(() => {
  const upload = vi.fn();
  return {
    rpc: vi.fn(),
    upload,
    invoke: vi.fn(),
    from: vi.fn(() => ({ upload })),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, storage: { from }, functions: { invoke } },
}));

import {
  SupplierPortalRpcError,
  deliveryNoteFilePath,
  deliveryNoteFileProblem,
  spAttachDeliveryNoteFile,
  spErrorMessage,
  spOrderShipments,
  spShipOrder,
  spUploadDeliveryNoteFile,
} from "../spRpc";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const NOTE = "5e5e0000-0000-4000-8000-000000000301";

beforeEach(() => {
  rpc.mockReset();
  upload.mockReset();
  invoke.mockReset();
  from.mockClear();
});

describe("spShipOrder", () => {
  it("envia os argumentos da RPC e omite transportador/notas vazios", async () => {
    rpc.mockResolvedValue({
      data: {
        delivery_note_id: NOTE,
        organization_id: ORG,
        note_number: "GR-1",
        already_shipped: false,
        lines: [{ purchase_order_item_id: "i1", quantity: 4, to_ship: 6 }],
      },
      error: null,
    });
    const res = await spShipOrder({
      requestId: NOTE,
      poId: "po1",
      revision: 2,
      noteNumber: "  GR-1 ",
      shipDate: "2026-10-27",
      lines: [{ purchase_order_item_id: "i1", quantity: 4 }],
      carrier: "   ",
      notes: null,
    });
    expect(rpc).toHaveBeenCalledWith("sp_ship_order", {
      p_request_id: NOTE,
      p_po_id: "po1",
      p_revision: 2,
      p_note_number: "GR-1",
      p_ship_date: "2026-10-27",
      p_lines: [{ purchase_order_item_id: "i1", quantity: 4 }],
    });
    expect(res.lines).toEqual([{ purchase_order_item_id: "i1", quantity: 4, to_ship: 6 }]);
    expect(res.already_shipped).toBe(false);
  });

  it("envia transportador e notas quando preenchidos", async () => {
    rpc.mockResolvedValue({ data: { delivery_note_id: NOTE, lines: [] }, error: null });
    await spShipOrder({
      requestId: NOTE,
      poId: "po1",
      revision: 1,
      noteNumber: "GR-2",
      shipDate: "2026-10-27",
      lines: [],
      carrier: " CTT ",
      notes: " frágil ",
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_carrier: "CTT", p_notes: "frágil" });
  });

  it.each([
    ["not_confirmed", "Confirme a encomenda antes de a expedir."],
    ["order_closed", "Esta encomenda já foi recebida ou cancelada: já não pode ser expedida."],
    ["not_found", "A encomenda não existe ou já não está disponível no portal."],
    ["stale_revision", "A empresa atualizou esta encomenda entretanto. Reveja os dados atualizados e confirme de novo."],
  ])("hint %s → mensagem em PT", async (hint, msg) => {
    rpc.mockResolvedValue({ data: null, error: { message: "server", code: "23514", hint } });
    const err = await spShipOrder({
      requestId: NOTE, poId: "po1", revision: 1, noteNumber: "X", shipDate: "2026-10-27", lines: [],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SupplierPortalRpcError);
    expect(spErrorMessage(err)).toBe(msg);
  });

  it("duplicate_note usa a mensagem do servidor (traz o número)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Já existe uma guia com o número GR-1 para esta empresa", code: "23505", hint: "duplicate_note" },
    });
    const err = await spShipOrder({
      requestId: NOTE, poId: "po1", revision: 1, noteNumber: "GR-1", shipDate: "2026-10-27", lines: [],
    }).catch((e) => e);
    expect(spErrorMessage(err)).toBe("Já existe uma guia com o número GR-1 para esta empresa");
  });

  it("validation (mais do que falta) usa a mensagem do servidor", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "«Linha 1»: só faltam 6 para expedir (indicou 7)", hint: "validation" } });
    const err = await spShipOrder({
      requestId: NOTE, poId: "po1", revision: 1, noteNumber: "GR-1", shipDate: "2026-10-27", lines: [],
    }).catch((e) => e);
    expect(spErrorMessage(err)).toBe("«Linha 1»: só faltam 6 para expedir (indicou 7)");
  });
});

describe("spOrderShipments", () => {
  it("normaliza linhas e guias (sem anexo → file null)", async () => {
    rpc.mockResolvedValue({
      data: {
        lines: [{ id: "i1", shipped: "4", to_ship: 6 }],
        shipments: [
          { id: NOTE, note_number: "GR-1", date: "2026-10-27", status: "open", carrier: null, has_file: false, file: null,
            lines: [{ purchase_order_item_id: "i1", quantity: 4 }] },
          { id: "n2", note_number: "GR-2", date: null, status: "cancelled", carrier: "CTT", has_file: true,
            file: { path: `${ORG}/supplier-delivery-notes/n2/x.pdf`, name: "g.pdf", mime: "application/pdf", size: 10 } },
        ],
      },
      error: null,
    });
    const res = await spOrderShipments("po1");
    expect(rpc).toHaveBeenCalledWith("sp_order_shipments", { p_po_id: "po1" });
    expect(res.lines).toEqual([{ id: "i1", shipped: 4, to_ship: 6 }]);
    expect(res.shipments[0].file).toBeNull();
    expect(res.shipments[1]).toMatchObject({ status: "cancelled", has_file: true, lines: [] });
    expect(res.shipments[1].file?.size).toBe(10);
  });

  it("resposta vazia → listas vazias", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await spOrderShipments("po1")).toEqual({ lines: [], shipments: [] });
  });
});

describe("spAttachDeliveryNoteFile", () => {
  it("chama a RPC com todos os argumentos", async () => {
    rpc.mockResolvedValue({ data: { ok: true, dry_run: true }, error: null });
    await spAttachDeliveryNoteFile({ noteId: NOTE, path: "p", name: "g.pdf", mime: null, size: null, dryRun: true });
    expect(rpc).toHaveBeenCalledWith("sp_attach_delivery_note_file", {
      p_note_id: NOTE, p_path: "p", p_name: "g.pdf", p_mime: null, p_size: null, p_dry_run: true,
    });
  });

  it("not_found tem mensagem de guia", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Guia não encontrada", hint: "not_found" } });
    const err = await spAttachDeliveryNoteFile({ noteId: NOTE, path: "p", name: "g", mime: null, size: null }).catch((e) => e);
    expect(spErrorMessage(err)).toBe("A guia não existe ou já não está disponível no portal.");
  });
});

describe("anexo: caminho e validação local", () => {
  it("caminho no formato aceite pela RPC", () => {
    expect(deliveryNoteFilePath(ORG, NOTE, "application/pdf", "abc")).toBe(`${ORG}/supplier-delivery-notes/${NOTE}/abc.pdf`);
    expect(deliveryNoteFilePath(ORG, NOTE, "image/jpeg", "abc")).toMatch(/\.jpg$/);
    expect(() => deliveryNoteFilePath(ORG, NOTE, "text/plain", "abc")).toThrow(SupplierPortalRpcError);
  });

  it("tipo e tamanho", () => {
    expect(deliveryNoteFileProblem({ type: "application/pdf", size: 100 })).toBeNull();
    expect(deliveryNoteFileProblem({ type: "image/gif", size: 100 })).toMatch(/Tipo de ficheiro/);
    expect(deliveryNoteFileProblem({ type: "image/png", size: 0 })).toMatch(/vazio/);
    expect(deliveryNoteFileProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
  });
});

describe("spUploadDeliveryNoteFile", () => {
  const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "Guia 1.pdf", { type: "application/pdf" });

  it("carrega para a quarentena e chama validate-upload com o caminho e o nome", async () => {
    upload.mockResolvedValue({ error: null });
    invoke.mockResolvedValue({ data: { ok: true, finalPath: "x", attachment: { ok: true, replaced: false } }, error: null });
    const res = await spUploadDeliveryNoteFile({ orgId: ORG, noteId: NOTE, file });
    expect(from).toHaveBeenCalledWith("documents-quarantine");
    const path = upload.mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^${ORG}/supplier-delivery-notes/${NOTE}/[0-9a-f-]{36}\\.pdf$`));
    expect(upload.mock.calls[0][2]).toEqual({ contentType: "application/pdf", upsert: false });
    expect(invoke).toHaveBeenCalledWith("validate-upload", {
      body: { quarantineBucket: "documents-quarantine", finalBucket: "documents", path, fileName: "Guia 1.pdf" },
    });
    expect(res).toEqual({ ok: true, replaced: false });
  });

  it("recusa localmente tipo não permitido (sem carregar)", async () => {
    const txt = new File(["x"], "a.txt", { type: "text/plain" });
    await expect(spUploadDeliveryNoteFile({ orgId: ORG, noteId: NOTE, file: txt })).rejects.toBeInstanceOf(SupplierPortalRpcError);
    expect(upload).not.toHaveBeenCalled();
  });

  it("erro da Edge (não-2xx) → mensagem e hint do corpo", async () => {
    upload.mockResolvedValue({ error: null });
    invoke.mockResolvedValue({
      data: null,
      error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code",
        context: new Response(JSON.stringify({ error: "Esta guia foi cancelada", hint: "order_closed" }), { status: 409 }) },
    });
    const err = await spUploadDeliveryNoteFile({ orgId: ORG, noteId: NOTE, file }).catch((e) => e);
    expect(err).toBeInstanceOf(SupplierPortalRpcError);
    expect((err as SupplierPortalRpcError).hint).toBe("order_closed");
    expect(spErrorMessage(err)).toBe("Esta guia foi cancelada pela empresa: já não pode anexar ficheiros.");
  });

  it("falha no carregamento para a quarentena", async () => {
    upload.mockResolvedValue({ error: { message: "upload_burst_rate_limit_exceeded" } });
    const err = await spUploadDeliveryNoteFile({ orgId: ORG, noteId: NOTE, file }).catch((e) => e);
    expect(spErrorMessage(err)).toMatch(/não foi carregado/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
