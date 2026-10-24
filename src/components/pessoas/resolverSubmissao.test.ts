import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { ATIVIDADE_EXEMPLO, PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import type { EstadoPessoas } from "./pessoasTipos";
import {
  idDaMaisRecente, marcarVoltaAAbordagem, ordenarSubmissoes, pessoaDaSubmissao, pessoasComPendentes, pessoasQueVoltaram, resolverSubmissao,
} from "./resolverSubmissao";

const inicial = (): EstadoPessoas => ({
  submissoes: [...SUBMISSOES_EXEMPLO], notas: [], pessoas: [], atividade: [], contactadas: [],
});

describe("submissões de exemplo", () => {
  it("são 6, com os códigos e tipos combinados", () => {
    expect(SUBMISSOES_EXEMPLO.map((s) => [s.codigo, s.tipo, s.candidatas.map((c) => c.pessoaId)])).toEqual([
      ["CONFLITO", "contacto", ["p-helena", "p-paulo"]],
      ["MATCH_FORTE", "cliente", ["p-marta"]],
      ["MATCH_FORTE", "lead", ["p-clara"]],
      ["MATCH_EMAIL", "lead", ["p-hugo"]],
      ["MATCH_TELEFONE", "cliente", ["p-rui"]],
      ["MATCH_EMAIL", "contacto", ["p-sofia"]],
    ]);
  });

  it("a da Marta tem visita pedida para Pintura exterior", () => {
    expect(SUBMISSOES_EXEMPLO[1].visitaPedida).toBe("Pintura exterior");
  });

  it("as datas são anteriores ou iguais a hoje", () => {
    SUBMISSOES_EXEMPLO.forEach((s) => expect(s.data.slice(0, 10) <= HOJE_EXEMPLO).toBe(true));
  });
});

describe("ordenarSubmissoes", () => {
  it("conflitos primeiro, depois a data mais recente", () => {
    expect(ordenarSubmissoes(SUBMISSOES_EXEMPLO).map((s) => s.id)).toEqual(["s1", "s2", "s3", "s5", "s4", "s6"]);
  });

  it("não altera a lista recebida", () => {
    const copia = [...SUBMISSOES_EXEMPLO];
    ordenarSubmissoes(SUBMISSOES_EXEMPLO);
    expect(SUBMISSOES_EXEMPLO).toEqual(copia);
  });
});

describe("resolverSubmissao", () => {
  it("a lista desce de 6 para 5", () => {
    const novo = resolverSubmissao(inicial(), "s3");
    expect(novo.submissoes).toHaveLength(5);
    expect(novo.submissoes.some((s) => s.id === "s3")).toBe(false);
  });

  it("a nota fica na pessoa certa, com os campos submetidos", () => {
    const novo = resolverSubmissao(inicial(), "s3");
    expect(novo.notas).toHaveLength(1);
    expect(novo.notas[0]).toMatchObject({ pessoaId: "p-clara", submissaoId: "s3" });
    expect(novo.notas[0].campos).toEqual(SUBMISSOES_EXEMPLO[2].campos);
  });

  it("num conflito a nota fica na candidata escolhida", () => {
    const paulo = resolverSubmissao(inicial(), "s1", "p-paulo");
    expect(paulo.notas.map((n) => n.pessoaId)).toEqual(["p-paulo"]);
    const helena = resolverSubmissao(inicial(), "s1", "p-helena");
    expect(helena.notas.map((n) => n.pessoaId)).toEqual(["p-helena"]);
  });

  it("num conflito, sem escolha ou com quem não é candidata, nada muda", () => {
    const estado = inicial();
    expect(resolverSubmissao(estado, "s1")).toBe(estado);
    expect(resolverSubmissao(estado, "s1", "p-marta")).toBe(estado);
  });

  it("fora do conflito ignora uma escolha que não é a candidata", () => {
    const estado = inicial();
    expect(resolverSubmissao(estado, "s3", "p-marta")).toBe(estado);
  });

  it("uma submissão que não existe não muda nada", () => {
    const estado = inicial();
    expect(resolverSubmissao(estado, "nao-existe")).toBe(estado);
  });

  it("não altera o estado recebido", () => {
    const estado = inicial();
    resolverSubmissao(estado, "s2");
    expect(estado.submissoes).toHaveLength(6);
    expect(estado.notas).toHaveLength(0);
  });

  it("resolver duas seguidas acumula as notas", () => {
    const novo = resolverSubmissao(resolverSubmissao(inicial(), "s2"), "s4");
    expect(novo.submissoes).toHaveLength(4);
    expect(novo.notas.map((n) => n.pessoaId)).toEqual(["p-marta", "p-hugo"]);
  });
});

describe("pessoasComPendentes", () => {
  it("são 7 pessoas, com as duas candidatas do conflito", () => {
    const p = pessoasComPendentes(SUBMISSOES_EXEMPLO);
    expect(p.size).toBe(7);
    expect(p.has("p-helena") && p.has("p-paulo")).toBe(true);
  });

  it("o 'Voltou a contactar' desaparece quando já não há pendentes da pessoa", () => {
    const depois = resolverSubmissao(inicial(), "s2");
    expect(pessoasComPendentes(depois.submissoes).has("p-marta")).toBe(false);
    expect(pessoasComPendentes(depois.submissoes).size).toBe(6);
  });

  it("resolver o conflito liberta as duas candidatas", () => {
    const depois = resolverSubmissao(inicial(), "s1", "p-paulo");
    const p = pessoasComPendentes(depois.submissoes);
    expect(p.has("p-helena") || p.has("p-paulo")).toBe(false);
  });

  it("sem submissões, ninguém voltou a contactar", () => {
    expect(pessoasComPendentes([]).size).toBe(0);
  });

  it("resolver espalha o estado: pessoas, atividade e contactadas ficam como estavam", () => {
    const antes: EstadoPessoas = { ...inicial(), pessoas: PESSOAS_EXEMPLO.slice(0, 2), atividade: ATIVIDADE_EXEMPLO.slice(0, 2), contactadas: ["p-rui"] };
    const depois = resolverSubmissao(antes, "s2");
    expect(depois.pessoas).toBe(antes.pessoas);
    expect(depois.atividade).toBe(antes.atividade);
    expect(depois.contactadas).toBe(antes.contactadas);
  });
});

describe("pessoasQueVoltaram", () => {
  it("tira as respondidas e as perdidas de 'Voltou a contactar'", () => {
    const pessoas = PESSOAS_EXEMPLO.map((p) => (p.id === "p-clara" ? { ...p, perdida: { motivo: "preco" as const, data: "2026-10-13" } } : p));
    const todas = pessoasQueVoltaram({ pessoas: PESSOAS_EXEMPLO, contactadas: [] }, SUBMISSOES_EXEMPLO);
    expect(todas.has("p-clara")).toBe(true);
    expect(todas.has("p-marta")).toBe(true);
    const menos = pessoasQueVoltaram({ pessoas, contactadas: ["p-marta"] }, SUBMISSOES_EXEMPLO);
    expect(menos.has("p-clara")).toBe(false);
    expect(menos.has("p-marta")).toBe(false);
    expect(menos.has("p-hugo")).toBe(true);
    expect(todas.has("p-marta")).toBe(true);
  });
});

describe("idDaMaisRecente", () => {
  it("é a submissão com a data mais recente; sem submissões, null", () => {
    expect(idDaMaisRecente(SUBMISSOES_EXEMPLO)).toBe("s2");
    expect(idDaMaisRecente([SUBMISSOES_EXEMPLO[0], SUBMISSOES_EXEMPLO[3]])).toBe("s1");
    expect(idDaMaisRecente([])).toBeNull();
  });
});

describe("resolverSubmissao: a pessoa volta à abordagem (Parte 1 do Quadro)", () => {
  const comPessoas = (): EstadoPessoas => ({ ...inicial(), pessoas: PESSOAS_EXEMPLO.filter((p) => p.id === "p-clara" || p.id === "p-hugo") });

  it("marca a pessoa com o dia da submissão (`abordagemDesde`) e não mexe nas outras", () => {
    const s3 = SUBMISSOES_EXEMPLO.find((s) => s.id === "s3")!;
    const novo = marcarVoltaAAbordagem(comPessoas(), pessoaDaSubmissao(s3)!, s3.data.slice(0, 10));
    expect(novo.pessoas.find((p) => p.id === "p-clara")!.abordagemDesde).toBe(s3.data.slice(0, 10));
    expect(novo.pessoas.find((p) => p.id === "p-hugo")!.abordagemDesde).toBeUndefined();
  });

  it("num conflito a pessoa é a escolhida, e sem escolha válida não há pessoa", () => {
    const s1 = SUBMISSOES_EXEMPLO.find((s) => s.id === "s1")!;
    expect(pessoaDaSubmissao(s1, "p-paulo")).toBe("p-paulo");
    expect(pessoaDaSubmissao(s1)).toBeNull();
    expect(pessoaDaSubmissao(s1, "p-outra")).toBeNull();
  });

  it("um id que não existe deixa as pessoas como estão (o mesmo objeto)", () => {
    const estado = comPessoas();
    expect(marcarVoltaAAbordagem(estado, "nao-existe", "2026-10-12")).toBe(estado);
  });

  it("resolver a submissão continua a não mexer nas pessoas: a marca é um passo à parte", () => {
    const estado = comPessoas();
    expect(resolverSubmissao(estado, "s3").pessoas).toBe(estado.pessoas);
  });
});
