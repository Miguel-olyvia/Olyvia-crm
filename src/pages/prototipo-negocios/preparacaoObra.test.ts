import { describe, expect, it } from "vitest";
import { TECS, acoes, conflitos, diaDeFerias, minhas, seed, valorSinal } from "./motor";
import { isoDia } from "./planoObra";
import { totais, tranches } from "./DocsCliente";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { custoFalta, entregaTarde, faltaParaArrancar, inicioDoPlano, passosPreparacao, rotuloDia, skDaTarefa, tecnicosPara, totalEf } from "./preparacaoObra";

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
// 1027 Tiago Almeida: contrato assinado a 08/10 → encomenda de cliente e plano por aprovar
const preparar = () => { const S = seed(); return { S, A: acoes(S, () => {}, (fn) => fn()), d: S.deals.find((x) => x.id === 1027)! }; };
const estados = (S: ReturnType<typeof seed>, d: ReturnType<typeof preparar>["d"]) => Object.fromEntries(passosPreparacao(d, S).map((p) => [p.id, p.estado]));

describe("do contrato à obra", () => {
  it("o contrato gera a encomenda de cliente (materiais e stock) e o plano do orçamento, ambos por aprovar", () => {
    const { S, d } = preparar();
    expect(d.obra.ec).toMatchObject({ n: "EC 2026/003", estado: "por aprovar", criada: "08/10" });
    expect(d.obra.ec!.linhas.length).toBeGreaterThan(0);
    expect(d.obra.plano).toMatchObject({ estado: "por aprovar", origem: "orcamento" });
    expect(d.obra.plano!.tasks.every((t) => t.fase && t.tec)).toBe(true);
    expect(estados(S, d)).toMatchObject({ ec: "feito", "ec-ok": "agora", ef: "espera", pl: "feito", "pl-ok": "agora", ft: "agora", pg: "espera", go: "espera" });
    expect(faltaParaArrancar(d)).toEqual(["aprovar a encomenda de cliente", "aprovar o plano", "emitir a fatura e receber o pagamento"]);
  });

  it("cada papel vê no Hoje o seu passo, em paralelo", () => {
    const { S } = preparar();
    const de = (r: Parameters<typeof minhas>[1]) => minhas(S, r).filter((x) => x.d.id === 1027).map((x) => x.p.act);
    expect(de("comercial")).toEqual(["aprovarEc"]);
    expect(de("direcao")).toEqual([]);
    expect(de("operacoes")).toEqual(["aprovarPlano"]);
    expect(de("financeiro")).toEqual(["emitir"]);
  });

  it("a encomenda aprovada reserva o stock e emite a encomenda a fornecedor; validada, encomendada; recebida", () => {
    const { S, A, d } = preparar();
    const antes = { ...S.stock };
    A.aprovarEc(d.id);
    expect(d.obra.ec!.estado).toBe("aprovada");
    expect(d.obra.mats).toBeTruthy();
    const reservado = d.obra.ec!.linhas.filter((x) => x.k).reduce((a, x) => a + x.res, 0);
    expect(Object.values(antes).reduce((a, v) => a + v, 0) - Object.values(S.stock).reduce((a, v) => a + v, 0)).toBeCloseTo(reservado, 5);
    const e = d.obra.enc!;
    expect(e).toMatchObject({ estado: "por confirmar", forn: "Madeiras e Cozinhas (exemplo)" });
    expect(e.linhas.map((x) => x.n)).toEqual(d.obra.ec!.linhas.filter((x) => x.falta > 0).map((x) => x.n));
    expect(minhas(S, "financeiro").filter((x) => x.d.id === 1027).map((x) => x.p.act)).toEqual(["validarEf", "emitir"]);
    A.escolherForn(d.id, "Cerâmica do Centro (exemplo)");
    S.role = "financeiro";
    A.validarEf(d.id);
    expect(e).toMatchObject({ estado: "encomendada", forn: "Cerâmica do Centro (exemplo)", validada: { por: "Sandra · Financeiro" } });
    expect(d.hist[0].t).toMatch(/antes de o sinal entrar/);
    A.receberEnc(d.id);
    expect(estados(S, d).rec).toBe("feito");
  });

  it("só arranca com tudo: encomenda, materiais, plano e sinal", () => {
    const { S, A, d } = preparar();
    preencher(d, [OBRA[0]]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("por aprovar");
    A.aprovarEc(d.id); A.validarEf(d.id); A.receberEnc(d.id); A.aprovarPlano(d.id);
    expect(faltaParaArrancar(d)).toEqual(["emitir a fatura e receber o pagamento"]);
    preencher(d, FINANCEIRO);
    A.emitir(d.id); A.validar(d.id);
    expect(d.fase).toBe(5);
    expect(estados(S, d).go).toBe("agora");
    expect(minhas(S, "operacoes").filter((x) => x.d.id === 1027).map((x) => x.p.act)).toEqual(["arrancar"]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
  });

  it("o ofício da tarefa escolhe o tipo de técnico", () => {
    expect(skDaTarefa("Demolições", "Demolição e entulho")).toBe("Servente · demolição");
    expect(skDaTarefa("Canalização", "Canalização")).toBe("Canalizador");
    expect(skDaTarefa("Revestimentos", "Pavimento cerâmico")).toBe("Ladrilhador");
    expect(skDaTarefa("Carpintaria", "Montagem de móveis")).toBe("Montador");
  });
});

describe("o plano nas Operações", () => {
  it("datas reais a partir do início (dias úteis), técnicos do ofício e o início mudado", () => {
    const { S, A, d } = preparar();
    const p = d.obra.plano!;
    expect(inicioDoPlano(p, new Date(2026, 9, 14))!.getDay()).toBe(1); // a próxima segunda-feira
    A.inicioPlano(d.id, "2026-10-30"); // sexta
    expect(rotuloDia(p, 0)).toBe("sex, 30 out");
    expect(rotuloDia(p, 1)).toBe("seg, 2 nov"); // salta o fim de semana
    const i = p.tasks.findIndex((t) => t.sk === "Ladrilhador");
    expect(tecnicosPara(p.tasks[i], p).map((x) => x.id)).toEqual(["sf", "hn"]);
    A.trocarTec(d.id, i, "sf");
    expect(p.tasks[i].tec).toBe("sf");
    expect(d.hist[0].t).toMatch(/passa de .* para Sérgio Faria/);
  });
  it("os planos antigos continuam com os dias de exemplo", () => {
    const S = seed(), m = S.deals.find((x) => x.id === 1022)!;
    expect(inicioDoPlano(m.obra.plano!)).toBeNull();
    expect(rotuloDia(m.obra.plano!, 0)).toBe("seg 13/10");
  });
});

describe("os custos da encomenda", () => {
  it("as linhas repartem a linha de materiais do orçamento (custo e preço batem); a encomenda a fornecedor leva o custo do que falta", () => {
    const { A, d } = preparar();
    const ec = d.obra.ec!, L = d.orc!.linhas.find((l) => l.t === "mat" && l.d === "móveis, bancada, torneira")!;
    expect(ec.custo).toBeCloseTo(L.t === "mat" ? L.custo : 0, 2);
    expect(ec.valor).toBeCloseTo(L.t === "mat" ? L.preco : 0, 2);
    expect(ec.linhas.every((x) => x.custo > 0 && x.preco > x.custo)).toBe(true);
    // móveis e bancada partilham a parte de 70%
    const mov = ec.linhas.find((x) => /móveis/.test(x.n))!, banc = ec.linhas.find((x) => /Bancada/.test(x.n))!;
    expect(mov.custo * mov.q).toBeCloseTo(banc.custo * banc.q, 2);
    A.aprovarEc(d.id);
    const e = d.obra.enc!;
    expect(totalEf(e)).toBeCloseTo(custoFalta(ec), 2);
    expect(e.linhas.every((x) => (x.custo ?? 0) > 0)).toBe(true);
  });
});

describe("a receção no Inventário", () => {
  it("o fornecedor confirma a entrega; o Armazém confere: parcial, depois o resto; só então se pode arrancar", () => {
    const { S, A, d } = preparar();
    A.aprovarEc(d.id); A.validarEf(d.id);
    const e = d.obra.enc!;
    A.confirmarEntrega(d.id);
    expect(e.entrega).toMatch(/^(seg|ter|qua|qui|sex), \d+ \w+$/);
    // chega tudo menos 1 da primeira linha
    A.receberLinhas(d.id, e.linhas.map((x, i) => (i === 0 ? x.q - 1 : x.q)));
    expect(e.estado).toBe("parcial");
    expect(faltaParaArrancar(d)).toContain("receber os materiais");
    const linha = d.obra.ec!.linhas.find((x) => x.n === e.linhas[0].n)!;
    expect(linha.falta).toBe(1);
    expect(passosPreparacao(d, S).find((p) => p.id === "rec")).toMatchObject({ estado: "agora", t: "Receber o que falta", act: "abrirInv" });
    A.receberLinhas(d.id, e.linhas.map((x) => x.q - (x.recebido ?? 0)));
    expect(e.estado).toBe("recebida");
    expect(d.obra.ec!.linhas.every((x) => x.falta === 0)).toBe(true);
    expect(faltaParaArrancar(d)).not.toContain("receber os materiais");
  });
});

describe("o sinal", () => {
  it("o valor recebido por omissão é a primeira prestação com IVA, igual à da fatura", () => {
    const { S, d } = preparar();
    expect(valorSinal(d, S)).toBeCloseTo(tranches(d, totais(d, S).total)[0].v, 2);
    expect(valorSinal(d, S)).toBeLessThan(totais(d, S).total);
  });
});

describe("férias em datas reais e a entrega antes do arranque", () => {
  it("o técnico de férias a 21–23 out entra em conflito pelas datas; a troca e o adiar resolvem", () => {
    const { A, d } = preparar();
    const p = d.obra.plano!;
    A.inicioPlano(d.id, "2026-10-19");
    const i = p.tasks.findIndex((t) => t.sk === "Ladrilhador");
    expect(p.tasks[i].tec).toBe("hn"); // o plano escolheu quem não está de férias
    A.trocarTec(d.id, i, "sf"); // o Sérgio está de férias a 21–23 out
    const di = diaDeFerias(TECS.find((x) => x.id === "sf")!, p, p.tasks[i].dia, p.tasks[i].dur);
    expect(di).not.toBeNull();
    expect(conflitos(p)).toHaveLength(1);
    expect(tecnicosPara(p.tasks[i], p).find((x) => x.id === "sf")).toMatchObject({ livre: false, ferias: expect.stringMatching(/out$/) });
    A.adiar(d.id, i);
    expect(conflitos(p)).toHaveLength(0);
    expect(rotuloDia(p, p.tasks[i].dia)).toBe("seg, 26 out"); // depois das férias
  });
  it("a entrega no dia do arranque avisa; começar no dia útil a seguir resolve", () => {
    const { A, d } = preparar();
    A.aprovarEc(d.id); A.validarEf(d.id);
    const e = d.obra.enc!;
    e.entrega = "seg, 19 out"; e.entregaIso = "2026-10-19";
    A.inicioPlano(d.id, "2026-10-19");
    const t = entregaTarde(d)!;
    expect(isoDia(t.depois)).toBe("2026-10-20");
    A.inicioPlano(d.id, isoDia(t.depois));
    expect(entregaTarde(d)).toBeNull();
  });
});
