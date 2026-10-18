// A visita nova de uma pessoa (marcada numa chamada ou no botão «Marcar visita»): validação, tipo, morada e o texto da atividade.
import { describe, expect, it } from "vitest";
import { alterarVisitaDaPessoa, visitaNova } from "./visitaDaPessoa";

const lead = { comercial: "Ana", morada: { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" } };
const semMorada = { comercial: "Ana" };
const dados = { data: "2026-10-16", hora: "09:30", nota: "" };
const HOJE = "2026-10-13";

describe("visitaNova", () => {
  it("marca por fazer, na morada da lead, do comercial da pessoa, com o texto da atividade", () => {
    const r = visitaNova(lead, dados, [], HOJE);
    expect(r?.visita).toMatchObject({
      data: "2026-10-16", hora: "09:30", feitoPor: "Ana", estado: "porFazer", tipo: "levantamento", igualALead: true, pessoaId: "",
      morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" },
    });
    expect(r?.detalhe).toBe("2026-10-16 09:30 · Rua A 1, 1000-001 Lisboa");
  });

  it("a primeira é de levantamento; as seguintes revisita (as canceladas não contam)", () => {
    expect(visitaNova(lead, dados, [{ estado: "cancelada" }], HOJE)?.visita.tipo).toBe("levantamento");
    expect(visitaNova(lead, dados, [{ estado: "feita" }], HOJE)?.visita.tipo).toBe("revisita");
    expect(visitaNova(lead, dados, [{ estado: "cancelada" }, { estado: "porFazer" }], HOJE)?.visita.tipo).toBe("revisita");
  });

  it("o texto dado por quem marca (a chamada) vale mais do que o composto", () => {
    expect(visitaNova(lead, { ...dados, detalhe: "16/10 · 09:30 · Rua A 1" }, [], HOJE)?.detalhe).toBe("16/10 · 09:30 · Rua A 1");
  });

  it("outra morada fica na visita, com a nota de acesso", () => {
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" }, notaAcesso: "Portão azul" };
    const r = visitaNova(lead, { ...dados, destino }, [], HOJE);
    expect(r?.visita).toMatchObject({ igualALead: false, morada: { rua: "Rua B 2", localidade: "Braga" }, nota: "Portão azul" });
  });

  it.each([
    ["sem dia", { ...dados, data: "" }],
    ["com dia passado", { ...dados, data: "2026-10-12" }],
    ["com hora inválida", { ...dados, hora: "25:00" }],
    ["com nota comprida", { ...dados, nota: "x".repeat(141) }],
  ])("devolve null %s", (_nome, d) => {
    expect(visitaNova(lead, d, [], HOJE)).toBeNull();
  });

  it("sem morada da lead e sem outra morada não marca (uma visita precisa de um sítio)", () => {
    expect(visitaNova(semMorada, dados, [], HOJE)).toBeNull();
    const destino = { igualALead: false, outra: { rua: "", codigoPostal: "", localidade: "", andar: "" }, notaAcesso: "" };
    expect(visitaNova(lead, { ...dados, destino }, [], HOJE)).toBeNull();
  });

  it("a hora pode faltar", () => {
    expect(visitaNova(lead, { ...dados, hora: "" }, [], HOJE)?.visita.hora).toBe("");
  });
});

describe("alterarVisitaDaPessoa", () => {
  const existente = {
    id: "rv-1", pessoaId: "a", negocioId: "n1", data: "2026-10-20", hora: "10:00", feitoPor: "Ana", estado: "porFazer" as const, tipo: "levantamento" as const,
    quemVaiEstar: "", duracao: "", morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }, igualALead: true, nota: "",
    resultado: "aPensar" as const,
  };
  const novos = { data: "2026-10-22", hora: "15:00", destino: { igualALead: true, outra: { rua: "", codigoPostal: "", localidade: "", andar: "" }, notaAcesso: "" } };

  it("muda o dia, a hora e a morada e mantém tudo o resto (a ligação ao negócio, o resultado, o tipo)", () => {
    const r = alterarVisitaDaPessoa(lead, existente, novos, HOJE);
    expect(r?.visita).toMatchObject({ id: "rv-1", negocioId: "n1", resultado: "aPensar", tipo: "levantamento", data: "2026-10-22", hora: "15:00" });
    expect(r?.detalhe).toBe("2026-10-22 15:00 · Rua A 1, 1000-001 Lisboa");
  });

  it("a nota de acesso da outra morada passa a ser a nota da visita", () => {
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" }, notaAcesso: "Portão azul" };
    expect(alterarVisitaDaPessoa(lead, existente, { ...novos, destino }, HOJE)?.visita).toMatchObject({ igualALead: false, nota: "Portão azul", morada: { rua: "Rua B 2" } });
  });

  it.each([
    ["dia passado", { ...novos, data: "2026-10-12" }],
    ["sem dia", { ...novos, data: "" }],
    ["hora inválida", { ...novos, hora: "99:00" }],
  ])("devolve null com %s", (_nome, dados) => {
    expect(alterarVisitaDaPessoa(lead, existente, dados, HOJE)).toBeNull();
  });
});
