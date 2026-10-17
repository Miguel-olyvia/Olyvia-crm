// A validação e o texto da visita: o que se pede para marcar ou alterar uma visita. Marcá-la, alterá-la e guardá-la são ações do
// pedido (ver `acoesPedido.test.ts`).
import { describe, expect, it } from "vitest";
import { MORADA_VISITA_VAZIA } from "./moradaVisita";
import { MAX_NOTA_VISITA, detalheDaVisita, validarVisita, type DadosVisita } from "./visitaPessoa";

const HOJE = "2026-10-13";
const MORADA = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const dados = (extra: Partial<DadosVisita> = {}): DadosVisita => ({ data: "2026-10-20", hora: "10:30", nota: "", servico: "Cozinha", ...extra });
const outraMorada = { igualALead: false, outra: { ...MORADA_VISITA_VAZIA, rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga" }, notaAcesso: "Portão azul" };

describe("validarVisita", () => {
  it("dia obrigatório, no formato AAAA-MM-DD e não anterior a hoje; hoje vale", () => {
    expect(validarVisita(dados({ data: "" }), HOJE)).toBe("dataVazia");
    expect(validarVisita(dados({ data: "20/10/2026" }), HOJE)).toBe("dataVazia");
    expect(validarVisita(dados({ data: "2026-10-12" }), HOJE)).toBe("dataPassada");
    expect(validarVisita(dados({ data: HOJE }), HOJE)).toBeNull();
  });

  it("a hora é opcional, mas se vier tem de ser HH:MM", () => {
    expect(validarVisita(dados({ hora: "" }), HOJE)).toBeNull();
    expect(validarVisita(dados({ hora: "25:00" }), HOJE)).toBe("horaInvalida");
    expect(validarVisita(dados({ hora: "9:30" }), HOJE)).toBe("horaInvalida");
  });

  it("a nota aceita 140 caracteres e recusa 141", () => {
    expect(validarVisita(dados({ nota: "x".repeat(MAX_NOTA_VISITA) }), HOJE)).toBeNull();
    expect(validarVisita(dados({ nota: "x".repeat(MAX_NOTA_VISITA + 1) }), HOJE)).toBe("notaComprida");
  });

  it("valida a morada depois do dia, da hora e da nota", () => {
    expect(validarVisita({ ...dados(), destino: outraMorada }, HOJE, null)).toBeNull();
    expect(validarVisita({ ...dados({ data: "" }), destino: { ...outraMorada, outra: MORADA_VISITA_VAZIA } }, HOJE, null)).toBe("dataVazia");
    expect(validarVisita({ ...dados(), destino: { ...outraMorada, outra: MORADA_VISITA_VAZIA } }, HOJE, null)).toBe("ruaVazia");
    expect(validarVisita({ ...dados(), destino: { ...outraMorada, outra: { ...outraMorada.outra, codigoPostal: "47" } } }, HOJE, null)).toBe("codigoPostalInvalido");
  });

  it("sem destino não valida a morada", () => {
    expect(validarVisita(dados(), HOJE, null)).toBeNull();
  });
});

describe("detalheDaVisita", () => {
  it("junta o dia e a hora, o serviço, a nota aparada e a morada, sem partes vazias", () => {
    expect(detalheDaVisita(dados({ nota: " Levar o catálogo " }), "Rua A 1, 1000-001 Lisboa"))
      .toBe("2026-10-20 10:30 · Cozinha · Levar o catálogo · Rua A 1, 1000-001 Lisboa");
    expect(detalheDaVisita(dados({ hora: "", servico: "" }), "")).toBe("2026-10-20");
  });
});
