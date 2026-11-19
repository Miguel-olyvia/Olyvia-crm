// Um negócio do exemplo da Emylia com orçamento de serviços, enviado ao cliente, e a vista como o portal a lê (ida e volta
// pelo JSON). O mesmo cenário de documentoObra.test.tsx, para os testes dos PDFs.
import { seed, type Estado, type Negocio } from "@/emylia/motor";
import { lerVista, vistaDoCliente } from "@/emylia/real/vistaCliente";
import type { VistaDoPortal } from "../dadosObra";

export function exemploObra(muda?: (d: Negocio, S: Estado) => void): { S: Estado; d: Negocio; v: VistaDoPortal } {
  const S = seed();
  const d = S.deals.find((x) => x.orc?.linhas.some((l) => l.t === "svc"))!;
  const o = d.orc!;
  o.enviada = "01/11/2026"; o.aceite = null; o.contrato = null;
  d.f.pagamento = "50% + 25% no arranque + 25% no fim";
  d.f.garantia = "5 anos";
  muda?.(d, S);
  const v = lerVista(JSON.parse(JSON.stringify({ vista: vistaDoCliente(d, S), rececao: null, respostas: [] })))!;
  return { S, d, v };
}

/** Uma adenda assinada, para o contrato. */
export const comAdenda = (d: Negocio): void => {
  d.adendas = [{ n: "AD-1", estado: "assinada", criada: "02/11/2026", assinada: "05/11/2026", motivo: "Pedido do cliente",
    linhas: [{ sid: "x", n: "Tomada <extra>", q: 2, un: "un", pu: 40, h: 1, perfil: "eletricista" }] } as unknown as NonNullable<Negocio["adendas"]>[number]];
};
