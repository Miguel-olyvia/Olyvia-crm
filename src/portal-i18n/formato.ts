// Formatação por idioma do portal. Não mexe no formatCurrency de src/lib/utils.ts (o CRM usa-o).
// Locales: pt -> pt / pt-PT; en -> enGB / en-GB (dd/mm/aaaa, 24 horas, «5 March 2025»).
import { format } from "date-fns";
import { enGB, pt, type Locale } from "date-fns/locale";
import type { PortalIdioma } from "./tipos";

export type EstiloDeData = "diaSemanaLongo" | "longo" | "curto" | "numerico";
type EntradaDeData = Date | string | number | null | undefined;

const SEM_VALOR = "—";

export function localeDateFns(idioma: PortalIdioma): Locale {
  return idioma === "en" ? enGB : pt;
}

export function localeIntl(idioma: PortalIdioma): string {
  return idioma === "en" ? "en-GB" : "pt-PT";
}

const PADROES: Record<EstiloDeData, Record<PortalIdioma, string>> = {
  diaSemanaLongo: { pt: "EEEE, d 'de' MMMM 'de' yyyy", en: "EEEE, d MMMM yyyy" },
  longo: { pt: "d 'de' MMMM 'de' yyyy", en: "d MMMM yyyy" },
  curto: { pt: "d MMM yyyy", en: "d MMM yyyy" },
  numerico: { pt: "dd/MM/yyyy", en: "dd/MM/yyyy" },
};

/** Como se liga a hora à data: por extenso («às» / «at»), e só um separador nos formatos curtos. */
const LIGACAO_DA_HORA: Record<EstiloDeData, Record<PortalIdioma, string>> = {
  diaSemanaLongo: { pt: " 'às' HH:mm", en: " 'at' HH:mm" },
  longo: { pt: " 'às' HH:mm", en: " 'at' HH:mm" },
  curto: { pt: ", HH:mm", en: ", HH:mm" },
  numerico: { pt: " HH:mm", en: " HH:mm" },
};

/** O padrão do date-fns para um estilo e idioma, para páginas que chamam `format()` elas próprias. */
export function padraoDeFormato(estilo: EstiloDeData, idioma: PortalIdioma, comHora = false): string {
  return PADROES[estilo][idioma] + (comHora ? LIGACAO_DA_HORA[estilo][idioma] : "");
}

const SO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date válida ou null. Um texto só com dia (AAAA-MM-DD) é esse dia na hora local: não recua um dia a oeste de UTC. */
function paraData(valor: EntradaDeData): Date | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") {
    const texto = valor.trim();
    if (texto === "") return null;
    const dia = SO_DIA.exec(texto);
    if (dia) {
      const d = new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatarData(valor: EntradaDeData, idioma: PortalIdioma, estilo: EstiloDeData = "curto"): string {
  const d = paraData(valor);
  return d ? format(d, padraoDeFormato(estilo, idioma), { locale: localeDateFns(idioma) }) : SEM_VALOR;
}

export function formatarDataHora(valor: EntradaDeData, idioma: PortalIdioma, estilo: EstiloDeData = "curto"): string {
  const d = paraData(valor);
  return d ? format(d, padraoDeFormato(estilo, idioma, true), { locale: localeDateFns(idioma) }) : SEM_VALOR;
}

/**
 * dd/mm/aaaa fixo, como `formatSpDate` do portal do fornecedor: um texto que começa por AAAA-MM-DD troca a ordem
 * sem passar por Date (sem deriva de fuso, e um timestamptz fica com a data que o próprio texto traz). Qualquer
 * outro texto válido passa pelo formato numérico; o que não for data volta como veio.
 */
export function formatarDataIso(valor: string | null | undefined, idioma: PortalIdioma): string {
  if (!valor) return SEM_VALOR;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = paraData(valor);
  return d ? formatarData(d, idioma, "numerico") : valor;
}

/** Em falta conta como 0 (igual a formatSpMoney); um número não finito não se mostra como valor. */
function numeroOuNull(valor: number | null | undefined): number | null {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : null;
}

export function formatarNumero(
  valor: number | null | undefined,
  idioma: PortalIdioma,
  opcoes?: Intl.NumberFormatOptions,
): string {
  const n = numeroOuNull(valor);
  return n === null ? SEM_VALOR : n.toLocaleString(localeIntl(idioma), opcoes);
}

export function formatarMoeda(valor: number | null | undefined, idioma: PortalIdioma, moeda = "EUR"): string {
  const n = numeroOuNull(valor);
  if (n === null) return SEM_VALOR;
  const codigo = moeda || "EUR";
  try {
    return n.toLocaleString(localeIntl(idioma), { style: "currency", currency: codigo });
  } catch {
    return `${n.toFixed(2)} ${codigo}`;
  }
}
