// O PDF do conteúdo da obra (01 O que vamos fazer, 02 Materiais, 04 Planeamento, 05 Pagamento, 06 Condições, 07 Aceitação),
// no idioma do documento, para o PDF da proposta o acrescentar depois dos orçamentos (generateProposalPdfBlob).
import React from "react";
import { pdf } from "@react-pdf/renderer";
import { ObraPDFDocument } from "@/components/pdf/ObraPDFDocument";
import type { PropostaObra } from "@/components/portal/obra/dadosObra";
import { propostaObraPdf } from "@/components/portal/obra/documentoObraPdf";
import type { PortalIdioma } from "@/portal-i18n/tipos";

/** O que o chamador (o portal, que já tem a vista do negócio) passa para o PDF da proposta levar a obra. */
export interface ObraNoPdf {
  /** Os dados dos blocos, de propostaDaVista (os mesmos do ecrã). */
  dados: PropostaObra;
  /** O idioma do documento (o mesmo que o ecrã usa para a proposta). Só as palavras mudam; o dinheiro não. */
  idioma: PortalIdioma;
  /** A cor principal do template (os números das secções). */
  cor?: string;
}

export async function generateObraPdfBlob(obra: ObraNoPdf): Promise<Blob> {
  const elemento = React.createElement(ObraPDFDocument, { documento: propostaObraPdf(obra.dados, obra.idioma), cor: obra.cor });
  // O tipo do pdf() pede um <Document> directo; ObraPDFDocument devolve um.
  return pdf(elemento as unknown as Parameters<typeof pdf>[0]).toBlob();
}
