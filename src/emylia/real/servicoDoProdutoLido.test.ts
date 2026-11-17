// 17/11 (A-Z na Mudelar: «Serviços que não estão no Catálogo desta organização: <uuid>»): o produto lido do servidor traz o serviço pelo id da
// base; no negócio vai pela chave do motor.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./produtosLeves", () => ({
  lerProdutoFicha: vi.fn(async (_org: string, id: string) => ({ ok: true, v: { id, n: "SANITA FLY", custo: 100, un: "un", marca: "", fornecedor: "", data: "", no: "sub-san", servico: "11111111-1111-4111-8111-111111111111", fatorServico: 1 } })),
}));
vi.mock("./produtosPaginados", () => ({ SEM_FILTRO_SERVIDOR: {}, lerProdutosPagina: vi.fn() }));

import { chaveDoServicoLido, definirServicosLidos, limparCatalogoLido } from "./catalogoLeve";
import { escolherProdutoDoServidor } from "./pesquisaProdutos";
import { lerCatalogo, mudarCatalogo } from "../v2/catalogoStore";

afterEach(() => { limparCatalogoLido(); mudarCatalogo((k) => { k.produtos = k.produtos.filter((p) => p.id !== "p-fly"); }); });

describe("o serviço de um produto lido do servidor", () => {
  it("o id da base passa à chave do motor; um id que o Catálogo não tem sai; uma chave fica", () => {
    definirServicosLidos(new Map([["c17", "11111111-1111-4111-8111-111111111111"]]));
    expect(chaveDoServicoLido("11111111-1111-4111-8111-111111111111")).toBe("c17");
    expect(chaveDoServicoLido("22222222-2222-4222-8222-222222222222")).toBeUndefined();
    expect(chaveDoServicoLido("loucas")).toBe("loucas");
    expect(chaveDoServicoLido(undefined)).toBeUndefined();
  });
  it("escolher do servidor mete o produto no Catálogo já com a chave", async () => {
    definirServicosLidos(new Map([["c17", "11111111-1111-4111-8111-111111111111"]]));
    const r = await escolherProdutoDoServidor("org", "p-fly");
    expect(r.ok && r.v.servico).toBe("c17");
    expect(lerCatalogo().produtos.find((p) => p.id === "p-fly")?.servico).toBe("c17");
  });
});
