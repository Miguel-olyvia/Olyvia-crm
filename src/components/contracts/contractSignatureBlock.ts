// O que o contrato precisa do bloco de assinatura e o núcleo não dá: as etiquetas das partes que o bloco plano
// gerado escreve, as marcas por classe no html (texto) e a procura do bloco genérico para o signatário.
// A LOCALIZAÇÃO do bloco (marcas, colunas, plano; critérios de linha) é uma só e vive em
// src/lib/idiomaDocumento/assinaturas.ts (localizarAssinaturas).

import {
  CLASSE_ASSINATURAS,
  CLASSE_ASSINATURA_CLIENTE,
  CLASSE_ASSINATURA_EMPRESA,
  IDIOMA_BASE,
  blocoPlanoPlausivel,
  idiomasDeDeteccao,
} from "@/lib/idiomaDocumento";
import { htmlTemClasse } from "./contractClassMarks";

/** As duas etiquetas que o bloco plano gerado escreve, por idioma (sem palavras próprias: as do português). */
const ROTULOS_DAS_PARTES: Record<string, { primeira: string; segunda: string }> = {
  pt: { primeira: "A PRIMEIRA CONTRATANTE", segunda: "O SEGUNDO CONTRATANTE" },
  en: { primeira: "THE FIRST PARTY", segunda: "THE SECOND PARTY" },
};

export function rotulosDasPartes(codigo: string): { primeira: string; segunda: string } {
  return ROTULOS_DAS_PARTES[codigo] ?? ROTULOS_DAS_PARTES[IDIOMA_BASE];
}

/** O html (texto) tem alguma das marcas por classe do bloco de assinatura? */
export function temMarcaDeAssinatura(html: string | null | undefined): boolean {
  return htmlTemClasse(html, CLASSE_ASSINATURAS, CLASSE_ASSINATURA_EMPRESA, CLASSE_ASSINATURA_CLIENTE);
}

/**
 * O primeiro elemento curto (<220) que contém as duas etiquetas das partes — o bloco que o signatário substitui.
 * Procura no idioma pedido e no base (nunca nos outros); fora do base só se for crível (no fim, com linha).
 */
export function localizarBlocoGenerico(raiz: ParentNode, idioma?: string): { alvo: Element; idioma: string } | null {
  const elementos = Array.from(raiz.querySelectorAll("p, div, td"));
  for (const { codigo } of idiomasDeDeteccao(idioma)) {
    const { primeira, segunda } = rotulosDasPartes(codigo);
    const alvo = elementos.find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!(text.includes(primeira) && text.includes(segunda) && text.length < 220)) return false;
      return codigo === IDIOMA_BASE || blocoPlanoPlausivel(raiz, el);
    });
    if (alvo) return { alvo, idioma: codigo };
  }
  return null;
}
