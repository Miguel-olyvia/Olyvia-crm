// Peças puras da lista de Pessoas e da ficha em painel: a pessoa vizinha, a posição "3 de 8", o texto do último contacto,
// a etapa e o valor de cada coluna, e o negócio escolhido por defeito. Nada aqui muda o Estado.
import type { Estado } from "./motor";
import type { FaseNegocio, NegocioApp } from "./negociosApp";
import { etapaDe, tempoDesde } from "./leadsDocs";
import { dadosCliente, valorPessoa, type PessoaApp } from "./pessoasDocs";
import { LIMITE_SEM_CONTACTO, estadoCurto } from "./perfilDocs";

export interface Vizinhas { anterior: string | null; seguinte: string | null; posicao: number; total: number }

/** A pessoa anterior e a seguinte na lista como se vê, sem dar a volta (nos limites fica `null`). `posicao` conta a partir de 1; 0 quando a pessoa não está na lista. */
export function vizinhasDe(nomes: string[], atual: string): Vizinhas {
  const i = nomes.indexOf(atual), total = nomes.length;
  if (i < 0) return { anterior: null, seguinte: null, posicao: 0, total };
  return { anterior: i > 0 ? nomes[i - 1] : null, seguinte: i < total - 1 ? nomes[i + 1] : null, posicao: i + 1, total };
}

/** "3 de 8"; vazio quando a pessoa não está na lista. */
export const posicaoTexto = (v: Vizinhas): string => (v.posicao > 0 ? `${v.posicao} de ${v.total}` : "");

/** "há 4 dias" (ou "hoje", "ontem"), e a partir do limite "sem contacto há 10 dias" (`sem`: pede o alerta). */
export function contactoTexto(f: { diasSemContacto: number; ultimoContacto: string }): { texto: string; sem: boolean } {
  const sem = f.diasSemContacto >= LIMITE_SEM_CONTACTO;
  return { sem, texto: sem ? `sem contacto há ${f.diasSemContacto} dias` : tempoDesde(f.ultimoContacto) || "hoje" };
}

/** As cinco etapas da pessoa. Só se é Cliente com um negócio ganho; depois de cliente, um negócio novo não faz voltar ao passo Negócio. */
export const ETAPAS_PESSOA = ["Lead", "Contacto", "Visita", "Negócio", "Cliente"] as const;
const ETAPA_CLIENTE = ETAPAS_PESSOA.length - 1;

/** A etapa da pessoa (0 a 4): o Cliente se tem um negócio ganho; senão a fase do negócio mais adiantado (Lead, Contacto, Visita ou Negócio em curso). */
export const etapaPessoa = (p: PessoaApp): number => (p.papel === "cliente" ? ETAPA_CLIENTE : Math.min(p.principal.fase, ETAPA_CLIENTE - 1));

/** A etapa em palavras: Por contactar, Contactada, Com visita, "Negócio · proposta" (o estado do negócio) e Cliente. */
export function etapaTexto(p: PessoaApp): string {
  const e = etapaPessoa(p);
  return e === ETAPA_CLIENTE - 1 ? `Negócio · ${estadoCurto(p.principal).toLowerCase()}` : e === ETAPA_CLIENTE ? "Cliente" : etapaDe(p);
}

/** O valor da coluna: nas leads o que está em orçamento, nos clientes o contratado. `null` quando não há valor (mostra-se "—"). */
export function valorColuna(S: Estado, p: PessoaApp): number | null {
  const v = p.papel === "lead" ? valorPessoa(S, p) : dadosCliente(S, p).valorTotal;
  return v > 0 ? v : null;
}

type NegocioEscolhivel = Pick<NegocioApp, "id" | "fase" | "perdido">;

/** Do mais avançado ao menos avançado, só entre os negócios em curso (o Concluído, `obra`, não está em curso). */
const ORDEM_AVANCO: readonly FaseNegocio[] = ["financeiro", "contrato", "proposta", "orcamento", "levantamento"];

/** O negócio mais avançado ainda em curso e não perdido (em empate, o primeiro da lista); se todos forem perdidos ou concluídos, o primeiro; sem negócios, `null`. */
export function negocioMaisAvancado(negocios: readonly NegocioEscolhivel[]): string | null {
  let melhor: NegocioEscolhivel | null = null, posMelhor = ORDEM_AVANCO.length;
  for (const n of negocios) {
    const pos = n.perdido !== null ? -1 : ORDEM_AVANCO.indexOf(n.fase);
    if (pos >= 0 && pos < posMelhor) { melhor = n; posMelhor = pos; }
  }
  return (melhor ?? negocios[0])?.id ?? null;
}

/** O negócio aberto no separador Negócios: o que a pessoa escolheu, se ainda existe; com um só negócio, esse.
 *  Com vários, ao lado da lista abre o mais avançado (para o detalhe não ficar vazio); com o detalhe por baixo (`porBaixo`) não abre nenhum, para não empurrar a lista. */
export function negocioPorDefeito(negocios: readonly NegocioEscolhivel[], escolhido: string | null, porBaixo = false): string | null {
  if (escolhido !== null && negocios.some((n) => n.id === escolhido)) return escolhido;
  if (negocios.length === 1) return negocios[0].id;
  return porBaixo ? null : negocioMaisAvancado(negocios);
}
