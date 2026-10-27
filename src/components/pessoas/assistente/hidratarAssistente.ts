// Do que a base já guardou para o que o ecrã de um passo mostra: quando o rascunho do navegador já não existe (outra sessão, depois de gravar), o passo
// abre na mesma com o que ficou gravado. Só lógica pura. O rascunho, quando tem valor, ganha sempre: é o que a pessoa está a escrever agora.
import { temMorada, type MoradaObraForm } from "@/components/negocio-metas/moradaObra";
import type { LevantamentoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { DURACOES_PREPARAR, QUEM_VAI_ESTAR, type PrepararVisita } from "./rascunhoAssistente";

/** O limite da nota da visita (o da agenda). */
const MAX_NOTA = 140;

const dentroDa = (lista: readonly string[], valor: string): string => (lista.includes(valor) ? valor : "");

/** A visita marcada a que o passo «Preparar a visita» e a morada recorrem: a mais recente que não foi cancelada (por data e hora); `null` sem nenhuma. */
export function visitaMarcadaMaisRecente(visitas: readonly VisitaPessoa[] | undefined): VisitaPessoa | null {
  let melhor: VisitaPessoa | null = null;
  for (const v of visitas ?? []) {
    if (v.estado === "cancelada") continue;
    if (melhor === null || `${v.data} ${v.hora}` >= `${melhor.data} ${melhor.hora}`) melhor = v;
  }
  return melhor;
}

/** A preparação mostrada: o que o rascunho tem, campo a campo, e o que falta vem da visita já marcada (duração só se for uma das opções do passo). */
export function prepararHidratado(rascunho: PrepararVisita, visita: VisitaPessoa | null, tocado = false): PrepararVisita {
  // `tocado`: a pessoa já mexeu neste passo, por isso um campo apagado de propósito fica vazio em vez de voltar ao da visita.
  if (!visita || tocado) return rascunho;
  return {
    duracao: rascunho.duracao || dentroDa(DURACOES_PREPARAR, visita.duracao),
    quem: rascunho.quem || dentroDa(QUEM_VAI_ESTAR, visita.quemVaiEstar),
    nota: rascunho.nota || visita.nota.slice(0, MAX_NOTA),
  };
}

/** A morada mostrada: a do rascunho se tem alguma coisa; senão a da visita marcada; senão a vazia do rascunho. */
export function moradaHidratada(rascunho: MoradaObraForm, visita: VisitaPessoa | null, tocado = false): MoradaObraForm {
  if (tocado || temMorada(rascunho) || !visita) return rascunho;
  const { rua, codigoPostal, localidade, andar } = visita.morada;
  const daVisita: MoradaObraForm = { rua, codigoPostal, localidade, andar };
  return temMorada(daVisita) ? daVisita : rascunho;
}

/** O levantamento guardado mais recente do negócio (por data; em empate, o último da lista); `undefined` sem nenhum. */
export function levantamentoMaisRecente(levantamentos: readonly LevantamentoPessoa[] | undefined): LevantamentoPessoa | undefined {
  let melhor: LevantamentoPessoa | undefined;
  for (const l of levantamentos ?? []) if (melhor === undefined || l.data >= melhor.data) melhor = l;
  return melhor;
}
