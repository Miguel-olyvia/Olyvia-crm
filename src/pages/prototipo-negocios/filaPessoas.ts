// A "Fila de trabalho" de Pessoas V2, sem React: cada cartão é um filtro que já existe (por contactar, voltou a contactar, com visita, atrasadas, negócio novo, perdidas)
// e o número que mostra é o da lista depois de o juntar aos filtros de agora, ou seja, o que o clique no cartão abre. Só entram os que fazem sentido no separador.
// Nada aqui muda o Estado.
import type { SeparadorLista } from "./pessoasDocs";
import { selecionar, type LinhaP } from "./filtrosPessoas";
import { aplicarAcao, type AcaoP } from "./dashboardPessoas";
import type { FiltrosP } from "./filtrosPessoas";
import type { ItemFila, TomFila } from "./CartaoFila";

export interface ItemFilaP extends ItemFila { acao: AcaoP }

interface Def { id: string; titulo: string; desc: string; tom: TomFila; acao: AcaoP; abas: readonly SeparadorLista[] }

const DEFS: readonly Def[] = [
  { id: "por_contactar", titulo: "Por contactar", desc: "Leads ainda por contactar pela primeira vez.", tom: "info", acao: { f: { porContactar: true } }, abas: ["leads", "todos"] },
  { id: "voltou", titulo: "Voltaram a contactar", desc: "Leads que voltaram a preencher o formulário e ainda ninguém respondeu.", tom: "ok", acao: { f: { voltou: true } }, abas: ["leads", "todos"] },
  { id: "visita", titulo: "Com visita", desc: "Leads na fase de visita.", tom: "info", acao: { f: { visita: true } }, abas: ["leads", "todos"] },
  { id: "atrasadas", titulo: "Atrasadas", desc: "O próximo passo já devia ter acontecido.", tom: "bad", acao: { f: { atrasadas: true } }, abas: ["leads", "clientes", "todos"] },
  { id: "novo", titulo: "Com negócio novo em curso", desc: "Clientes com um negócio novo ainda por fechar.", tom: "warn", acao: { f: { novoNegocio: true } }, abas: ["clientes", "todos"] },
  { id: "perdidas", titulo: "Perdidas", desc: "Pessoas dadas como perdidas, com o motivo da perda.", tom: "neu", acao: { f: { estado: "perdidas" } }, abas: ["leads", "todos"] },
];

export function filaPessoas(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP): ItemFilaP[] {
  return DEFS.filter((d) => d.abas.includes(aba)).map((d) => {
    const r = aplicarAcao(aba, f, d.acao);
    return { id: d.id, n: selecionar(linhas, r.aba, r.f).length, titulo: d.titulo, desc: d.desc, tom: d.tom, acao: d.acao };
  });
}
