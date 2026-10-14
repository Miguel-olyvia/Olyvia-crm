import { describe, expect, it } from "vitest";
import {
  MAX_NOTA_ACESSO, MORADA_VISITA_VAZIA, destinoInicial, moradaDaLead, resolverDestino, textoMoradaVisita, validarDestino,
  type DestinoVisita,
} from "./moradaVisita";
import type { MoradaVisita } from "./pessoasTipos";

const LEAD: MoradaVisita = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const outra = (parcial: Partial<DestinoVisita["outra"]> = {}, nota = ""): DestinoVisita => ({
  igualALead: false, outra: { ...MORADA_VISITA_VAZIA, rua: "Rua B 2", ...parcial }, notaAcesso: nota,
});

describe("moradaDaLead", () => {
  it("converte a morada da ficha (linha, cp, localidade) na da visita", () => {
    expect(moradaDaLead({ morada: { linha: " Rua A 1 ", cp: "1000-001", localidade: "Lisboa" } })).toEqual(LEAD);
  });
  it("sem morada, ou com tudo vazio, devolve null; só com a localidade conta", () => {
    expect(moradaDaLead({})).toBeNull();
    expect(moradaDaLead({ morada: { linha: "", cp: "", localidade: " " } })).toBeNull();
    expect(moradaDaLead({ morada: { linha: "", cp: "", localidade: "Sintra" } })).toMatchObject({ rua: "", localidade: "Sintra" });
  });
});

describe("destinoInicial", () => {
  it("com morada da lead começa na da lead; sem ela só há outra morada", () => {
    expect(destinoInicial(LEAD).igualALead).toBe(true);
    expect(destinoInicial(null)).toEqual({ igualALead: false, outra: MORADA_VISITA_VAZIA, notaAcesso: "" });
  });
});

describe("validarDestino", () => {
  it("na morada da lead não valida mais nada; sem morada da lead, 'igual' não vale e pede a rua", () => {
    expect(validarDestino({ ...destinoInicial(LEAD) }, LEAD)).toBeNull();
    expect(validarDestino({ igualALead: true, outra: MORADA_VISITA_VAZIA, notaAcesso: "" }, null)).toBe("ruaVazia");
  });
  it("outra morada: a rua é obrigatória, o código postal é 0000-000 e a nota tem máximo", () => {
    expect(validarDestino(outra({ rua: "  " }), LEAD)).toBe("ruaVazia");
    expect(validarDestino(outra({ codigoPostal: "1000" }), LEAD)).toBe("codigoPostalInvalido");
    expect(validarDestino(outra({ codigoPostal: "1000-0012" }), LEAD)).toBe("codigoPostalInvalido");
    expect(validarDestino(outra({ codigoPostal: "" }), LEAD)).toBeNull();
    expect(validarDestino(outra({ codigoPostal: "4700-010" }), LEAD)).toBeNull();
    expect(validarDestino(outra({}, "x".repeat(MAX_NOTA_ACESSO)), LEAD)).toBeNull();
    expect(validarDestino(outra({}, "x".repeat(MAX_NOTA_ACESSO + 1)), LEAD)).toBe("notaAcessoComprida");
  });
});

describe("resolverDestino", () => {
  it("igual: guarda a morada da lead, sem nota de acesso", () => {
    expect(resolverDestino({ ...destinoInicial(LEAD), notaAcesso: "ignorada" }, LEAD)).toEqual({ igualALead: true, moradaVisita: LEAD });
  });
  it("outra: guarda a morada aparada e a nota (só se houver)", () => {
    const r = resolverDestino(outra({ rua: " Rua B 2 ", localidade: " Porto ", andar: " 2.º " }, " campainha "), LEAD);
    expect(r).toEqual({
      igualALead: false, moradaVisita: { rua: "Rua B 2", codigoPostal: "", localidade: "Porto", andar: "2.º" }, notaAcesso: "campainha",
    });
    expect(resolverDestino(outra(), LEAD)).not.toHaveProperty("notaAcesso");
  });
  it("sem morada da lead, mesmo marcada 'igual', fica outra morada", () => {
    expect(resolverDestino({ igualALead: true, outra: { ...MORADA_VISITA_VAZIA, rua: "Rua C" }, notaAcesso: "" }, null).igualALead).toBe(false);
  });
});

describe("textoMoradaVisita", () => {
  it("junta rua, andar e código postal com localidade, sem vírgulas soltas", () => {
    expect(textoMoradaVisita({ rua: "Rua A 1", andar: "3.º Esq.", codigoPostal: "1000-001", localidade: "Lisboa" })).toBe("Rua A 1, 3.º Esq., 1000-001 Lisboa");
    expect(textoMoradaVisita(LEAD)).toBe("Rua A 1, 1000-001 Lisboa");
    expect(textoMoradaVisita({ ...MORADA_VISITA_VAZIA, localidade: "Sintra" })).toBe("Sintra");
    expect(textoMoradaVisita(MORADA_VISITA_VAZIA)).toBe("");
  });
});
