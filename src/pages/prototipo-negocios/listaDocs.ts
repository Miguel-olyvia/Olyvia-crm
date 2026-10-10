// Peças puras da lista de Pessoas e da ficha em painel: a pessoa vizinha, a posição "3 de 8", o texto do último contacto,
// a etapa e o valor de cada coluna, e o negócio escolhido por defeito. Nada aqui muda o Estado.
import { FASES, type Estado } from "./motor";
import { etapaDe, tempoDesde } from "./leadsDocs";
import { dadosCliente, valorPessoa, type PessoaApp } from "./pessoasDocs";
import { LIMITE_SEM_CONTACTO } from "./perfilDocs";

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

/** A etapa em palavras: as leads dizem onde vão no contacto; os clientes, a fase do negócio mais adiantado (Financeiro, Obra). */
export const etapaTexto = (p: PessoaApp): string => (p.papel === "lead" ? etapaDe(p) : FASES[p.principal.fase]);

/** O valor da coluna: nas leads o que está em orçamento, nos clientes o contratado. `null` quando não há valor (mostra-se "—"). */
export function valorColuna(S: Estado, p: PessoaApp): number | null {
  const v = p.papel === "lead" ? valorPessoa(S, p) : dadosCliente(S, p).valorTotal;
  return v > 0 ? v : null;
}

/** O negócio aberto no separador Negócios: o que a pessoa escolheu, se ainda existe; com um só negócio, esse (para não haver espaço vazio). */
export function negocioPorDefeito(chaves: string[], escolhido: string | null): string | null {
  if (escolhido !== null && chaves.includes(escolhido)) return escolhido;
  return chaves.length === 1 ? chaves[0] : null;
}
