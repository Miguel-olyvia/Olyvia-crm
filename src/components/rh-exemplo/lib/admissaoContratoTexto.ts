/**
 * O texto do contrato de admissão, montado a partir do modelo escolhido e dos dados que só o RH preenche. Devolve linhas
 * de texto simples (nunca HTML): serve a pré-visualização do RH e a leitura da pessoa na página pública.
 */
import type { TraduzirFn } from "@/components/rh-exemplo/lib/errosAdmissao";

export interface DadosDoContrato {
  nome: string;
  cargo: string;
  dataAdmissao: string;
  tipoContrato: string;
  retribuicao: number;
  subsidio: number | null;
  duodecimos: number;
}

export interface TextoDoContrato {
  titulo: string;
  linhas: string[];
}

/** O texto de um modelo sem as marcas HTML (o modelo de exemplo guarda um título e um parágrafo). */
export function textoDoModelo(corpoHtml: string): string {
  return corpoHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const euros = (v: number): string => `${v.toFixed(2).replace(".", ",")} EUR`;

export function textoDoContrato(modelo: { nome: string; corpo_html: string }, d: DadosDoContrato, t: TraduzirFn): TextoDoContrato {
  const intro = textoDoModelo(modelo.corpo_html).replace(modelo.nome, "").trim();
  const subsidio = d.subsidio === null ? t("rhAdm.contrato.semSubsidio") : euros(d.subsidio);
  return {
    titulo: modelo.nome,
    linhas: [
      t("rhAdm.contrato.partes", { nome: d.nome, cargo: d.cargo }),
      t("rhAdm.contrato.inicio", { data: d.dataAdmissao, tipo: d.tipoContrato }),
      t("rhAdm.contrato.retribuicao", { base: euros(d.retribuicao), subsidio, duodecimos: d.duodecimos }),
      ...(intro === "" ? [] : [intro]),
      t("rhAdm.contrato.assinatura"),
    ],
  };
}
