// Os técnicos de obra (22/10/2026): a ficha (custo/hora, ofício, férias) no Estado, ligada ao custo das obras e aos conflitos do plano;
// os estados de antes da ficha continuam a funcionar; a agenda da equipa põe cada pessoa no dia e na obra certos e mostra os conflitos.
import { beforeEach, describe, expect, it, vi } from "vitest";

// a sincronização importa o cliente da base: aqui não se fala com ninguém
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { TECS, acoes, conflitos, seed, type Estado } from "../motor";
import { custoHoraDe, custosObra, equipaDaObra } from "../obraOps";
import { tecnicosPara } from "../preparacaoObra";
import { juntarEstado, partesDoEstado } from "../sincronizacao";
import { seedFrota } from "../frota/seed";
import { repor as reporRh, lerEstado as lerRh } from "@/components/rh-exemplo/dados/loja";
import { criarEstadoInicial } from "@/components/rh-exemplo/dados/exemplo";
import {
  agendaEquipa, contarConflitos, diasDoPeriodo, horasDaDuracao, moverPeriodo, obrasDoTecnico, segundaDe, tituloPeriodo, type LinhaAgenda,
} from "./regrasAgenda";
import { ausenciasDosTecnicos, garantirTecnicosNoRh, juntarTecnicosAoRh, pessoaRhDe, sugestaoCustoHora, tecnicoDaPessoaRh } from "./pontes";
import { CUSTO_HORA_OMISSAO, garantirTecnicos, type FichaTecnico } from "./tecnicos";

const avisos: { msg: string; kind?: string }[] = [];
function estado(papel: Estado["role"] = "direcao") {
  const S = seed();
  S.role = papel;
  const A = acoes(S, (a) => { avisos.push(a); }, (fn) => fn());
  return { S, A };
}
const obra = (S: Estado, id: number) => S.deals.find((d) => d.id === id)!;
const HOJE = new Date(2026, 9, 14, 10);
const celula = (L: LinhaAgenda[], quem: string, data: string) => L.find((l) => l.id === quem || l.nome === quem)!.celulas.find((c) => c.data === data)!;

beforeEach(() => { avisos.length = 0; });

describe("a ficha dos técnicos", () => {
  it("arranca com os seis técnicos de sempre e o custo/hora que estava em obraOps (FICHA_TEC)", () => {
    const { S } = estado();
    expect(S.tecnicos!.map((t) => [t.id, t.custoHora])).toEqual([["js", 14.2], ["ra", 14.2], ["ma", 18.5], ["sf", 17.8], ["hn", 17.8], ["pm", 16.9]]);
    // o registo vivo (TECS) é a ficha deste Estado
    expect(TECS.map((t) => t.id)).toEqual(["js", "ra", "ma", "sf", "hn", "pm"]);
    expect(TECS[4]).toBe(S.tecnicos![4]);
    expect(custoHoraDe("ma")).toBe(18.5);
    expect(custoHoraDe(null)).toBe(CUSTO_HORA_OMISSAO);
  });

  it("mudar o custo/hora de um técnico muda o custo previsto e o real da obra (só nas tarefas dele)", () => {
    const { S, A } = estado();
    const p = obra(S, 1022).obra.plano!;
    const antes = custosObra(p);
    const deHugo = p.tasks.filter((t) => t.tec === "hn"), hHugo = deHugo.reduce((a, t) => a + t.h, 0);
    expect(hHugo).toBeGreaterThan(0);
    A.editarTecnico("hn", { custoHora: 30 });
    const depois = custosObra(p);
    expect(depois.prev).toBeCloseTo(antes.prev + hHugo * (30 - 17.8), 1);
    // as tarefas dos outros técnicos ficam com o custo de antes
    p.tasks.forEach((t, i) => { if (t.tec !== "hn") expect(depois.linhas[i].prev).toBe(antes.linhas[i].prev); });
    expect(equipaDaObra(p).find((m) => m.id === "hn")?.custoH).toBe(30);
    // o real usa as horas registadas pelo técnico ao mesmo custo/hora
    deHugo[0].exec = { estado: "feita", horas: 10, fotos: ["x"] };
    expect(custosObra(p).linhas[p.tasks.indexOf(deHugo[0])].real).toBe(300);
    expect(avisos.at(-1)).toMatchObject({ kind: "ok", msg: "Ficha de Hugo Neves atualizada" });
  });

  it("só a Direção e as Operações mudam a ficha; valores fora do intervalo não passam", () => {
    const c = estado("comercial");
    c.A.editarTecnico("hn", { custoHora: 30 });
    expect(c.S.tecnicos!.find((t) => t.id === "hn")!.custoHora).toBe(17.8);
    expect(avisos.at(-1)).toMatchObject({ kind: "bad", msg: "Sem permissão para mudar a ficha do técnico" });
    const o = estado("operacoes");
    o.A.editarTecnico("hn", { custoHora: 0 });
    o.A.editarTecnico("hn", { custoHora: 250 });
    o.A.editarTecnico("hn", { sk: "Astronauta" });
    expect(o.S.tecnicos!.find((t) => t.id === "hn")).toMatchObject({ custoHora: 17.8, sk: "Ladrilhador" });
    o.A.editarTecnico("hn", { custoHora: 19.456, sk: "Montador" });
    expect(o.S.tecnicos!.find((t) => t.id === "hn")).toMatchObject({ custoHora: 19.46, sk: "Montador" });
  });

  it("as férias mudadas na ficha contam nos conflitos do plano (as datas e o dia dos planos de exemplo)", () => {
    const { S, A } = estado();
    const p = obra(S, 1022).obra.plano!;
    expect(conflitos(p)).toHaveLength(0);
    // o revestimento do Hugo é qua 15 e qui 16/10 (dias 2 e 3 do plano de exemplo)
    A.editarTecnico("hn", { feriasDatas: ["2026-10-16", "2026-10-16", "lixo"] });
    expect(S.tecnicos!.find((t) => t.id === "hn")).toMatchObject({ feriasDatas: ["2026-10-16"], ferias: [3] });
    expect(conflitos(p).map((c) => [c.tec.id, c.dia])).toEqual([["hn", 3]]);
    A.editarTecnico("hn", { feriasDatas: [] });
    expect(conflitos(p)).toHaveLength(0);
  });

  it("um ofício mudado muda quem o plano propõe para as tarefas desse ofício", () => {
    const { S, A } = estado();
    const p = obra(S, 1022).obra.plano!, t = p.tasks.find((x) => x.sk === "Ladrilhador")!;
    expect(tecnicosPara(t, p).map((x) => x.id)).toEqual(["sf", "hn"]);
    A.editarTecnico("pm", { sk: "Ladrilhador" });
    expect(tecnicosPara(t, p).map((x) => x.id)).toEqual(["sf", "hn", "pm"]);
    expect(t.tec).toBe("hn"); // a tarefa já atribuída fica com quem estava
  });
});

describe("os estados de antes da ficha", () => {
  it("um Estado guardado sem `tecnicos` fica com os seis de sempre e as obras continuam a contar", () => {
    // o registo vivo vem "sujo" de outro Estado (custo/hora mudado)
    const outro = estado();
    outro.A.editarTecnico("ma", { custoHora: 99 });
    expect(custoHoraDe("ma")).toBe(99);
    const velho = JSON.parse(JSON.stringify(seed())) as Estado;
    delete velho.tecnicos;
    const A = acoes(velho, () => undefined, (fn) => fn());
    expect(velho.tecnicos!.map((t) => t.id)).toEqual(["js", "ra", "ma", "sf", "hn", "pm"]);
    expect(custoHoraDe("ma")).toBe(18.5);
    expect(custosObra(obra(velho, 1022).obra.plano!).prev).toBeGreaterThan(0);
    velho.role = "direcao";
    A.editarTecnico("ma", { custoHora: 20 });
    expect(velho.tecnicos!.find((t) => t.id === "ma")!.custoHora).toBe(20);
  });

  it("uma ficha incompleta (de outro aparelho) completa-se; garantirTecnicos diz se mudou alguma coisa", () => {
    const S = { tecnicos: [{ id: "js", n: "João Silva", sk: "Servente · demolição" } as unknown as FichaTecnico] };
    expect(garantirTecnicos(S)).toBe(true);
    expect(S.tecnicos[0]).toMatchObject({ custoHora: 14.2, ferias: [], tel: "912 418 330", pessoaRhId: "p-tec-js" });
    expect(garantirTecnicos(S)).toBe(false);
    expect(garantirTecnicos({})).toBe(true);
  });

  it("a ficha vai na parte global da sincronização; uma global remota de antes não a apaga", () => {
    const { S, A } = estado();
    A.editarTecnico("sf", { custoHora: 21 });
    const g = partesDoEstado(S)[0];
    expect(g.chave).toBe("global");
    expect((g.dados as { tecnicos: FichaTecnico[] }).tecnicos.find((t) => t.id === "sf")!.custoHora).toBe(21);
    const remotaAntiga = { ...(g.dados as Record<string, unknown>) };
    delete remotaAntiga.tecnicos;
    const J = juntarEstado(S, remotaAntiga, new Map());
    expect(J.tecnicos!.find((t) => t.id === "sf")!.custoHora).toBe(21);
  });
});

describe("a agenda da equipa", () => {
  const entrada = (S: Estado, extra: Partial<Parameters<typeof agendaEquipa>[0]> = {}) => ({ deals: S.deals, tecnicos: S.tecnicos!, frota: seedFrota(), hoje: HOJE, ...extra });

  it("os dias da semana e do mês, e andar para trás e para a frente", () => {
    expect(segundaDe("2026-10-14")).toBe("2026-10-12");
    expect(diasDoPeriodo("semana", "2026-10-14")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(diasDoPeriodo("mes", "2026-10-14")).toHaveLength(31);
    expect(moverPeriodo("semana", "2026-10-14", 1)).toBe("2026-10-19");
    expect(moverPeriodo("mes", "2026-10-14", -1)).toBe("2026-09-01");
    expect(tituloPeriodo("semana", diasDoPeriodo("semana", "2026-10-28"))).toBe("26 de outubro a 1 de novembro de 2026");
    expect([horasDaDuracao("1 h 30"), horasDaDuracao("45 min"), horasDaDuracao("2 h"), horasDaDuracao("")]).toEqual([1.5, 0.8, 2, 1.5]);
  });

  it("põe cada técnico no dia e na obra certos, com a viatura da Frota e as visitas na linha de quem as faz", () => {
    const { S } = estado();
    const L = agendaEquipa(entrada(S), diasDoPeriodo("semana", "2026-10-14"));
    // a obra #1022 (Marta Lima): demolição seg 13 (João), canalização ter 14 (Marco), revestimento qua 15 e qui 16 (Hugo), louças sex 17 (Marco)
    const it13 = celula(L, "js", "2026-10-13");
    expect(it13.itens).toEqual([expect.objectContaining({ tipo: "tarefa", obra: 1022, titulo: "#1022 · Demolição", fase: 1, feito: true })]);
    expect(it13.viatura).toMatch(/^AA-12-BC/);
    expect(celula(L, "ma", "2026-10-14").itens[0]).toMatchObject({ obra: 1022, titulo: "#1022 · Canalização" });
    for (const d of ["2026-10-15", "2026-10-16"]) expect(celula(L, "hn", d).itens[0]).toMatchObject({ obra: 1022, titulo: "#1022 · Revestimento e pavimento" });
    expect(celula(L, "hn", "2026-10-15").viatura).toMatch(/^BX-55-RT/); // a reserva pontual da partilhada, antes da permanente
    expect(celula(L, "ma", "2026-10-17").itens).toHaveLength(1);
    expect(celula(L, "ma", "2026-10-17").itens[0].titulo).toMatch(/Louças/);
    expect(celula(L, "js", "2026-10-14").itens).toEqual([]);
    // a obra de exemplo concluída (#1050) fica de fora: não tem datas reais
    expect(L.flatMap((l) => l.celulas.flatMap((c) => c.itens)).some((x) => x.obra === 1050)).toBe(false);
    // a visita marcada da Luísa Freitas (#1036, qui 15/10 às 10:00) é do Rúben
    const ruben = L.find((l) => l.nome === "Rúben")!;
    expect(ruben).toMatchObject({ tipo: "comercial", papel: "Comercial" });
    expect(celula(L, "Rúben", "2026-10-15").itens).toEqual([expect.objectContaining({ tipo: "visita", negocio: 1036, hora: "10:00" })]);
    expect(contarConflitos(L)).toBe(0);
  });

  it("o plano por aprovar aparece como previsto, nos dias reais do orçamento", () => {
    const { S } = estado();
    const p = obra(S, 1027).obra.plano!;
    p.inicio = "2026-10-19";
    const L = agendaEquipa(entrada(S), diasDoPeriodo("semana", "2026-10-19"));
    const doTiago = L.flatMap((l) => l.celulas.flatMap((c) => c.itens.map((x) => ({ quem: l.id, data: c.data, x })))).filter((y) => y.x.obra === 1027);
    expect(doTiago.length).toBeGreaterThan(0);
    expect(doTiago.every((y) => y.x.previsto)).toBe(true);
    expect(doTiago[0]).toMatchObject({ data: "2026-10-19", quem: p.tasks[0].tec });
  });

  it("destaca a mesma pessoa em duas obras no mesmo dia com mais de 8 h, e obra em dia de férias (ficha ou RH)", () => {
    const { S, A } = estado();
    // o Hugo passa a ter também 8 h na obra do Tiago no dia em que faz o revestimento na da Marta
    const p = obra(S, 1027).obra.plano!;
    p.inicio = "2026-10-15";
    Object.assign(p.tasks[0], { tec: "hn", dia: 0, dur: 1, h: 8 });
    A.editarTecnico("hn", { feriasDatas: ["2026-10-16"] });
    const L = agendaEquipa(entrada(S, { ausencias: { js: { "2026-10-13": "Baixa médica" } } }), diasDoPeriodo("semana", "2026-10-14"));
    const q15 = celula(L, "hn", "2026-10-15");
    expect(new Set(q15.itens.map((x) => x.obra))).toEqual(new Set([1022, 1027]));
    expect(q15.horas).toBeGreaterThan(8);
    expect(q15.conflitos).toEqual([expect.objectContaining({ tipo: "obras" })]);
    expect(celula(L, "hn", "2026-10-16").conflitos).toEqual([expect.objectContaining({ tipo: "ferias" })]);
    expect(celula(L, "hn", "2026-10-16").itens[0]).toMatchObject({ tipo: "ferias" });
    expect(celula(L, "js", "2026-10-13").conflitos).toEqual([expect.objectContaining({ tipo: "ferias", texto: expect.stringMatching(/baixa médica/) })]);
    // (as outras tarefas da obra do Tiago também passam a cair nesta semana: podem dar mais conflitos a outros técnicos)
    expect(contarConflitos(L)).toBeGreaterThanOrEqual(3);
    // numa só obra, um dia cheio não é conflito
    expect(celula(L, "ma", "2026-10-14").conflitos).toEqual([]);
  });

  it("as obras atuais do técnico, com as horas e o custo pela ficha", () => {
    const { S } = estado();
    const o = obrasDoTecnico(S.deals, "hn", 20, HOJE);
    expect(o.map((x) => x.id)).toEqual([1022]);
    expect(o[0].custo).toBeCloseTo(o[0].horas * 20, 2);
    expect(o[0]).toMatchObject({ inicio: "2026-10-15", fim: "2026-10-16" });
  });
});

describe("a ponte com o RH de exemplo", () => {
  beforeEach(() => reporRh());

  it("os técnicos entram no RH como pessoas com o cargo Técnico de obra (ids estáveis), só uma vez", () => {
    expect(lerRh().fichas["p-tec-hn"]).toBeUndefined();
    garantirTecnicosNoRh();
    const e = lerRh();
    expect(e.fichas["p-tec-hn"].pessoa).toMatchObject({ nome_completo: "Hugo Neves", cargo: "Técnico de obra" });
    expect(e.ordem.filter((x) => x.startsWith("p-tec-"))).toEqual(["p-tec-js", "p-tec-ra", "p-tec-ma", "p-tec-sf", "p-tec-hn", "p-tec-pm"]);
    expect(juntarTecnicosAoRh(e)).toBe(e); // já lá estão: nada muda
    garantirTecnicosNoRh();
    expect(lerRh()).toBe(e);
    // as pessoas de exemplo do RH ficam como estavam
    for (const id of criarEstadoInicial().ordem) expect(e.fichas[id]).toBeDefined();
    expect(pessoaRhDe({ id: "hn" })).toBe("p-tec-hn");
    expect(tecnicoDaPessoaRh("p-tec-ma")?.n).toBe("Marco Antunes");
  });

  it("sugere o custo/hora pelo salário e encargos no RH, e lê as ausências aprovadas", () => {
    garantirTecnicosNoRh();
    const s = sugestaoCustoHora(lerRh().fichas["p-tec-ma"])!;
    // 1350 € × 14 / 12 × (1 + 25,25 %) ÷ (40 × 52 / 12) h
    expect(s.salario).toBe(1350);
    expect(s.valor).toBeCloseTo((1350 * 14 / 12) * 1.2525 / (40 * 52 / 12), 1);
    expect(sugestaoCustoHora(null)).toBeNull();
    expect(ausenciasDosTecnicos(lerRh())).toHaveProperty("ma");
  });
});
