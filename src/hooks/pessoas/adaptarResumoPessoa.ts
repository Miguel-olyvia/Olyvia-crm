// Passa uma linha de neg_resumo_pessoas para o tipo da Lista (puro, sem rede).
import type { FaseNegocio } from "@/components/negocio-metas/negocioMetas";
import { RESULTADOS_CONTACTO } from "@/components/pessoas/opcoesPessoa";
import type { EtapaPessoa, QualificacaoPessoa, ResultadoContacto, ResultadoEncerramento } from "@/components/pessoas/pessoasTipos";
import type { LinhaResumoDb, PessoaDaLista } from "./listaPessoasTipos";
import { passoDaLista } from "./passoDaLista";

const ETAPAS: readonly EtapaPessoa[] = ["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"];
const FASES: readonly FaseNegocio[] = ["orcamento", "proposta", "contrato"];
const ENCERRAMENTOS: readonly ResultadoEncerramento[] = ["semInteresse", "obraInviavel"];
const MS_POR_DIA = 86_400_000;

const formatoLisboa = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** O dia de Lisboa (AAAA-MM-DD) de um instante; nunca o de UTC. */
export function hojeLisboa(agora: Date = new Date()): string {
  const partes = formatoLisboa.formatToParts(agora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function emDias(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / MS_POR_DIA;
}

export function diasEntre(instante: string | null, hoje: string): number | null {
  if (!instante) return null;
  const quando = new Date(instante);
  if (Number.isNaN(quando.getTime())) return null;
  return Math.max(0, emDias(hoje) - emDias(hojeLisboa(quando)));
}

function escolher<T extends string>(valor: string | null, aceites: readonly T[]): T | null {
  return aceites.find((a) => a === valor) ?? null;
}

function numero(valor: number | string | null): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** O selo MQL/SQL aparece sempre que a lead tem classificação, seja qual for o estado dela (decisão do produto: o fluxo de Pessoas difere do de Leads). */
function qualificacaoDe(tipo: string | null | undefined): QualificacaoPessoa | null {
  const limpo = tipo?.trim().toUpperCase();
  return limpo === "MQL" || limpo === "SQL" ? limpo : null;
}

const instante = (valor: string | null | undefined): number | null => {
  if (!valor) return null;
  const t = new Date(valor).getTime();
  return Number.isNaN(t) ? null : t;
};

/** O último contacto é o MAIOR entre as duas fontes (chamada registada e contacto guardado na lead); uma data ilegível não conta. */
function maisRecente(a: string | null | undefined, b: string | null | undefined): string | null {
  const ta = instante(a);
  const tb = instante(b);
  if (ta === null) return tb === null ? null : (b ?? null);
  if (tb === null) return a ?? null;
  return tb > ta ? (b ?? null) : (a ?? null);
}

/** Um dos cinco da chamada, «outro» para o que as Leads guardam (id de resultado, texto livre), ou nada. */
function resultadoDe(valor: string | null | undefined): ResultadoContacto | "outro" | null {
  const limpo = valor?.trim();
  // «semContacto» não é um resultado de chamada: quem nunca foi contactado diz-se pela data (vistaDaLista), nunca por este campo.
  if (!limpo || limpo === "semContacto") return null;
  return RESULTADOS_CONTACTO.find((r) => r === limpo) ?? "outro";
}

export function adaptarResumo(linha: LinhaResumoDb, hoje: string): PessoaDaLista {
  const encerrada = escolher(linha.closure_result, ENCERRAMENTOS);
  const faseEtapa = escolher(linha.fase_mais_avancada, FASES);
  const porLigarContactos = numero(linha.por_ligar_contactos);
  const porLigarVisitas = numero(linha.por_ligar_visitas);
  const porLigarLevantamentos = numero(linha.por_ligar_levantamentos);
  const ultimoContacto = maisRecente(linha.ultimo_contacto_em, linha.ultimo_contacto_lead_em);
  return {
    id: linha.entity_id,
    nome: linha.nome?.trim() ?? "",
    papel: linha.papel === "cliente" ? "cliente" : "lead",
    leadId: linha.lead_id,
    clienteId: linha.client_id,
    responsavelId: linha.assigned_to,
    etapa: escolher(linha.etapa, ETAPAS) ?? "nova",
    faseEtapa,
    encerrada,
    abertos: linha.negocios_abertos,
    ganhos: linha.negocios_ganhos,
    perdidos: linha.negocios_perdidos,
    prontoAGanhar: linha.pronto_a_ganhar,
    valorEmJogo: numero(linha.valor_em_jogo),
    ultimoContactoEm: ultimoContacto,
    diasSemContacto: diasEntre(ultimoContacto, hoje),
    proximaVisitaEm: linha.proxima_visita_em,
    leadStatus: linha.lead_status ?? null,
    ultimaVisitaFeitaEm: linha.ultima_visita_feita_em ?? null,
    ultimoNegocioEm: linha.ultimo_negocio_em ?? null,
    porLigarContactos,
    porLigarVisitas,
    porLigarLevantamentos,
    passo: passoDaLista({
      encerrada, abertos: linha.negocios_abertos, ganhos: linha.negocios_ganhos, perdidos: linha.negocios_perdidos, faseEtapa,
      prontoAGanhar: linha.pronto_a_ganhar, ultimaVisitaFeitaEm: linha.ultima_visita_feita_em ?? null,
      ultimoNegocioEm: linha.ultimo_negocio_em ?? null, porLigarContactos, porLigarVisitas, porLigarLevantamentos,
    }),
    criadoEm: linha.criado_em ?? null,
    qualificacao: qualificacaoDe(linha.qualificacao_tipo),
    voltou: linha.voltou_a_contactar ?? null,
    atrasada: linha.atrasada ?? null,
    origem: linha.origem ?? null,
    campanhaId: linha.campanha_id ?? null,
    campanha: linha.campanha ?? null,
    formulario: linha.formulario ?? null,
    ultimoResultado: resultadoDe(linha.ultimo_resultado),
  };
}
