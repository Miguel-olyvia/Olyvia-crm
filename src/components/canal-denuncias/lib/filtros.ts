// Filtros, pesquisa, totais e ordem da lista da gestão. A pesquisa nunca olha para a identidade da pessoa.
import { prazoAtual, prazoPorVencer } from "./prazos";
import type { Denuncia, EstadoDenuncia, TipoDenuncia } from "./tipos";

export const TODOS = "todos";
export const SEM_RESPONSAVEL = "sem";

export interface FiltrosGestao {
  estado: EstadoDenuncia | typeof TODOS;
  tipo: TipoDenuncia | typeof TODOS;
  origem: "anonima" | "identificada" | typeof TODOS;
  /** Id do responsável, `SEM_RESPONSAVEL` ou `TODOS`. */
  responsavel: string;
  soPrazo: boolean;
  texto: string;
}

export const SEM_FILTROS: FiltrosGestao = { estado: TODOS, tipo: TODOS, origem: TODOS, responsavel: TODOS, soPrazo: false, texto: "" };

export const haFiltros = (f: FiltrosGestao): boolean => JSON.stringify(f) !== JSON.stringify(SEM_FILTROS);

const normalizar = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function corresponde(d: Denuncia, f: FiltrosGestao, hoje: string): boolean {
  if (f.estado !== TODOS && d.estado !== f.estado) return false;
  if (f.tipo !== TODOS && d.tipo !== f.tipo) return false;
  if (f.origem !== TODOS && d.anonima !== (f.origem === "anonima")) return false;
  if (f.responsavel === SEM_RESPONSAVEL && d.responsavelId !== null) return false;
  if (f.responsavel !== TODOS && f.responsavel !== SEM_RESPONSAVEL && d.responsavelId !== f.responsavel) return false;
  if (f.soPrazo && !prazoPorVencer(prazoAtual(d, hoje))) return false;
  const q = normalizar(f.texto.trim());
  return q === "" || normalizar(`${d.codigo} ${d.resumo} ${d.descricao}`).includes(q);
}

/** Do mais urgente para o menos: prazos atrasados, depois por data de prazo; os casos fechados no fim. */
export function ordenarPorUrgencia(lista: readonly Denuncia[], hoje: string): Denuncia[] {
  const chave = (d: Denuncia): string => prazoAtual(d, hoje).data ?? "9999-12-31";
  return [...lista].sort((a, b) => chave(a).localeCompare(chave(b)) || b.codigo.localeCompare(a.codigo));
}

export function filtrarDenuncias(lista: readonly Denuncia[], f: FiltrosGestao, hoje: string): Denuncia[] {
  return ordenarPorUrgencia(lista.filter((d) => corresponde(d, f, hoje)), hoje);
}

export interface TotaisGestao {
  novas: number;
  emAnalise: number;
  aVencer: number;
  concluidas: number;
}

export function totaisDaGestao(lista: readonly Denuncia[], hoje: string): TotaisGestao {
  return {
    novas: lista.filter((d) => d.estado === "recebida").length,
    emAnalise: lista.filter((d) => d.estado === "em_analise" || d.estado === "mais_info").length,
    aVencer: lista.filter((d) => prazoPorVencer(prazoAtual(d, hoje))).length,
    concluidas: lista.filter((d) => d.estado === "concluida").length,
  };
}
