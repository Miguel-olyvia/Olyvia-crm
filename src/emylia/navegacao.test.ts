// 26/10: a navegação pelo endereço (navegacao.ts) e os filtros de trabalho do "Hoje" (filtrosTrabalho.ts).
import { describe, expect, it } from "vitest";
import { ROTA_VAZIA, aplicarNoEstado, hashParaRota, mesmoEcra, origemAtual, rotaParaHash, tirarPedidoRota, type Rota } from "./navegacao";
import { acoes, seed } from "./motor";
import { FILTROS_TRABALHO, eFiltroTrabalho } from "./filtrosTrabalho";

const R = (x: Partial<Rota>): Rota => ({ ...ROTA_VAZIA, ...x });

describe("o endereço de cada ecrã", () => {
  it("vai e volta sem perder nada: o negócio, a obra, o módulo com o contexto, o filtro do quadro", () => {
    for (const r of [
      R({ v: "negocio", deal: 1046 }),
      R({ v: "operacoes", op: 1046 }),
      R({ v: "catalogo" }),
      R({ v: "negocios", filtro: "faturar" }),
      R({ v: "inventario", mod: "inv", aba: "po", q: "EC-1046", de: "Obra #1046", volta: "/obra/1046" }),
      R({ v: "inventario", mod: "inv", aba: "stock", f: JSON.stringify({ state: "low" }), de: "Hoje", volta: "/hoje" }),
      R({ v: "inventario", mod: "frota", aba: "viaturas" }),
      R({ v: "inventario", mod: "rh", aba: "pessoas" }),
    ]) expect(hashParaRota(rotaParaHash(r)), rotaParaHash(r)).toEqual(r);
  });
  it("os caminhos legíveis", () => {
    expect(rotaParaHash(R({ v: "operacoes", op: 1046 }))).toBe("#/obra/1046");
    expect(rotaParaHash(R({ v: "negocio", deal: 7 }))).toBe("#/negocio/7");
    expect(rotaParaHash(R({ v: "inventario", mod: "inv", aba: "po", q: "EC-1046" }))).toBe("#/inventario/po?q=EC-1046");
  });
  it("um endereço que não é da app não dá rota", () => {
    expect(hashParaRota("")).toBeNull();
    expect(hashParaRota("#seccao")).toBeNull();
    expect(hashParaRota("#/coisa-que-nao-existe")).toBeNull();
  });
  it("o mesmo ecrã com outro contexto substitui no histórico; outro ecrã junta uma entrada", () => {
    expect(mesmoEcra(R({ v: "inventario", mod: "inv", aba: "po" }), R({ v: "inventario", mod: "inv", aba: "po", q: "x" }))).toBe(true);
    expect(mesmoEcra(R({ v: "inventario", mod: "inv", aba: "po" }), R({ v: "inventario", mod: "inv", aba: "ec" }))).toBe(false);
    expect(mesmoEcra(R({ v: "negocio", deal: 1 }), R({ v: "negocio", deal: 2 }))).toBe(false);
  });
});

describe("pôr a rota no Estado", () => {
  it("abre o negócio ou a obra só se existirem; o filtro do quadro vai para S.filtro", () => {
    const S = seed();
    const d = S.deals[0];
    expect(aplicarNoEstado(S, R({ v: "negocio", deal: d.id }))).toBe(true);
    expect([S.view, S.deal]).toEqual(["negocio", d.id]);
    expect(aplicarNoEstado(S, R({ v: "negocio", deal: 999999 }))).toBe(false);
    expect(aplicarNoEstado(S, R({ v: "negocios", filtro: "faturar" }))).toBe(true);
    expect(S.filtro).toBe("faturar");
  });
  it("de onde se vem, para o Voltar", () => {
    expect(origemAtual({ view: "operacoes", deal: null, op: 1046 })).toEqual({ de: "Obra #1046", volta: "/obra/1046" });
    expect(origemAtual({ view: "negocio", deal: 7, op: null })).toEqual({ de: "Negócio #7", volta: "/negocio/7" });
    expect(origemAtual({ view: "hoje", deal: null, op: null })).toEqual({ de: "", volta: "" });
  });
});

describe("os pedidos do motor levam o contexto", () => {
  it("as compras de uma obra: a lista filtrada pela encomenda de cliente e o Voltar à obra", () => {
    const S = seed();
    const d = S.deals.find((x) => x.obra.plano)!;
    d.obra.ec = { ...(d.obra.ec ?? {}), n: "EC-TESTE", ref: "CT 2026/TESTE" } as typeof d.obra.ec;
    const A = acoes(S, () => {}, (fn) => fn());
    A.abrirPlano(d.id);
    A.abrirComprasObra(d.id);
    expect(S.view).toBe("inventario");
    expect(tirarPedidoRota()).toMatchObject({ mod: "inv", aba: "po", q: d.obra.ec!.n, de: `Obra #${d.id}`, volta: `/obra/${d.id}` });
    expect(tirarPedidoRota()).toBeNull();
  });
  it("uma lista do Inventário vinda do Hoje: os filtros em JSON e o Voltar a Hoje", () => {
    const S = seed();
    acoes(S, () => {}, (fn) => fn()).abrirInvLista("po", { status: "late" });
    expect(tirarPedidoRota()).toMatchObject({ mod: "inv", aba: "po", f: '{"status":"late"}', de: "Hoje", volta: "/hoje" });
  });
});

describe("os filtros de trabalho do quadro", () => {
  it("cada um escolhe só os negócios que diz", () => {
    const S = seed();
    expect(eFiltroTrabalho("faturar")).toBe(true);
    expect(eFiltroTrabalho("meus")).toBe(false);
    for (const d of S.deals.filter(FILTROS_TRABALHO.pagar.vale)) expect(!!d.fin.fatura && !d.fin.pago).toBe(true);
    for (const d of S.deals.filter(FILTROS_TRABALHO.propostas.vale)) expect(d.fase === 3 && !!d.orc?.enviada && !d.orc?.aceite).toBe(true);
    expect(S.deals.some(FILTROS_TRABALHO.propostas.vale)).toBe(true);
  });
});

describe("o estado de dentro das páginas no endereço (usarParamUrl.ts)", () => {
  it("os parâmetros das páginas ficam no mesmo ecrã; os da rota não se duplicam", async () => {
    const { juntarExtras } = await import("./navegacao");
    expect(juntarExtras("#/obra/1046", "#/obra/1046?sec=meios")).toBe("#/obra/1046?sec=meios");
    expect(juntarExtras("#/inventario/po?q=EC-1", "#/inventario/po?q=EC-2&sec=x")).toBe("#/inventario/po?q=EC-1&sec=x");
    expect(juntarExtras("#/hoje", "#/hoje")).toBe("#/hoje");
  });
  it("escrever junta uma entrada ao histórico (ou substitui); o valor por omissão sai do endereço", async () => {
    const { escreverParamUrl, lerParamUrl } = await import("./usarParamUrl");
    window.history.replaceState(null, "", "/#/obra/7");
    const antes = window.history.length;
    escreverParamUrl("sec", "meios");
    expect(window.location.hash).toBe("#/obra/7?sec=meios");
    expect(window.history.length).toBe(antes + 1);
    expect(lerParamUrl("sec")).toBe("meios");
    escreverParamUrl("sec", "", true);
    expect(window.location.hash).toBe("#/obra/7");
    expect(window.history.length).toBe(antes + 1);
  });
  it("o título do separador do browser segue a rota", async () => {
    const { tituloDaRota } = await import("./navegacao");
    const nome = (id: number) => (id === 7 ? "Anabela" : undefined);
    expect(tituloDaRota(R({ v: "operacoes", op: 7 }), nome)).toBe("Olyvia · Obra · Anabela");
    expect(tituloDaRota(R({ v: "negocio", deal: 7 }), nome)).toBe("Olyvia · Anabela");
    expect(tituloDaRota(R({ v: "inventario", mod: "inv", aba: "po" }), nome)).toBe("Olyvia · Inventário · Encomendas a fornecedor");
    expect(tituloDaRota(R({ v: "catalogo" }), nome)).toBe("Olyvia · Catálogo e custos");
  });
});
