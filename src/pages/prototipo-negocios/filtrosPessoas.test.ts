import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import {
  SEM_FILTROS_P, alternarChip, chipAtivo, chipsAtivos, chipsRapidos, contagensP, contarChip, efetivos, linhasDe, listaP, opcoesDe, selecionar,
  type FiltrosP,
} from "./filtrosPessoas";
import type { SeparadorLista } from "./pessoasDocs";

const S = seed();
const linhas = linhasDe(S);
const nomes = (aba: SeparadorLista, f: Partial<FiltrosP>): string[] => selecionar(linhas, aba, { ...SEM_FILTROS_P, ...f }).map((l) => l.p.nome);
const conta = (aba: SeparadorLista, f: Partial<FiltrosP>): number => nomes(aba, f).length;

describe("filtros de Pessoas · os separadores (contados à mão: 14 leads, 5 clientes, 2 perdidas)", () => {
  it("cada separador sem filtros", () => {
    expect(contagensP(linhas, "")).toEqual({ leads: 14, clientes: 5, todos: 21 });
    expect(linhas).toHaveLength(21);
  });
  it("não muda o Estado", () => {
    const antes = JSON.stringify(S);
    selecionar(linhas, "todos", { ...SEM_FILTROS_P, distrito: "Lisboa", periodo: "30" });
    linhasDe(S);
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("filtros de Pessoas · cada filtro isolado (separador Todos)", () => {
  it("pesquisa", () => expect(nomes("todos", { q: "carla" })).toEqual(["Carla Nunes"]));
  it("período: 7, 30 e 90 dias com hoje fixo a 10/10", () => {
    expect(conta("todos", { periodo: "7" })).toBe(6); // Pedro, Rita, Inês, Manuel, Modas, Filipa (Manuel e Filipa fazem 7 dias)
    expect(conta("todos", { periodo: "30" })).toBe(19); // só ficam de fora Hotel Praia Dourada (32 dias) e Armando Figueiredo (35)
    expect(conta("todos", { periodo: "90" })).toBe(21);
  });
  it("origem e canal", () => {
    expect(conta("todos", { origem: "Site" })).toBe(6);
    expect(conta("todos", { origem: "Meta Ads" })).toBe(3);
    expect(conta("todos", { canal: "Redes sociais pagas" })).toBe(4);
    expect(conta("todos", { canal: "Pesquisa" })).toBe(2);
    expect(conta("todos", { canal: "Offline" })).toBe(2);
    expect(conta("todos", { canal: "Parcerias" })).toBe(3);
    expect(conta("todos", { canal: "Outros" })).toBe(10);
  });
  it("formulário, incluindo 'Registada à mão'", () => {
    expect(conta("todos", { formulario: "Registada à mão" })).toBe(8);
    expect(conta("todos", { formulario: "Cozinha nova" })).toBe(4);
    expect(conta("todos", { formulario: "Casa de banho nova" })).toBe(2);
  });
  it("comercial e distrito", () => {
    expect(conta("todos", { comercial: "Rúben" })).toBe(21);
    expect(conta("todos", { comercial: "Sandra" })).toBe(0);
    expect(conta("todos", { distrito: "Lisboa" })).toBe(10);
    expect(conta("todos", { distrito: "Setúbal" })).toBe(4);
    expect(conta("todos", { distrito: "Coimbra" })).toBe(1);
  });
  it("qualificação: MQL = 2 leads; SQL = 2 leads mais 1 cliente", () => {
    expect(conta("todos", { qualificacao: "MQL" })).toBe(2);
    expect(conta("leads", { qualificacao: "SQL" })).toBe(2);
    expect(conta("clientes", { qualificacao: "SQL" })).toBe(1);
    expect(conta("todos", { qualificacao: "SQL" })).toBe(3);
    expect(conta("todos", { qualificacao: "qualificada" })).toBe(5);
    expect(conta("todos", { qualificacao: "sem" })).toBe(16);
  });
  it("resultado do último contacto", () => {
    expect(conta("todos", { resultado: "Sem contacto" })).toBe(4);
    expect(conta("todos", { resultado: "Não atendeu" })).toBe(1);
    expect(conta("todos", { resultado: "Atendeu · ligar mais tarde" })).toBe(3);
    expect(conta("todos", { resultado: "Atendeu · interessado" })).toBe(13);
  });
  it("pessoa ou empresa: 3 empresas", () => {
    expect(conta("todos", { tipo: "empresa" })).toBe(3);
    expect(conta("todos", { tipo: "pessoa" })).toBe(18);
  });
  it("estado: ativas e perdidas (2), também no separador Leads", () => {
    expect(conta("todos", { estado: "perdidas" })).toBe(2);
    expect(conta("todos", { estado: "ativas" })).toBe(19);
    expect(nomes("leads", { estado: "perdidas" })).toEqual(["Teresa Antunes", "Duarte Gouveia"]);
    expect(conta("clientes", { estado: "perdidas" })).toBe(5); // os clientes nunca tiveram perdidas: o filtro não se aplica
  });
  it("voltou a contactar = 2, com visita = 3, atrasadas = 1, por contactar = 4, só as minhas", () => {
    expect(nomes("todos", { voltou: true })).toEqual(["Inês Carvalho", "Ricardo Nogueira"]);
    expect(conta("todos", { visita: true })).toBe(3);
    expect(nomes("todos", { atrasadas: true })).toEqual(["Pedro Lopes"]);
    expect(conta("todos", { porContactar: true })).toBe(4);
    expect(conta("leads", { soMinhas: true })).toBe(14);
  });
  it("já chegou a (etapa): 17, 13, 9 e 5 pessoas", () => {
    expect([1, 2, 3, 4].map((e) => conta("todos", { etapa: String(e) as FiltrosP["etapa"] }))).toEqual([17, 13, 9, 5]);
  });
  it("motivo da perda e negócio novo em curso", () => {
    expect(nomes("todos", { motivo: "Preço" })).toEqual(["Teresa Antunes"]);
    expect(nomes("todos", { motivo: "Adiou" })).toEqual(["Duarte Gouveia"]);
    expect(conta("clientes", { novoNegocio: true })).toBe(4);
  });
});

describe("filtros de Pessoas · combinados, separadores e ordem", () => {
  it("distrito e separador", () => {
    expect(conta("leads", { distrito: "Lisboa" })).toBe(7);
    expect(conta("todos", { distrito: "Lisboa", periodo: "7" })).toBe(3); // Pedro, Rita e Manuel
    expect(conta("todos", { distrito: "Lisboa", periodo: "7", tipo: "empresa" })).toBe(0);
    expect(conta("todos", { distrito: "Faro", tipo: "empresa" })).toBe(1); // Hotel Praia Dourada
  });
  it("nos clientes, os filtros que só valem para leads não se aplicam", () => {
    const f = { ...SEM_FILTROS_P, porContactar: true, visita: true, voltou: true };
    expect(selecionar(linhas, "clientes", f)).toHaveLength(5);
    expect(efetivos("clientes", f)).toMatchObject({ porContactar: false, visita: false, voltou: false });
    expect(efetivos("leads", f)).toBe(f);
  });
  it("a ordem por valor muda a lista mas não quem lá está", () => {
    const urgencia = listaP(S, linhas, "leads", SEM_FILTROS_P).map((l) => l.p.nome);
    const valor = listaP(S, linhas, "leads", SEM_FILTROS_P, "valor").map((l) => l.p.nome);
    expect([...valor].sort()).toEqual([...urgencia].sort());
    expect(valor[0]).toBe("Carla Nunes");
  });
  it("sem filtros vem tudo", () => {
    expect(conta("todos", {})).toBe(21);
  });
});

describe("filtros de Pessoas · chips rápidos e chips ativos", () => {
  it("os chips por separador", () => {
    expect(chipsRapidos("leads").map((c) => c.nome)).toEqual(["Todas", "Por contactar", "Atrasadas", "Perdidas"]);
    expect(chipsRapidos("clientes").map((c) => c.nome)).toEqual(["Todas", "Atrasadas"]);
  });
  it("ligar e desligar um chip; Todas desliga os três", () => {
    let f = alternarChip(SEM_FILTROS_P, "por_contactar");
    f = alternarChip(f, "perdidas");
    expect(chipAtivo(f, "por_contactar") && chipAtivo(f, "perdidas") && !chipAtivo(f, "todas")).toBe(true);
    f = alternarChip(f, "todas");
    expect(f).toEqual(SEM_FILTROS_P);
    expect(chipAtivo(f, "todas")).toBe(true);
    expect(alternarChip(alternarChip(f, "perdidas"), "perdidas")).toEqual(f);
  });
  it("a contagem de cada chip não depende dos outros chips (14, 4, 1 e 2 em Leads)", () => {
    const f = alternarChip(SEM_FILTROS_P, "atrasadas");
    expect((["todas", "por_contactar", "atrasadas", "perdidas"] as const).map((c) => contarChip(linhas, "leads", f, c))).toEqual([14, 4, 1, 2]);
  });
  it("cada filtro ligado aparece em texto, com o que o desliga", () => {
    const f: FiltrosP = { ...SEM_FILTROS_P, q: " ana ", periodo: "30", qualificacao: "qualificada", etapa: "2", voltou: true, soMinhas: true };
    const chips = chipsAtivos(f);
    expect(chips.map((c) => c.texto)).toEqual(["Pesquisa: ana", "Período: 30 dias", "Qualificação: MQL ou SQL", "Já chegou a: Visita", "Só as minhas", "Voltou a contactar"]);
    const sem = chips.reduce((a, c) => ({ ...a, ...c.limpar }), f);
    expect(sem).toEqual(SEM_FILTROS_P);
    expect(chipsAtivos(SEM_FILTROS_P)).toEqual([]);
  });
  it("as opções dos selects vêm das pessoas", () => {
    const o = opcoesDe(linhas);
    expect(o.distrito).toEqual(["Braga", "Coimbra", "Faro", "Lisboa", "Porto", "Setúbal"]);
    expect(o.motivo).toEqual(["Adiou", "Preço"]);
    expect(o.formulario).toContain("Registada à mão");
    expect(o.canal).toEqual(["Offline", "Outros", "Parcerias", "Pesquisa", "Redes sociais pagas"]);
  });
});
