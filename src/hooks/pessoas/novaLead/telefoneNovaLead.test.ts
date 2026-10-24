import { describe, expect, it } from "vitest";
import { mesmoEmail, mesmoTelefone, normalizeEmailForMatch, normalizePhoneForMatch } from "./telefoneNovaLead";

describe("normalizePhoneForMatch (cópia da regra do formulário online: últimos 9 dígitos, mínimo 7)", () => {
  it("com indicativo e espaços fica com os últimos 9 dígitos", () => {
    expect(normalizePhoneForMatch("+351 912 345 678")).toBe("912345678");
    expect(normalizePhoneForMatch("00351912345678")).toBe("912345678");
  });

  it("6 dígitos não é um dado verificável", () => {
    expect(normalizePhoneForMatch("123456")).toBeNull();
    expect(normalizePhoneForMatch("12 34 56")).toBeNull();
  });

  it("7 dígitos é o mínimo e guarda-os todos", () => {
    expect(normalizePhoneForMatch("1234567")).toBe("1234567");
  });

  it("vazio, nulo e indefinido dão nulo", () => {
    expect(normalizePhoneForMatch("")).toBeNull();
    expect(normalizePhoneForMatch(null)).toBeNull();
    expect(normalizePhoneForMatch(undefined)).toBeNull();
  });

  it("mesmoTelefone: indicativos diferentes com os mesmos 9 dígitos são o mesmo número", () => {
    expect(mesmoTelefone("+351912345678", "912 345 678")).toBe(true);
    expect(mesmoTelefone("+351912345678", "+351912345679")).toBe(false);
    expect(mesmoTelefone("123", "123")).toBe(false);
    expect(mesmoTelefone(null, "912345678")).toBe(false);
  });
});

describe("email para comparar", () => {
  it("sem maiúsculas nem espaços; sem @ não vale", () => {
    expect(normalizeEmailForMatch("  Ana@Exemplo.PT ")).toBe("ana@exemplo.pt");
    expect(normalizeEmailForMatch("n/a")).toBeNull();
    expect(normalizeEmailForMatch("")).toBeNull();
    expect(normalizeEmailForMatch(null)).toBeNull();
  });

  it("mesmoEmail compara só emails válidos", () => {
    expect(mesmoEmail("Ana@x.pt", " ana@X.pt ")).toBe(true);
    expect(mesmoEmail("ana@x.pt", "bruno@x.pt")).toBe(false);
    expect(mesmoEmail("sem", "sem")).toBe(false);
  });
});
