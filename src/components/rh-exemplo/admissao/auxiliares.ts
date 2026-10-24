// Funções e constantes de apoio ao fluxo de admissão no ecrã: o texto do prazo do login temporário, a data e hora de um
// instante, a palavra-passe simulada do e-mail de credenciais e a ordem dos grupos do pipeline.
import { formatarDataHora } from "@/components/rh-exemplo/lib/conviteAdmissaoEcra";
import type { EstadoVisivel, PrazoLogin } from "@/components/rh-exemplo/lib/admissaoFluxo";
import type { TraduzirFn } from "@/components/rh-exemplo/lib/errosAdmissao";

/** «Expira em 3 dias», «Expira em 5 h» ou «Expirado»; vazio quando não há login a contar. */
export function textoPrazo(t: TraduzirFn, prazo: PrazoLogin): string {
  switch (prazo.tipo) {
    case "dias": return prazo.n === 1 ? t("rhAdm.prazo.umDia") : t("rhAdm.prazo.dias", { n: prazo.n });
    case "horas": return t("rhAdm.prazo.horas", { n: prazo.n });
    case "expirado": return t("rhAdm.prazo.expirado");
    default: return "";
  }
}

/** «dd/mm» e «hh:mm» (hora local) de um instante, para «termina a dd/mm às hh:mm». */
export function dataEHora(iso: string): { data: string; hora: string } {
  const [dia = "", hora = ""] = formatarDataHora(iso).split(" ");
  return { data: dia.slice(0, 5), hora };
}

/** A palavra-passe temporária de exemplo: nunca é uma palavra-passe real, só mostra o aspeto do e-mail. */
export function palavraPasseSimulada(pessoaId: string): string {
  return `Tmp-${pessoaId.replace(/^p-/, "").slice(0, 4)}-7Kq2`;
}

/** Pela ordem em que pedem trabalho ao RH: primeiro o que está à espera dele. */
export const GRUPOS_PIPELINE: readonly EstadoVisivel[] = [
  "submetida", "aprovada", "contrato_por_assinar", "contrato_assinado", "devolvida", "a_preencher", "convite_enviado",
  "expirado", "acesso_enviado", "acesso_ativo", "rejeitada",
];
