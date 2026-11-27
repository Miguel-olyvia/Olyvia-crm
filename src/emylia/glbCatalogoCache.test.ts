// 27/11: a leitura das categorias e dos Modelos para o GLB próprio. Uma leitura que FALHA (quem não tem `products.edit` nem `services.view` recebe uma recusa das duas RPC) guarda-se
// um minuto: sem isso cada ficha aberta repetia duas chamadas recusadas e enchia o painel de erros da base. Uma leitura que corre bem serve cinco minutos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mundo = vi.hoisted(() => ({ cat: vi.fn(), mod: vi.fn() }));
vi.mock("./categoriasMarcasGestao", () => ({ lerCategoriasGestao: mundo.cat }));
vi.mock("./modelosDados", () => ({ lerModelosGestao: mundo.mod }));
import { VALIDADE_FALHA_MS, VALIDADE_LEITURA_MS, invalidarGlbsDoCatalogo, lerGlbsDoCatalogo } from "./glbCatalogoCache";

const boa = { ok: true, v: [] }, ma = { ok: false, erro: "sem permissão" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  mundo.cat.mockReset(); mundo.mod.mockReset();
  invalidarGlbsDoCatalogo();
});
afterEach(() => { vi.useRealTimers(); });

describe("lerGlbsDoCatalogo", () => {
  it("uma leitura boa serve as fichas seguintes (uma só ida à base por organização)", async () => {
    mundo.cat.mockResolvedValue(boa); mundo.mod.mockResolvedValue(boa);
    expect(await lerGlbsDoCatalogo("org-1")).not.toBeNull();
    expect(await lerGlbsDoCatalogo("org-1")).not.toBeNull();
    expect(mundo.cat).toHaveBeenCalledTimes(1);
    expect(mundo.mod).toHaveBeenCalledTimes(1);
  });

  it("uma leitura recusada fica guardada: as fichas seguintes não repetem as duas chamadas", async () => {
    mundo.cat.mockResolvedValue(ma); mundo.mod.mockResolvedValue(ma);
    expect(await lerGlbsDoCatalogo("org-1")).toBeNull();
    expect(await lerGlbsDoCatalogo("org-1")).toBeNull();
    expect(await lerGlbsDoCatalogo("org-1")).toBeNull();
    expect(mundo.cat).toHaveBeenCalledTimes(1);
    expect(mundo.mod).toHaveBeenCalledTimes(1);
  });

  it("passado um minuto a falha caduca e volta a tentar (e se correr bem, passa a servir)", async () => {
    mundo.cat.mockResolvedValue(ma); mundo.mod.mockResolvedValue(ma);
    await lerGlbsDoCatalogo("org-1");
    vi.setSystemTime(Date.now() + VALIDADE_FALHA_MS);
    mundo.cat.mockResolvedValue(boa); mundo.mod.mockResolvedValue(boa);
    expect(await lerGlbsDoCatalogo("org-1")).not.toBeNull();
    expect(mundo.cat).toHaveBeenCalledTimes(2);
  });

  it("a falha de uma organização não esconde as outras, e uma excepção conta como falha", async () => {
    mundo.cat.mockRejectedValueOnce(new Error("rede")).mockResolvedValue(boa); mundo.mod.mockResolvedValue(boa);
    expect(await lerGlbsDoCatalogo("org-1")).toBeNull();
    expect(await lerGlbsDoCatalogo("org-2")).not.toBeNull();
  });

  it("depois de ligar ou remover um GLB (invalidar) a próxima leitura vai à base, mesmo que a anterior tenha falhado", async () => {
    mundo.cat.mockResolvedValue(ma); mundo.mod.mockResolvedValue(ma);
    await lerGlbsDoCatalogo("org-1");
    invalidarGlbsDoCatalogo("org-1");
    mundo.cat.mockResolvedValue(boa); mundo.mod.mockResolvedValue(boa);
    expect(await lerGlbsDoCatalogo("org-1")).not.toBeNull();
    expect(mundo.cat).toHaveBeenCalledTimes(2);
  });

  it("a leitura boa caduca aos cinco minutos", async () => {
    mundo.cat.mockResolvedValue(boa); mundo.mod.mockResolvedValue(boa);
    await lerGlbsDoCatalogo("org-1");
    vi.setSystemTime(Date.now() + VALIDADE_LEITURA_MS);
    await lerGlbsDoCatalogo("org-1");
    expect(mundo.cat).toHaveBeenCalledTimes(2);
  });
});
