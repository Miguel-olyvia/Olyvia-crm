// Os dados que a ficha real dá aos ecrãs do negócio (`DadosNegocio`, em negocio-metas): lê o que `neg_ficha_pessoa` devolve e entrega o que os
// painéis já sabiam mostrar (perdas, detalhes dos documentos) mais o que só a base sabe (documentos por ligar, leads abertas, permissões).
// Funções puras: nada rebenta com um valor que a ficha não conhece.
import type { DadosNegocio, DocumentoPorLigar, LeadAbertaCostura, MomentoGanhoCostura } from "@/components/negocio-metas/costuraNegocio";
import type {
  ContratoDetalhe, DetalheNegocio, EstadoOrcamentoDetalhe, OrcamentoDetalhe, PropostaDetalhe,
} from "@/components/negocio-metas/negocioDetalhes";
import type { PerdaNegocio } from "@/components/negocio-metas/negociosAlterados";
import type { FaseNaPerda } from "@/components/negocio-metas/percursoNegocio";
import { maisRecentePrimeiro, textoOuNull } from "./adaptarComum";
import { estadoContratoDeDb } from "./adaptarNegociosFicha";
import { adaptarRegistos } from "./adaptarRegistos";
import type { FichaDb, NegocioFichaDb } from "./fichaTipos";
import { propostaViva } from "./propostaViva";
import { diaLisboa } from "./tempoLisboa";

/** A fase em que a base diz que o negócio se perdeu, na linguagem do ecrã. As da abordagem (lead, contacto, visita) contam como a mais antiga que o ecrã tem. */
export function faseDaPerdaDaBase(fase: string | null | undefined): FaseNaPerda {
  if (fase === "levantamento" || fase === "orcamento" || fase === "proposta" || fase === "contrato") return fase;
  if (fase === "lead" || fase === "contacto" || fase === "visita") return "levantamento";
  return "orcamento";
}

function perdaDoNegocio(n: NegocioFichaDb): PerdaNegocio {
  const dia = diaLisboa(n.perdido_em) ?? diaLisboa(n.criado_em) ?? "";
  return { motivo: textoOuNull(n.motivo_perda) ?? "", mes: dia.slice(0, 7), data: dia, fase: faseDaPerdaDaBase(n.fase_perda) };
}

const ORCAMENTO_RASCUNHO = ["rascunho", "draft"];
const ORCAMENTO_ACEITE = ["aceite", "aceito", "accepted", "approved"];
const ORCAMENTO_RECUSADO = ["rejeitado", "recusado", "rejected", "declined", "lost"];

/** O estado de um orçamento; um valor que não se conhece conta como enviado (já saiu de rascunho, e não se sabe mais). */
function estadoDoOrcamento(estado: string | null): EstadoOrcamentoDetalhe {
  const s = (estado ?? "").trim().toLowerCase();
  if (ORCAMENTO_RASCUNHO.includes(s)) return "rascunho";
  if (ORCAMENTO_ACEITE.includes(s)) return "aceite";
  return ORCAMENTO_RECUSADO.includes(s) ? "recusado" : "enviado";
}

const SO_DIA = /^\d{4}-\d{2}-\d{2}/;

/** O dia (AAAA-MM-DD) de uma data (já só com dia) ou de um instante; `undefined` sem data. */
const diaOuUndefined = (valor: string | null | undefined): string | undefined =>
  valor && SO_DIA.test(valor) && valor.length === 10 ? valor : diaLisboa(valor) ?? undefined;

function detalheDoNegocio(n: NegocioFichaDb): DetalheNegocio | null {
  const orcamentos = n.orcamentos ?? [];
  const proposta = propostaViva(n);
  const contratos = maisRecentePrimeiro((n.contratos ?? []).filter((c) => estadoContratoDeDb(c) !== null), (c) => c.criado_em);
  if (orcamentos.length === 0 && !proposta && contratos.length === 0) return null;
  const detalhe: DetalheNegocio = {};
  if (orcamentos.length > 0) {
    detalhe.orcamentos = Object.fromEntries(orcamentos.map((o): [string, OrcamentoDetalhe] => [
      o.id, { data: diaLisboa(o.criado_em) ?? "", estado: estadoDoOrcamento(o.estado) },
    ]));
  }
  if (proposta) {
    const p: PropostaDetalhe = { orcamentoIds: orcamentos.map((o) => o.id) };
    const enviadaEm = diaLisboa(proposta.enviada_em);
    const validaAte = diaOuUndefined(proposta.valid_until);
    if (enviadaEm) p.enviadaEm = enviadaEm;
    if (validaAte) p.validaAte = validaAte;
    detalhe.proposta = p;
  }
  const contrato = contratos[0];
  if (contrato) {
    const c: ContratoDetalhe = { criadoEm: diaLisboa(contrato.criado_em) ?? "" };
    const assinadoEm = diaLisboa(contrato.assinado_em);
    if (assinadoEm) c.assinadoEm = assinadoEm;
    detalhe.contrato = c;
  }
  return detalhe;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Uma lista de documentos da ficha (formas por confirmar na base): só as entradas com id em texto. */
function documentosDe(lista: unknown, tipo: DocumentoPorLigar["tipo"]): DocumentoPorLigar[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((d): DocumentoPorLigar[] => {
    if (!ehObjeto(d) || typeof d.id !== "string" || d.id === "") return [];
    const numero = textoOuNull(d.numero) ?? d.id.slice(0, 8);
    // Um contrato só se liga com a confirmação da base de que tem orçamento ou proposta (senão a base recusa: NG014).
    return [{ tipo, id: d.id, numero, temBase: tipo === "contrato" ? d.tem_base === true : true }];
  });
}

function documentosPorLigar(ficha: FichaDb): DocumentoPorLigar[] {
  const docs: unknown = ficha.documentos_por_ligar;
  if (!ehObjeto(docs)) return [];
  return [...documentosDe(docs.orcamentos, "orcamento"), ...documentosDe(docs.propostas, "proposta"), ...documentosDe(docs.contratos, "contrato")];
}

function leadsAbertas(ficha: FichaDb): LeadAbertaCostura[] {
  return (ficha.leads_abertas ?? []).map((l) => ({
    id: l.id, criadaEm: diaLisboa(l.created_at) ?? "", encerrada: textoOuNull(l.closure_result) !== null,
    ...(l.created_at ? { instante: l.created_at } : {}),
  }));
}

/** Os dados do negócio para uma ficha. Não muda a ficha; cria objetos novos a cada chamada (quem os usa memoriza pelo resultado). */
export function adaptarDadosNegocio(ficha: FichaDb, momentoGanho: MomentoGanhoCostura | null): DadosNegocio {
  const itens = ficha.negocios?.itens ?? [];
  const detalhes = new Map(itens.map((n) => [n.id, detalheDoNegocio(n)]));
  return {
    registos: adaptarRegistos(ficha),
    alteracoes: {
      editados: {}, detalhes: {}, sequencia: 0,
      perdidos: Object.fromEntries(itens.filter((n) => n.estado === "perdido").map((n): [string, PerdaNegocio] => [n.id, perdaDoNegocio(n)])),
    },
    detalhe: (negocioId) => detalhes.get(negocioId) ?? null,
    momentoGanho, podeEditar: ficha.permissoes.editar === true, podeCriar: ficha.permissoes.criar === true,
    leadsAbertas: leadsAbertas(ficha), levantamentosCompletos: ficha.levantamentos?.tem_mais !== true, documentosPorLigar: documentosPorLigar(ficha),
  };
}
