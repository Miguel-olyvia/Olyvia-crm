// A atividade da ficha real: cada interação (`atividade.itens`) e cada evento dos negócios (`negocios.itens[].eventos`, os últimos 10 de
// cada um) passa a ItemAtividade, por ordem do mais recente para o mais antigo. Texto da aplicação vai por chave de tradução; o que a
// pessoa escreveu (nota, assunto, motivo «outro») vai como texto e nunca é tratado como chave.
//
// SUPOSIÇÃO POR CONFIRMAR NA BASE: os assuntos fixos das notas («Abordagem encerrada», «Abordagem reaberta» e «Contacto adiado») são os
// que o contrato diz que as funções neg_* escrevem; neg_registar_nota e neg_adiar_contacto (M8) ainda não estão aplicadas, por isso o
// de «Contacto adiado» é um palpite. Estão todos em `ASSUNTOS_SUPOSTOS`: uma nota com outro assunto é uma nota livre (nada se assume).
import { MOTIVOS_PERDA, RESULTADOS_CONTACTO } from "@/components/pessoas/opcoesPessoa";
import type { ItemAtividade, TipoAtividade } from "@/components/pessoas/pessoasTipos";
import { escolher, maisRecentePrimeiro, textoOuNull } from "./adaptarComum";
import type { AtividadeFichaDb, EventoNegocioDb, FichaDb } from "./fichaTipos";
import { diaLisboa, horaLisboa } from "./tempoLisboa";

const H = "pessoasPagina.real.ficha.activity.";
const CHAVE_NOTA = "pessoasPagina.activity.noteAdded";
const CHAVE_SEM_RESULTADO = "pessoasPagina.real.ficha.unknownResult";
const CHAVE_MOTIVO_OUTRO = "pessoasPagina.close.reason.other";

export const ASSUNTOS_SUPOSTOS = {
  encerrada: "Abordagem encerrada",
  reaberta: "Abordagem reaberta",
  adiado: "Contacto adiado",
} as const;

/** Os tipos de evento (de negócio) que aparecem como histórico, e a chave do título de cada um. Os outros (fases, criação) não entram. */
const EVENTOS: Readonly<Record<string, string>> = {
  perdeu: `${H}lost`, reabriu: `${H}reopened`, ganhou: `${H}won`, apagado: `${H}deleted`, restaurado: `${H}restored`,
};

type Parte = Pick<ItemAtividade, "tipo" | "titulo" | "chaveTitulo" | "detalhe" | "chaveMotivo">;

/** O motivo do encerramento (da lead) em chave traduzível e texto: um da lista, ou «outro» com o texto escrito. */
function motivoDoEncerramento(ficha: FichaDb): { chaveMotivo: string; texto: string | null } | null {
  const e = ficha.lead?.encerramento;
  if (!e) return null;
  const daLista = escolher(e.motivo, MOTIVOS_PERDA);
  if (daLista) return { chaveMotivo: `pessoasPagina.lost.${daLista}`, texto: null };
  return { chaveMotivo: CHAVE_MOTIVO_OUTRO, texto: textoOuNull(e.motivo_outro) };
}

function nota(a: AtividadeFichaDb, encerramento: ReturnType<typeof motivoDoEncerramento>): Parte {
  const detalhe = a.notas?.trim() ?? "";
  const base = { tipo: "historico" as const, titulo: "" };
  if (a.assunto === ASSUNTOS_SUPOSTOS.encerrada) {
    const chaveTitulo = "pessoasPagina.close.activity.closed";
    // Só a nota de encerrar mais recente leva o motivo da lead (é o encerramento que a ficha conhece).
    return encerramento
      ? { ...base, chaveTitulo, chaveMotivo: encerramento.chaveMotivo, detalhe: encerramento.texto ?? detalhe }
      : { ...base, chaveTitulo, detalhe };
  }
  if (a.assunto === ASSUNTOS_SUPOSTOS.reaberta) return { ...base, chaveTitulo: "pessoasPagina.close.activity.reopened", detalhe };
  if (a.assunto === ASSUNTOS_SUPOSTOS.adiado) return { ...base, chaveTitulo: `${H}snoozed`, detalhe };
  return { tipo: "nota", titulo: "", chaveTitulo: CHAVE_NOTA, detalhe };
}

function partes(a: AtividadeFichaDb, encerramento: ReturnType<typeof motivoDoEncerramento>): Parte {
  const detalhe = a.notas?.trim() ?? "";
  if (a.tipo === "call") {
    const resultado = escolher(a.resultado, RESULTADOS_CONTACTO);
    // Um resultado que a ficha não conhece não esconde a chamada: título neutro.
    return { tipo: "chamada", titulo: "", chaveTitulo: resultado ? `pessoasPagina.result.${resultado}` : CHAVE_SEM_RESULTADO, detalhe };
  }
  if (a.tipo === "note") return nota(a, encerramento);
  if (a.tipo === "email") return { tipo: "email" as TipoAtividade, titulo: textoOuNull(a.assunto) ?? "", chaveTitulo: undefined, detalhe };
  const chave = EVENTOS[a.tipo];
  if (chave) return { tipo: "historico", titulo: "", chaveTitulo: chave, detalhe };
  return { tipo: "historico", titulo: textoOuNull(a.assunto) ?? "", chaveTitulo: undefined, detalhe };
}

function dasInteracoes(ficha: FichaDb): { item: ItemAtividade; em: string | null }[] {
  const encerramento = motivoDoEncerramento(ficha);
  let encerramentoUsado = false;
  return (ficha.atividade?.itens ?? []).map((a) => {
    const ehEncerrar = a.tipo === "note" && a.assunto === ASSUNTOS_SUPOSTOS.encerrada;
    const motivo = ehEncerrar && !encerramentoUsado ? encerramento : null;
    if (ehEncerrar) encerramentoUsado = true;
    return {
      em: a.em,
      item: { id: a.id, pessoaId: ficha.pessoa.id, ...partes(a, motivo), quando: diaLisboa(a.em) ?? "", hora: horaLisboa(a.em) ?? undefined, exemplo: false },
    };
  });
}

function dosEventos(ficha: FichaDb): { item: ItemAtividade; em: string | null }[] {
  const lista: { item: ItemAtividade; em: string | null }[] = [];
  for (const negocio of ficha.negocios?.itens ?? []) {
    for (const e of negocio.eventos ?? []) {
      const chaveTitulo = EVENTOS[e.tipo];
      if (!chaveTitulo) continue;
      lista.push({ em: e.criado_em, item: {
        id: `evento-${e.id}`, pessoaId: ficha.pessoa.id, tipo: "historico", titulo: "", chaveTitulo, detalhe: detalheDoEvento(negocio.titulo, e),
        quando: diaLisboa(e.criado_em) ?? "", hora: horaLisboa(e.criado_em) ?? undefined, exemplo: false,
      } });
    }
  }
  return lista;
}

/** O nome do negócio e o motivo escrito (da perda ou da reabertura). */
const detalheDoEvento = (titulo: string | null, e: EventoNegocioDb): string =>
  [textoOuNull(titulo), textoOuNull(e.motivo) ?? textoOuNull(e.motivo_reabertura)].filter(Boolean).join(" · ");

export function adaptarAtividade(ficha: FichaDb): ItemAtividade[] {
  const todos = [...dasInteracoes(ficha), ...dosEventos(ficha)];
  return maisRecentePrimeiro(todos, (x) => x.em).map((x) => x.item);
}
