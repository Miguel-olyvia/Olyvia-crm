import { afterEach, describe, expect, it } from "vitest";
import { garantirServico, r2, seed } from "./motor";
import { CATALOGO_TODO, ehCriado, itemCatalogo } from "./catalogo";
import { aplicarParteCatalogo, lerCatalogo, lerParteCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import { ligarCustos, lerCustos, mudarCustos, reporCustos } from "./v2/custosStore";
import { custoHoraPerfil, custos0, listaCatalogoCompleta } from "./v2/custosModelo";
import { catalogo0, oficios } from "./v2/catalogoModelo";
import {
  consumiveisComCriados, criarConsumivel, criarEquip, criarProdutoCompleto, criarServico, criarTecnico, faltasServico, horaTecnicoNovo,
  previsaoServico, type NovoServico,
} from "./criarCatalogo";

afterEach(() => { reporCustos(); reporCatalogo(); });

const K0 = catalogo0();
const canal = oficios(K0.arvore).find((o) => o.n === "Canalização")!;
const novo = (o: Partial<NovoServico> = {}): NovoServico => ({
  n: "Instalação de base de duche extraplana", no: canal.id, un: "un", medida: null, linhas: ["wc"],
  mo: [{ n: "Execução", perfil: "canalizador", h: 2 }], equip: [], cons: [{ n: "Silicone", q: 1, un: "un", preco: 6, fornecedor: "Leroy" }],
  modo: "margem", precoTabela: 0, margem: 40, ...o,
});

describe("criar um serviço", () => {
  it("diz o que falta, pela ordem do formulário", () => {
    expect(faltasServico(K0, novo({ n: "", mo: [], modo: "tabela" }))).toEqual([
      "Escreva o nome do serviço.", "Ponha pelo menos um passo de mão de obra com horas.", "Escreva o preço de tabela.",
    ]);
    expect(faltasServico(K0, novo({ n: CATALOGO_TODO[0].n.toUpperCase() }))[0]).toMatch(/^Já existe um serviço/);
    expect(faltasServico(K0, novo())).toEqual([]);
  });
  it("a pré-visualização é a conta da receita: (mão de obra + consumíveis) ÷ (1 − margem)", () => {
    const C = custos0(), pv = previsaoServico(novo(), C, false);
    expect(pv.c.cons).toBeCloseTo(6, 6);
    expect(pv.preco).toBeCloseTo(pv.c.total / 0.6, 6);
    expect(pv.m).toBeCloseTo(0.4, 6);
  });
  it("fica no Catálogo (item, ofício, receita) e o motor usa-o como os outros, com o mesmo preço", () => {
    const S = seed();
    ligarCustos(S);
    const r = criarServico(lerCatalogo(), lerCustos(), novo());
    if (!r.ok) throw new Error(r.erro);
    expect(r.id).toBe("n-instalacao-de-base-de-duche-extraplana");
    mudarCustos(() => r.C);
    mudarCatalogo(() => r.K);
    expect(ehCriado(r.id)).toBe(true);
    expect(itemCatalogo(r.id)).toMatchObject({ n: "Instalação de base de duche extraplana", cat: "Canalização", un: "un", hu: 2, linhas: ["wc"] });
    expect(lerCatalogo().classe[r.id]).toBe(canal.id);
    expect(S.custos!.receitas[r.id].origem).toBe("editada");
    // na lista do Catálogo, "não usado" até a visita o escolher
    const i = listaCatalogoCompleta(S, lerCustos()).find((x) => x.sid === r.id)!;
    expect(i.emUso).toBe(false);
    const pv = previsaoServico(novo(), lerCustos(), S.cfg.estrutura);
    expect(i.preco).toBeCloseTo(pv.preco, 6);
    // a visita escolhe-o: entra em S.svc com o preço e o técnico da receita
    const sv = garantirServico(S, r.id)!;
    expect(sv.n).toBe("Instalação de base de duche extraplana");
    expect(sv.preco).toBe(r2(pv.preco));
    expect(sv.perfilId).toBe("canalizador");
    // o mesmo nome já não se pode criar
    expect(criarServico(lerCatalogo(), lerCustos(), novo())).toMatchObject({ ok: false });
  });
  it("vai para a base com o Catálogo (só a diferença) e volta noutro aparelho; repor tira-o", () => {
    const r = criarServico(lerCatalogo(), lerCustos(), novo());
    if (!r.ok) throw new Error(r.erro);
    mudarCatalogo(() => r.K);
    const parte = JSON.parse(JSON.stringify(lerParteCatalogo()));
    expect(parte.resto.servicosCriados).toHaveLength(1);
    reporCatalogo();
    expect(itemCatalogo(r.id)).toBeUndefined();
    aplicarParteCatalogo(parte);
    expect(itemCatalogo(r.id)?.n).toBe("Instalação de base de duche extraplana");
    expect(CATALOGO_TODO.filter((c) => c.id === r.id)).toHaveLength(1);
    reporCatalogo();
    expect(CATALOGO_TODO.some((c) => c.id === r.id)).toBe(false);
  });
});

describe("criar produtos, equipamentos, consumíveis e técnicos", () => {
  it("produto: com PVP, referência, descrição e o serviço que traz; a referência não se repete", () => {
    const r = criarProdutoCompleto(K0, { n: "Sanita suspensa Rimless", custo: 120, un: "un", marca: "Roca", sku: "RO-123", pvp: 210, desc: "Com tampa amortecida", servico: "c5" });
    if (!r.ok) throw new Error(r.erro);
    expect(r.K.produtos.find((p) => p.id === r.id)).toMatchObject({ n: "Sanita suspensa Rimless", custo: 120, pvp: 210, sku: "RO-123", servico: "c5", desc: "Com tampa amortecida" });
    expect(criarProdutoCompleto(r.K, { n: "Outra", custo: 1, un: "un", sku: "ro-123" })).toEqual({ ok: false, erro: "A referência ro-123 já é de outro produto." });
  });
  it("equipamento: o €/h sai das contas de sempre e o residual não passa a compra", () => {
    const C = custos0();
    const r = criarEquip(C, { n: "Serra circular de bancada 315 mm", compra: 600, residual: 100, vida: 1000, manutAno: 60, usoAno: 300 });
    if (!r.ok) throw new Error(r.erro);
    expect(r.id).toBe("e-serra-circular-de-bancada-315-mm");
    expect(r.C.equip.at(-1)).toMatchObject({ compra: 600, residual: 100, vida: 1000, manutAno: 60, usoAno: 300 });
    expect(criarEquip(C, { n: "X", compra: 10, residual: 20, vida: 10, manutAno: 0, usoAno: 0 })).toEqual({ ok: false, erro: "O valor residual não pode passar a compra." });
  });
  it("consumível: entra na lista do Catálogo sem serviço, até uma receita o usar", () => {
    const S = seed(), C = custos0();
    const L0 = consumiveisComCriados(S, C, K0);
    const r = criarConsumivel(K0, L0, { n: "Silicone sanitário transparente", un: "un", preco: 5.9, fornecedor: "", opcional: true });
    if (!r.ok) throw new Error(r.erro);
    const x = consumiveisComCriados(S, C, r.K).find((c) => c.n === "Silicone sanitário transparente")!;
    expect(x).toMatchObject({ preco: 5.9, fornecedor: "Por escolher", servicos: [] });
    expect(criarConsumivel(r.K, consumiveisComCriados(S, C, r.K), { n: "silicone SANITÁRIO transparente", un: "un", preco: 1, fornecedor: "" })).toMatchObject({ ok: false });
  });
  it("técnico: o €/h pelo salário; sem salário fica sem €/h", () => {
    const C = custos0();
    expect(horaTecnicoNovo(C, { n: "Estucador", salario: 1900 })).toBeCloseTo(custoHoraPerfil({ id: "", n: "", salario: 1900 }, C.par)!, 6);
    const r = criarTecnico(C, { n: "Estucador", salario: null });
    if (!r.ok) throw new Error(r.erro);
    expect(r.C.perfis.at(-1)).toEqual({ id: "estucador", n: "Estucador", salario: null });
    expect(criarTecnico(r.C, { n: "estucador", salario: null })).toMatchObject({ ok: false });
  });
});
