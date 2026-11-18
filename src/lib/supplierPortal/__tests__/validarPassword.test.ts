// Validação local da nova password do primeiro acesso do fornecedor: mesmas regras e mesma ordem que o
// passwordResetSchema (que é partilhado com o CRM e não se toca), mas com mensagens no idioma do portal.
import { describe, expect, it } from "vitest";
import { passwordResetSchema } from "@/lib/validations";
import { traduzir } from "@/portal-i18n/traduzir";
import { validarNovaPassword } from "../validarPassword";

const tPt = (k: string, p?: Record<string, string | number>) => traduzir("pt", k, p);
const tEn = (k: string, p?: Record<string, string | number>) => traduzir("en", k, p);

describe("validarNovaPassword", () => {
  it("em português as mensagens são as do passwordResetSchema, palavra por palavra", () => {
    expect(validarNovaPassword("curta", "curta", tPt)).toBe("A password deve ter no mínimo 8 caracteres.");
    expect(validarNovaPassword("umaPasswordBoa1", "", tPt)).toBe("Confirme a password.");
    expect(validarNovaPassword("umaPasswordBoa1", "outraDiferente", tPt)).toBe("As passwords não coincidem.");
  });

  it("em inglês", () => {
    expect(validarNovaPassword("short", "short", tEn)).toBe("The password must be at least 8 characters long.");
    expect(validarNovaPassword("aGoodPassword1", "", tEn)).toBe("Please confirm the password.");
    expect(validarNovaPassword("aGoodPassword1", "different", tEn)).toBe("The passwords do not match.");
  });

  it("uma password válida e confirmada não dá erro", () => {
    expect(validarNovaPassword("umaPasswordBoa1", "umaPasswordBoa1", tPt)).toBeNull();
    expect(validarNovaPassword("12345678", "12345678", tEn)).toBeNull();
  });

  it("dá o mesmo veredicto e a mesma primeira mensagem que o passwordResetSchema (paridade)", () => {
    const casos: [string, string][] = [
      ["", ""],
      ["1234567", "1234567"],
      ["1234567", ""],
      ["12345678", ""],
      ["12345678", "1234567"],
      ["12345678", "12345678"],
      ["       ", "       "],
    ];
    for (const [password, confirmPassword] of casos) {
      const zod = passwordResetSchema.safeParse({ password, confirmPassword });
      const local = validarNovaPassword(password, confirmPassword, tPt);
      if (zod.success) expect(local).toBeNull();
      else expect(local).toBe(zod.error.issues[0]?.message);
    }
  });
});
