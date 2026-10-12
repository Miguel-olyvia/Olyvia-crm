// As vistas rápidas de Pessoas V2, sem React: cada chip é um filtro que já existe (por contactar, voltou a contactar, com visita, atrasadas, negócio novo, perdidas) e o número
// que mostra é o da lista depois de o juntar aos filtros de agora, ou seja, o que o clique abre. Só entram os que fazem sentido no separador. Nada aqui muda o Estado.
import type { SeparadorLista } from "./pessoasDocs";
import { selecionar, type FiltrosP, type LinhaP } from "./filtrosPessoas";
import type { ItemVista } from "./ChipsVista";

export interface ItemVistaP extends ItemVista { chave: keyof FiltrosP; valor: boolean | string }

const DEFS: readonly { id: string; titulo: string; chave: keyof FiltrosP; valor: boolean | string; abas: readonly SeparadorLista[] }[] = [
  { id: "por_contactar", titulo: "Por contactar", chave: "porContactar", valor: true, abas: ["leads", "todos"] },
  { id: "voltou", titulo: "Voltaram a contactar", chave: "voltou", valor: true, abas: ["leads", "todos"] },
  { id: "visita", titulo: "Com visita", chave: "visita", valor: true, abas: ["leads", "todos"] },
  { id: "atrasadas", titulo: "Atrasadas", chave: "atrasadas", valor: true, abas: ["leads", "clientes", "todos"] },
  { id: "novo", titulo: "Com negócio novo", chave: "novoNegocio", valor: true, abas: ["clientes", "todos"] },
  { id: "perdidas", titulo: "Perdidas", chave: "estado", valor: "perdidas", abas: ["leads", "todos"] },
];

export function vistasPessoas(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP): ItemVistaP[] {
  return DEFS.filter((d) => d.abas.includes(aba)).map((d) => ({
    id: d.id, titulo: d.titulo, chave: d.chave, valor: d.valor, ativo: f[d.chave] === d.valor,
    n: selecionar(linhas, aba, { ...f, [d.chave]: d.valor }).length,
  }));
}
