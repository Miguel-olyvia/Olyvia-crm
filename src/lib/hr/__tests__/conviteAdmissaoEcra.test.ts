import { describe, it, expect } from "vitest";
import {
  campoDoErroDeServidor,
  errosDeFormato,
  formatarDataHora,
  idiomaDoNavegador,
} from "../conviteAdmissaoEcra";

describe("idiomaDoNavegador", () => {
  it("usa a primeira lingua suportada", () => {
    expect(idiomaDoNavegador(["fr-FR", "en"])).toBe("fr");
    expect(idiomaDoNavegador(["es-ES"])).toBe("es");
    expect(idiomaDoNavegador(["de"])).toBe("de");
    expect(idiomaDoNavegador(["en-GB"])).toBe("en");
    expect(idiomaDoNavegador(["pt-BR"])).toBe("pt");
  });

  it("salta as linguas que nao suporta", () => {
    expect(idiomaDoNavegador(["ja-JP", "de-AT"])).toBe("de");
  });

  it("sem nenhuma suportada, ou sem nada, fica em portugues", () => {
    expect(idiomaDoNavegador(["ja-JP"])).toBe("pt");
    expect(idiomaDoNavegador([])).toBe("pt");
  });
});

describe("errosDeFormato", () => {
  const vazio = { nif: "", niss: "", conta_numero: "", conta_bic: "" };

  it("campos vazios nao sao erro de formato", () => {
    expect(errosDeFormato(vazio)).toEqual({});
  });

  it("valores validos nao dao erro", () => {
    expect(
      errosDeFormato({
        nif: "123456789",
        niss: "12345678902",
        conta_numero: "PT50 0002 0123 1234 5678 9015 4",
        conta_bic: "cgdi ptpl",
      }),
    ).toEqual({});
  });

  it("BIC malformado da erro; vazio e ignorado", () => {
    expect(errosDeFormato({ ...vazio, conta_bic: "ABCD1234" })).toEqual({
      conta_bic: "hr.convite.erro.bicInvalido",
    });
    expect(errosDeFormato({ ...vazio, conta_bic: "CGDIPTP" })).toEqual({
      conta_bic: "hr.convite.erro.bicInvalido",
    });
    expect(errosDeFormato({ ...vazio, conta_bic: "   " })).toEqual({});
    expect(errosDeFormato({ ...vazio, conta_bic: "CGDIPTPLXXX" })).toEqual({});
  });

  it("o erro do BIC nao depende do IBAN", () => {
    expect(
      errosDeFormato({ ...vazio, conta_numero: "PT50 0002 0123 1234 5678 9015 4", conta_bic: "1234" }),
    ).toEqual({ conta_bic: "hr.convite.erro.bicInvalido" });
  });

  it("NIF e NISS com digito de controlo errado dao erro", () => {
    expect(errosDeFormato({ ...vazio, nif: "123456788" })).toEqual({ nif: "hr.convite.erro.nifInvalido" });
    expect(errosDeFormato({ ...vazio, niss: "12345678901" })).toEqual({ niss: "hr.convite.erro.nissInvalido" });
  });

  it("IBAN invalido da erro", () => {
    expect(errosDeFormato({ ...vazio, conta_numero: "PT50 1234" })).toEqual({
      conta_numero: "hr.convite.erro.ibanInvalido",
    });
  });
});

describe("campoDoErroDeServidor", () => {
  it("liga cada recusa ao seu campo", () => {
    expect(campoDoErroDeServidor("nif_ja_existe")).toBe("nif");
    expect(campoDoErroDeServidor("nif_invalido")).toBe("nif");
    expect(campoDoErroDeServidor("niss_ja_existe")).toBe("niss");
    expect(campoDoErroDeServidor("niss_invalido")).toBe("niss");
    expect(campoDoErroDeServidor("iban_invalido")).toBe("conta_numero");
    expect(campoDoErroDeServidor("bic_invalido")).toBe("conta_bic");
  });

  it("as outras nao marcam campo nenhum", () => {
    expect(campoDoErroDeServidor("admissao_incompleta")).toBeNull();
    expect(campoDoErroDeServidor(undefined)).toBeNull();
  });
});

describe("formatarDataHora", () => {
  it("formata dd/MM/yyyy HH:mm", () => {
    expect(formatarDataHora("2026-10-20T12:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("devolve vazio para ausente ou invalido", () => {
    expect(formatarDataHora(null)).toBe("");
    expect(formatarDataHora("nao e data")).toBe("");
  });
});
