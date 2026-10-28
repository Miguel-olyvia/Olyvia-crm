// aplicarCatalogo: o que vem da base (custos, estrutura, técnicos do RH) fica no Estado do motor, e não só nas stores.
// Antes (até 28/10) o S.custos e o S.tecnicos ficavam os do seed(): o orçamento contava a estrutura de exemplo e o Hoje repunha os
// técnicos de exemplo (garantirTecnicos), que depois se gravavam na obra sem pessoa do RH.
import { describe, expect, it } from "vitest";
import { estruturaHora, seed } from "../motor";
import { catalogo0 } from "../v2/catalogoModelo";
import { custosDe } from "../v2/custosModelo";
import { lerCustos } from "../v2/custosStore";
import { TECNICOS, garantirTecnicos } from "../equipa/tecnicos";
import { montarCatalogo } from "./catalogoReal";
import { linhasDe } from "./lerCatalogo";
import { aplicarCatalogo } from "./carregarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const PERFIL = "22222222-2222-4222-a222-222222222222";
const PESSOA = "33333333-3333-4333-a333-333333333333";

const linhas = (tecnicos = [{ id: PESSOA, nome: "Ana Sousa", custo_hora: 21.5, perfis: [PERFIL] }]) => linhasDe({
  parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
  margemLinha: [], categorias: [],
  perfis: [{ id: PERFIL, chave: "canalizador", nome: "Canalizador", salario_referencia: 1100, ativo: true, custo_hora: 21.5, fonte: "rh", n: 1, nomes: ["Ana Sousa"], cargos: ["Técnico"] }],
  equipamentos: [],
  // uma estrutura muito diferente da de exemplo (3400 €/mês), para se ver de onde vem a taxa
  estrutura: [{ id: "44444444-4444-4444-a444-444444444444", nome: "Renda", categoria: "Renda", mensal: 900, ativo: true, ordem: 0 }],
  servicos: [], precosServico: [], passos: [], usosEquip: [], usosCons: [], produtos: [], precosProduto: [], fornecedores: [],
  tecnicos,
});

describe("aplicarCatalogo põe a base no Estado", () => {
  it("os custos do Estado são os da base: a estrutura conta no €/h e a store fica presa ao Estado", () => {
    const exemplo = estruturaHora(seed());
    const S = seed();
    const M = montarCatalogo(linhas(), catalogo0(), seed().svc);
    aplicarCatalogo(ORG, M, [], S);
    expect(S.custos).toBe(M.C);
    expect(custosDe(S)).toBe(M.C);
    expect(lerCustos()).toBe(M.C);
    expect(estruturaHora(S)).not.toBe(exemplo);
    expect(estruturaHora(S)).toBeLessThan(exemplo);
  });

  it("os técnicos são os do RH e o garantirTecnicos (Hoje, agenda) já não repõe os de exemplo", () => {
    const S = seed();
    aplicarCatalogo(ORG, montarCatalogo(linhas(), catalogo0(), seed().svc), [], S);
    expect(S.tecnicos!.map((t) => t.id)).toEqual([PESSOA]);
    garantirTecnicos(S);
    expect(TECNICOS.map((t) => t.id)).toEqual([PESSOA]);
    expect(S.tecnicos!.map((t) => t.id)).toEqual([PESSOA]);
  });

  it("uma organização sem técnicos no RH fica sem técnicos (não volta aos de exemplo)", () => {
    const S = seed();
    aplicarCatalogo(ORG, montarCatalogo(linhas([]), catalogo0(), seed().svc), [], S);
    garantirTecnicos(S);
    expect(S.tecnicos).toEqual([]);
    expect(TECNICOS).toEqual([]);
  });
});
