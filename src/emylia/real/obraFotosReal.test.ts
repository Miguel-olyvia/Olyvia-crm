// 20/11/2026 (auditoria de 19/11, Lote 3, dados; 20270125010000): as fotografias da obra saem do JSON. Com a base ligada guardam-se em
// negocio_obra_fotos (neg_obra_foto_juntar) e no estado fica «obrafoto:<id>»; mostram-se pela função da equipa ou do portal, uma vez por
// sessão. As antigas (data URL) continuam a ver-se como estão.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("./conversaReal", () => ({ fotoParaEnvio: vi.fn(async () => ({ mime: "image/jpeg", b64: "/9j/AAAA" })) }));

import { definirModoReal } from "../acessosPortal";
import {
  apagarFotoObra, blobDeDataUrl, definirFotosObraDoPortal, eFotoObraGuardada, esquecerFotosObra, guardarFotoObra, idDaFotoObra,
  imagemDaFotoObra, refDaFotoObra, semFuncaoFotosObra,
} from "./obraFotosReal";

const ID = "0b9d7c1e-1111-4222-8333-444455556666";
const REF = `obrafoto:${ID}`;

beforeEach(() => { rpc.mockReset(); esquecerFotosObra(); definirFotosObraDoPortal(false); definirModoReal("org-1"); });
afterEach(() => { definirModoReal(null); definirFotosObraDoPortal(false); });

describe("a referência", () => {
  it("só «obrafoto:<uuid>» é uma fotografia guardada; data URL, URL e lixo não", () => {
    expect(refDaFotoObra(ID)).toBe(REF);
    expect(idDaFotoObra(REF)).toBe(ID);
    expect(eFotoObraGuardada(REF)).toBe(true);
    expect(idDaFotoObra("data:image/jpeg;base64,AAAA")).toBeNull();
    expect(idDaFotoObra("https://x.supabase.co/a.webp")).toBeNull();
    expect(idDaFotoObra("obrafoto:nao-e-uuid")).toBeNull();
    expect(idDaFotoObra(undefined)).toBeNull();
  });
});

describe("mostrar", () => {
  it("um data URL antigo fica como está (sem ir à base)", async () => {
    await expect(imagemDaFotoObra("data:image/jpeg;base64,AAAA")).resolves.toBe("data:image/jpeg;base64,AAAA");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a equipa lê pela neg_obra_foto (organização e id), uma vez por sessão", async () => {
    rpc.mockResolvedValue({ data: { id: ID, mime: "image/jpeg", b64: "/9j/AAAA" }, error: null });
    const a = await imagemDaFotoObra(REF), b = await imagemDaFotoObra(REF);
    expect(a).toBe(b);
    expect(a).toMatch(/^(blob:|data:image\/jpeg;base64,)/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("neg_obra_foto", { p_organization_id: "org-1", p_foto_id: ID });
  });

  it("o portal lê pela portal_neg_obra_foto (só o id)", async () => {
    definirFotosObraDoPortal(true);
    rpc.mockResolvedValue({ data: { id: ID, mime: "image/png", b64: "iVBORw0KGgo=" }, error: null });
    await imagemDaFotoObra(REF);
    expect(rpc).toHaveBeenCalledWith("portal_neg_obra_foto", { p_foto_id: ID });
  });

  it("um erro rejeita e a próxima vez volta a tentar", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Sem permissão (pessoas.view)." } })
      .mockResolvedValueOnce({ data: { id: ID, mime: "image/jpeg", b64: "/9j/AAAA" }, error: null });
    await expect(imagemDaFotoObra(REF)).rejects.toThrow("Sem permissão");
    await expect(imagemDaFotoObra(REF)).resolves.toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("sem a base ligada, uma referência não se consegue mostrar (sem pedir nada)", async () => {
    definirModoReal(null);
    await expect(imagemDaFotoObra(REF)).rejects.toThrow("sem a base");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("guardar", () => {
  it("com a base: neg_obra_foto_juntar (organização, número, {mime, b64}) e devolve a referência, já pronta a mostrar", async () => {
    rpc.mockResolvedValueOnce({ data: { id: ID, ref: REF, em: "2026-11-20T10:00:00Z" }, error: null });
    const ref = await guardarFotoObra(1026, new Blob(["x"], { type: "image/jpeg" }));
    expect(ref).toBe(REF);
    expect(rpc).toHaveBeenCalledWith("neg_obra_foto_juntar", { p_organization_id: "org-1", p_numero: 1026, p_foto: { mime: "image/jpeg", b64: "/9j/AAAA" } });
    await imagemDaFotoObra(ref);
    expect(rpc).toHaveBeenCalledTimes(1); // mostrar não volta à base
  });

  it("um erro da base chega a quem chama, com a mensagem", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Esta obra já tem 500 fotografias guardadas." } });
    await expect(guardarFotoObra(1026, new Blob(["x"], { type: "image/jpeg" }))).rejects.toThrow("500 fotografias");
  });

  it("uma resposta sem id é erro (não se põe no estado uma referência partida)", async () => {
    rpc.mockResolvedValueOnce({ data: { ref: "obrafoto:x" }, error: null });
    await expect(guardarFotoObra(1026, new Blob(["x"], { type: "image/jpeg" }))).rejects.toThrow("Resposta inesperada");
  });

  it("um data URL que não é imagem é recusado logo", async () => {
    await expect(guardarFotoObra(1026, "não é um data url")).rejects.toThrow("não é uma fotografia");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a função por aplicar reconhece-se (a app volta ao data URL pequeno)", () => {
    expect(semFuncaoFotosObra({ message: "Could not find the function public.neg_obra_foto_juntar(p_foto, p_numero, p_organization_id) in the schema cache" })).toBe(true);
    expect(semFuncaoFotosObra({ message: "Sem permissão (negocios.obra.executar)." })).toBe(false);
  });

  it("blobDeDataUrl lê base64 e texto", async () => {
    const b = blobDeDataUrl("data:image/png;base64,iVBORw0KGgo=")!;
    expect(b.type).toBe("image/png");
    expect(b.size).toBe(8);
    expect(blobDeDataUrl("data:image/svg+xml,%3Csvg%2F%3E")!.size).toBe(6);
    expect(blobDeDataUrl("lixo")).toBeNull();
  });
});

describe("apagar a que ainda não foi registada", () => {
  it("uma referência vai a neg_obra_foto_apagar; um data URL não faz nada; um erro não rebenta", async () => {
    rpc.mockRejectedValueOnce(new Error("rede"));
    await apagarFotoObra(REF);
    await apagarFotoObra("data:image/jpeg;base64,AAAA");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("neg_obra_foto_apagar", { p_organization_id: "org-1", p_foto_id: ID });
  });

  it("no portal nunca apaga", async () => {
    definirFotosObraDoPortal(true);
    await apagarFotoObra(REF);
    expect(rpc).not.toHaveBeenCalled();
  });
});
