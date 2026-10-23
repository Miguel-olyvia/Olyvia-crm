// Os três filtros da etapa "Necessidades do cliente" (15/10/2026, pedido do Ruben): a pesquisa, a fase da obra pelo nome
// e a tipologia (o ofício: Revestimentos, Canalização…), separados e combinados (E). Funções puras, sem React.
import { FASES_OBRA, type FaseObra } from "./fasesObra";

/** Os nomes das fases, como aparecem nos filtros (os curtos: "Preparação e demolições", "Infraestruturas"…). */
export const NOMES_FASES: string[] = FASES_OBRA.map((f) => f.curto);

/** A fase de um nome do filtro (ou nenhuma). */
export function faseDoNome(nome: string | null): FaseObra | null {
  return FASES_OBRA.find((f) => f.curto === nome)?.n ?? null;
}

/** O nome de uma fase no filtro (ou nenhum). */
export function nomeDaFase(f: FaseObra | null): string | null {
  return f ? FASES_OBRA[f - 1].curto : null;
}

/** Só os itens que acontecem na fase (um item pode estar em várias); sem fase, todos. */
export function filtrarPorFase<T>(itens: T[], fase: FaseObra | null, fasesDe: (x: T) => FaseObra[]): T[] {
  return fase ? itens.filter((x) => fasesDe(x).includes(fase)) : itens;
}

/** Há algum filtro ligado (a pesquisa com texto, a fase ou a tipologia)? */
export function filtroAtivo(f: { q: string; fase: FaseObra | null; tipo: string | null }): boolean {
  return !!f.q.trim() || f.fase != null || f.tipo != null;
}

/** "1 serviço", "12 serviços", "Nenhum serviço". */
export function textoResultados(n: number, singular: string, plural: string, nenhum: string): string {
  return n === 0 ? nenhum : `${n} ${n === 1 ? singular : plural}`;
}
