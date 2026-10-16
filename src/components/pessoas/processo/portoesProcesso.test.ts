import { describe, expect, it } from "vitest";
import { novaLinha, type LinhaForm } from "@/components/negocio-metas/levantamento";
import {
  portaoCriarNegocio, portaoFazerLevantamento, portaoLevantamento, portaoVisitaFeita,
} from "./portoesProcesso";

const linha = (extra: Partial<LinhaForm> = {}): LinhaForm => ({ ...novaLinha("l1"), divisao: "cozinha", trabalho: "pintura", medida: "12", ...extra });
const visita = { data: "2026-10-12", feita: false };

describe("portaoVisitaFeita (marcar a visita como feita)", () => {
  it("sem visita falta a visita", () => {
    expect(portaoVisitaFeita(null)).toEqual({ ok: false, emFalta: ["visita"] });
  });
  it("uma visita sem data falta a data", () => {
    expect(portaoVisitaFeita({ data: "", feita: false })).toEqual({ ok: false, emFalta: ["dataVisita"] });
  });
  it("com visita e data está tudo, mesmo no passado", () => {
    expect(portaoVisitaFeita(visita)).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoFazerLevantamento", () => {
  it("sem visita, ou com a visita por fazer, falta a visita feita", () => {
    expect(portaoFazerLevantamento(null)).toEqual({ ok: false, emFalta: ["visitaFeita"] });
    expect(portaoFazerLevantamento(visita)).toEqual({ ok: false, emFalta: ["visitaFeita"] });
  });
  it("com a visita feita pode começar", () => {
    expect(portaoFazerLevantamento({ ...visita, feita: true })).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoLevantamento (visita feita e pelo menos uma linha de medidas)", () => {
  it("sem visita feita falta a visita feita", () => {
    expect(portaoLevantamento({ visitaFeita: false, linhas: [linha()] })).toEqual({ ok: false, emFalta: ["visitaFeita"] });
  });
  it("sem linhas faltam as medidas", () => {
    expect(portaoLevantamento({ visitaFeita: true, linhas: [] })).toEqual({ ok: false, emFalta: ["linhas"] });
  });
  it("uma linha por acabar não conta (a validação é a do levantamento)", () => {
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha({ medida: "" })] })).toEqual({ ok: false, emFalta: ["linhaInvalida"] });
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha({ medida: "0" })] }).emFalta).toEqual(["linhaInvalida"]);
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha({ divisao: "" })] }).emFalta).toEqual(["linhaInvalida"]);
  });
  it("falta tudo de uma vez: visita feita e linhas, por esta ordem", () => {
    expect(portaoLevantamento({ visitaFeita: false, linhas: [] }).emFalta).toEqual(["visitaFeita", "linhas"]);
  });
  it("com visita feita e uma linha válida está tudo", () => {
    expect(portaoLevantamento({ visitaFeita: true, linhas: [linha()] })).toEqual({ ok: true, emFalta: [] });
  });
});

describe("portaoCriarNegocio (a pessoa; com visita feita, pelo menos uma linha)", () => {
  it("sem pessoa falta a pessoa", () => {
    expect(portaoCriarNegocio({ pessoaId: "", visitaFeita: false, linhas: [] })).toEqual({ ok: false, emFalta: ["pessoa"] });
    expect(portaoCriarNegocio({ pessoaId: "  ", visitaFeita: false, linhas: [] }).emFalta).toEqual(["pessoa"]);
  });
  it("sem visita feita não se pedem linhas", () => {
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: false, linhas: [] })).toEqual({ ok: true, emFalta: [] });
  });
  it("com visita feita e sem linhas faltam as medidas", () => {
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: true, linhas: [] })).toEqual({ ok: false, emFalta: ["linhas"] });
  });
  it("com visita feita, uma linha por acabar não serve; uma válida serve", () => {
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: true, linhas: [linha({ trabalho: "" })] }).emFalta).toEqual(["linhaInvalida"]);
    expect(portaoCriarNegocio({ pessoaId: "a", visitaFeita: true, linhas: [linha()] })).toEqual({ ok: true, emFalta: [] });
  });
  it("falta a pessoa e as linhas ao mesmo tempo", () => {
    expect(portaoCriarNegocio({ pessoaId: "", visitaFeita: true, linhas: [] }).emFalta).toEqual(["pessoa", "linhas"]);
  });
});
