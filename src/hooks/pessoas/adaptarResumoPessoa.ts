// Passa uma linha de neg_resumo_pessoas para o tipo da Lista (puro, sem rede).
import type { FaseNegocio } from "@/components/negocio-metas/negocioMetas";
import type { EtapaPessoa, ResultadoEncerramento } from "@/components/pessoas/pessoasTipos";
import type { LinhaResumoDb, PessoaDaLista } from "./listaPessoasTipos";

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

function diasEntre(instante: string | null, hoje: string): number | null {
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

export function adaptarResumo(linha: LinhaResumoDb, hoje: string): PessoaDaLista {
  return {
    id: linha.entity_id,
    nome: linha.nome?.trim() ?? "",
    papel: linha.papel === "cliente" ? "cliente" : "lead",
    leadId: linha.lead_id,
    clienteId: linha.client_id,
    responsavelId: linha.assigned_to,
    etapa: escolher(linha.etapa, ETAPAS) ?? "nova",
    faseEtapa: escolher(linha.fase_mais_avancada, FASES),
    encerrada: escolher(linha.closure_result, ENCERRAMENTOS),
    abertos: linha.negocios_abertos,
    ganhos: linha.negocios_ganhos,
    perdidos: linha.negocios_perdidos,
    prontoAGanhar: linha.pronto_a_ganhar,
    valorEmJogo: numero(linha.valor_em_jogo),
    ultimoContactoEm: linha.ultimo_contacto_em,
    diasSemContacto: diasEntre(linha.ultimo_contacto_em, hoje),
    proximaVisitaEm: linha.proxima_visita_em,
  };
}
