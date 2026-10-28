// O rascunho do assistente (Preparar a visita, a morada da obra e o levantamento a meio): sobrevive a mudar de passo e a recarregar a página
// (sessionStorage), e um valor estragado ou de outra versão nunca rebenta o ecrã.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DURACOES_PREPARAR, QUEM_VAI_ESTAR, RASCUNHO_VAZIO, chaveDoRascunho, duracaoParaAgenda, lerRascunho, guardarRascunho, type RascunhoAssistente,
} from "./rascunhoAssistente";

beforeEach(() => window.sessionStorage.clear());

describe("rascunho do assistente", () => {
  it("sem nada guardado devolve o vazio, em que nada está escolhido", () => {
    const r = lerRascunho("k");
    expect(r).toEqual(RASCUNHO_VAZIO);
    expect(r.preparar).toEqual({ duracao: "", quem: "", nota: "" });
    expect(r.morada).toEqual({ rua: "", codigoPostal: "", localidade: "", andar: "" });
  });

  it("guarda e volta a ler o que se escreveu", () => {
    const r: RascunhoAssistente = {
      ...RASCUNHO_VAZIO, preparar: { duracao: "h1m30", quem: "casal", nota: "Levar escada" },
      morada: { rua: "Rua A 3", codigoPostal: "4000-001", localidade: "Porto", andar: "2.º" }, moradaOrigem: "manual", respostas: { exterior1: "a" },
    };
    guardarRascunho("k", r);
    expect(lerRascunho("k")).toEqual(r);
  });

  it("cada negócio tem o seu rascunho", () => {
    guardarRascunho("n1", { ...RASCUNHO_VAZIO, preparar: { duracao: "h1", quem: "", nota: "" } });
    expect(lerRascunho("n2").preparar.duracao).toBe("");
    expect(chaveDoRascunho("n1")).not.toBe(chaveDoRascunho("n2"));
  });

  it("um valor estragado ou de outra forma volta ao vazio", () => {
    window.sessionStorage.setItem(chaveDoRascunho("k"), "{isto não é json");
    expect(lerRascunho("k")).toEqual(RASCUNHO_VAZIO);
    window.sessionStorage.setItem(chaveDoRascunho("x"), JSON.stringify({ preparar: 3, morada: "rua" }));
    expect(lerRascunho("x")).toEqual(RASCUNHO_VAZIO);
  });

  it("uma duração ou um «quem vai estar» fora da lista não passa", () => {
    window.sessionStorage.setItem(chaveDoRascunho("y"), JSON.stringify({ ...RASCUNHO_VAZIO, preparar: { duracao: "h9", quem: "toda a gente", nota: "ok" } }));
    expect(lerRascunho("y").preparar).toEqual({ duracao: "", quem: "", nota: "ok" });
  });

  it("não rebenta se o armazenamento recusar", () => {
    const original = window.sessionStorage.setItem;
    window.sessionStorage.setItem = () => { throw new Error("cheio"); };
    expect(() => guardarRascunho("k", RASCUNHO_VAZIO)).not.toThrow();
    window.sessionStorage.setItem = original;
  });

  it("as opções são as do protótipo mais os 30 min da agenda: 30 min, 1 h, 1 h 30, 2 h e o cliente, o casal, a família, outra pessoa", () => {
    expect(DURACOES_PREPARAR).toEqual(["m30", "h1", "h1m30", "h2"]);
    expect(QUEM_VAI_ESTAR).toEqual(["cliente", "casal", "familia", "outra"]);
  });

  it("a duração segue para a agenda com as chaves que ela já usa, e vazia não escolhe nada", () => {
    expect(duracaoParaAgenda("h1m30")).toBe("h1m30");
    expect(duracaoParaAgenda("m30")).toBe("m30");
    expect(duracaoParaAgenda("")).toBeUndefined();
  });
});
