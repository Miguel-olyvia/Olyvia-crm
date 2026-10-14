// As regras do Hoje da V2: um só Hoje por papel, cada coisa uma vez, por prioridade; os contadores; as visitas e as tarefas na linha;
// a agenda da semana; a equipa da Direção; os alertas; o resumo do Inventário para o Armazém.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "../motor";
import { CONTACTO, emFalta } from "../campos";
import { hojeNegocios } from "../funcNegocios";
import { linhasNegocios, selecionarQuadro, SEM_FILTROS_N } from "../filtrosNegocios";
import { contadores as contadoresInv } from "../inventario/contadores";
import { criarSeed } from "../inventario/seed";
import {
  agendaV2, alertasV2, contadores, destinoVisita, diasVisita, doDia, equipa, faltamContacto, filtrarCat, hojeComercial, hojePapel, hojeV2,
  ordemDia, quandoTexto, rotuloDia, semana, slotDe,
} from "./hojeV2Regras";
import { resumoInventario } from "./hojeArmazem";
import { esquecerHojeV2, guardarVisita, juntarTarefa, concluirTarefa, lerHojeV2, type DadosHojeV2 } from "./hojeV2Store";

const VAZIO: DadosHojeV2 = { tarefas: [], visitas: [] };
const doNome = (S: Estado, nome: string, dados = VAZIO) => hojeComercial(S, [], dados).find((i) => i.nome === nome);

beforeEach(() => esquecerHojeV2());

describe("Hoje V2 · Comercial: Pessoas e Negócios numa só lista", () => {
  it("cada pessoa aparece uma só vez", () => {
    const itens = hojeComercial(seed(), [], VAZIO), nomes = itens.map((i) => i.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(itens).toHaveLength(16);
  });
  it("vem por prioridade: Contactar, Visitas, Orçamentos, À espera, Contratos, A faturar", () => {
    const cats = hojeComercial(seed(), [], VAZIO).map((i) => i.cat);
    const ordem = ["contactar", "visitas", "orcamento", "espera", "contrato", "faturar"];
    expect(cats.map((c) => ordem.indexOf(c))).toEqual([...cats.map((c) => ordem.indexOf(c))].sort((a, b) => a - b));
    expect(cats[0]).toBe("contactar");
  });
  it("a razão de maior prioridade manda; as outras ficam em texto, sem repetir a pessoa", () => {
    const S = seed();
    expect(doNome(S, "Ana Martins")?.razao).toBe("Sem contacto há 10 dias");
    const carla = doNome(S, "Carla Nunes")!;
    expect(carla.cat).toBe("orcamento");
    expect(carla.razao).toBe("Em orçamento há 6 dias · Casa de banho e pintura");
    expect(carla.outras).toEqual(["Proposta enviada há 5 dias"]);
    // o Tiago já diz "Por faturar · Cozinha (e mais 1)": os dois negócios a faturar não se repetem
    expect(doNome(S, "Tiago Almeida")!.outras).toEqual(["Por faturar · Cozinha (e mais 1)"]);
  });
  it("só as leads em Contactar podem marcar a visita na linha", () => {
    const itens = hojeComercial(seed(), [], VAZIO);
    expect(itens.filter((i) => i.podeVisita).map((i) => i.nome)).toEqual(itens.filter((i) => i.cat === "contactar").map((i) => i.nome));
    expect(doNome(seed(), "Inês Carvalho")).toMatchObject({ podeVisita: true, dealId: null, exemplo: true });
    expect(doNome(seed(), "Ana Martins")).toMatchObject({ podeVisita: true, dealId: 1043, exemplo: false });
  });
  it("os contadores somam o total e filtram a lista", () => {
    const itens = hojeComercial(seed(), [], VAZIO), cs = contadores(itens, "comercial");
    expect(cs.map((c) => [c.nome, c.n])).toEqual([
      ["Contactar", 7], ["Visitas", 2], ["Orçamentos por enviar", 4], ["À espera do cliente", 1], ["Contratos por assinar", 1], ["A faturar", 1],
    ]);
    expect(cs.reduce((a, c) => a + c.n, 0)).toBe(itens.length);
    for (const c of cs) expect(filtrarCat(itens, c.cat)).toHaveLength(c.n);
    expect(filtrarCat(itens, null)).toHaveLength(itens.length);
  });
});

describe("Hoje V2 · marcar a visita na linha", () => {
  it("dias úteis a seguir a hoje (sáb 10/10) e a vaga no formato do motor", () => {
    expect(diasVisita().map((d) => d.rotulo)).toEqual(["seg 12/10", "ter 13/10", "qua 14/10", "qui 15/10", "sex 16/10"]);
    expect(slotDe("qui 15/10", "11:00")).toBe("qui 15/10 · 11:00");
  });
  it("pessoa de exemplo, negócio em Lead ou Contacto incompleto: fica em memória, com o motivo", () => {
    const S = seed();
    expect(destinoVisita(S, null)).toMatchObject({ motor: false, motivo: expect.stringMatching(/^Pessoa de exemplo/) });
    expect(destinoVisita(S, 1043)).toMatchObject({ motor: false, motivo: expect.stringMatching(/ainda está em Lead/) });
    const manuel = destinoVisita(S, 1038);
    expect(manuel.motor).toBe(false);
    expect(faltamContacto(S, S.deals.find((d) => d.id === 1038)!)).toEqual(["Quem vai estar"]);
    expect(manuel.motivo).toMatch(/^Falta 1 campo do Contacto \(Quem vai estar\)/);
  });
  it("com o Contacto completo vai ao motor, e o negócio passa a Visita (com a visita na agenda)", () => {
    const S = seed(), d = S.deals.find((x) => x.id === 1038)!;
    // preenche o que o portão do Contacto ainda pede (só tem de existir)
    for (const c of emFalta(CONTACTO, d.f)) d.f[c.k] = c.op?.[0] ?? "1";
    expect(faltamContacto(S, d)).toEqual([]);
    const destino = destinoVisita(S, 1038);
    expect(destino).toEqual({ motor: true, id: 1038, motivo: "" });
    const run = (fn: () => void) => fn();
    acoes(S, vi.fn(), run).marcarVisita(1038, slotDe("seg 12/10", "09:30"));
    expect(d.fase).toBe(2);
    const manuel = doNome(S, "Manuel Costa")!;
    expect(manuel.cat).toBe("visitas");
    expect(manuel.razao).toBe("Visita seg 12/10 · 09:30");
    expect(agendaV2(S, "comercial", [], VAZIO).some((c) => c.dia === "12/10" && c.quem.startsWith("Manuel Costa"))).toBe(true);
  });
  it("a visita guardada em memória tira a pessoa de Contactar, põe-na em Visitas e entra na agenda desse dia", () => {
    guardarVisita({ nome: "Inês Carvalho", dealId: null, servico: "WC", dia: "14/10", rotulo: "qua 14/10", hora: "11:00" });
    const S = seed(), dados = lerHojeV2(), ines = doNome(S, "Inês Carvalho", dados)!;
    expect(ines).toMatchObject({ cat: "visitas", razao: "Visita marcada qua 14/10 · 11:00", podeVisita: false });
    expect(hojeComercial(S, [], dados).filter((i) => i.nome === "Inês Carvalho")).toHaveLength(1);
    expect(doDia(agendaV2(S, "comercial", [], dados), "14/10").map((c) => c.quem)).toEqual(["Inês Carvalho"]);
  });
  it("marcar outra vez a mesma pessoa substitui a visita guardada", () => {
    guardarVisita({ nome: "Ana Martins", dealId: 1043, servico: "WC", dia: "14/10", rotulo: "qua 14/10", hora: "11:00" });
    guardarVisita({ nome: "Ana Martins", dealId: 1043, servico: "WC", dia: "15/10", rotulo: "qui 15/10", hora: "16:00" });
    expect(lerHojeV2().visitas).toHaveLength(1);
    expect(doNome(seed(), "Ana Martins", lerHojeV2())!.razao).toBe("Visita marcada qui 15/10 · 16:00");
  });
});

describe("Hoje V2 · tarefas sempre ligadas a uma pessoa", () => {
  it("uma tarefa para hoje põe a pessoa em Tarefas para hoje, sem a repetir, e guarda a razão antiga", () => {
    juntarTarefa({ nome: "Carla Nunes", dealId: 1031, servico: "Cozinha", titulo: "Enviar orçamento", dias: 0 });
    const S = seed(), itens = hojeComercial(S, [], lerHojeV2()), carla = itens.filter((i) => i.nome === "Carla Nunes");
    expect(carla).toHaveLength(1);
    expect(carla[0]).toMatchObject({ cat: "tarefas", razao: "Tarefa para hoje: Enviar orçamento" });
    expect(carla[0].outras[0]).toBe("Em orçamento há 6 dias · Casa de banho e pintura");
    expect(itens[0].nome).toBe("Carla Nunes");
    expect(contadores(itens, "comercial")[0]).toMatchObject({ nome: "Tarefas para hoje", n: 1 });
  });
  it("uma tarefa para amanhã fica na linha da pessoa e na agenda, sem mudar a ordem", () => {
    juntarTarefa({ nome: "Ana Martins", dealId: 1043, servico: "WC", titulo: "Ligar", dias: 1 });
    const S = seed(), ana = doNome(S, "Ana Martins", lerHojeV2())!;
    expect(ana.cat).toBe("contactar");
    expect(ana.tarefas.map((t) => t.titulo)).toEqual(["Ligar"]);
    expect(doDia(agendaV2(S, "comercial", [], lerHojeV2()), "11/10").map((c) => c.titulo)).toEqual(["Tarefa: Ligar"]);
  });
  it("uma pessoa fora do Hoje entra por causa de uma tarefa para hoje; feita, sai", () => {
    const t = juntarTarefa({ nome: "Hugo Matos", dealId: 1035, servico: "WC suite", titulo: "Confirmar visita", dias: 0 });
    const S = seed();
    expect(doNome(S, "Hugo Matos")).toBeUndefined();
    expect(doNome(S, "Hugo Matos", lerHojeV2())).toMatchObject({ cat: "tarefas", dealId: 1035 });
    concluirTarefa(t.id);
    expect(doNome(S, "Hugo Matos", lerHojeV2())).toBeUndefined();
  });
  it("as tarefas valem também nos outros papéis (ligadas ao negócio)", () => {
    juntarTarefa({ nome: "Tiago Almeida", dealId: 1027, servico: "Cozinha", titulo: "Outra coisa", dias: 3 });
    const S = seed(); S.role = "financeiro";
    expect(hojePapel(S, "financeiro", lerHojeV2())[0].tarefas.map((t) => t.titulo)).toEqual(["Outra coisa"]);
    expect(quandoTexto(3)).toBe("ter 13/10");
    expect(quandoTexto(1)).toBe("amanhã (11/10)");
  });
});

describe("Hoje V2 · os outros papéis", () => {
  it("Financeiro: Faturas por registar e Pagamentos por validar (mesmo a zero); registar, não emitir", () => {
    const S = seed(), itens = hojeV2(S, "financeiro", [], VAZIO);
    expect(contadores(itens, "financeiro").map((c) => [c.nome, c.n])).toEqual([["Faturas por registar", 1], ["Pagamentos por validar", 0]]);
    expect(itens[0]).toMatchObject({ nome: "Tiago Almeida", acao: { rotulo: "Registar fatura", act: "emitir" } });
  });
  it("Financeiro: depois de registar a fatura, o negócio passa a Pagamentos por validar (uma só linha)", () => {
    const S = seed(), d = S.deals.find((x) => x.id === 1027)!;
    d.fin.fatura = { n: "FT 2026/418", q: "hoje" };
    const itens = hojeV2(S, "financeiro", [], VAZIO);
    expect(itens.map((i) => [i.nome, i.cat])).toEqual([["Tiago Almeida", "pagamentos"]]);
  });
  it("Operações: a obra em curso, com o passo do motor (e o plano do Tiago, gerado do contrato, por aprovar)", () => {
    const itens = hojeV2(seed(), "operacoes", [], VAZIO);
    expect(itens.map((i) => [i.nome, i.cat, i.acao?.act])).toEqual([["Tiago Almeida", "faturas", "aprovarPlano"], ["Marta Lima", "obras", "abrirPlano"]]);
  });
  it("Direção: as exceções à margem pedidas aparecem para aprovar", () => {
    const S = seed(), d = S.deals.find((x) => x.id === 1031)!;
    d.orc!.aprov = "pedida";
    const itens = hojeV2(S, "direcao", [], VAZIO);
    expect(itens.map((i) => [i.nome, i.cat, i.aprovar])).toEqual([["Carla Nunes", "aprovar", true]]); // a encomenda de cliente aprova-a o comercial (14/10)
  });
  it("Direção: a equipa por comercial bate com as listas de Negócios", () => {
    const S = seed(), [ruben] = equipa(S);
    const grupos = hojeNegocios(selecionarQuadro(linhasNegocios(S), { rapido: "todos", q: "", f: SEM_FILTROS_N }));
    const n = (id: string) => grupos.find((g) => g.id === id)!.linhas.length;
    expect(ruben).toMatchObject({ comercial: "Rúben", orcamentos: n("orcamento"), propostas: n("proposta"), contratos: n("contrato"), atrasos: 1 });
    expect(ruben.valorPropostas).toBeGreaterThan(0);
  });
});

describe("Hoje V2 · alertas que levam a outro ecrã", () => {
  it("Comercial: negócios com atraso, já filtrado", () => {
    expect(alertasV2(seed(), "comercial")).toEqual([{ id: "atraso", n: 1, texto: "Negócios com atraso", destino: "negocios-atraso", filtrado: true }]);
  });
  it("Direção: também as propostas à espera (só navega); o Financeiro não tem alertas fora", () => {
    expect(alertasV2(seed(), "direcao").map((a) => [a.id, a.filtrado])).toEqual([["atraso", true], ["prop", false]]);
    expect(alertasV2(seed(), "financeiro")).toEqual([]);
  });
});

describe("Hoje V2 · a semana e a agenda", () => {
  it("a faixa tem 7 dias a partir de hoje (sáb 10/10)", () => {
    const s = semana();
    expect(s.map((d) => d.rotulo)).toEqual(["sáb 10/10", "dom 11/10", "seg 12/10", "ter 13/10", "qua 14/10", "qui 15/10", "sex 16/10"]);
    expect(s.filter((d) => d.hoje).map((d) => d.dia)).toEqual(["10/10"]);
    expect(rotuloDia("1/11")).toBe("dom 01/11");
    expect(ordemDia("01/11")).toBeGreaterThan(ordemDia("31/10"));
  });
  it("Comercial: as visitas da seed (Hoje.tsx) e as das pessoas de exemplo, por dia, sem repetir", () => {
    const ag = agendaV2(seed(), "comercial", [], VAZIO);
    expect(ag.map((c) => [c.dia, c.hora, c.quem.split(" · ")[0]])).toEqual([["15/10", "10:00", "Luísa Freitas"], ["16/10", "09:30", "Filipa Moreira"]]);
    expect(doDia(ag, "15/10")).toHaveLength(1);
    expect(doDia(ag, "10/10")).toHaveLength(0);
    expect(doDia(ag, null)).toHaveLength(2);
  });
  it("Operações: a obra em curso conta como hoje", () => {
    expect(agendaV2(seed(), "operacoes", [], VAZIO).map((c) => c.dia)).toEqual(["10/10"]);
  });
});

describe("Hoje V2 · Armazém: o Inventário", () => {
  it("frases curtas com os números do Inventário, só as que têm alguma coisa", () => {
    const c = contadoresInv(criarSeed()), linhas = resumoInventario(c);
    expect(linhas.every((l) => l.n > 0)).toBe(true);
    expect(linhas.find((l) => l.id === "cont")?.n ?? 0).toBe(c.countsOpen);
    expect(resumoInventario({ ...c, countsOpen: 2, stalled: 1 })[0].texto).toBe("Contagens abertas (1 parada há 7 dias ou mais)");
    expect(resumoInventario({ ...c, countsOpen: 0, low: 0, ecReady: 0, guiasOpen: 0, late: 0 })).toEqual([]);
  });
});
