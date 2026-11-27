// 27/11 (teste ao vivo do relatório com a análise): o modelo copia para o texto a ligação que a ferramenta devolveu e, numa ligação
// longa (o código da análise vai nela), estragou letras no meio («123,74» saiu «1=?,74»). Aqui troca-se cada ligação escrita pelo
// modelo pela ligação exata da ferramenta com o mesmo caminho (ex.: /relatorios/olyvia). Se o modelo não escreveu nenhuma, junta-se.
export interface LigacaoFerramenta { link?: string }
export interface LigacaoChat { label: string; path: string }

const caminho = (u: string) => u.split(/[?#]/)[0];

export function corrigirLigacoes(texto: string, ligacoes: LigacaoChat[], chamadas: LigacaoFerramenta[] | undefined, rotulo = "Abrir"): { texto: string; ligacoes: LigacaoChat[] } {
  const exatas = (chamadas ?? []).map((c) => c.link).filter((l): l is string => typeof l === "string" && l.startsWith("/"));
  if (!exatas.length) return { texto, ligacoes };
  const exata = (p: string) => (p.startsWith("/") ? [...exatas].reverse().find((l) => caminho(l) === caminho(p)) : undefined);
  const novoTexto = texto.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, r: string, p: string) => { const e = exata(p); return e ? `[${r}](${e})` : m; });
  const novas = ligacoes.map((l) => { const e = exata(l.path); return e ? { ...l, path: e } : l; });
  for (const e of exatas) if (!novas.some((l) => l.path === e)) novas.push({ label: rotulo, path: e });
  return { texto: novoTexto, ligacoes: novas };
}
