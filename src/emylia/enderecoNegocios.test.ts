import { afterEach, describe, expect, it } from "vitest";
import { ecraDoEndereco, ecraDoEstado, ecraValido, mesmoEcra, pesquisaDoEcra } from "./enderecoNegocios";
import { escreverParamUrl, lerParamUrl } from "@/lib/paramUrl";
import type { Estado } from "./motor";

const P = (s: string) => new URLSearchParams(s);
const deals = [{ id: 1026, obra: { plano: {} } }, { id: 1030, obra: { plano: null } }] as unknown as Estado["deals"];

describe("o ecrã dos Negócios no endereço (12/11)", () => {
  it("lê o negócio, a vista e a obra do endereço", () => {
    expect(ecraDoEndereco(P("negocio=1026"))).toEqual({ view: "negocio", deal: 1026, op: null });
    expect(ecraDoEndereco(P("vista=operacoes&obra=1026"))).toEqual({ view: "operacoes", deal: null, op: 1026 });
    expect(ecraDoEndereco(P("vista=hoje"))).toEqual({ view: "hoje", deal: null, op: null });
    expect(ecraDoEndereco(P(""))).toEqual({ view: "negocios", deal: null, op: null });
    // /home abre no Hoje; ?vista=negocios leva aos Negócios
    expect(ecraDoEndereco(P(""), "hoje").view).toBe("hoje");
    expect(ecraDoEndereco(P("vista=negocios"), "hoje").view).toBe("negocios");
    // lixo no endereço não abre nada
    expect(ecraDoEndereco(P("negocio=abc&vista=xpto"))).toEqual({ view: "negocios", deal: null, op: null });
    expect(ecraDoEndereco(P("vista=hoje&obra=1026")).op).toBeNull();
  });

  it("escreve o ecrã e larga os parâmetros do ecrã anterior (fica o ?teste=)", () => {
    const atual = P("negocio=1026&passo=orc&estudio=plano&teste=1");
    expect(pesquisaDoEcra({ view: "negocios", deal: null, op: null }, atual)).toBe("?teste=1");
    expect(pesquisaDoEcra({ view: "negocio", deal: 1030, op: null }, P("negocio=1026&passo=orc"))).toBe("?negocio=1030");
    expect(pesquisaDoEcra({ view: "operacoes", deal: null, op: 1026 }, P(""))).toBe("?vista=operacoes&obra=1026");
    expect(pesquisaDoEcra({ view: "hoje", deal: null, op: null }, P(""), "hoje")).toBe("");
    expect(pesquisaDoEcra({ view: "negocios", deal: null, op: null }, P(""), "hoje")).toBe("?vista=negocios");
  });

  it("ida e volta: o que se escreve lê-se igual", () => {
    for (const e of [{ view: "negocio", deal: 7, op: null }, { view: "operacoes", deal: null, op: 9 }, { view: "hoje", deal: null, op: null }] as const)
      for (const om of ["negocios", "hoje"] as const)
        expect(mesmoEcra(ecraDoEndereco(P(pesquisaDoEcra(e, P(""), om).slice(1)), om), e)).toBe(true);
  });

  it("o estado: só as vistas desta página", () => {
    expect(ecraDoEstado({ view: "negocio", deal: 1026, op: null })).toEqual({ view: "negocio", deal: 1026, op: null });
    expect(ecraDoEstado({ view: "operacoes", deal: null, op: 1026 })?.op).toBe(1026);
    expect(ecraDoEstado({ view: "inventario", deal: null, op: null })).toBeNull();
    expect(ecraDoEstado({ view: "negocio", deal: null, op: null })).toBeNull();
  });

  it("um negócio que não existe abre a lista; uma obra sem plano abre as Operações", () => {
    expect(ecraValido({ view: "negocio", deal: 999, op: null }, { deals })).toEqual({ view: "negocios", deal: null, op: null });
    expect(ecraValido({ view: "operacoes", deal: null, op: 1030 }, { deals }).op).toBeNull();
    expect(ecraValido({ view: "operacoes", deal: null, op: 1026 }, { deals }).op).toBe(1026);
  });
});

describe("paramUrl na pesquisa (a app, não a moldura do protótipo)", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));
  it("junta e tira um parâmetro sem mexer nos outros, e cada mudança é uma entrada do histórico", () => {
    window.history.replaceState({ idx: 3 }, "", "/negocios?negocio=1026");
    const antes = window.history.length;
    escreverParamUrl("passo", "orc", false, "pesquisa");
    expect(window.location.search).toBe("?negocio=1026&passo=orc");
    expect(lerParamUrl("passo", "pesquisa")).toBe("orc");
    expect(window.history.length).toBe(antes + 1);
    expect((window.history.state as { idx: number }).idx).toBe(4);
    escreverParamUrl("passo", "", true, "pesquisa");
    expect(window.location.search).toBe("?negocio=1026");
    expect(window.history.length).toBe(antes + 1);
  });
});
