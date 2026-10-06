/**
 * Pequenas pecas puras dos anexos da admissao na ficha do RH: quem pode abrir
 * cada tipo e as iniciais do avatar.
 *
 * `podeAbrirAnexo` so decide o que o ECRA mostra (botao "Abrir" ou o texto de
 * sem permissao). Quem decide de verdade, por tipo e contra a organizacao da
 * linha, e a Edge Function `hr-anexo-url`; esta matriz tem de ser a mesma.
 */
import type { TipoAnexoAdmissao } from "@/types/hr";

export interface PermissoesAnexos {
  /** `hr.pessoas.view`: abre a fotografia. */
  pessoasView: boolean;
  /** `hr.pessoas.view.own`: com a ficha ser a propria, abre os tres tipos. */
  viewOwn: boolean;
  /** `hr.pessoas.identificacao.reveal`: abre o cartao de cidadao. */
  identificacaoReveal: boolean;
  /** `hr.pessoas.bancarios.edit`: abre o comprovativo de IBAN. */
  bancariosEdit: boolean;
}

/**
 * A propria pessoa abre os tres, mas so com `hr.pessoas.view.own` (o servidor,
 * `decidirAcessoAnexo`, exige as duas coisas); os outros precisam da permissao
 * do tipo.
 */
export function podeAbrirAnexo(
  tipo: TipoAnexoAdmissao,
  permissoes: PermissoesAnexos,
  souAPessoa: boolean,
): boolean {
  const propria = souAPessoa && permissoes.viewOwn;
  switch (tipo) {
    case "fotografia":
      return propria || permissoes.pessoasView;
    case "cartao_cidadao":
      return propria || permissoes.identificacaoReveal;
    case "comprovativo_iban":
      return propria || permissoes.bancariosEdit;
    default:
      // Um tipo que este ecra nao conhece nunca se abre.
      return false;
  }
}

/**
 * A base (`pessoas_anexos_select`) so entrega cada tipo a quem tem a permissao
 * dele; por isso uma lista vazia ou curta so quer dizer "nao ha anexos" a quem
 * pode ver os tres tipos. Para os outros, o ecra nao afirma que nao ha anexos.
 */
export function podeVerTodosOsTiposDeAnexo(
  permissoes: PermissoesAnexos,
  souAPessoa: boolean,
): boolean {
  if (souAPessoa && permissoes.viewOwn) return true;
  return permissoes.pessoasView && permissoes.identificacaoReveal && permissoes.bancariosEdit;
}

/** A primeira e a ultima palavra do nome, em maiusculas ("Joana Maria Pires" -> "JP"). */
export function iniciaisDoNome(nome: string | null | undefined): string {
  const palavras = (nome ?? "").split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "";
  const primeira = Array.from(palavras[0])[0] ?? "";
  if (palavras.length === 1) return primeira.toLocaleUpperCase();
  const ultima = Array.from(palavras[palavras.length - 1])[0] ?? "";
  return `${primeira}${ultima}`.toLocaleUpperCase();
}
