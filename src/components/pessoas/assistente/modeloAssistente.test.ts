// O modelo do assistente de passos: a conta de «faltam X respostas», o tempo, o estado de cada passo, o «Ir para» e as listas de passos das
// fases Contacto (5 passos) e Visita (Visitas, uma secção do levantamento por passo e Fechar levantamento). Funções puras.
import { describe, expect, it } from "vitest";
import {
  completo, estadoDoPasso, faltam, passosDaVisita, passosDoContacto, proximoRelevante, seccoesDoAssistente, tempoDoPasso,
  type ContextoContacto, type ContextoVisita,
} from "./modeloAssistente";
import type { PassoAssistente } from "./tiposAssistente";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";

const passo = (extra: Partial<PassoAssistente> = {}): PassoAssistente => ({ id: "x", icone: "telefone", obrigatorias: 2, respondidas: 0, precisaNegocio: false, ...extra });

const CONTACTO: ContextoContacto = {
  chamadas: 0, visitaMarcada: false, perguntas: { respondidas: 0, total: 6 },
  morada: { rua: "", codigoPostal: "", localidade: "" }, preparar: { duracao: "", quem: "" },
};

describe("faltam e completo", () => {
  it("faltam é obrigatórias menos respondidas, nunca negativo", () => {
    expect(faltam(passo({ obrigatorias: 3, respondidas: 1 }))).toBe(2);
    expect(faltam(passo({ obrigatorias: 1, respondidas: 4 }))).toBe(0);
  });

  it("um passo sem nada obrigatório está completo; com falta, não", () => {
    expect(completo(passo({ obrigatorias: 0, respondidas: 0 }))).toBe(true);
    expect(completo(passo({ obrigatorias: 2, respondidas: 1 }))).toBe(false);
    expect(completo(passo({ obrigatorias: 2, respondidas: 2 }))).toBe(true);
  });

  it("o campo feito manda sobre a conta (Fechar levantamento só está feito depois de guardar)", () => {
    expect(completo(passo({ obrigatorias: 0, feito: false }))).toBe(false);
    expect(completo(passo({ obrigatorias: 2, respondidas: 0, feito: true }))).toBe(true);
  });
});

describe("tempoDoPasso (6 segundos por resposta)", () => {
  it("sem faltas diz completo", () => expect(tempoDoPasso(0)).toEqual({ tipo: "completo" }));
  it("até 9 respostas é menos de um minuto", () => {
    expect(tempoDoPasso(1)).toEqual({ tipo: "menosDeUmMinuto" });
    expect(tempoDoPasso(9)).toEqual({ tipo: "menosDeUmMinuto" });
  });
  it("10 respostas é um minuto e 25 são três", () => {
    expect(tempoDoPasso(10)).toEqual({ tipo: "minutos", minutos: 1 });
    expect(tempoDoPasso(25)).toEqual({ tipo: "minutos", minutos: 3 });
  });
});

describe("estadoDoPasso", () => {
  it("feito, atual, com falta (já visitado) e por fazer", () => {
    expect(estadoDoPasso(passo({ obrigatorias: 1, respondidas: 1 }), { ativo: false, visitado: true })).toBe("feito");
    expect(estadoDoPasso(passo(), { ativo: true, visitado: true })).toBe("atual");
    expect(estadoDoPasso(passo(), { ativo: false, visitado: true })).toBe("comFalta");
    expect(estadoDoPasso(passo(), { ativo: false, visitado: false })).toBe("porFazer");
  });
});

describe("proximoRelevante (o «Ir para»)", () => {
  const lista = [passo({ id: "a", obrigatorias: 1, respondidas: 1 }), passo({ id: "b" }), passo({ id: "c", obrigatorias: 1, respondidas: 1 }), passo({ id: "d" })];

  it("salta para o primeiro passo seguinte que ainda tem falta", () => {
    expect(proximoRelevante(lista, 0)).toBe(1);
    expect(proximoRelevante(lista, 1)).toBe(3);
  });

  it("se já nada falta mais à frente, vai ao último", () => {
    const feitos = lista.map((p) => ({ ...p, obrigatorias: 1, respondidas: 1 }));
    expect(proximoRelevante(feitos, 0)).toBe(3);
  });

  it("no último passo não há para onde ir", () => {
    expect(proximoRelevante(lista, 3)).toBeNull();
    expect(proximoRelevante([], 0)).toBeNull();
  });
});

describe("passosDoContacto", () => {
  it("são cinco, por ordem: Chamada, Qualificação, Morada da obra, Preparar a visita, Marcar a visita", () => {
    expect(passosDoContacto(CONTACTO).map((p) => p.id)).toEqual(["chamada", "qualificacao", "morada", "preparar", "marcar"]);
  });

  it("os passos que gravam no negócio precisam dele; a chamada e a marcação não", () => {
    const precisa = Object.fromEntries(passosDoContacto(CONTACTO).map((p) => [p.id, p.precisaNegocio]));
    expect(precisa).toEqual({ chamada: false, qualificacao: true, morada: true, preparar: true, marcar: false });
  });

  it("a chamada falta até haver uma registada", () => {
    expect(faltam(passosDoContacto(CONTACTO)[0])).toBe(1);
    expect(completo(passosDoContacto({ ...CONTACTO, chamadas: 2 })[0])).toBe(true);
  });

  it("a qualificação conta as perguntas do questionário (as 6 configuráveis), não um número fixo", () => {
    const q = passosDoContacto({ ...CONTACTO, perguntas: { respondidas: 2, total: 4 } })[1];
    expect([q.obrigatorias, q.respondidas, faltam(q)]).toEqual([4, 2, 2]);
  });

  it("a morada pede rua, código postal e localidade; o andar não conta", () => {
    const m = passosDoContacto({ ...CONTACTO, morada: { rua: "Rua A", codigoPostal: " ", localidade: "Porto" } })[2];
    expect([m.obrigatorias, m.respondidas]).toEqual([3, 2]);
  });

  it("preparar a visita pede duração e quem vai estar; a nota é opcional", () => {
    const p = passosDoContacto({ ...CONTACTO, preparar: { duracao: "h1", quem: "" } })[3];
    expect([p.obrigatorias, p.respondidas]).toEqual([2, 1]);
  });

  it("marcar a visita falta até haver uma visita marcada", () => {
    expect(faltam(passosDoContacto(CONTACTO)[4])).toBe(1);
    expect(completo(passosDoContacto({ ...CONTACTO, visitaMarcada: true })[4])).toBe(true);
  });
});

describe("passosDaVisita", () => {
  const base: ContextoVisita = {
    visitas: 0, guardado: false,
    seccoes: [
      { id: "exterior", titulo: "Exterior do edifício", respondidas: 1, total: 3 },
      { id: "interior", titulo: "Interior do espaço", respondidas: 0, total: 0 },
    ],
  };

  it("Visitas primeiro, uma secção por passo (com o título da base) e Fechar levantamento no fim", () => {
    const passos = passosDaVisita(base);
    expect(passos.map((p) => p.id)).toEqual(["visitas", "seccao:exterior", "seccao:interior", "fechar"]);
    expect(passos[1].rotulo).toBe("Exterior do edifício");
    // O levantamento é um por negócio: as secções e Fechar levantamento precisam dele; a lista de visitas não.
    expect(passos.map((p) => p.precisaNegocio)).toEqual([false, true, true, true]);
  });

  it("Visitas só está completo com pelo menos uma visita", () => {
    expect(faltam(passosDaVisita(base)[0])).toBe(1);
    expect(completo(passosDaVisita({ ...base, visitas: 2 })[0])).toBe(true);
  });

  it("uma secção conta as respostas dela; sem perguntas visíveis está completa", () => {
    const [, exterior, interior] = passosDaVisita(base);
    expect(faltam(exterior)).toBe(2);
    expect(completo(interior)).toBe(true);
  });

  it("Fechar levantamento só está feito depois de guardar e não conta respostas", () => {
    const fechar = passosDaVisita(base).at(-1) as PassoAssistente;
    expect(completo(fechar)).toBe(false);
    expect(faltam(fechar)).toBe(0);
    expect(completo(passosDaVisita({ ...base, guardado: true }).at(-1) as PassoAssistente)).toBe(true);
  });
});

describe("seccoesDoAssistente (do questionário da base)", () => {
  const pergunta = (id: string) => ({ id, rotulo: [id, id] as const, opcoes: [["a", "A", "A"], ["b", "B", "B"]] as const, literal: true });
  const seccao = (id: string, extra: Record<string, unknown> = {}) => ({
    id, titulo: [`T-${id}`, `T-${id}`] as const, literal: true, blocos: [{ id: `${id}-0`, perguntas: [pergunta(`${id}1`), pergunta(`${id}2`)] }], ...extra,
  });
  const q = {
    versao: 3, semBase: false,
    seccoes: [
      seccao("visitas", { especial: "visitas", blocos: [] }), seccao("exterior"), seccao("interior"), seccao("medidas", { especial: "medidas", blocos: [] }),
      seccao("necessidades"), seccao("escolhas"), seccao("qualificacao", { aba: "qualificacao" }),
    ],
  } as unknown as QuestionarioForm;

  it("deixa de fora Visitas (é o primeiro passo), Necessidades, a Qualificação e mantém as outras pela ordem", () => {
    expect(seccoesDoAssistente(q, {}, 0).map((s) => s.id)).toEqual(["exterior", "interior", "medidas", "escolhas"]);
  });

  it("conta as respostas visíveis de cada secção", () => {
    const [exterior] = seccoesDoAssistente(q, { exterior1: "a" }, 0);
    expect([exterior.respondidas, exterior.total]).toEqual([1, 2]);
  });

  it("Medidas da área conta as linhas: sem linhas falta uma, com linhas está completa", () => {
    const medidas = (n: number) => seccoesDoAssistente(q, {}, n).find((s) => s.id === "medidas");
    expect([medidas(0)?.respondidas, medidas(0)?.total]).toEqual([0, 1]);
    expect([medidas(2)?.respondidas, medidas(2)?.total]).toEqual([1, 1]);
  });
});
