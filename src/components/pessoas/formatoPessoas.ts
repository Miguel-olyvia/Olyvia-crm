// Os textos curtos da página "Pessoas" que dependem de números: "há 3 dias", "2 · €14.100 · Contrato",
// "jun/2026", "ontem às 18:40". Recebem `t` e o dia de hoje (nunca leem o relógio).
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { diasParaPrazo, type Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { ResumoPessoa } from "./pessoasTipos";

const P = "pessoasPagina.";

/** "hoje", "há 1 dia", "há 9 dias". */
export function textoUltimoContacto(t: Traduzir, dias: number): string {
  if (dias <= 0) return t(`${P}last.today`);
  return t(`${P}last.${dias === 1 ? "one" : "many"}`, { count: dias });
}

/** "Sem negócio", "—" (só histórico) ou "2 · €14.100 · Financeiro". */
export function textoNegocios(t: Traduzir, r: ResumoPessoa): string {
  if (r.semNegocio) return t(`${P}deals.none`);
  if (r.fase === null) return "—";
  return t(`${P}deals.summary`, {
    count: r.numero, value: formatarMeta("euro", r.valor), phase: t(`businessGoals.phase.${r.fase}`),
  });
}

/** "jun/2026" a partir de "2026-06". */
export function textoMes(t: Traduzir, mes: string): string {
  const [ano, numero] = mes.split("-");
  return `${t(`${P}month.${Number(numero)}`)}/${ano}`;
}

/** "hoje às 09:15", "ontem às 18:40" ou "11/10 às 10:20", a partir de AAAA-MM-DDTHH:MM. */
export function textoData(t: Traduzir, data: string, hoje: string): string {
  const dia = data.slice(0, 10);
  const hora = data.slice(11, 16);
  const dias = diasParaPrazo(dia, hoje);
  if (dias === 0) return t(`${P}date.today`, { time: hora });
  if (dias === -1) return t(`${P}date.yesterday`, { time: hora });
  return t(`${P}date.other`, { day: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`, time: hora });
}
