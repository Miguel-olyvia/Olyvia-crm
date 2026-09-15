import { PDFDocument } from "pdf-lib";
import { generateRelatorioAssiduidadeMensalPdfBlob } from "@/utils/generateRelatorioAssiduidadeMensalPdfBlob";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { DiaRelatorioMensal, ObraHoras, TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

export interface PessoaComDadosDoRelatorio {
  pessoaId: string;
  pessoaNome: string;
  cargo?: string | null;
  dataAdmissao?: string | null;
  dias: DiaRelatorioMensal[];
  totais: TotaisRelatorioMensal;
  obras: ObraHoras[];
}

/**
 * Gera um PDF por pessoa (`generateRelatorioAssiduidadeMensalPdfBlob`) e
 * junta-os num so ficheiro, na ordem dada -- mesmo mecanismo de
 * `generateProposalPdfBlob` (`pdf-lib`, `PDFDocument.copyPages`).
 */
export async function generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob(
  pessoas: PessoaComDadosDoRelatorio[],
  ano: number,
  mes: number,
  organizacaoNome?: string | null,
): Promise<{ blob: Blob; fileName: string; falhas: string[] }> {
  if (pessoas.length === 0) {
    throw new Error("Não há pessoas para incluir neste relatório.");
  }

  const merged = await PDFDocument.create();
  const falhas: string[] = [];

  for (const pessoa of pessoas) {
    try {
      const { blob } = await generateRelatorioAssiduidadeMensalPdfBlob({
        organizacaoNome,
        pessoaNome: pessoa.pessoaNome,
        cargo: pessoa.cargo,
        dataAdmissao: pessoa.dataAdmissao,
        ano,
        mes,
        dias: pessoa.dias,
        totais: pessoa.totais,
        obras: pessoa.obras,
      });
      const arrayBuffer = await blob.arrayBuffer();
      const src = await PDFDocument.load(arrayBuffer);
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach((page) => merged.addPage(page));
    } catch (e) {
      captureFlowError(e, "hr-relatorio-assiduidade-mensal-pdf-export");
      falhas.push(pessoa.pessoaId);
    }
  }

  if (merged.getPageCount() === 0) {
    throw new Error("Não foi possível produzir o relatório de nenhuma pessoa.");
  }

  const bytes = await merged.save();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });

  const mesComDoisDigitos = String(mes + 1).padStart(2, "0");
  const fileName = `assiduidade-organizacao-${ano}-${mesComDoisDigitos}.pdf`;

  return { blob, fileName, falhas };
}
