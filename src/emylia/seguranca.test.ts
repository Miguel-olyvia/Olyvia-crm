// 23/10/2026 (segurança): as permissões reais das ações dos Negócios e o Estado por organização (sem os dados de exemplo nas reais).
import { afterEach, describe, expect, it } from "vitest";
import { CODIGO_BASE, definirPermissoesReais, podeNeg } from "./permissoes";
import { chaveLocal, esquecerMemoria, estadoInicial, estadoVazio, frotaVazia, inventarioVazio, lerEstadoLocal } from "./estadoOrganizacao";
import { acoes, seed } from "./motor";
import { lerInventario } from "./inventario/loja";
import { lerFrota } from "./frota/loja";
import { nomeConfere } from "./DialogosSeguranca";

afterEach(() => { definirPermissoesReais(null); localStorage.clear(); });

describe("podeNeg: as permissões reais, e o quadro por papel só para simular", () => {
  it("sem conta (o protótipo e os testes): o quadro por papel", () => {
    expect(podeNeg("financeiro", "finance.validate_payment")).toBe(true);
    expect(podeNeg("comercial", "finance.validate_payment")).toBe(false);
    expect(podeNeg("direcao", "margin.approve")).toBe(true);
  });
  it("com conta: o que a base diz, seja qual for o papel do protótipo", () => {
    definirPermissoesReais({ codigos: new Set(["financeiro.validar_pagamento"]), simular: false });
    expect(podeNeg("comercial", "finance.validate_payment")).toBe(true); // um papel personalizado com a permissão
    expect(podeNeg("direcao", "contracts.cancel")).toBe(false); // o papel "direcao" do Estado não chega
    expect(podeNeg("financeiro", "finance.invoice")).toBe(false);
  });
  it("a Direção a ver como outro papel: o desse papel, mas nunca mais do que ela pode", () => {
    definirPermissoesReais({ codigos: new Set(Object.values(CODIGO_BASE).filter((c) => c !== "negocios.anular")), simular: true });
    expect(podeNeg("financeiro", "finance.validate_payment")).toBe(true);
    expect(podeNeg("comercial", "finance.validate_payment")).toBe(false);
    expect(podeNeg("direcao", "contracts.cancel")).toBe(false);
  });
  it("com conta e as permissões ainda por ler (ou a leitura falhou): nenhuma", () => {
    definirPermissoesReais({ codigos: null, simular: true });
    expect(podeNeg("direcao", "finance.invoice")).toBe(false);
  });
  it("o motor pede-as: um técnico com o papel 'direcao' no Estado não aprova a margem nem anula", () => {
    const S = seed();
    S.role = "direcao";
    const avisos: string[] = [];
    const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
    definirPermissoesReais({ codigos: new Set(["obras.executar"]), simular: false });
    const d = S.deals.find((x) => x.orc)!;
    d.orc!.aprov = "pedida";
    A.aprovar(d.id);
    expect(d.orc!.aprov).toBe("pedida");
    expect(avisos).toContain("Sem permissão para aprovar a margem");
  });
  it("os códigos são os do catálogo da base", () => {
    expect(CODIGO_BASE).toMatchObject({ "finance.validate_payment": "financeiro.validar_pagamento", "finance.invoice": "financeiro.faturar",
      "contracts.cancel": "negocios.anular", "margin.approve": "orcamentos.aprovar_margem" });
  });
});

describe("o Estado por organização", () => {
  it("a chave local leva a organização e quem entrou; sem conta, a de sempre", () => {
    expect(chaveLocal(null)).toBe("olyvia-prototipo-negocios");
    expect(chaveLocal("org-a", "m1")).toBe("olyvia-prototipo-negocios:org-a:m1");
    expect(chaveLocal("org-a", "m1")).not.toBe(chaveLocal("org-b", "m1"));
  });
  it("uma organização real começa vazia: sem negócios, clientes, contas nem stock; com o catálogo e os custos", () => {
    const S = estadoVazio("org-a");
    expect(S.org).toBe("org-a");
    expect(S.deals).toEqual([]);
    expect(S.clientes).toEqual([]);
    expect(S.acessos).toEqual({});
    expect(Object.values(S.stock).every((n) => n === 0)).toBe(true);
    expect(Object.keys(S.svc).length).toBeGreaterThan(5);
    expect(S.custos).toBeTruthy();
    expect(estadoInicial("org-a", false).deals).toEqual([]);
  });
  it("só a organização de demonstração recebe os dados de exemplo", () => {
    const D = estadoInicial("org-demo", true);
    expect(D.deals.length).toBeGreaterThan(5);
    expect(D.org).toBe("org-demo");
  });
  it("o Estado guardado de outra organização (ou sem marca) não se lê", () => {
    const S = estadoVazio("org-a");
    localStorage.setItem(chaveLocal("org-a", "m1"), JSON.stringify(S));
    expect(lerEstadoLocal(chaveLocal("org-a", "m1"), "org-a")?.org).toBe("org-a");
    expect(lerEstadoLocal(chaveLocal("org-a", "m1"), "org-b")).toBeNull();
    localStorage.setItem("x", JSON.stringify({ ...S, org: undefined }));
    expect(lerEstadoLocal("x", "org-a")).toBeNull();
  });
  it("o Inventário e a Frota de uma organização real começam vazios", () => {
    const inv = inventarioVazio();
    expect(inv.products).toEqual([]);
    expect(inv.suppliers).toEqual([]);
    expect(inv.pos).toEqual([]);
    expect(inv.warehouses).toHaveLength(1);
    const F = frotaVazia();
    expect(F.viaturas).toEqual([]);
    expect(F.pessoas).toEqual([]);
  });
  it("trocar de organização esquece a memória: o Inventário e a Frota passam aos da organização nova (vazios numa real)", () => {
    esquecerMemoria(null, true);
    expect(lerInventario().products.length).toBeGreaterThan(0); // a demonstração
    esquecerMemoria("org-a", false, "m1");
    expect(lerInventario().products).toEqual([]);
    expect(lerFrota().viaturas).toEqual([]);
    esquecerMemoria(null, true); // volta ao protótipo de sempre (os outros testes)
    expect(lerFrota().viaturas.length).toBeGreaterThan(0);
  });
  it("repor numa organização com conta pede o nome exato da organização", () => {
    expect(nomeConfere("mudelar", "Mudelar")).toBe(true);
    expect(nomeConfere(" Mudelar ", "Mudelar")).toBe(true);
    expect(nomeConfere("Mudela", "Mudelar")).toBe(false);
    expect(nomeConfere("", "")).toBe(false);
  });
});
