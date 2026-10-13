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

/** "Sem negócio", "—" (só histórico) ou "2 · €14.100 · Ganho". */
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

/** ", 1 pendente" ou ", 3 pendentes": o que o leitor de ecrã ouve a seguir ao nome de uma aba. */
export const textoPendentes = (t: Traduzir, count: number): string =>
  t(`${P}tabs.pendingSr${count === 1 ? "One" : ""}`, { count });

/** "14/10" a partir de AAAA-MM-DD. */
export const textoDiaMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** "12/03/2026" a partir de AAAA-MM-DD. */
export const textoDiaCompleto = (dia: string): string => `${textoDiaMes(dia)}/${dia.slice(0, 4)}`;

/** "hoje", "ontem" ou "11/10" (com o ano se não for o de hoje), a partir de AAAA-MM-DD. */
export function textoDia(t: Traduzir, dia: string, hoje: string): string {
  const dias = diasParaPrazo(dia, hoje);
  if (dias === 0) return t(`${P}day.today`);
  if (dias === -1) return t(`${P}day.yesterday`);
  return dia.slice(0, 4) === hoje.slice(0, 4) ? textoDiaMes(dia) : textoDiaCompleto(dia);
}
