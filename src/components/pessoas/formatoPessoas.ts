// Os textos curtos da página "Pessoas" que dependem de números: "há 3 dias", "2 · €14.100 · Contrato",
// "jun/2026", "ontem às 18:40". Recebem `t` e o dia de hoje (nunca leem o relógio).
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { diasParaPrazo, type Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";

const P = "pessoasPagina.";

/** "hoje", "há 1 dia", "há 9 dias"; `null` (nunca houve contacto) diz «Sem contacto». */
export function textoUltimoContacto(t: Traduzir, dias: number | null): string {
  if (dias === null) return t(`${P}real.noContact`);
  if (dias <= 0) return t(`${P}last.today`);
  return t(`${P}last.${dias === 1 ? "one" : "many"}`, { count: dias });
}

/** "Por contactar", "Negócio · Proposta" ou "Cliente" (a etapa, sem contar com a perda). */
export function textoEtapaBase(t: Traduzir, r: ResumoPessoa): string {
  if (r.etapa === "qualificada") return r.faseEtapa ? t(`${P}stage.qualificada`, { phase: t(`businessGoals.phase.${r.faseEtapa}`) }) : t(`${P}journey.step3`);
  return t(`${P}stage.${r.etapa}`);
}

/** Como `textoEtapaBase`; numa perdida, "Perdida · Preço"; numa abordagem encerrada, "Encerrada · Sem interesse". */
export function textoEtapa(t: Traduzir, r: ResumoPessoa): string {
  if (r.pessoa.encerrada) return t(`${P}close.stage`, { result: t(`${P}close.result.${r.pessoa.encerrada.resultado}`) });
  if (r.pessoa.perdida) return t(`${P}stage.lost`, { reason: t(`${P}lost.${r.pessoa.perdida.motivo}`) });
  return textoEtapaBase(t, r);
}

/** "sem contacto há 9 dias": a partir do limite da lista. */
export const textoSemContacto = (t: Traduzir, dias: number): string => t(`${P}last.stale`, { count: dias });

/** O valor em jogo ("€14.100"); `null` sem valor (nenhum negócio aberto, ou nenhum com orçamento escolhido). */
export const textoValor = (r: ResumoPessoa): string | null => (r.emJogo > 0 ? formatarMeta("euro", r.emJogo) : null);

/** "Até 16/10", "Até 13/10 · hoje" ou "Prazo ultrapassado (era 03/10)"; `null` sem prazo. */
export function textoPrazoPasso(t: Traduzir, prazo: string | null, hoje: string): string | null {
  const dias = diasParaPrazo(prazo, hoje);
  if (prazo === null || dias === null) return null;
  const date = textoDiaMes(prazo);
  if (dias < 0) return t(`${P}deadline.overdue`, { date });
  return t(dias === 0 ? `${P}deadline.today` : `${P}deadline.until`, { date });
}

export type FaixaSaude = "baixa" | "media" | "alta";

/** A faixa de uma saúde de 0 a 100 (até 33 baixa, até 66 média, acima alta): a barra nunca é o único sinal. */
export const faixaSaude = (valor: number): FaixaSaude => (valor <= 33 ? "baixa" : valor <= 66 ? "media" : "alta");

/** "jun/2026" a partir de "2026-06". */
export function textoMes(t: Traduzir, mes: string): string {
  const [ano, numero] = mes.split("-");
  return `${t(`${P}month.${Number(numero)}`)}/${ano}`;
}

/** Como `textoData`, mas com o ano quando não é hoje nem ontem: "hoje às 09:15", "ontem às 18:40" ou "13/10/2026 às 09:15". */
export function textoDataCompleta(t: Traduzir, data: string, hoje: string): string {
  const dia = data.slice(0, 10);
  const hora = data.slice(11, 16);
  const dias = diasParaPrazo(dia, hoje);
  if (dias === 0) return t(`${P}date.today`, { time: hora });
  if (dias === -1) return t(`${P}date.yesterday`, { time: hora });
  return t(`${P}date.full`, { day: textoDiaCompleto(dia), time: hora });
}

/** "hoje", "há 1 dia" ou "há 9 dias" para uma data AAAA-MM-DDTHH:MM (uma data futura conta como hoje). */
export const textoHaQuanto = (t: Traduzir, data: string, hoje: string): string =>
  textoUltimoContacto(t, -(diasParaPrazo(data.slice(0, 10), hoje) ?? 0));

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

/**
 * A linha do cabeçalho da ficha: "Lead · Por contactar · Sintra" (o papel, a etapa e a localidade, ou o distrito).
 * Nunca repete um segmento ("Cliente · Porto", não "Cliente · Cliente · Porto") nem deixa um "·" solto.
 */
export function textoLinhaCabecalho(t: Traduzir, r: ResumoPessoa): string {
  const { pessoa } = r;
  const segmentos = [t(`${P}role.${r.papel}`), textoEtapaBase(t, r), pessoa.morada?.localidade ?? pessoa.distrito];
  const vistos: string[] = [];
  for (const s of segmentos) if (s && !vistos.includes(s)) vistos.push(s);
  return vistos.join(" · ");
}

/** A morada numa linha: "Rua X, 1000-001 Lisboa"; uma lead criada só com a localidade fica "Sintra" (sem vírgulas soltas). */
export function textoMorada(m: NonNullable<Pessoa["morada"]>): string {
  return [m.linha, `${m.cp} ${m.localidade}`.trim()].filter(Boolean).join(", ");
}

/** O dia da semana de um dia AAAA-MM-DD: 0 (domingo) a 6 (sábado), sem fusos nem relógio. */
export function diaDaSemana(dia: string): number {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
}
