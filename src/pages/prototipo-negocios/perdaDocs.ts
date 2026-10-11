// O motivo da perda de uma lead: a escolha fixa e a memória de módulo onde o motivo escolhido na ficha fica guardado.
// A memória só dura a sessão (não é o Estado, que o protótipo grava no localStorage): ao recarregar a página, uma lead perdida
// à mão continua perdida (o negócio está marcado no Estado) mas o motivo deixa de se saber ("Motivo não registado").
import { PESSOAS_EXEMPLO } from "./pessoasExemplo";

/** Os cinco motivos, em escolha fixa; `curto` é o texto da etapa na lista. */
export const MOTIVOS_PERDA = [
  { nome: "Preço", curto: "Preço" },
  { nome: "Adiou", curto: "Adiou" },
  { nome: "Foi para outra empresa", curto: "Outra empresa" },
  { nome: "Sem resposta", curto: "Sem resposta" },
  { nome: "Não era o que procurava", curto: "Não servia" },
] as const;
export type MotivoPerda = (typeof MOTIVOS_PERDA)[number]["nome"];

/** O que se diz quando a pessoa está perdida mas o motivo já não se sabe. */
export const SEM_MOTIVO = "Motivo não registado";

const lembradas = new Map<string, string>();

/** Guarda o motivo da perda de uma pessoa (pelo nome) até ao fim da sessão. */
export function lembrarPerda(nome: string, motivo: string): void {
  lembradas.set(nome, motivo);
}

/** Esquece os motivos guardados (quando a demonstração é reposta). */
export function esquecerPerdas(): void {
  lembradas.clear();
}

/** A pessoa foi marcada como perdida nesta sessão. */
export const perdaLembrada = (nome: string): boolean => lembradas.has(nome);

/** O motivo da perda: o escolhido na ficha, ou o do exemplo que já nasce perdido; `null` quando não há nenhum. */
export function motivoDaPerda(nome: string): string | null {
  return lembradas.get(nome) ?? PESSOAS_EXEMPLO.find((e) => e.nome === nome)?.perdida ?? null;
}

/** O motivo em poucas palavras (para a etapa na lista); um motivo desconhecido fica como está. */
export function motivoCurto(motivo: string): string {
  return MOTIVOS_PERDA.find((m) => m.nome === motivo)?.curto ?? motivo;
}
