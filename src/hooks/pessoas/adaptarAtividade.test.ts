import { describe, expect, it } from "vitest";
import { adaptarAtividade } from "./adaptarAtividade";
import { atividadeDb, fichaDb, PESSOA_ID, seccaoDb } from "./fichaFabrica";

const um = (sobre: Parameters<typeof atividadeDb>[0]) => adaptarAtividade(fichaDb({ atividade: seccaoDb([atividadeDb(sobre)]) }))[0];

describe("adaptarAtividade", () => {
  it("uma chamada leva o resultado como título (chave), a nota como detalhe, o dia e a hora de Lisboa", () => {
    expect(um({ tipo: "call", resultado: "naoAtendeu", notas: "Sem resposta", em: "2026-07-01T23:30:00Z" })).toEqual({
      id: "a1", pessoaId: PESSOA_ID, tipo: "chamada", titulo: "", chaveTitulo: "pessoasPagina.result.naoAtendeu", detalhe: "Sem resposta",
      quando: "2026-07-02", hora: "00:30", exemplo: false,
    });
  });

  it("uma chamada sem resultado conhecido leva o título neutro traduzido", () => {
    expect(um({ tipo: "call", resultado: "xpto" })).toMatchObject({ tipo: "chamada", chaveTitulo: "pessoasPagina.real.ficha.unknownResult", titulo: "" });
    expect(um({ tipo: "call", resultado: null })).toMatchObject({ tipo: "chamada", chaveTitulo: "pessoasPagina.real.ficha.unknownResult" });
  });

  it("as notas de encerrar e reabrir a abordagem são histórico, com as chaves que já existem", () => {
    expect(um({ tipo: "note", assunto: "Abordagem encerrada" })).toMatchObject({ tipo: "historico", chaveTitulo: "pessoasPagina.close.activity.closed" });
    expect(um({ tipo: "note", assunto: "Abordagem reaberta" })).toMatchObject({ tipo: "historico", chaveTitulo: "pessoasPagina.close.activity.reopened" });
  });

  it("o contacto adiado é histórico", () => {
    expect(um({ tipo: "note", assunto: "Contacto adiado" })).toMatchObject({ tipo: "historico", chaveTitulo: "pessoasPagina.real.ficha.activity.snoozed" });
  });

  it("uma nota livre é nota, com o texto como detalhe", () => {
    expect(um({ tipo: "note", assunto: "Nota", notas: "Prefere de manhã" })).toMatchObject({
      tipo: "nota", chaveTitulo: "pessoasPagina.activity.noteAdded", detalhe: "Prefere de manhã", titulo: "",
    });
  });

  it("um email leva o assunto como título", () => {
    expect(um({ tipo: "email", assunto: "Orçamento", notas: "Segue em anexo" })).toMatchObject({ tipo: "email", titulo: "Orçamento", detalhe: "Segue em anexo" });
  });

  it.each([
    ["perdeu", "lost"], ["reabriu", "reopened"], ["ganhou", "won"], ["apagado", "deleted"], ["restaurado", "restored"],
  ])("o evento %s é histórico com a chave %s", (tipo, chave) => {
    expect(um({ tipo, resultado: null })).toMatchObject({ tipo: "historico", chaveTitulo: `pessoasPagina.real.ficha.activity.${chave}` });
  });

  it("um tipo desconhecido é histórico com o assunto escrito, e nunca rebenta", () => {
    expect(um({ tipo: "reuniao", assunto: "Reunião na obra", notas: null })).toMatchObject({ tipo: "historico", titulo: "Reunião na obra", detalhe: "" });
  });

  it("um instante inválido não rebenta (sem dia nem hora válidos fica sem hora)", () => {
    const item = um({ em: "lixo" });
    expect(item.hora).toBeUndefined();
    expect(item.quando).toBe("");
  });

  it("mantém a ordem da base e uma atividade em falta dá lista vazia", () => {
    const ficha = fichaDb({ atividade: seccaoDb([atividadeDb({ id: "x" }), atividadeDb({ id: "y" })]) });
    expect(adaptarAtividade(ficha).map((i) => i.id)).toEqual(["x", "y"]);
    expect(adaptarAtividade(fichaDb({ atividade: null }))).toEqual([]);
  });
});
