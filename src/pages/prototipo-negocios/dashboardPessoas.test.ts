import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { SEM_FILTROS_P, linhasDe, selecionar, type FiltrosP } from "./filtrosPessoas";
import type { SeparadorLista } from "./pessoasDocs";
import {
  cartoesPessoas, depoisDaAcao, entradasPorDia, funil, motivosDaPerda, populacao, porDistrito, porFormulario, porOrigemECanal, porResultado, porTipo,
} from "./dashboardPessoas";

const S = seed();
const linhas = linhasDe(S);
const ESTADOS: Partial<FiltrosP>[] = [{}, { periodo: "30" }, { distrito: "Lisboa" }, { periodo: "90", tipo: "pessoa" }, { atrasadas: true }, { estado: "perdidas" }, { qualificacao: "qualificada" }];
const ABAS: SeparadorLista[] = ["leads", "clientes", "todos"];
const soma = (b: { n: number }[]): number => b.reduce((a, x) => a + x.n, 0);
const cartaoDe = (aba: SeparadorLista, id: string, f: FiltrosP = SEM_FILTROS_P) => cartoesPessoas(linhas, aba, f).find((c) => c.id === id)!;

describe("dashboard de Pessoas · os cartões com os dados de exemplo", () => {
  it("cada cartão traz o nome do botão: o filtro e quantas pessoas a lista mostra depois dele", () => {
    for (const aba of ABAS) {
      for (const c of cartoesPessoas(linhas, aba, SEM_FILTROS_P)) {
        const n = depoisDaAcao(linhas, aba, SEM_FILTROS_P, c.acao).length;
        expect(c.acaoRotulo, `${aba} ${c.id}`).toBe(`Filtrar por ${c.rotulo}: ${n === 1 ? "1 pessoa" : `${n} pessoas`}`);
      }
    }
  });
  it("Leads: 14 ativas, 4 por contactar, 1 atrasada, 4 qualificadas, 2 voltaram a contactar, 2 perdidas", () => {
    const c = cartoesPessoas(linhas, "leads", SEM_FILTROS_P);
    expect(c.map((x) => x.id)).toEqual(["ativas", "por_contactar", "atrasadas", "qualificadas", "voltou", "perdidas"]);
    expect(c.map((x) => x.valor)).toEqual([14, 4, 1, 4, 2, 2]);
  });
  it("Clientes: 5 clientes, valor contratado, 4 com negócio novo, valor em aberto e 3 novos nos últimos 30 dias", () => {
    const c = cartoesPessoas(linhas, "clientes", SEM_FILTROS_P);
    expect(c.map((x) => x.id)).toEqual(["clientes", "contratado", "novo", "aberto", "novos30"]);
    expect(c.map((x) => x.valor).filter((_, i) => i !== 1 && i !== 3)).toEqual([5, 4, 3]);
    expect(c[1].euros && c[3].euros).toBe(true);
    expect(c[1].valor).toBeCloseTo(39913.67, 1); // 15.334,10 + 8.432,74 + 3.966,22 + 3.396,51 + 8.784,10 (14/10: a Joana, 1050, passou de 4.045,21 € a 3.966,22 €, com a receita da Mudelar nos c28, c3, c14 e c19)
    expect(c[3].valor).toBeCloseTo(37180, 1); // 5.600 + 18.900 + 5.230 + 7.450: os negócios novos em curso dos 4 clientes
  });
  it("Todos: 21 pessoas, 14 leads, 5 clientes, 3 empresas, 2 perdidas e o valor em jogo", () => {
    const c = cartoesPessoas(linhas, "todos", SEM_FILTROS_P);
    expect(c.map((x) => x.id)).toEqual(["pessoas", "leads", "clientes", "empresas", "perdidas", "jogo"]);
    expect(c.map((x) => x.valor).slice(0, 5)).toEqual([21, 14, 5, 3, 2]);
    expect(c[5].valor).toBeCloseTo(67809.04, 1);
  });
  it("o valor contratado soma a coluna Valor dos clientes na lista", () => {
    const soColuna = selecionar(linhas, "clientes", SEM_FILTROS_P).reduce((a, l) => a + l.contratado, 0);
    expect(cartaoDe("clientes", "contratado").valor).toBeCloseTo(soColuna, 5);
  });
});

describe("dashboard de Pessoas · os números batem com a lista", () => {
  it("cada cartão mostra o número de linhas da lista depois de carregar nele (todos os separadores e vários filtros)", () => {
    for (const aba of ABAS) for (const parcial of ESTADOS) {
      const f = { ...SEM_FILTROS_P, ...parcial };
      for (const c of cartoesPessoas(linhas, aba, f).filter((x) => !x.euros)) expect(c.valor, `${aba} ${c.id} ${JSON.stringify(parcial)}`).toBe(depoisDaAcao(linhas, aba, f, c.acao).length);
    }
  });
  it("os cartões em dinheiro somam as pessoas da lista depois de carregar neles", () => {
    for (const aba of ["clientes", "todos"] as const) {
      const f = SEM_FILTROS_P;
      for (const c of cartoesPessoas(linhas, aba, f).filter((x) => x.euros)) {
        const soma2 = depoisDaAcao(linhas, aba, f, c.acao).reduce((a, l) => a + (c.id === "contratado" ? l.contratado : l.emJogo), 0);
        expect(c.valor).toBeCloseTo(soma2, 5);
        expect(c.valor).toBeGreaterThan(0);
      }
    }
  });
  it("a soma das barras de cada gráfico é o total de pessoas da lista com os mesmos filtros", () => {
    for (const aba of ABAS) for (const parcial of ESTADOS) {
      const f = { ...SEM_FILTROS_P, ...parcial }, F = populacao(linhas, aba, f), total = F.length;
      expect(soma(porFormulario(F)), `formulário ${aba}`).toBe(total);
      expect(soma(porDistrito(F))).toBe(total);
      expect(soma(porResultado(F))).toBe(total);
      expect(soma(porTipo(F))).toBe(total);
      expect(soma(porOrigemECanal(F))).toBe(total);
      expect(soma(porOrigemECanal(F).flatMap((g) => g.barras))).toBe(total);
      expect(funil(F, f)[0].chegaram).toBe(total);
      expect(soma(funil(F, f).map((e) => ({ n: e.agora })))).toBe(total);
    }
  });
  it("cada barra mostra o número de linhas da lista depois de carregar nela", () => {
    for (const aba of ABAS) for (const parcial of ESTADOS) {
      const f = { ...SEM_FILTROS_P, ...parcial }, F = populacao(linhas, aba, f);
      const barras = [...porFormulario(F), ...porDistrito(F), ...porResultado(F), ...porTipo(F), ...porOrigemECanal(F).flatMap((g) => g.barras), ...motivosDaPerda(linhas, aba, f).barras];
      for (const b of barras.filter((x) => x.acao)) expect(b.n, `${aba} ${b.id}`).toBe(depoisDaAcao(linhas, aba, f, b.acao).length);
      expect(barras.filter((x) => !x.acao).every((x) => x.n === 0)).toBe(true); // sem ação só as barras a zero
      for (const g of porOrigemECanal(F)) expect(g.n).toBe(depoisDaAcao(linhas, aba, f, g.acao).length);
      for (const e of funil(F, f)) expect(e.chegaram).toBe(depoisDaAcao(linhas, aba, f, e.acao).length);
    }
  });
  it("com os cartões Leads, Clientes e Perdidas a soma é o cartão Pessoas (Todos, sem filtros)", () => {
    const c = cartoesPessoas(linhas, "todos", SEM_FILTROS_P).map((x) => x.valor);
    expect(c[1] + c[2] + c[4]).toBe(c[0]);
  });
});

describe("dashboard de Pessoas · os gráficos com os dados de exemplo (Todos, sem filtros)", () => {
  const F = populacao(linhas, "todos", SEM_FILTROS_P);
  it("funil: 21 pessoas, e chegaram a Contacto 17, Visita 13, Negócio 9 e Cliente 5; passagem 81, 76, 69 e 56 %", () => {
    const e = funil(F, SEM_FILTROS_P);
    expect(e.map((x) => x.rotulo)).toEqual(["Lead", "Contacto", "Visita", "Negócio", "Cliente"]);
    expect(e.map((x) => x.chegaram)).toEqual([21, 17, 13, 9, 5]);
    expect(e.map((x) => x.agora)).toEqual([4, 4, 4, 4, 5]);
    expect(e.map((x) => x.passagem)).toEqual([null, 81, 76, 69, 56]);
    expect(e[4].agora).toBe(cartaoDe("todos", "clientes").valor); // a etapa Cliente bate com o papel de cliente
  });
  it("funil: a ação nunca baixa uma etapa que o filtro já exige", () => {
    const f = { ...SEM_FILTROS_P, etapa: "3" as const }, e = funil(populacao(linhas, "todos", f), f);
    expect(e.map((x) => x.acao.f?.etapa)).toEqual(["3", "3", "3", "3", "4"]);
  });
  it("por formulário: 8 registadas à mão, 6 pelo site, 4 pela cozinha, 2 pela casa de banho e 1 pelo outdoor", () => {
    expect(porFormulario(F).map((b) => [b.rotulo, b.n])).toEqual([
      ["Registada à mão", 8], ["Site · pedido de orçamento", 6], ["Cozinha nova", 4], ["Casa de banho nova", 2], ["Outdoor A1 · pedido de contacto", 1],
    ]);
  });
  it("por origem, agrupada por canal: Outros 10, Redes sociais pagas 4, Parcerias 3, Offline 2, Pesquisa 2", () => {
    const g = porOrigemECanal(F);
    expect(g.map((x) => [x.canal, x.n])).toEqual([["Outros", 10], ["Redes sociais pagas", 4], ["Parcerias", 3], ["Offline", 2], ["Pesquisa", 2]]);
    expect(g[0].barras.map((b) => [b.rotulo, b.n])).toEqual([["Site", 6], ["Chamada", 4]]);
  });
  it("por distrito: Lisboa 10, Setúbal 4 e os outros", () => {
    expect(porDistrito(F).map((b) => [b.rotulo, b.n])).toEqual([["Lisboa", 10], ["Setúbal", 4], ["Braga", 2], ["Faro", 2], ["Porto", 2], ["Coimbra", 1]]);
  });
  it("resultado do último contacto: 13 interessados, 4 sem contacto, 3 a ligar mais tarde, 1 não atendeu", () => {
    expect(porResultado(F).map((b) => [b.rotulo, b.n])).toEqual([["Atendeu · interessado", 13], ["Sem contacto", 4], ["Atendeu · ligar mais tarde", 3], ["Não atendeu", 1]]);
  });
  it("motivos da perda: Adiou 1 e Preço 1, em Leads e em Todos; nenhum nos clientes nem com 'Ativas'", () => {
    for (const aba of ["leads", "todos"] as const) {
      const m = motivosDaPerda(linhas, aba, SEM_FILTROS_P);
      expect(m.total).toBe(2);
      expect(m.barras.map((b) => [b.rotulo, b.n])).toEqual([["Adiou", 1], ["Preço", 1]]);
      expect(m.total).toBe(cartaoDe(aba, "perdidas").valor);
    }
    expect(motivosDaPerda(linhas, "clientes", SEM_FILTROS_P).total).toBe(0);
    expect(motivosDaPerda(linhas, "todos", { ...SEM_FILTROS_P, estado: "ativas" }).total).toBe(0);
  });
  it("pessoa contra empresa: 18 e 3", () => {
    expect(porTipo(F).map((b) => b.n)).toEqual([18, 3]);
  });
  it("entradas por dia: 31 pontos de 10/09 a 10/10 e 19 pessoas (as mesmas do período de 30 dias)", () => {
    const e = entradasPorDia(F);
    expect(e.pontos).toHaveLength(31);
    expect([e.pontos[0].rotulo, e.pontos[30].rotulo]).toEqual(["10/09", "10/10"]);
    expect(e.total).toBe(19);
    expect(e.total).toBe(selecionar(linhas, "todos", { ...SEM_FILTROS_P, periodo: "30" }).length);
    expect(e.pontos.find((p) => p.rotulo === "08/10")?.n).toBe(2); // Rita Sousa e Inês Carvalho
    expect(cartaoDe("clientes", "novos30").valor).toBe(3); // Tiago, Joana e Marta
  });
});

describe("dashboard de Pessoas · estados vazios e pureza", () => {
  it("sem pessoas, os gráficos ficam vazios e os números a zero", () => {
    const f = { ...SEM_FILTROS_P, distrito: "Coimbra", tipo: "empresa" as const }, F = populacao(linhas, "todos", f);
    expect(F).toHaveLength(0);
    expect(porFormulario(F)).toEqual([]);
    expect(porOrigemECanal(F)).toEqual([]);
    expect(entradasPorDia(F).total).toBe(0);
    expect(funil(F, f).map((e) => e.chegaram)).toEqual([0, 0, 0, 0, 0]);
    expect(funil(F, f).map((e) => e.passagem)).toEqual([null, 0, 0, 0, 0]);
    expect(cartaoDe("todos", "pessoas", f).valor).toBe(0);
  });
  it("nada muda o Estado", () => {
    const antes = JSON.stringify(S);
    for (const aba of ABAS) { cartoesPessoas(linhas, aba, SEM_FILTROS_P); funil(linhas, SEM_FILTROS_P); motivosDaPerda(linhas, aba, SEM_FILTROS_P); }
    expect(JSON.stringify(S)).toBe(antes);
  });
});
