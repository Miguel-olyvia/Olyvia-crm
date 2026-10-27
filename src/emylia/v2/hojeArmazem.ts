// O que o Armazém vê do Inventário no Hoje da V2: os números que o Inventário já calcula (inventario/contadores.ts), em frases curtas.
// Só lê a base em memória do Inventário: não a muda.
import type { Contadores } from "../inventario/contadores";

export interface LinhaInventario { id: string; n: number; texto: string }

const plural = (n: number, um: string, varios: string): string => (n === 1 ? um : varios);

/** As linhas do Inventário para o Armazém, só as que têm alguma coisa. As contagens vêm primeiro. */
/** 26/10: a lista do Inventário que cada linha do resumo abre, já filtrada (o separador e os filtros, inventario/filtros.ts). */
export const DESTINO_LINHA: Record<string, { aba: string; f: Record<string, unknown> }> = {
  cont: { aba: "cont", f: { estado: "open" } },
  low: { aba: "stock", f: { state: "low" } },
  ec: { aba: "ec", f: { prontas: true } },
  guia: { aba: "guia", f: { estado: "open" } },
  late: { aba: "po", f: { status: "late" } },
};
export function resumoInventario(c: Contadores): LinhaInventario[] {
  const L: LinhaInventario[] = [
    { id: "cont", n: c.countsOpen, texto: `${plural(c.countsOpen, "Contagem aberta", "Contagens abertas")}${c.stalled ? ` (${c.stalled} ${plural(c.stalled, "parada", "paradas")} há 7 dias ou mais)` : ""}` },
    { id: "low", n: c.low, texto: plural(c.low, "Produto com stock baixo", "Produtos com stock baixo") },
    { id: "ec", n: c.ecReady, texto: plural(c.ecReady, "Encomenda de cliente pronta para sair", "Encomendas de cliente prontas para sair") },
    { id: "guia", n: c.guiasOpen, texto: plural(c.guiasOpen, "Guia por fechar", "Guias por fechar") },
    { id: "late", n: c.late, texto: plural(c.late, "Encomenda ao fornecedor atrasada", "Encomendas ao fornecedor atrasadas") },
  ];
  return L.filter((l) => l.n > 0);
}
