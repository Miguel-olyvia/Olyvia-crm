import React from "react";
import { pdf } from "@react-pdf/renderer";
import { RelatorioAssiduidadeMensalPDFDocument } from "@/components/hr/RelatorioAssiduidadeMensalPDFDocument";
import type { DiaRelatorioMensal, ObraHoras, TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

export interface RelatorioAssiduidadeMensalPdfDados {
  organizacaoNome?: string | null;
  pessoaNome: string;
  cargo?: string | null;
  dataAdmissao?: string | null;
  /** `mes` e 0-indexado (Janeiro = 0), o mesmo formato que `useRelatorioAssiduidadeMensal` usa. */
  ano: number;
  mes: number;
  dias: DiaRelatorioMensal[];
  totais: TotaisRelatorioMensal;
  obras: ObraHoras[];
}

function nomeDeFicheiroSeguro(pessoaNome: string): string {
  return pessoaNome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Gera o PDF do relatorio mensal de assiduidade de UMA pessoa como um `Blob`
 * pronto a descarregar -- mesmo padrao de `generateQuotePdfBlob`.
 */
export async function generateRelatorioAssiduidadeMensalPdfBlob(
  dados: RelatorioAssiduidadeMensalPdfDados,
): Promise<{ blob: Blob; fileName: string }> {
  const nomeDoMes = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(
    new Date(dados.ano, dados.mes, 1),
  );

  const pdfElement = React.createElement(RelatorioAssiduidadeMensalPDFDocument as any, {
    organizacaoNome: dados.organizacaoNome,
    pessoaNome: dados.pessoaNome,
    cargo: dados.cargo,
    dataAdmissao: dados.dataAdmissao,
    nomeDoMes,
    dias: dados.dias,
    totais: dados.totais,
    obras: dados.obras,
  });

  const blob = await (pdf as any)(pdfElement).toBlob();

  const mesComDoisDigitos = String(dados.mes + 1).padStart(2, "0");
  const fileName = `assiduidade-${nomeDeFicheiroSeguro(dados.pessoaNome)}-${dados.ano}-${mesComDoisDigitos}.pdf`;

  return { blob, fileName };
}
