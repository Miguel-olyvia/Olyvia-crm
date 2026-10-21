// Os registos da pessoa (contactos, visitas e levantamentos) da ficha real, no formato que a ficha do protótipo já lê.
// Mantém a ordem da base. As respostas do levantamento leem-se com o snapshot (`lerRespostasGravadas`): um texto por pergunta para o rascunho abrir
// preenchido, e as gravadas tal como estão para o formulário mostrar o que a pessoa viu (D5).
import type { EstadoVisitaNegocio, TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import {
  RESULTADOS_VISITA, type AgendaDaVisita, type ContactoPessoa, type LevantamentoPessoa, type RegistosDaPessoa, type ResultadoVisita, type VisitaPessoa,
} from "@/components/negocio-metas/registosTipos";
import { respostasDeGravadas } from "@/components/negocio-metas/respostasQuestionario";
import { RESULTADOS_CONTACTO } from "@/components/pessoas/opcoesPessoa";
import { escolher, textoOuNull } from "./adaptarComum";
import type { ContactoFichaDb, FichaDb, LevantamentoFichaDb, LinhaLevantamentoDb, VisitaFichaDb } from "./fichaTipos";
import { lerRespostasGravadas } from "./respostasGravadas";
import { diaLisboa, horaLisboa } from "./tempoLisboa";

const TIPOS_VISITA: readonly TipoVisitaNegocio[] = ["levantamento", "medicao", "materiais", "revisita"];
const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Um resultado que a ficha não conhece NÃO descarta o contacto (os totais deixavam de bater): fica sem resultado e a ficha mostra um texto neutro. */
function adaptarContacto(c: ContactoFichaDb, pessoaId: string): ContactoPessoa {
  const resultado = escolher(c.resultado, RESULTADOS_CONTACTO);
  return {
    id: c.id, pessoaId, data: diaLisboa(c.em) ?? "", hora: horaLisboa(c.em) ?? undefined, resultado, nota: c.notas?.trim() ?? "", negocioId: c.negocio_id,
  };
}

/**
 * cancelada=true ou cancelled valem «cancelada» (mesmo que o estado diga outra coisa: a marca da base manda); draft, scheduled, confirmed,
 * in_progress e rescheduled valem «por fazer»; completed vale «feita».
 */
function estadoDaVisita(v: Pick<VisitaFichaDb, "status" | "cancelada">): EstadoVisitaNegocio {
  if (v.cancelada === true || v.status === "cancelled") return "cancelada";
  return v.status === "completed" ? "feita" : "porFazer";
}

const MS_MINUTO = 60_000;
const CHAVE_DA_DURACAO: Readonly<Record<number, string>> = { 30: "m30", 60: "h1", 90: "h1m30", 120: "h2" };

/** Os minutos entre o início e o fim; `null` sem fim, com datas que não se leem ou com um fim que não vem depois do início. */
function duracaoEmMinutos(inicio: string, fim: string | null): number | null {
  if (!fim) return null;
  const minutos = (Date.parse(fim) - Date.parse(inicio)) / MS_MINUTO;
  return Number.isFinite(minutos) && minutos > 0 ? minutos : null;
}

/** O quadro, quem vai e a duração: o que «Alterar visita» precisa de reenviar à base. */
function agendaDaVisita(v: VisitaFichaDb, minutos: number | null): AgendaDaVisita {
  return {
    boardId: v.board_id ?? null,
    recursos: (v.recursos ?? []).map((r) => ({ id: r.id, nome: r.nome?.trim() ?? "" })),
    duracaoMinutos: minutos,
  };
}

function adaptarVisita(v: VisitaFichaDb, pessoaId: string): VisitaPessoa {
  const m = v.detalhes?.morada;
  const resultado: ResultadoVisita | null = escolher(v.resultado, RESULTADOS_VISITA);
  const minutos = duracaoEmMinutos(v.inicio, v.fim);
  return {
    id: v.id,
    pessoaId,
    negocioId: v.negocio_id,
    data: diaLisboa(v.inicio) ?? "",
    hora: horaLisboa(v.inicio) ?? "",
    feitoPor: v.feito_por_nome?.trim() ?? "",
    estado: estadoDaVisita(v),
    tipo: escolher(v.tipo, TIPOS_VISITA) ?? "",
    quemVaiEstar: textoOuNull(v.detalhes?.presentes) ?? "",
    duracao: minutos === null ? "" : CHAVE_DA_DURACAO[minutos] ?? "",
    agenda: agendaDaVisita(v, minutos),
    morada: {
      rua: textoOuNull(m?.rua) ?? (m ? "" : textoOuNull(v.local) ?? ""),
      codigoPostal: textoOuNull(m?.codigo_postal) ?? "",
      localidade: textoOuNull(m?.localidade) ?? "",
      andar: textoOuNull(m?.andar) ?? "",
    },
    igualALead: typeof v.detalhes?.igual_a_lead === "boolean" ? v.detalhes.igual_a_lead : null,
    nota: v.notas?.trim() ?? "",
    ...(resultado ? { resultado } : {}),
  };
}

function adaptarLinha(l: LinhaLevantamentoDb, id: string): LevantamentoPessoa["rascunho"]["linhas"][number] {
  const medida = l.medida === null || l.medida === undefined ? "" : String(l.medida);
  return {
    id, divisao: l.divisao ?? "", trabalho: l.trabalho ?? "", trabalhoOutro: l.trabalho_outro ?? "", medida,
    unidade: l.unidade ?? "m2", observacoes: l.observacoes ?? "",
  };
}

/** As linhas que a base deu; se `n_linhas` for maior (página parcial), completa com linhas vazias para a contagem da ficha ficar certa. */
function linhasDoLevantamento(l: LevantamentoFichaDb): LevantamentoPessoa["rascunho"]["linhas"] {
  const dadas = (l.linhas ?? []).map((x, i) => adaptarLinha(x, `${l.id}-${i}`));
  const falta = Math.max(0, (l.n_linhas ?? 0) - dadas.length);
  const vazias = Array.from({ length: falta }, (_, i) => adaptarLinha(
    { divisao: null, trabalho: null, trabalho_outro: null, medida: null, unidade: null, observacoes: null, ordem: null }, `${l.id}-${dadas.length + i}`,
  ));
  return [...dadas, ...vazias];
}

function adaptarLevantamento(l: LevantamentoFichaDb, pessoaId: string): LevantamentoPessoa {
  const gravadas = lerRespostasGravadas(l.respostas);
  return {
    id: l.id,
    pessoaId,
    visitaId: l.visita_id,
    data: FORMATO_DIA.test(l.data) ? l.data : diaLisboa(l.data) ?? "",
    feitoPor: l.feito_por_nome?.trim() ?? "",
    ...(l.estado === "feito" || l.estado === "por_fazer" ? { estado: l.estado === "feito" ? ("feito" as const) : ("porFazer" as const) } : {}),
    rascunho: {
      linhas: linhasDoLevantamento(l), observacoes: l.notas?.trim() ?? "", respostas: respostasDeGravadas(gravadas),
      ...(gravadas.length > 0 ? { gravadas } : {}),
    },
    negocioId: l.negocio_id,
  };
}

export function adaptarRegistos(ficha: FichaDb): RegistosDaPessoa {
  const pessoaId = ficha.pessoa.id;
  return {
    contactos: (ficha.contactos?.itens ?? []).map((c) => adaptarContacto(c, pessoaId)),
    visitas: (ficha.visitas?.itens ?? []).map((v) => adaptarVisita(v, pessoaId)),
    levantamentos: (ficha.levantamentos?.itens ?? []).map((l) => adaptarLevantamento(l, pessoaId)),
  };
}
