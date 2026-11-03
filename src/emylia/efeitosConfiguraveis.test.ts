// 3/11 (Rúben): o impacto dos campos no orçamento configurado pela organização (CfgEfeitos). Sem ajustes, os valores de sempre.
import { afterEach, describe, expect, it } from "vitest";
import {
  definirEfeitosCampos, efeitosDoCampo, efeitosDoLevantamento, lerCfgEfeitos, REGRAS_EFEITO, valorParam, type CfgEfeitos,
} from "./efeitosLevantamento";

afterEach(() => definirEfeitosCampos(null));

const PAGO = { estacionamento: "Pago", zona_estacionamento: "Amarela" };

describe("impacto dos campos configurável", () => {
  it("sem ajustes fica tudo como sempre (estacionamento pago: 10 dias × 8 €)", () => {
    const [e] = efeitosDoCampo("zona_estacionamento", PAGO);
    expect(e).toMatchObject({ d: "Estacionamento pago (10 dias × 8 €)", custo: 80, preco: 80 });
    expect(efeitosDoLevantamento(PAGO, {})).toEqual(efeitosDoLevantamento(PAGO));
  });

  it("o preço por dia e os dias por omissão vêm da configuração", () => {
    const cfg: CfgEfeitos = { estacionamento: { v: { dia_amarela: 12, dias: 15 } } };
    expect(efeitosDoCampo("zona_estacionamento", PAGO, cfg)[0]).toMatchObject({ d: "Estacionamento pago (15 dias × 12 €)", preco: 180 });
    // o prazo da proposta continua a ganhar aos dias por omissão
    expect(efeitosDoCampo("zona_estacionamento", { ...PAGO, prazo_exec: "4" }, cfg)[0]).toMatchObject({ preco: 48 });
  });

  it("a configuração que a página definiu é a que o motor e a nota usam", () => {
    definirEfeitosCampos({ amianto: { v: { custo: 400, preco: 700 } } });
    expect(efeitosDoCampo("amianto", { amianto: "Sim" })[0]).toMatchObject({ custo: 400, preco: 700 });
    definirEfeitosCampos(null);
    expect(efeitosDoCampo("amianto", { amianto: "Sim" })[0]).toMatchObject({ custo: 300, preco: 520 });
  });

  it("uma regra desligada não mexe no orçamento", () => {
    expect(efeitosDoCampo("tem_elevador", { tem_elevador: "Sim" }, { elevador: { off: true } })).toEqual([]);
    expect(efeitosDoLevantamento({ habitada_durante_obra: "Sim", diag_janela: "Não" }, { habitada: { off: true } }).map((e) => e.k)).toEqual(["diag_janela"]);
  });

  it("as respostas a que a regra se aplica mudam-se (ex.: amianto também com «Não sei»)", () => {
    const cfg: CfgEfeitos = { amianto: { ops: ["Sim", "Não sei"] } };
    expect(efeitosDoCampo("amianto", { amianto: "Não sei" })).toEqual([]);
    expect(efeitosDoCampo("amianto", { amianto: "Não sei" }, cfg)).toHaveLength(1);
    expect(efeitosDoCampo("amianto", { amianto: "Sim" }, { amianto: { ops: ["Não sei"] } })).toEqual([]);
  });

  it("as percentagens e as horas também se configuram, e o texto acompanha", () => {
    const e = efeitosDoLevantamento({ habitada_durante_obra: "Sim", tem_elevador: "Não", andar: "2" }, { habitada: { v: { pct: 6 } }, escada: { v: { h_andar: 2, preco_h: 40 } } });
    expect(e.find((x) => x.k === "habitada_durante_obra")).toMatchObject({ pct: 0.06, d: "Casa habitada: limpeza diária e arrumação (+6%)" });
    expect(e.find((x) => x.k === "andar")).toMatchObject({ d: "Transporte pela escada (2.º andar, 4 h)", preco: 160 });
  });

  it("uma regra posta a zero não deixa uma linha de 0 € no orçamento", () => {
    expect(efeitosDoCampo("tem_elevador", { tem_elevador: "Sim" }, { elevador: { v: { custo: 0, preco: 0 } } })).toEqual([]);
  });

  it("o que vem da base é limpo: regras e parâmetros desconhecidos, números inválidos e negativos ficam de fora", () => {
    const lido = lerCfgEfeitos({
      inventada: { off: true },
      estacionamento: { v: { dia_amarela: 9, dia_azul: 3, dias: -1, dia_verde: "5" }, ops: ["Pago", 7, ""] },
      portas: { ops: ["Sim"] },
      elevador: { off: true },
    });
    expect(lido).toEqual({ estacionamento: { v: { dia_amarela: 9 }, ops: ["Pago"] }, elevador: { off: true } });
    expect(lerCfgEfeitos(null)).toEqual({});
    expect(lerCfgEfeitos([1, 2])).toEqual({});
  });

  it("cada regra tem um valor por omissão para cada parâmetro (o que o editor mostra)", () => {
    for (const r of REGRAS_EFEITO) for (const p of r.params) expect(valorParam({}, r.id, p.p), `${r.id}.${p.p}`).toBe(p.v);
  });
});
