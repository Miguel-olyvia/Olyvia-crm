// As palavras do documento da obra no idioma do portal. Só os rótulos fixos do motor da Emylia (os nomes das fases, os grupos,
// os momentos de pagamento por omissão, as garantias da lista) passam por aqui; o que a organização ou o cliente escreveram
// (produtos, tarefas, pedido, notas, prestações à medida) fica como vem. Dinheiro e números não mudam com o idioma.
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import { dataCurta } from "@/emylia/planoObra";
import type { Grupo } from "@/emylia/propostaConteudo";
import type { ClausulasDados } from "@/emylia/propostaDados";
import { formatarData, formatarDataIso } from "@/portal-i18n/formato";
import type { PortalIdioma } from "@/portal-i18n/tipos";

type T = (chave: string, params?: Record<string, string | number>) => string;

const NOME_FASE: Record<number, string> = {
  1: "pc.docObra.fase.nome1", 2: "pc.docObra.fase.nome2", 3: "pc.docObra.fase.nome3", 4: "pc.docObra.fase.nome4",
};
const CURTO_FASE: Record<number, string> = {
  1: "pc.docObra.fase.curto1", 2: "pc.docObra.fase.curto2", 3: "pc.docObra.fase.curto3", 4: "pc.docObra.fase.curto4",
};
const GRUPO: Record<Grupo, string> = {
  trabalhos: "pc.docObra.grupo.trabalhos", preparacao: "pc.docObra.grupo.preparacao", materiais: "pc.docObra.grupo.materiais", cliente: "pc.docObra.grupo.cliente",
};
/** Os textos fixos que o motor escreve (propostaConteudo.ts, planoObra.ts, campos.ts), pelo texto português. */
const FIXOS: Record<string, string> = {
  "Demolição e remoção de entulho": "pc.docObra.fixo.demolicao",
  "operador licenciado, com e-GAR": "pc.docObra.fixo.demolicaoDet",
  "incluídos no modelo": "pc.docObra.fixo.incluidosModelo",
  "Na adjudicação": "pc.docObra.prest.adjudicacao",
  "No arranque da obra": "pc.docObra.prest.arranque",
  "No fim, antes da entrega": "pc.docObra.prest.fimEntrega",
  "A meio da obra": "pc.docObra.prest.meio",
  "No fim da obra": "pc.docObra.prest.fimObra",
  "1 ano": "pc.docObra.garantia.umAno",
  "2 anos": "pc.docObra.garantia.doisAnos",
  "5 anos": "pc.docObra.garantia.cincoAnos",
};
/** As escolhas do cliente, pela chave do campo (campos.ts: ESCOLHAS). */
const ESCOLHA: Record<string, string> = { mobilidade_reduzida: "pc.docObra.escolha.mobilidadeReduzida" };

export const nomeDaFase = (t: T, n: number): string => (NOME_FASE[n] ? t(NOME_FASE[n]) : String(n));
export const curtoDaFase = (t: T, n: number): string => (CURTO_FASE[n] ? t(CURTO_FASE[n]) : String(n));
export const nomeDoGrupo = (t: T, k: Grupo): string => t(GRUPO[k]);
/** Um texto do motor: o fixo traduz-se; qualquer outro (escrito por alguém) fica como vem. */
export const textoDoMotor = (t: T, s: string): string => (FIXOS[s] ? t(FIXOS[s]) : s);
export const rotuloDaEscolha = (t: T, k: string, l: string): string => (ESCOLHA[k] ? t(ESCOLHA[k]) : l);

/** O momento de uma prestação: os do motor traduzem-se ("No fim da fase 2 (infraestruturas)" também); os escritos à mão ficam. */
export function momentoDaPrestacao(t: T, l: string): string {
  const m = /^No fim da fase ([1-4]) \(.*\)$/.exec(l);
  if (m) return t("pc.docObra.prest.fimFase", { n: m[1], fase: curtoDaFase(t, Number(m[1])).toLowerCase() });
  return textoDoMotor(t, l);
}

/** A garantia: a escrita na proposta (as da lista traduzem-se) ou a de omissão. */
export const garantiaDe = (t: T, g: string | null): string => (g ? textoDoMotor(t, g) : t("pc.docObra.garantia.doisAnos"));

/** "seg, 19 out" em português (o mesmo da Emylia); "Mon, 19 Oct" em inglês. */
export const dataCurtaEm = (d: Date, idioma: PortalIdioma): string => (idioma === "en" ? format(d, "EEE, d MMM", { locale: enGB }) : dataCurta(d));

/** Os títulos das cláusulas, pela ordem do contrato (o mesmo título português guarda a revisão do Jurídico: TITULOS_CLAUSULAS).
 *  Partilhados pelo ecrã (ClausulasObra.tsx) e pelo PDF do contrato (documentoObraPdf.ts). */
export const CLAUSULAS: { titulo: string; chave: string }[] = [
  { titulo: "Objeto", chave: "pc.docObra.ct.t.objeto" },
  { titulo: "Preço", chave: "pc.docObra.ct.t.preco" },
  { titulo: "Pagamento", chave: "pc.docObra.ct.t.pagamento" },
  { titulo: "Prazo", chave: "pc.docObra.ct.t.prazo" },
  { titulo: "Garantia", chave: "pc.docObra.ct.t.garantia" },
  { titulo: "Condições gerais", chave: "pc.docObra.ct.t.condicoes" },
];

/** O texto de cada cláusula do modelo, no idioma do portal (o Pagamento é uma lista, uma prestação por linha). */
export function textoDaClausula(titulo: string, C: ClausulasDados, t: T, idioma: PortalIdioma): string | string[] {
  const T = C.T;
  switch (titulo) {
    case "Objeto":
      return t("pc.docObra.ct.objeto", {
        servico: C.servico.toLowerCase(), local: [C.morada, C.localidade].filter(Boolean).join(", "), servicos: C.servicos.map((s) => s.toLowerCase()).join(", "),
      });
    case "Preço":
      return t("pc.docObra.ct.preco", {
        base: formatCurrency(T.base), mo: formatCurrency(T.mo), ivaMo: formatCurrency(T.ivaMo), mat: formatCurrency(T.mat), ivaMat: formatCurrency(T.ivaMat), total: formatCurrency(T.total),
      });
    case "Pagamento":
      return C.prestacoes.map((p) => {
        const base = { momento: momentoDaPrestacao(t, p.l), p: Math.round(p.p * 100), valor: formatCurrency(p.v) };
        return p.data ? t("pc.docObra.ct.prestacaoPrevista", { ...base, data: dataCurtaEm(p.data, idioma) }) : t("pc.docObra.ct.prestacao", base);
      });
    case "Prazo": {
      const P = C.prazo;
      const frase = t("pc.docObra.ct.prazo", {
        inicio: P.inicio ? t("pc.docObra.ct.inicioA", { data: formatarDataIso(P.inicio, idioma) }) : t("pc.docObra.ct.inicioPorMarcar"),
        dias: P.dias || "—",
        fim: P.fim ? formatarData(P.fim, idioma, "numerico") : t("pc.docObra.ct.aDefinir"),
      });
      return P.multa ? `${frase} ${t("pc.docObra.ct.multa")}` : frase;
    }
    case "Garantia":
      return t("pc.docObra.ct.garantia", { garantia: garantiaDe(t, C.garantia) });
    default:
      return t("pc.docObra.ct.condicoes");
  }
}

/** 33,3 (o número com vírgula: os números não mudam com o idioma). */
export const numero = (x: number): string => String(Math.round(x * 100) / 100).replace(".", ",");

/** "1 dia útil" / "3 dias úteis" (com um sinal à frente, se vier). */
export const diasUteis = (t: T, n: number, sinal = ""): string =>
  n === 1 ? t("pc.docObra.diaUtil", { n: sinal + numero(n) }) : t("pc.docObra.diasUteis", { n: sinal + numero(n) });
