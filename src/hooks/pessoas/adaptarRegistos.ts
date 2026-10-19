// Os registos da pessoa (contactos, visitas e levantamentos) da ficha real, no formato que a ficha do protótipo já lê.
// Mantém a ordem da base. As respostas do levantamento ficam por ler (são do P5).
import type { EstadoVisitaNegocio, TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import {
  RESULTADOS_VISITA, type ContactoPessoa, type LevantamentoPessoa, type RegistosDaPessoa, type ResultadoVisita, type VisitaPessoa,
} from "@/components/negocio-metas/registosTipos";
import { RESULTADOS_CONTACTO } from "@/components/pessoas/opcoesPessoa";
import { escolher, textoOuNull } from "./adaptarComum";
import type { ContactoFichaDb, FichaDb, LevantamentoFichaDb, LinhaLevantamentoDb, VisitaFichaDb } from "./fichaTipos";
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

/** draft, scheduled, confirmed, in_progress e rescheduled valem «por fazer»; completed vale «feita» (as canceladas nem vêm da base). */
function estadoDaVisita(status: string): EstadoVisitaNegocio {
  return status === "completed" ? "feita" : "porFazer";
}

function adaptarVisita(v: VisitaFichaDb, pessoaId: string): VisitaPessoa {
  const m = v.detalhes?.morada;
  const resultado: ResultadoVisita | null = escolher(v.resultado, RESULTADOS_VISITA);
  return {
    id: v.id,
    pessoaId,
    negocioId: v.negocio_id,
    data: diaLisboa(v.inicio) ?? "",
    hora: horaLisboa(v.inicio) ?? "",
    feitoPor: v.feito_por_nome?.trim() ?? "",
    estado: estadoDaVisita(v.status),
    tipo: escolher(v.tipo, TIPOS_VISITA) ?? "",
    quemVaiEstar: textoOuNull(v.detalhes?.presentes) ?? "",
    duracao: "",
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
  return {
    id: l.id,
    pessoaId,
    visitaId: l.visita_id,
    data: FORMATO_DIA.test(l.data) ? l.data : diaLisboa(l.data) ?? "",
    feitoPor: l.feito_por_nome?.trim() ?? "",
    rascunho: { linhas: linhasDoLevantamento(l), observacoes: l.notas?.trim() ?? "", respostas: {} },
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
