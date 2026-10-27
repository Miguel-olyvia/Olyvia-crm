// Os filtros de trabalho do quadro de Negócios (26/10/2026): o "Hoje" diz "3 faturas por emitir" e, ao tocar, o quadro abre só com
// essas (antes abria com todos os negócios). Servem o quadro simples (NegociosSimples.tsx) e o da versão Atual (filtrosNegocios.ts).
// Ficam em S.filtro, como os filtros rápidos de sempre ("meus", "atraso", …), e vão para o endereço (navegacao.ts).
import type { Negocio } from "./motor";

export const FILTROS_TRABALHO: Record<string, { t: string; vale: (d: Negocio) => boolean }> = {
  propostas: { t: "Propostas à espera do cliente", vale: (d) => d.fase === 3 && !!d.orc?.enviada && !d.orc.aceite },
  aprovar: { t: "Exceções à margem por aprovar", vale: (d) => d.orc?.aprov === "pedida" },
  faturar: { t: "Faturas por emitir", vale: (d) => d.fase === 4 && !d.fin.fatura },
  pagar: { t: "Pagamentos por validar", vale: (d) => !!d.fin.fatura && !d.fin.pago },
};

/** É um filtro de trabalho (e não um dos rápidos de sempre)? */
export const eFiltroTrabalho = (f: string): boolean => f in FILTROS_TRABALHO;
