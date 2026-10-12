// O Hoje da V2 funcional de Pessoas e a camada dos registos do dia a dia: prioridade, unicidade, razões, e o efeito de registar uma chamada, uma nota e um adiamento.
import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { todosApp } from "./pessoasDocs";
import { perfilDe } from "./perfilDocs";
import { resultadoContacto, voltouAContactar } from "./camposPessoa";
import { linhasDe } from "./filtrosPessoas";
import { atividadeRegistada, grupoDe, hojePessoas, perfilFunc, proximoContactoDias, totalHoje, REGISTADO_AGORA } from "./funcHoje";
import type { Registo } from "./diaADia";

const nomes = (S = seed(), regs: Registo[] = []) => Object.fromEntries(hojePessoas(S, regs).map((g) => [g.id, g.itens.map((i) => i.p.nome)]));
const razao = (nome: string, S = seed(), regs: Registo[] = []) => hojePessoas(S, regs).flatMap((g) => g.itens).find((i) => i.p.nome === nome)?.razao;
const pessoa = (S: ReturnType<typeof seed>, nome: string) => todosApp(S).find((p) => p.nome === nome)!;
const chamada = (nome: string, resultado = "Atendeu · interessado", passo: "nenhum" | "ligar_hoje" | "ligar_amanha" | "visita" = "nenhum", nota = ""): Registo =>
  ({ id: 1, nome, tipo: "chamada", resultado, passo, nota });

describe("Hoje · as quatro listas com a seed e os exemplos", () => {
  it("cada lista tem as pessoas certas, pela ordem da página de Pessoas", () => {
    expect(nomes()).toEqual({
      contactar: ["Pedro Lopes", "Ana Martins", "Rita Sousa", "Inês Carvalho", "Ricardo Nogueira", "Manuel Costa", "Sérgio Pinto"],
      visitas: ["Luísa Freitas", "Filipa Moreira"],
      espera: ["Carla Nunes"],
      contratos: ["Tiago Almeida", "Hotel Praia Dourada", "Joana Ribeiro", "Armando Figueiredo"],
    });
  });
  it("a Inês Carvalho e o Ricardo Nogueira estão em Contactar hoje porque voltaram a contactar", () => {
    expect(razao("Inês Carvalho")).toMatch(/^Voltou a contactar ontem/);
    expect(razao("Ricardo Nogueira")).toMatch(/^Voltou a contactar há 4 dias/);
  });
  it("as razões dizem o porquê em texto", () => {
    expect(razao("Ana Martins")).toBe("Sem contacto há 10 dias");
    expect(razao("Pedro Lopes")).toBe("Sem contacto há 4 dias · Tarefa atrasada");
    expect(razao("Manuel Costa")).toBe("Pediu para ligar mais tarde");
    expect(razao("Luísa Freitas")).toBe("Visita qui 15/10 · 10:00");
    expect(razao("Carla Nunes")).toBe("Proposta enviada há 5 dias");
    expect(razao("Joana Ribeiro")).toBe("Contrato por assinar · WC de serviço e lavandaria");
    expect(razao("Tiago Almeida")).toBe("Por faturar · Cozinha (e mais 1)");
  });
  it("cada pessoa aparece uma só vez, e a soma das listas é o total do Hoje", () => {
    const S = seed(), gs = hojePessoas(S, []), todos = gs.flatMap((g) => g.itens.map((i) => i.p.nome));
    expect(new Set(todos).size).toBe(todos.length);
    expect(totalHoje(gs)).toBe(14);
    const comGrupo = todosApp(S).filter((p) => grupoDe(S, p, perfilDe(p, S), []) !== null).length;
    expect(totalHoje(gs)).toBe(comGrupo);
  });
  it("a prioridade manda: a Carla tem proposta parada e nenhuma razão de contacto, por isso fica em À espera e não em Contratos", () => {
    expect(nomes().espera).toContain("Carla Nunes");
    expect(nomes().contratos).not.toContain("Carla Nunes");
  });
  it("as perdidas nunca entram, e os clientes nunca entram em Contactar hoje", () => {
    const n = nomes();
    for (const nome of ["Teresa Antunes", "Duarte Gouveia"]) expect(Object.values(n).flat()).not.toContain(nome);
    const S = seed();
    expect(n.contactar.every((x) => pessoa(S, x).papel === "lead")).toBe(true);
  });
  it("o campo 'Voltar a ligar em' marcado para hoje põe a lead em Contactar hoje", () => {
    const S = seed();
    S.deals.find((d) => d.nome === "Hugo Matos")!.f.religar = "2026-10-10";
    expect(nomes(S).contactar).toContain("Hugo Matos");
    expect(razao("Hugo Matos", S)).toBe("Ficou de voltar a ligar hoje");
  });
});

describe("Hoje · os registos do dia a dia", () => {
  it("registar uma chamada tira a pessoa de Contactar hoje, faz desaparecer 'Voltou a contactar' e muda o resultado", () => {
    const S = seed(), regs = [chamada("Ricardo Nogueira")];
    expect(nomes(S, regs).contactar).not.toContain("Ricardo Nogueira");
    const p = pessoa(S, "Ricardo Nogueira"), f = perfilFunc(perfilDe(p, S), regs, p.nome);
    expect(voltouAContactar(S, p, perfilDe(p, S))).toBe(true);
    expect(voltouAContactar(S, p, f)).toBe(false);
    expect(resultadoContacto(f)).toBe("Atendeu · interessado");
    expect(f.diasSemContacto).toBe(0);
    expect(linhasDe(S).find((l) => l.p.nome === "Ricardo Nogueira")!.voltou).toBe(true); // a camada não muda os dados derivados de sempre
  });
  it("a chamada entra no topo da Atividade, com a marca 'registado agora'", () => {
    const a = atividadeRegistada([chamada("Inês Carvalho", "Não atendeu", "ligar_amanha", "Deixei mensagem")], "Inês Carvalho");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ tipo: "chamada", titulo: "Chamada registada", q: REGISTADO_AGORA });
    expect(a[0].detalhe).toBe("Não atendeu · Próximo passo: Ligar amanhã · Deixei mensagem");
  });
  it("com 'Voltar a ligar hoje' a pessoa fica em Contactar hoje, com essa razão", () => {
    const regs = [chamada("Ana Martins", "Não atendeu", "ligar_hoje")];
    expect(nomes(seed(), regs).contactar).toContain("Ana Martins");
    expect(razao("Ana Martins", seed(), regs)).toBe("Combinado ligar outra vez hoje");
  });
  it("adiar tira a pessoa do Hoje e muda o próximo contacto; uma chamada posterior manda", () => {
    const S = seed(), adiar: Registo = { id: 1, nome: "Inês Carvalho", tipo: "adiar", dias: 3 };
    expect(Object.values(nomes(S, [adiar])).flat()).not.toContain("Inês Carvalho");
    const p = pessoa(S, "Inês Carvalho");
    expect(perfilFunc(perfilDe(p, S), [adiar], p.nome).prazo).toEqual({ data: "13/10", atrasado: false });
    expect(proximoContactoDias([adiar, { ...chamada("Inês Carvalho", "Não atendeu", "ligar_hoje"), id: 2 }], "Inês Carvalho")).toBe(0);
  });
  it("adiar move uma pessoa de outra lista (a Luísa sai das Visitas)", () => {
    expect(nomes(seed(), [{ id: 1, nome: "Luísa Freitas", tipo: "adiar", dias: 1 }]).visitas).toEqual(["Filipa Moreira"]);
  });
  it("uma nota entra à frente das notas e na Atividade", () => {
    const S = seed(), p = pessoa(S, "Pedro Lopes"), regs: Registo[] = [{ id: 1, nome: "Pedro Lopes", tipo: "nota", texto: "Prefere WhatsApp" }];
    expect(perfilFunc(perfilDe(p, S), regs, p.nome).notas[0]).toMatchObject({ texto: "Prefere WhatsApp", q: REGISTADO_AGORA, exemplo: false });
    expect(atividadeRegistada(regs, "Pedro Lopes")[0]).toMatchObject({ tipo: "nota", titulo: "Prefere WhatsApp" });
    expect(nomes(S, regs).contactar).toContain("Pedro Lopes"); // uma nota não é um contacto
  });
  it("os registos de uma pessoa não mexem nas outras", () => {
    const regs = [chamada("Ricardo Nogueira")];
    expect(razao("Inês Carvalho", seed(), regs)).toBe(razao("Inês Carvalho"));
  });
});

describe("Hoje · nada muda o Estado, o seed nem os registos", () => {
  it("o Estado e os registos ficam iguais (JSON antes e depois), e o seed continua o mesmo", () => {
    const S = seed(), antes = JSON.stringify(S), regs: Registo[] = [chamada("Ricardo Nogueira"), { id: 2, nome: "Inês Carvalho", tipo: "adiar", dias: 1 }];
    const regsAntes = JSON.stringify(regs);
    Object.freeze(regs);
    hojePessoas(S, regs);
    for (const p of todosApp(S)) { perfilFunc(perfilDe(p, S), regs, p.nome); atividadeRegistada(regs, p.nome); }
    expect(JSON.stringify(S)).toBe(antes);
    expect(JSON.stringify(regs)).toBe(regsAntes);
    expect(JSON.stringify(seed())).toBe(antes);
  });
  it("perfilFunc devolve uma cópia: o perfil de entrada fica igual", () => {
    const S = seed(), p = pessoa(S, "Ricardo Nogueira"), f = perfilDe(p, S), antes = JSON.stringify(f);
    const g = perfilFunc(f, [chamada("Ricardo Nogueira")], p.nome);
    expect(g).not.toBe(f);
    expect(JSON.stringify(f)).toBe(antes);
    expect(perfilFunc(f, [], p.nome)).toBe(f);
  });
});
