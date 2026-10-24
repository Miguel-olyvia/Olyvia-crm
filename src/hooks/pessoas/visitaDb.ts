// Da visita como o ecrã a vê para os parâmetros que neg_guardar_visita e neg_alterar_visita pedem. Funções puras, sem relógio nem rede.
// Os nomes e os limites vêm do contrato das funções (M3): nada aqui inventa um parâmetro.
import type { TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { textoMoradaVisita } from "@/components/pessoas/moradaVisita";
import type { MoradaVisita } from "@/components/pessoas/pessoasTipos";
import { textoOuNull } from "./adaptarComum";
import type { DetalhesVisitaDb } from "./fichaTipos";
import { instanteLisboa } from "./tempoLisboa";

// O fuso é sempre Europe/Lisbon (com a hora de verão); a conversão vive em tempoLisboa.ts.
export { instanteLisboa };

/** A duração de uma visita sem duração escolhida. */
export const DURACAO_OMISSAO_MIN = 60;

const MINUTOS_DA_DURACAO: Readonly<Record<string, number>> = { m30: 30, h1: 60, h1m30: 90, h2: 120 };
const PRESENTES_VALIDOS: readonly string[] = ["cliente", "casal", "familia", "outra"];
const CODIGO_POSTAL = /^\d{4}-\d{3}$/;
const MS_MINUTO = 60_000;

// Limites da base (em caracteres, como o `char_length` do Postgres).
const MAX_TITULO = 200;
const MAX_LOCAL = 500;
const MAX_RUA = 300;
const MAX_LOCALIDADE = 120;
const MAX_ANDAR = 60;
// A base recusa detalhes com mais de 2000 octetos (do texto do jsonb, que leva um espaço depois de cada «:» e «,»).
const MAX_OCTETOS_DETALHES = 2000;

/** Corta ao limite em pontos de código (nunca a meio de um par de substitutos). */
const cortar = (texto: string, limite: number): string => Array.from(texto).slice(0, limite).join("");

/** Os minutos de uma duração (a chave `m30`, `h1`...); vazia vale a duração por omissão; desconhecida dá `null`. */
export function minutosDaDuracao(chave: string): number | null {
  if (chave === "") return DURACAO_OMISSAO_MIN;
  return MINUTOS_DA_DURACAO[chave] ?? null;
}

/** O que a morada, «igual à da lead» e «quem vai estar» deixam dito (os detalhes da visita). */
export interface DadosDetalhesVisita {
  morada?: MoradaVisita | null;
  igualALead?: boolean | null;
  quemVaiEstar?: string | null;
}

function paraMoradaDb(m: MoradaVisita | null | undefined): NonNullable<DetalhesVisitaDb["morada"]> | null {
  if (!m) return null;
  const rua = textoOuNull(m.rua);
  const cp = textoOuNull(m.codigoPostal);
  const localidade = textoOuNull(m.localidade);
  const andar = textoOuNull(m.andar);
  const morada = {
    ...(rua ? { rua: cortar(rua, MAX_RUA) } : {}),
    ...(cp && CODIGO_POSTAL.test(cp) ? { codigo_postal: cp } : {}),
    ...(localidade ? { localidade: cortar(localidade, MAX_LOCALIDADE) } : {}),
    ...(andar ? { andar: cortar(andar, MAX_ANDAR) } : {}),
  };
  return Object.keys(morada).length > 0 ? morada : null;
}

const octetos = (texto: string): number => new TextEncoder().encode(texto).length;

/** Cabem na base? Conta o JSON compacto mais um espaço por separador (a margem do `::text` do jsonb). */
function cabeNosDetalhes(d: DetalhesVisitaDb): boolean {
  const json = JSON.stringify(d);
  const separadores = (json.match(/[:,]/g) ?? []).length;
  return octetos(json) + separadores <= MAX_OCTETOS_DETALHES;
}

/**
 * Os detalhes (`p_detalhes`) de uma visita. Só leva o que tem valor: nunca texto vazio (a base dá NG009 num código postal ou num
 * «presentes» vazios). Código postal fora do formato `0000-000` fica de fora; `presentes` só se for uma das quatro chaves. Devolve
 * `null` quando não sobra nada. Se passar dos 2000 octetos larga a morada (o texto dela já vai em `p_local`).
 */
export function paraDetalhesVisita(d: DadosDetalhesVisita): DetalhesVisitaDb | null {
  const morada = paraMoradaDb(d.morada);
  const presentes = textoOuNull(d.quemVaiEstar);
  const detalhes: DetalhesVisitaDb = {
    ...(morada ? { morada } : {}),
    ...(typeof d.igualALead === "boolean" ? { igual_a_lead: d.igualALead } : {}),
    ...(presentes && PRESENTES_VALIDOS.includes(presentes) ? { presentes } : {}),
  };
  const final = cabeNosDetalhes(detalhes) ? detalhes : { ...detalhes, morada: undefined };
  const limpo: DetalhesVisitaDb = JSON.parse(JSON.stringify(final));
  return Object.keys(limpo).length > 0 ? limpo : null;
}

/** O que o formulário de uma visita dá (marcar ou alterar). */
export interface EntradaVisita {
  boardId: string | null;
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; obrigatória. */
  hora: string;
  /** A chave da duração (`m30`, `h1`, `h1m30`, `h2`); vazia vale 60 min. */
  duracao: string;
  /** Uma duração que não é nenhuma das chaves (uma visita da base com 45 min): preserva-se tal e qual e manda sobre `duracao`. */
  duracaoMinutos?: number;
  /** Os recursos (`schedule_resources.id`) que vão à visita; nunca vazio. */
  recursos: readonly string[];
  tipo: TipoVisitaNegocio | "";
  /** Já composto («Levantamento · Ana Lopes»). */
  titulo: string;
  nota: string;
  morada: MoradaVisita;
  igualALead: boolean | null;
  quemVaiEstar: string;
  /** Só ao marcar: o negócio aberto a que a visita já nasce ligada. */
  negocioId?: string | null;
}

export type ErroEntradaVisita = "horaInvalida" | "duracaoInvalida" | "recursoEmFalta" | "quadroEmFalta" | "visitaEmFalta";

export type ResultadoParams = { ok: true; params: Record<string, unknown> } | { ok: false; erro: ErroEntradaVisita };

const recusa = (erro: ErroEntradaVisita): ResultadoParams => ({ ok: false, erro });

/** Os recursos sem repetidos nem vazios, pela ordem em que vieram. */
const recursosLimpos = (recursos: readonly string[]): string[] => Array.from(new Set(recursos.filter((r) => r.trim() !== "")));

/** O fim: o início mais a duração (soma de instantes, por isso certa mesmo quando a hora de Lisboa muda a meio). */
function fimDaVisita(inicio: string, e: EntradaVisita): string | null {
  const minutos = e.duracaoMinutos ?? minutosDaDuracao(e.duracao);
  if (minutos === null || !Number.isFinite(minutos) || minutos <= 0) return null;
  return new Date(Date.parse(inicio) + minutos * MS_MINUTO).toISOString();
}

type Comuns = { erro: ErroEntradaVisita } | { campos: Record<string, unknown>; recursos: string[] };

/** O que marcar e alterar enviam por igual: quadro, horas, textos, tipo e detalhes. */
function camposComuns(e: EntradaVisita): Comuns {
  if (!e.boardId) return { erro: "quadroEmFalta" };
  const inicio = instanteLisboa(e.data, e.hora);
  if (!inicio) return { erro: "horaInvalida" };
  const fim = fimDaVisita(inicio, e);
  if (!fim) return { erro: "duracaoInvalida" };
  const recursos = recursosLimpos(e.recursos);
  if (recursos.length === 0) return { erro: "recursoEmFalta" };
  const titulo = textoOuNull(e.titulo);
  const local = textoOuNull(textoMoradaVisita(e.morada));
  return {
    recursos,
    campos: {
      p_board_id: e.boardId, p_inicio: inicio, p_fim: fim,
      p_titulo: titulo === null ? null : cortar(titulo, MAX_TITULO),
      p_notas: textoOuNull(e.nota),
      p_local: local === null ? null : cortar(local, MAX_LOCAL),
      p_visit_kind: e.tipo === "" ? null : e.tipo,
      p_detalhes: paraDetalhesVisita({ morada: e.morada, igualALead: e.igualALead, quemVaiEstar: e.quemVaiEstar }),
    },
  };
}

/**
 * Os parâmetros de `neg_guardar_visita`. Nunca leva `p_recursos` nulo (a base usaria ou criaria o recurso de quem marca): sem recursos
 * recusa. Pessoas não geocodifica: `p_lat` e `p_lng` vão a NULL e a deslocação conta 0.
 */
export function paraGuardarVisita(organizationId: string, pessoaId: string, e: EntradaVisita): ResultadoParams {
  const c = camposComuns(e);
  if ("erro" in c) return recusa(c.erro);
  return {
    ok: true,
    params: {
      p_organization_id: organizationId, p_entity_id: pessoaId, ...c.campos, p_lat: null, p_lng: null,
      p_recursos: c.recursos, p_negocio_id: e.negocioId ?? null,
    },
  };
}

const mesmosRecursos = (a: readonly string[], b: readonly string[]): boolean => {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/**
 * Os parâmetros de `neg_alterar_visita`: REENVIA todos os campos (a base apaga os que vêm a NULL: notas, local, tipo e detalhes). Com a mesma
 * lista de recursos que a visita já tem (`recursosAtuais`) envia `p_recursos` a NULL: a base não revalida nem toca no responsável da lead.
 */
export function paraAlterarVisita(visitaId: string, e: EntradaVisita, recursosAtuais?: readonly string[]): ResultadoParams {
  if (!visitaId) return recusa("visitaEmFalta");
  const c = camposComuns(e);
  if ("erro" in c) return recusa(c.erro);
  const iguais = recursosAtuais !== undefined && mesmosRecursos(c.recursos, recursosLimpos(recursosAtuais));
  return { ok: true, params: { p_visita_id: visitaId, ...c.campos, p_recursos: iguais ? null : c.recursos } };
}
