// Validação local da nova password do primeiro acesso do fornecedor. Mesmas regras e mesma ordem do
// `passwordResetSchema` (src/lib/validations.ts, partilhado com o CRM e por isso intocado): mínimo de 8
// caracteres, depois a confirmação preenchida, depois as duas iguais. As mensagens vêm do idioma do portal.
import type { ParamsDeTraducao } from "@/portal-i18n/tipos";

const MIN_PASSWORD = 8;

type Traduzir = (chave: string, params?: ParamsDeTraducao) => string;

/** A primeira mensagem de erro, ou `null` se a password e a confirmação são válidas. */
export function validarNovaPassword(password: string, confirmacao: string, t: Traduzir): string | null {
  if (password.length < MIN_PASSWORD) return t("sp.primeiroAcesso.erro.minimo");
  if (confirmacao.length < 1) return t("sp.primeiroAcesso.erro.confirmar");
  if (password !== confirmacao) return t("sp.primeiroAcesso.erro.diferentes");
  return null;
}
