import { describe, expect, it } from "vitest";
import {
  formatInternationalPhone,
  joinInternationalPhone,
  normalizeLegacyPhonePrefix,
  splitInternationalPhone,
} from "../splitInternationalPhone";

describe("splitInternationalPhone", () => {
  it("separa o formato guardado com +", () => {
    expect(splitInternationalPhone("+351912345678")).toEqual({ dialCode: "+351", digits: "912345678" });
  });

  it("converte o 00 antigo em + (caso real: '0045 41736520')", () => {
    expect(splitInternationalPhone("0045 41736520")).toEqual({ dialCode: "+45", digits: "41736520" });
  });

  it("vazio fica com +351 por omissão", () => {
    expect(splitInternationalPhone("")).toEqual({ dialCode: "+351", digits: "" });
    expect(splitInternationalPhone(undefined)).toEqual({ dialCode: "+351", digits: "" });
  });

  it("9 dígitos nacionais recebem +351; outros números ficam sem indicativo", () => {
    expect(splitInternationalPhone("912 345 678")).toEqual({ dialCode: "+351", digits: "912345678" });
    expect(splitInternationalPhone("41736520")).toEqual({ dialCode: "", digits: "41736520" });
  });
});

describe("normalizeLegacyPhonePrefix / formatInternationalPhone", () => {
  it("troca o 00 por + e deixa o resto intacto", () => {
    expect(normalizeLegacyPhonePrefix("0045 41736520")).toBe("+4541736520");
    expect(normalizeLegacyPhonePrefix("+351912345678")).toBe("+351912345678");
    expect(normalizeLegacyPhonePrefix("912 345 678")).toBe("912 345 678");
  });

  it("mostra o telefone com o indicativo separado", () => {
    expect(formatInternationalPhone("0045 41736520")).toBe("+45 41736520");
    expect(formatInternationalPhone("+351912345678")).toBe("+351 912345678");
    expect(formatInternationalPhone("912345678")).toBe("912345678");
  });
});

describe("joinInternationalPhone", () => {
  it("junta indicativo e dígitos, e devolve vazio sem dígitos", () => {
    expect(joinInternationalPhone("+351", "912 345 678")).toBe("+351912345678");
    expect(joinInternationalPhone("+351", "")).toBe("");
    expect(joinInternationalPhone("", "41736520")).toBe("41736520");
  });
});
