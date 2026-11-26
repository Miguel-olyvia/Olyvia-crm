/**
 * A prévia da conta no formulário de um ativo («perde 33,33 € por mês durante 36 meses, até 12/2029», «custa 450 € por mês, desde...»)
 * e a vida de um equipamento do catálogo em meses. Puras: só dependem do que está escrito nos campos; sem dados suficientes não há
 * prévia (nunca um número inventado).
 */
import { quotaMensal, somarMesesAoMes } from "@/components/rh-exemplo/lib/comoConta";
import { mesDaData, type MesIso } from "@/components/rh-exemplo/lib/custo";
import { LIMITES_ATIVO } from "./tipos";
import { eAlugado, numeroDoCampo, type CamposAtivo } from "./validarAtivo";

/** A vida de um equipamento do catálogo em meses (anos x 12, de 1 a 600); `null` se não tem vida em anos. */
export function vidaDoCatalogoEmMeses(vidaAnos: number | null): number | null {
  return vidaAnos && vidaAnos > 0 ? Math.min(LIMITES_ATIVO.vidaMaxima, Math.max(LIMITES_ATIVO.vidaMinima, Math.round(vidaAnos * 12))) : null;
}

export type PreviaConta =
  | { tipo: "comprado"; quota: number; meses: number; fim: MesIso }
  | { tipo: "alugadoFim"; renda: number; inicio: string; fim: string }
  | { tipo: "alugadoSemFim"; renda: number; inicio: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const positivo = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

export function previaDaConta(c: CamposAtivo): PreviaConta | null {
  if (c.grupo === "servico") return null;
  if (eAlugado(c)) {
    const renda = numeroDoCampo(c.rendaMensal);
    if (!positivo(renda) || !DATA.test(c.inicioAluguer)) return null;
    return DATA.test(c.fimAluguer)
      ? { tipo: "alugadoFim", renda, inicio: c.inicioAluguer, fim: c.fimAluguer }
      : { tipo: "alugadoSemFim", renda, inicio: c.inicioAluguer };
  }
  const valor = numeroDoCampo(c.valorCompra);
  const residual = numeroDoCampo(c.valorResidual) ?? 0;
  const escrita = numeroDoCampo(c.vidaMeses);
  const vida = c.vidaOrigem === "catalogo" ? c.vidaCatalogoMeses : escrita;
  if (!positivo(valor) || Number.isNaN(residual) || residual > valor) return null;
  if (vida === null || !Number.isInteger(vida) || vida < LIMITES_ATIVO.vidaMinima || vida > LIMITES_ATIVO.vidaMaxima || !DATA.test(c.dataCompra)) return null;
  return { tipo: "comprado", quota: quotaMensal(valor - residual, vida), meses: vida, fim: somarMesesAoMes(mesDaData(c.dataCompra), vida - 1) };
}
