/**
 * Uma folha de cálculo que abre bem em português.
 *
 * Isto parece trivial e não é. Um ficheiro CSV feito da maneira óbvia — vírgulas
 * a separar, ponto decimal, sem BOM — abre no Excel português com **tudo numa
 * coluna só** e os acentos partidos. Quem o recebe conclui que a exportação está
 * avariada, e tem razão.
 *
 * Três decisões, e todas são para o Excel de cá:
 *
 *  · **`;` a separar.** O Excel usa o separador de listas do sistema, e em
 *    Portugal esse é o ponto e vírgula — porque a vírgula já está ocupada a ser
 *    o separador decimal. Com `,` o ficheiro abre numa coluna só;
 *  · **vírgula decimal.** `12.5` lido com locale português dá doze mil e
 *    quinhentos, ou texto. `12,5` é o número certo;
 *  · **BOM no início.** Sem ele o Excel assume a codificação antiga do Windows,
 *    e "Inspeção" aparece como "Inspeçãoo".
 *
 * O resto é o escape do RFC 4180: um campo com separador, aspas ou mudança de
 * linha vai entre aspas, e as aspas lá dentro duplicam-se.
 */

/** O que separa as colunas. Ver a nota no topo — não é vírgula de propósito. */
export const SEPARADOR = ";";

/**
 * O Excel só respeita esta linha se ela for mesmo a primeira do ficheiro.
 * Serve para quem receber o ficheiro com outro locale — diz-lhe qual é o
 * separador em vez de o deixar adivinhar.
 */
const DECLARACAO = `sep=${SEPARADOR}\r\n`;

/** Byte order mark. Sem isto, os acentos partem-se no Excel. */
const BOM = "﻿";

export type Celula = string | number | boolean | null | undefined;

/**
 * Um valor, escrito como o Excel português o quer ler.
 *
 * `null` e `undefined` dão campo vazio — e não a palavra "null", que é o que
 * sai de uma concatenação distraída e depois aparece na folha do cliente.
 */
export function celula(v: Celula): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return String(v).replace(".", ",");
  }

  const texto = String(v);
  if (texto.includes(SEPARADOR) || texto.includes('"') || /[\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * As linhas todas, com cabeçalho.
 *
 * Fins de linha `\r\n`, que é o que o RFC 4180 diz e o que o Excel mais antigo
 * ainda exige.
 */
export function paraCSV(cabecalho: readonly string[], linhas: readonly Celula[][]): string {
  const corpo = [cabecalho.map(celula), ...linhas.map((l) => l.map(celula))]
    .map((l) => l.join(SEPARADOR))
    .join("\r\n");
  return BOM + DECLARACAO + corpo + "\r\n";
}

/**
 * Um nome de ficheiro que sobrevive a Windows, macOS e a um anexo de email.
 *
 * Tira acentos e tudo o que não seja letra, número ou hífen. Um ficheiro
 * chamado `Medições: janeiro/2026.csv` é recusado pelo Windows por causa dos
 * dois pontos e da barra, e o erro que dá não diz porquê.
 */
export function nomeDeFicheiro(...partes: (string | null | undefined)[]): string {
  const limpo = partes
    .filter((p): p is string => Boolean(p && p.trim()))
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${limpo || "exportacao"}.csv`;
}
