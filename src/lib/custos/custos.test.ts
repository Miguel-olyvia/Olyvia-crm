import { describe, expect, it } from "vitest";
import {
  PARAMETROS_BMG,
  acaoEnvio,
  custoHoraCalc,
  custoHoraEquipamento,
  custoHoraPerfil,
  custoReceita,
  estruturaHora,
  formatarEur,
  formatarPct,
  lerNumero,
  margemPct,
  mediaCustoHora,
  precoSugerido,
  verificarMargem,
  type LinhaOrcamento,
  type ParametrosCusto,
  type Receita,
} from "./index";

// Os números do protótipo (receitas.ts: × 14, TSU 23,75%, seguros 713 €/ano,
// 1.345 h/ano), passados para os parâmetros mensais da área de custos.
const PROTOTIPO: ParametrosCusto = {
  ...PARAMETROS_BMG,
  encargos_pct: 0,
  subsidio_alimentacao_dia: 0,
  dias_subsidio_mes: 0,
  seguro_mes: 59.42,
  horas_produtivas_mes: 112.08,
  horas_empresa_mes: 672,
  somar_estrutura: true,
};

describe("custo/hora", () => {
  it("925 € com os parâmetros BMG → 9,12 €/h", () => {
    expect(custoHoraCalc(925, PARAMETROS_BMG)!.toFixed(2)).toBe("9.12");
  });
  it("1.900 € com os números do protótipo → 25,00 €/h", () => {
    expect(custoHoraCalc(1900, PROTOTIPO)!.toFixed(2)).toBe("25.00");
  });
  it("o custo/hora manual manda sobre o salário", () => {
    expect(custoHoraPerfil({ salario_base: 1900, custo_hora_manual: 30 }, PROTOTIPO)).toBe(30);
  });
  it("os encargos do perfil substituem os dos parâmetros", () => {
    const base = custoHoraPerfil({ salario_base: 925 }, PARAMETROS_BMG)!;
    const sem = custoHoraPerfil({ salario_base: 925, encargos_pct: 0 }, PARAMETROS_BMG)!;
    expect(base / sem).toBeCloseTo(1.075, 6);
  });
  it("sem salário não há custo/hora; a média ignora os vazios", () => {
    expect(custoHoraPerfil({ salario_base: null }, PARAMETROS_BMG)).toBeNull();
    expect(mediaCustoHora([25, null, 35])).toBe(30);
    expect(mediaCustoHora([null])).toBeNull();
  });
});

describe("equipamentos e estrutura", () => {
  it("amortização + manutenção", () => {
    expect(custoHoraEquipamento({ compra: 900, vida_util_horas: 1500 })).toBeCloseTo(0.6, 6);
    expect(custoHoraEquipamento({ compra: 1000, residual: 100, vida_util_horas: 900, manutencao_anual: 60, uso_horas_ano: 600 }))
      .toBeCloseTo(1.1, 6);
  });
  it("estrutura 3.400 € ÷ 672 h → 5,06 €/h (os inativos não contam)", () => {
    const itens = [
      { valor_mensal: 1200, ativo: true }, { valor_mensal: 900, ativo: true }, { valor_mensal: 300, ativo: true },
      { valor_mensal: 700, ativo: true }, { valor_mensal: 300, ativo: true }, { valor_mensal: 999, ativo: false },
    ];
    expect(estruturaHora(itens, 672).toFixed(2)).toBe("5.06");
    expect(estruturaHora(itens, 0)).toBe(0);
  });
});

// O WC suite da Ana Martins (motor.ts): pavimento 6 m², paredes 18 m², 3 pontos, 4 peças.
const CH = custoHoraCalc(1900, PROTOTIPO)!;
const ESTR = 3400 / 672;
const RECEITAS: Record<string, { r: Receita; preco: number; qt: number; motor: number }> = {
  demol: {
    r: { maoObra: [{ perfil: "Servente", horas: 0.5, custoHora: CH }],
         equipamentos: [{ equipamento: "Martelo", horas: 0.5, custoHora: 900 / 1500 }, { equipamento: "Carro de mão", horas: 0.5, custoHora: 120 / 2000 }],
         consumiveis: [{ consumivel: "Sacos", quantidade: 0.4, preco: 1.5 }, { consumivel: "Disco", quantidade: 0.05, preco: 12 }] },
    preco: 25.48, qt: 6, motor: 16.56 },
  canal: {
    r: { maoObra: [{ perfil: "Canalizador", horas: 2, custoHora: CH }],
         equipamentos: [{ equipamento: "Prensa", horas: 0.4, custoHora: 1700 / 2000 }],
         consumiveis: [{ consumivel: "Tubo", quantidade: 3, preco: 1.9 }, { consumivel: "Uniões", quantidade: 1, preco: 2.27 }, { consumivel: "Fita", quantidade: 1, preco: 0.5 }] },
    preco: 106.05, qt: 3, motor: 68.93 },
  revest: {
    r: { maoObra: [{ perfil: "Ladrilhador", horas: 0.75, custoHora: null }], equipamentos: [],
         consumiveis: [{ consumivel: "Cimento-cola", quantidade: 4, preco: 0.19, dataPreco: "2026-02-01" }, { consumivel: "Juntas", quantidade: 0.25, preco: 1 }] },
    preco: 26, qt: 18, motor: 23.555 },
  pav: {
    r: { maoObra: [{ perfil: "Ladrilhador", horas: 0.85, custoHora: null }], equipamentos: [],
         consumiveis: [{ consumivel: "Cimento-cola", quantidade: 3, preco: 0.19 }, { consumivel: "Cruzetas", quantidade: 1, preco: 0.09 }] },
    preco: 40.32, qt: 6, motor: 26.211 },
  loucas: {
    r: { maoObra: [{ perfil: "Canalizador", horas: 1.35, custoHora: CH }], equipamentos: [],
         consumiveis: [{ consumivel: "Silicone", quantidade: 0.25, preco: 4.84 }] },
    preco: 64.29, qt: 4, motor: 41.791 },
};
const OPC = { mediaHora: CH, estruturaHora: ESTR, somarEstrutura: true, mesesDesatualizado: 6, hoje: new Date("2026-10-13") };

function linhasWc(): LinhaOrcamento[] {
  const l: LinhaOrcamento[] = Object.entries(RECEITAS).map(([k, x]) => ({
    id: k, nome: k, qt: x.qt, totalSemIva: Math.round(x.preco * x.qt * 100) / 100,
    custoUnit: Math.round(custoReceita(x.r, OPC).custoPorMedida * 100) / 100, margemMinima: 28,
  }));
  l.push({ id: "mat", nome: "Material", qt: 1, totalSemIva: 2168, custoUnit: 1400, margemMinima: 28 });
  return l;
}

describe("custo do serviço pela receita", () => {
  it.each(Object.entries(RECEITAS))("%s bate com o motor do protótipo", (_k, x) => {
    expect(custoReceita(x.r, OPC).custoPorMedida).toBeCloseTo(x.motor, 1);
  });
  it("o ladrilhador sem custo/hora usa a média e avisa; o cimento-cola de fevereiro está desatualizado", () => {
    const c = custoReceita(RECEITAS.revest.r, OPC);
    expect(c.avisos.map((a) => a.tipo)).toEqual(["sem_custo_hora", "custo_desatualizado"]);
    expect(c.avisos[0].mensagem).toContain("Ladrilhador");
  });
  it("sem somar a estrutura, o custo fica só com mão de obra, equipamentos e consumíveis", () => {
    const c = custoReceita(RECEITAS.demol.r, { ...OPC, somarEstrutura: false });
    expect(c.estrutura).toBe(0);
    expect(c.custoPorMedida).toBeCloseTo(0.5 * CH + 0.33 + 1.2, 6);
  });
  it("consumível sem preço avisa", () => {
    const c = custoReceita({ maoObra: [], equipamentos: [], consumiveis: [{ consumivel: "Massa", quantidade: 1, preco: null }] }, OPC);
    expect(c.avisos[0].tipo).toBe("consumivel_sem_preco");
  });
  it("margem e preço sugerido", () => {
    expect(margemPct(100, 65)).toBeCloseTo(35, 6);
    expect(margemPct(0, 10)).toBeNull();
    expect(precoSugerido(65, 35)).toBe(100);
  });
});

describe("verificar a margem do orçamento", () => {
  it("WC suite: custo ≈ 2.454,55 €, preço ≈ 3.606,12 €, margem 31,9%, e o revestimento pede aprovação", () => {
    const v = verificarMargem(linhasWc(), { margemMinimaGeral: 28 });
    expect(v.custo_total).toBeCloseTo(2454.55, 0);
    expect(v.preco_total).toBeCloseTo(3606.12, 0);
    expect(formatarPct(v.margem_total)).toBe("31,9");
    expect(v.estado).toBe("precisa_aprovacao");
    expect(v.pode_enviar).toBe(false);
    expect(v.alertas.filter((a) => a.nivel === "aprovacao").map((a) => a.linha)).toEqual(["revest"]);
    expect(acaoEnvio(v)).toBe("pedir_aprovacao");
  });
  it("abaixo do custo bloqueia, mesmo com aprovação", () => {
    const l: LinhaOrcamento[] = [{ id: "c", nome: "Canalização", qt: 3, totalSemIva: 150, custoUnit: 68.94, margemMinima: 28 }];
    const v = verificarMargem(l, { margemMinimaGeral: 28, aprovacao: { id: "a", estado: "aprovada", margem: -100, margem_linha_min: -100 } });
    expect(v.estado).toBe("bloqueado");
    expect(v.pode_enviar).toBe(false);
    expect(v.alertas[0].mensagem).toBe("Canalização: o preço (150,00 €) não cobre o custo (206,82 €). Não se envia assim.");
    expect(acaoEnvio(v)).toBe("corrigir_preco");
  });
  it("pendente → aguarda; aprovada → pode enviar; se a margem desce depois, volta a precisar", () => {
    const l = linhasWc();
    const v0 = verificarMargem(l, { margemMinimaGeral: 28 });
    const ap = { id: "a", estado: "aprovada" as const, margem: v0.margem_total, margem_linha_min: v0.margem_linha_min };
    expect(verificarMargem(l, { margemMinimaGeral: 28, aprovacao: { ...ap, estado: "pendente" } }).estado).toBe("aguarda_aprovacao");
    expect(verificarMargem(l, { margemMinimaGeral: 28, aprovacao: ap }).pode_enviar).toBe(true);
    const pior = l.map((x) => (x.id === "revest" ? { ...x, totalSemIva: 18 * 25 } : x));
    expect(verificarMargem(pior, { margemMinimaGeral: 28, aprovacao: ap }).estado).toBe("precisa_aprovacao");
    expect(verificarMargem(l, { margemMinimaGeral: 28, aprovacao: { ...ap, estado: "recusada" } }).estado).toBe("recusado");
  });
  it("o desconto global que tira uma linha do mínimo dá 'desconto_come_margem'", () => {
    const l: LinhaOrcamento[] = [{ id: "d", nome: "Demolição", qt: 6, totalSemIva: 152.88, custoUnit: 16.56, margemMinima: 28 }];
    const v = verificarMargem(l, { margemMinimaGeral: 28, descontoGlobal: 10 });
    expect(v.alertas[0].tipo).toBe("desconto_come_margem");
    expect(v.alertas[0].mensagem).toMatch(/^O desconto de 10% deixa Demolição com 27,8% de margem \(mínimo 28%\)\.$/);
  });
  it("margem total abaixo do mínimo geral, sem linha nenhuma abaixo da sua", () => {
    const l: LinhaOrcamento[] = [{ id: "x", nome: "X", qt: 1, totalSemIva: 100, custoUnit: 75, margemMinima: 20 }];
    const v = verificarMargem(l, { margemMinimaGeral: 28 });
    expect(v.alertas.map((a) => a.tipo)).toEqual(["margem_total"]);
    expect(v.estado).toBe("precisa_aprovacao");
  });
  it("linha com preço e sem custo é só aviso; linha a zero não conta", () => {
    const l: LinhaOrcamento[] = [
      { id: "a", nome: "Taxa", qt: 1, totalSemIva: 50, custoUnit: 0, margemMinima: 28 },
      { id: "b", nome: "Nota", qt: 1, totalSemIva: 0, custoUnit: 0, margemMinima: 28 },
    ];
    const v = verificarMargem(l, { margemMinimaGeral: 28 });
    expect(v.alertas.map((a) => a.tipo)).toEqual(["sem_custo"]);
    expect(v.estado).toBe("ok");
  });
});

describe("formatação", () => {
  it("euros e percentagens em PT", () => {
    expect(formatarEur(2454.55)).toBe("2.454,55");
    expect(formatarEur(1234567.8)).toBe("1.234.567,80");
    expect(formatarEur(-5)).toBe("-5,00");
    expect(formatarEur(null)).toBe("—");
    expect(formatarPct(31.93)).toBe("31,9");
  });
  it("ler números escritos à portuguesa", () => {
    expect(lerNumero("1.234,5")).toBe(1234.5);
    expect(lerNumero("1234.5")).toBe(1234.5);
    expect(lerNumero(" ")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
  });
});
