// Só para os testes (nenhum código da página o importa): o dia de hoje e o negócio de partida dos testes do orçamento e da proposta.
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase } from "@/components/pessoas/fabricaTestes";

export const HOJE = HOJE_EXEMPLO;

/** Um negócio em Orçamento, sem orçamentos, da pessoa "a" (o nome dela, nos botões, é "a"). */
export const negocioEmOrcamento = (extra: Partial<NegocioMes> = {}): NegocioMes => negocioBase("n1", { servico: "Cozinha", ...extra });
