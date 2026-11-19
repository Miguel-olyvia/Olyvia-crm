// Validação da palavra-passe do primeiro login. As regras são as do passwordResetSchema (src/lib/validations.ts,
// partilhado com o CRM e por isso intocado); aqui só se traduz a primeira falha, mapeando-a por caminho e tipo
// (e não pelo texto, que está em português) para uma chave pc.login.* do portal.
import { passwordResetSchema } from "@/lib/validations";

export interface DadosDePassword {
  password: string;
  confirmPassword: string;
}

/** Chave da mensagem da primeira falha, ou `null` quando os dados são válidos. */
export function chaveDoErroDePassword(dados: DadosDePassword): string | null {
  const resultado = passwordResetSchema.safeParse(dados);
  if (resultado.success) return null;
  const falha = resultado.error.issues[0];
  if (!falha) return "pc.login.erro.invalido";
  if (falha.path[0] === "password") return "pc.login.erro.minimo";
  if (falha.code === "custom") return "pc.login.erro.naoCoincidem";
  if (falha.path[0] === "confirmPassword") return "pc.login.erro.confirmar";
  return "pc.login.erro.invalido";
}
