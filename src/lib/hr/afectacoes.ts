/**
 * Regras de negocio de `pessoas_afectacoes`, partilhadas entre o hook
 * (`usePessoaAfectacoes`) e o ecra (`PessoaAfectacoesSeccao`).
 *
 * A DISTINCAO ALTERAR / CORRIGIR VIVE AQUI, DUAS VEZES
 * -----------------------------------------------------
 * A base decide pelo `valido_ate` da linha (ver `public.hr_periodo_decorrido`
 * na migracao 20261130060000): NULL, hoje ou futuro = ALTERAR
 * (`hr.pessoas.afectacoes.edit`); passado = CORRIGIR
 * (`hr.pessoas.afectacoes.corrigir`). `periodoDecorrido` aqui e a MESMA regra,
 * calculada no cliente, para o ecra poder desenhar o botao certo e recusar
 * antes de gastar um pedido -- nunca para decidir sozinho o que a base aceita.
 */
import type { PessoaAfectacao } from "@/types/hr";

export function dataDeHojeISO(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Espelha `public.hr_periodo_decorrido(date)`: `null` ou uma data de hoje/
 * futuro NAO e decorrido. So um `valido_ate` estritamente anterior a hoje o e.
 */
export function periodoDecorrido(validoAte: string | null): boolean {
  return validoAte !== null && validoAte < dataDeHojeISO();
}

/** Qual das duas permissoes a linha (ou o rascunho) exige, pelo `valido_ate`. */
export function bucketDePermissao(validoAte: string | null): "editar" | "corrigir" {
  return periodoDecorrido(validoAte) ? "corrigir" : "editar";
}

/** Uma afectacao esta EM ABERTO quando nao tem fim. */
export function estaEmAberto(afectacao: Pick<PessoaAfectacao, "valido_ate">): boolean {
  return afectacao.valido_ate === null;
}

/** Ordena para mostrar: em aberto primeiro (por inicio mais recente), depois
 *  o historico, mais recente primeiro. */
export function ordenarAfectacoes(linhas: PessoaAfectacao[]): PessoaAfectacao[] {
  return [...linhas].sort((a, b) => {
    const aAberta = estaEmAberto(a);
    const bAberta = estaEmAberto(b);
    if (aAberta !== bAberta) return aAberta ? -1 : 1;
    return b.valido_de.localeCompare(a.valido_de);
  });
}

/** O dia seguinte a uma data (string `YYYY-MM-DD`), para sugerir o inicio da
 *  afectacao que substitui a que se fecha. */
export function diaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(ano, (mes ?? 1) - 1, (dia ?? 1) + 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Nomes dos erros que a base devolve para esta tabela, para o ecra os
 *  reconhecer sem depender do texto completo da mensagem. */
export const ERRO_AFECTACAO_SOBREPOSTA = "afectacao_sobreposta";
export const ERRO_AFECTACAO_HORARIO_A_FRENTE = "afectacao_tem_horario_a_frente";
export const ERRO_HORARIO_SEM_AFECTACAO = "horario_sem_afectacao";

export function mensagemDeErro(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const msg = (erro as { message?: unknown }).message;
  return typeof msg === "string" ? msg : null;
}

export function ehErroNomeado(erro: unknown, nome: string): boolean {
  const msg = mensagemDeErro(erro);
  return msg !== null && msg.startsWith(nome);
}
