// Exportar listas da V2 funcional para CSV, para abrir no Excel português: BOM (para os acentos), ponto e vírgula a separar, aspas à volta
// de um campo que tenha separador, aspas ou mudança de linha (as aspas de dentro duplicam-se), linhas acabadas em CRLF e o valor com vírgula decimal.
// As funções que fazem o texto são puras; só `descarregarCsv` toca no browser.
import type { Estado } from "./motor";
import { localDe } from "./leadsDocs";
import { comercialDe, type PessoaApp } from "./pessoasDocs";
import { proximoTexto, type Perfil } from "./perfilDocs";
import { contactoTexto, etapaTexto, valorColuna } from "./listaDocs";
import { formularioDe, resultadoContacto } from "./camposPessoa";
import { COLUNAS_V2 } from "./negociosDocs";
import type { LinhaN } from "./filtrosNegocios";
import { paradoN } from "./funcNegocios";

export const BOM = "﻿";
export const SEP = ";";
const FIM = "\r\n";

/** Um campo do CSV: com aspas só quando é preciso (separador, aspas, mudança de linha ou espaços nas pontas). */
export function campoCsv(v: string | number | null | undefined): string {
  const t = v === null || v === undefined ? "" : String(v);
  return /[;"\r\n]|^\s|\s$/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** O texto inteiro do CSV: BOM, cabeçalho e uma linha por registo. */
export function csvDe(cabecalho: readonly string[], linhas: readonly (readonly (string | number | null)[])[]): string {
  return BOM + [cabecalho, ...linhas].map((l) => l.map(campoCsv).join(SEP)).join(FIM) + FIM;
}

/** O valor em euros com vírgula decimal e sem separador de milhares ("16225,82"); vazio sem valor. */
export const valorCsv = (v: number | null): string => (v === null ? "" : v.toFixed(2).replace(".", ","));

export const COLUNAS_CSV_PESSOAS = [
  "Nome", "Papel", "Empresa", "Serviço", "Localidade", "Distrito", "Formulário", "Etapa", "Último contacto", "Resultado", "Próximo passo", "Valor", "Comercial",
] as const;

/** Uma pessoa como linha do CSV, com o perfil já ajustado pelos registos do dia a dia. */
export function linhaCsvPessoa(S: Estado, p: PessoaApp, f: Perfil): string[] {
  return [
    p.nome, p.papel === "lead" ? (p.perdida !== null ? "Lead perdida" : "Lead") : "Cliente", p.empresa ? "Sim" : "Não", p.principal.servico, localDe(p.principal),
    f.distrito ?? "Por indicar", formularioDe(S, p), etapaTexto(p), contactoTexto(f).texto, resultadoContacto(f), p.perdida !== null ? "" : proximoTexto(p, S),
    valorCsv(valorColuna(S, p)), comercialDe(p),
  ];
}

export function csvPessoas(S: Estado, itens: readonly { p: PessoaApp; f: Perfil }[]): string {
  return csvDe(COLUNAS_CSV_PESSOAS, itens.map(({ p, f }) => linhaCsvPessoa(S, p, f)));
}

export const COLUNAS_CSV_NEGOCIOS = ["Pessoa", "Negócio", "Fase", "Orçamentos", "Valor", "Dias parado", "Próximo passo", "Comercial", "Distrito", "Exemplo"] as const;

export function csvNegocios(ls: readonly LinhaN[]): string {
  return csvDe(COLUNAS_CSV_NEGOCIOS, ls.map((l) => [
    l.negocio.nome, l.negocio.titulo, COLUNAS_V2.find((c) => c.id === l.doc)?.nome ?? "", l.nOrc, valorCsv(l.valor), paradoN(l),
    l.cartao?.proximo ?? "", l.comercial, l.distrito, l.cartao?.demo || l.negocio.demo ? "Sim" : "Não",
  ]));
}

/** O nome do ficheiro: "pessoas-2026-10-10.csv" (a data fixa do protótipo). */
export const nomeCsv = (base: string): string => `${base}-2026-10-10.csv`;

/** Descarrega o CSV com um Blob e um link temporário. Devolve `false` se o browser não o deixar (por exemplo sem URL.createObjectURL). */
export function descarregarCsv(nome: string, texto: string): boolean {
  try {
    if (typeof URL.createObjectURL !== "function") return false;
    const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = nome; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}
