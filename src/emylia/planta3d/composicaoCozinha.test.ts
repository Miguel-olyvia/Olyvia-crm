// A composição modular de cozinha: predefinidos, edição das ranhuras, peças 3D dos módulos e venda por módulo com o desconto só completo.
import { describe, expect, it } from "vitest";
import { retangulo, type Planta } from "../planta";
import { linhasVendaveis, totalDasLinhas } from "./conjuntos";
import {
  DESCONTO_COMPOSICAO, PREDEFINIDOS, acrescentarModulo, aplicarComposicao, composicaoDe, larguraTotal, linhasDaComposicao, moverModulo, mudarModulo, pecaComposicao, pecasDosModulos,
  precoComposicao, predefinido, retirarModulo,
} from "./composicaoCozinha";
import { moverPara } from "./pecas3d";

const colunas = composicaoDe(predefinido("colunas_forno")!);

describe("composição modular de cozinha", () => {
  it("há os quatro predefinidos pedidos", () => {
    expect(PREDEFINIDOS.map((p) => p.nome)).toEqual(["Duas colunas com forno no meio", "Coluna de frigorífico e bases", "Bancada com módulos de parede", "Ilha com gavetas"]);
    expect(predefinido("ilha_gavetas")?.ilha).toBe(true);
  });
  it("duas colunas com forno: colunas nas pontas e, no meio, gavetão, forno e armário de parede por cima", () => {
    const p = pecasDosModulos(colunas);
    expect(p.map((x) => x.categoria)).toEqual(["coluna_cozinha", "modulo_base", "forno", "armario_parede", "coluna_cozinha"]);
    expect(p.find((x) => x.categoria === "armario_parede")).toMatchObject({ y: 145, d: 35, h: 70, x: 0 });
    expect(p[0].x).toBe(-60);
  });
  it("editar ranhuras: tipo, largura, cor, acrescentar, retirar e reordenar (sem mutar a original)", () => {
    let c = mudarModulo(colunas, "f", { largura: 80, cor: "#222222" });
    expect(larguraTotal(c)).toBe(200);
    c = acrescentarModulo(c, "base_gavetas", 40);
    expect(c.modulos.map((m) => m.tipo)).toEqual(["coluna_despensa", "base_forno", "coluna_despensa", "base_gavetas"]);
    c = moverModulo(c, c.modulos[3].id, -1);
    expect(c.modulos[2].tipo).toBe("base_gavetas");
    c = retirarModulo(c, "c1");
    expect(c.modulos).toHaveLength(3);
    expect(larguraTotal(colunas)).toBe(180);
    // uma coluna não leva armário de parede por cima
    expect(mudarModulo(colunas, "f", { tipo: "coluna_forno" }).modulos[1].parede).toBe(false);
  });
  it("cada módulo é uma linha vendável; o desconto só com todos os obrigatórios", () => {
    const completo = precoComposicao(colunas);
    expect(completo.completo).toBe(true);
    expect(completo.total).toBeCloseTo(completo.soma * (1 - DESCONTO_COMPOSICAO), 2);
    expect(linhasDaComposicao(colunas).map((l) => l.nome)).toEqual(["Coluna despensa 60 cm", "Base com forno encastrado e gavetão 60 cm", "Armário de parede 60 cm", "Coluna despensa 60 cm"]);
    const sem = precoComposicao(retirarModulo(colunas, "c2"));
    expect(sem).toMatchObject({ completo: false, faltam: ["Coluna despensa"] });
    expect(sem.total).toBe(sem.soma);
  });
  it("na planta é UMA peça: linhas por módulo, total com desconto, e mexe-se como um bloco", () => {
    const planta: Planta = { o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [pecaComposicao("k", { x: 50, y: 0 }, colunas)] };
    const linhas = linhasVendaveis(planta);
    expect(linhas).toHaveLength(4);
    expect(linhas.every((l) => l.conjId === "k" && l.vendivelSeparado)).toBe(true);
    expect(totalDasLinhas(planta)).toBe(precoComposicao(colunas).total);
    const r = moverPara(planta, planta.pecas[0], 2.0, 0.3);
    expect(r.ok && [r.peca.w, r.peca.coz?.modulos.length]).toEqual([180, 3]);
    expect(aplicarComposicao(planta.pecas[0], acrescentarModulo(colunas)).w).toBe(240);
  });
});
