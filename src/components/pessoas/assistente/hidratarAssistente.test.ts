// O que a base guardou a preencher o ecrã de um passo quando o rascunho do navegador já não existe: o rascunho ganha, a visita preenche o que falta.
import { describe, expect, it } from "vitest";
import type { LevantamentoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { levantamentoMaisRecente, moradaHidratada, prepararHidratado, visitaMarcadaMaisRecente } from "./hidratarAssistente";

const VISITA = (extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id: "v1", data: "2026-10-20", hora: "10:30", feitoPor: "Rita", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "casal", duracao: "h1m30",
  morada: { rua: "Rua da Obra 5", codigoPostal: "4000-010", localidade: "Porto", andar: "" }, igualALead: null, nota: "Levar escada", pessoaId: "p", negocioId: "n", ...extra,
});
const LEV = (id: string, data: string): LevantamentoPessoa => ({
  id, pessoaId: "p", visitaId: null, data, feitoPor: "Rita", rascunho: { linhas: [], observacoes: "", respostas: {} }, negocioId: "n",
});
const VAZIA = { duracao: "", quem: "", nota: "" };
const MORADA_VAZIA = { rua: "", codigoPostal: "", localidade: "", andar: "" };

describe("visitaMarcadaMaisRecente", () => {
  it("ignora as canceladas e escolhe a mais recente por data e hora", () => {
    const v = visitaMarcadaMaisRecente([VISITA({ id: "a" }), VISITA({ id: "b", data: "2026-10-25" }), VISITA({ id: "c", data: "2026-11-01", estado: "cancelada" })]);
    expect(v?.id).toBe("b");
  });
  it("sem visitas, ou só canceladas, ou indefinido: null", () => {
    expect(visitaMarcadaMaisRecente([])).toBeNull();
    expect(visitaMarcadaMaisRecente(undefined)).toBeNull();
    expect(visitaMarcadaMaisRecente([VISITA({ estado: "cancelada" })])).toBeNull();
  });
});

describe("prepararHidratado", () => {
  it("sem visita devolve o rascunho", () => {
    expect(prepararHidratado(VAZIA, null)).toBe(VAZIA);
  });
  it("o que falta no rascunho vem da visita", () => {
    expect(prepararHidratado(VAZIA, VISITA())).toEqual({ duracao: "h1m30", quem: "casal", nota: "Levar escada" });
  });
  it("o rascunho ganha campo a campo", () => {
    expect(prepararHidratado({ duracao: "h2", quem: "", nota: "" }, VISITA())).toEqual({ duracao: "h2", quem: "casal", nota: "Levar escada" });
  });
  it("tocado: um campo apagado fica vazio e a visita não o repõe", () => {
    expect(prepararHidratado({ duracao: "h2", quem: "", nota: "" }, VISITA(), true)).toEqual({ duracao: "h2", quem: "", nota: "" });
    expect(prepararHidratado(VAZIA, VISITA(), true)).toBe(VAZIA);
  });
  it("uma duração que o passo não oferece (30 min) ou um valor desconhecido ficam vazios, e a nota respeita o limite", () => {
    const p = prepararHidratado(VAZIA, VISITA({ duracao: "m30", quemVaiEstar: "ninguem", nota: "x".repeat(200) }));
    expect(p.duracao).toBe("");
    expect(p.quem).toBe("");
    expect(p.nota).toHaveLength(140);
  });
});

describe("moradaHidratada", () => {
  it("a do rascunho ganha se tem alguma coisa", () => {
    const m = { ...MORADA_VAZIA, rua: "Rua Nova" };
    expect(moradaHidratada(m, VISITA())).toBe(m);
  });
  it("vazia, vem da visita; se a visita também não a tem, fica a do rascunho", () => {
    expect(moradaHidratada(MORADA_VAZIA, VISITA())).toEqual({ rua: "Rua da Obra 5", codigoPostal: "4000-010", localidade: "Porto", andar: "" });
    expect(moradaHidratada(MORADA_VAZIA, VISITA({ morada: MORADA_VAZIA }))).toBe(MORADA_VAZIA);
    expect(moradaHidratada(MORADA_VAZIA, null)).toBe(MORADA_VAZIA);
  });
});

describe("moradaHidratada (tocado)", () => {
  it("tocada e esvaziada, a morada da visita não reaparece", () => {
    expect(moradaHidratada(MORADA_VAZIA, VISITA(), true)).toBe(MORADA_VAZIA);
  });
});

describe("levantamentoMaisRecente", () => {
  it("escolhe o de data mais recente; em empate, o último", () => {
    expect(levantamentoMaisRecente([LEV("a", "2026-10-01"), LEV("b", "2026-10-09"), LEV("c", "2026-10-09")])?.id).toBe("c");
  });
  it("sem levantamentos: undefined", () => {
    expect(levantamentoMaisRecente([])).toBeUndefined();
    expect(levantamentoMaisRecente(undefined)).toBeUndefined();
  });
});
