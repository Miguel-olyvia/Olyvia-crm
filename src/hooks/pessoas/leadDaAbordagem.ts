// A lead a que a abordagem de uma pessoa se refere. A ficha põe em `lead` a lead mais recente viva em QUALQUER estado, por isso pode estar morta
// (convertida, perdida, rejeitada, cancelada): encerrar ou reativar nela é escrever na lead errada. Aqui decide-se a certa: a que tem o
// encerramento; senão a lead da ficha, se está aberta; senão a aberta mais recente de `leads_abertas` (encerrada ou não). Função pura.
import { escolher, textoOuNull } from "./adaptarComum";
import type { FichaDb } from "./fichaTipos";

/** Os resultados de encerramento que a base conhece (os mesmos de `PedidoEncerrar.resultado`). */
export const RESULTADOS_DE_ENCERRAMENTO = ["semInteresse", "obraInviavel"] as const;

export interface LeadDaAbordagem {
  id: string;
  /** A abordagem desta lead está encerrada (então o menu oferece «Reativar» e não «Encerrar»). */
  encerrada: boolean;
}

const instante = (data: string | null): number => {
  const ms = data ? Date.parse(data) : Number.NaN;
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

export function leadDaAbordagem(ficha: FichaDb): LeadDaAbordagem | null {
  const da = ficha.lead;
  if (da && escolher(da.encerramento?.resultado, RESULTADOS_DE_ENCERRAMENTO)) return { id: da.id, encerrada: true };
  if (da?.aberta) return { id: da.id, encerrada: false };
  // A lead da ficha está morta (ou não há): vale a aberta mais recente. Datas em falta contam como as mais antigas; empate fica pela ordem dada.
  const abertas = [...(ficha.leads_abertas ?? [])].sort((a, b) => instante(b.created_at) - instante(a.created_at));
  const recente = abertas[0];
  if (recente) return { id: recente.id, encerrada: textoOuNull(recente.closure_result) !== null };
  return da ? { id: da.id, encerrada: false } : null;
}
