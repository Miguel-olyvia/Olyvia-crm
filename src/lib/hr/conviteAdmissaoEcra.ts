/**
 * Pequenas pecas puras do ecra publico do convite de admissao: a lingua, a
 * validacao local de formato e a data legivel. Fora do componente para se
 * poderem testar sem renderizar nada.
 */
import { bicValido, contaValida } from "@/lib/hr/conta";
import { nifValido, nissValido } from "@/lib/hr/identificadoresPt";

export type IdiomaConvite = "pt" | "es" | "fr" | "de" | "en";

const IDIOMAS_SUPORTADOS: readonly IdiomaConvite[] = ["pt", "es", "fr", "de", "en"];

/**
 * A lingua do ecra publico, escolhida pelo navegador (pt, es, fr, de ou en),
 * com portugues por omissao. So este ecra a usa: quem abre o link nao tem
 * sessao nem preferencia guardada, e o resto da aplicacao continua com a
 * lingua do utilizador.
 */
export function idiomaDoNavegador(
  idiomas: readonly string[] | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language],
): IdiomaConvite {
  for (const bruto of idiomas ?? []) {
    const base = String(bruto ?? "").toLowerCase().split("-")[0];
    const encontrado = IDIOMAS_SUPORTADOS.find((i) => i === base);
    if (encontrado) return encontrado;
  }
  return "pt";
}

/** Os campos cujo FORMATO se valida no ecra, alem de estarem ou nao vazios. */
export type CampoComFormato = "nif" | "niss" | "conta_numero" | "conta_bic";

export interface ValoresComFormato {
  nif: string;
  niss: string;
  conta_numero: string;
  conta_bic: string;
}

const CHAVE_ERRO_FORMATO: Readonly<Record<CampoComFormato, string>> = {
  nif: "hr.convite.erro.nifInvalido",
  niss: "hr.convite.erro.nissInvalido",
  conta_numero: "hr.convite.erro.ibanInvalido",
  conta_bic: "hr.convite.erro.bicInvalido",
};

/**
 * Os campos preenchidos mas com formato errado: NIF e NISS pelo digito de
 * controlo, IBAN pelo mod-97. Um campo vazio nao e erro de formato -- e
 * ausencia, e dela cuida a obrigatoriedade.
 */
export function errosDeFormato(
  valores: ValoresComFormato,
): Partial<Record<CampoComFormato, string>> {
  const erros: Partial<Record<CampoComFormato, string>> = {};
  if (valores.nif.trim() !== "" && !nifValido(valores.nif)) {
    erros.nif = CHAVE_ERRO_FORMATO.nif;
  }
  if (valores.niss.trim() !== "" && !nissValido(valores.niss)) {
    erros.niss = CHAVE_ERRO_FORMATO.niss;
  }
  if (valores.conta_numero.trim() !== "" && !contaValida("iban", valores.conta_numero)) {
    erros.conta_numero = CHAVE_ERRO_FORMATO.conta_numero;
  }
  if (valores.conta_bic.trim() !== "" && !bicValido(valores.conta_bic)) {
    erros.conta_bic = CHAVE_ERRO_FORMATO.conta_bic;
  }
  return erros;
}

/** O campo que cada codigo de recusa do servidor deixa marcado, quando ha um. */
export function campoDoErroDeServidor(codigo: string | undefined): CampoComFormato | null {
  switch (codigo) {
    case "nif_ja_existe":
    case "nif_invalido":
      return "nif";
    case "niss_ja_existe":
    case "niss_invalido":
      return "niss";
    case "iban_invalido":
      return "conta_numero";
    case "bic_invalido":
      return "conta_bic";
    default:
      return null;
  }
}

function dois(n: number): string {
  return String(n).padStart(2, "0");
}

/** dd/MM/yyyy HH:mm, na hora local de quem abre o link. Vazio quando a data nao e valida. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}
