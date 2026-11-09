/**
 * Ligacao entre as RPCs de desvios (`rpc_hr_desvios_*`, `rpc_hr_desvio_validar`) e o cliente: formas das linhas, conversao
 * para o que a fila e o relatorio usam, e os erros traduziveis. Funcoes puras, sem base.
 */
import { chaveDeDesvios, linhaDaChaveDeDesvios, type DesvioLido } from "@/lib/hr/desviosRelatorio";
import type { NaturezaDesvio } from "@/lib/hr/desvios";
import type { DesvioAValidar } from "@/lib/hr/filaDeTrabalho";

/** Uma linha de `rpc_hr_desvios_listar`. */
export interface LinhaDesvio {
  id: string;
  pessoa_id: string;
  data: string;
  estado: "a_validar" | "validado" | "substituido";
  natureza: NaturezaDesvio | null;
  tipo_horario: string | null;
  margem_min: number | null;
  planeado_min: number;
  realizado_min: number;
  fora_min: number;
  em_falta_min: number;
  diferenca_min: number;
  desvio_horario_min: number;
  /** `HH:MM:SS` do realizado em vigor hoje. */
  realizado_inicio: string | null;
  realizado_fim: string | null;
  decisao: "normal" | "hora_extra" | "aceitar_desvio" | null;
  /** So vem preenchido para quem pode gerir. */
  motivo: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  substitui_id: string | null;
  created_at: string;
}

/** A natureza que a base devolve, ou a que as medidas dizem quando ela falta. */
export function naturezaDaLinha(l: Pick<LinhaDesvio, "natureza" | "diferenca_min" | "desvio_horario_min">): NaturezaDesvio {
  if (l.natureza) return l.natureza;
  if (l.diferenca_min > 0) return "hora_extra";
  if (l.diferenca_min < 0) return "tempo_a_menos";
  return "desvio_horario";
}

/** Uma linha a validar, como item da fila: os minutos sao os da medida que fez dela um desvio. */
export function desvioParaFila(l: LinhaDesvio): DesvioAValidar {
  const natureza = naturezaDaLinha(l);
  return {
    id: l.id,
    pessoaId: l.pessoa_id,
    data: l.data,
    natureza,
    minutos: natureza === "desvio_horario" ? l.desvio_horario_min : Math.abs(l.diferenca_min),
    horaInicio: l.realizado_inicio,
    horaFim: l.realizado_fim,
    detalhe: null,
    planeadoMin: l.planeado_min,
    realizadoMin: l.realizado_min,
    diferencaMin: l.diferenca_min,
    desvioHorarioMin: l.desvio_horario_min,
    margemMin: l.margem_min,
  };
}

/** A linha em vigor (nao substituida) como o relatorio a usa; uma substituida devolve `null`. */
export function desvioLidoDaLinha(l: LinhaDesvio): DesvioLido | null {
  if (l.estado === "substituido") return null;
  return {
    id: l.id,
    estado: l.estado,
    natureza: naturezaDaLinha(l),
    decisao: l.decisao,
    planeado_min: l.planeado_min,
    realizado_min: l.realizado_min,
  };
}

/** `diferenca > margem`: so ai a decisao «hora extra» e possivel (a base recusa o resto). Sem margem conhecida, nao se bloqueia aqui. */
export const podeSerHoraExtra = (diferencaMin: number | undefined, margemMin: number | null | undefined): boolean =>
  diferencaMin === undefined || margemMin === null || margemMin === undefined ? true : diferencaMin > margemMin;

/* ------------------------------------------------------------------ erros */
const CODIGOS_CONHECIDOS: ReadonlySet<string> = new Set([
  "desvios_config_sem_sessao",
  "desvios_config_dados_em_falta",
  "desvios_config_sem_permissao",
  "desvios_config_fora_de_intervalo",
  "desvios_config_data_invalida",
  "desvios_config_versoes_sobrepostas",
  "desvios_config_historico_imutavel",
  "desvios_config_periodo_fechado",
  "desvios_config_data_anterior",
  "desvios_config_sem_utilizador",
  "desvios_sem_sessao",
  "desvios_sem_permissao",
  "desvios_sem_utilizador",
  "desvios_dados_invalidos",
  "desvios_data_invalida",
  "desvios_intervalo_excedido",
  "desvios_pessoa_invalida",
  "desvios_detecao_em_curso",
  "desvios_estado_invalido",
  "desvio_sem_sessao",
  "desvio_sem_permissao",
  "desvio_sem_utilizador",
  "desvio_validar_proprio",
  "desvio_nao_esta_a_validar",
  "desvio_decisao_invalida",
  "desvio_motivo_obrigatorio",
  "desvio_hora_extra_sem_tempo_a_mais",
  "pessoas_desvios_periodo_fechado",
  "pessoas_desvios_imutavel",
  "processamento_fechar_desvios_por_validar",
  "processamento_fechar_desvios_desactualizados",
]);

const PADRAO_CODIGO = /\b(?:desvios?_[a-z_]+|pessoas_desvios_[a-z_]+|processamento_fechar_desvios_[a-z_]+)/g;

/** O codigo do erro de uma RPC de desvios (prefixo da mensagem), `desvios_detecao_em_curso` pelo SQLSTATE 55P03, ou `null`. */
export function codigoDeErroDesvios(erro: unknown): string | null {
  const objecto = erro && typeof erro === "object" ? (erro as { message?: unknown; code?: unknown }) : null;
  const mensagem = typeof erro === "string" ? erro : typeof objecto?.message === "string" ? objecto.message : "";
  for (const candidato of mensagem.match(PADRAO_CODIGO) ?? []) {
    if (CODIGOS_CONHECIDOS.has(candidato)) return candidato;
  }
  if (objecto?.code === "55P03") return "desvios_detecao_em_curso";
  return null;
}

/**
 * A leitura falhou porque a RPC ainda nao existe nesta base (migration por aplicar). So conta quando a funcao em falta e a que se
 * chamou (`funcao`): um PGRST202 de outra funcao nao e «sem desvios» e nao se esconde.
 */
export function rpcDeDesviosIndisponivel(erro: unknown, funcao?: string): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  const texto = typeof message === "string" ? message : "";
  const ehDeFuncaoEmFalta = code === "PGRST202" || code === "42883" || /could not find the function|function .* does not exist/i.test(texto);
  if (!ehDeFuncaoEmFalta) return false;
  return funcao ? texto.includes(funcao) : /desvio/i.test(texto);
}

/** A chave de desvios de cada pessoa (versoes em vigor), a mesma que o relatorio calcula: serve para comparar no fecho. */
export function chavesDeDesviosPorPessoa(linhas: readonly LinhaDesvio[]): Map<string, string> {
  const porPessoa = new Map<string, string[]>();
  for (const l of linhas) {
    if (l.estado === "substituido") continue;
    porPessoa.set(l.pessoa_id, [...(porPessoa.get(l.pessoa_id) ?? []), linhaDaChaveDeDesvios(l.data, l.id, l.estado, l.decisao)]);
  }
  return new Map([...porPessoa].map(([pessoa, partes]) => [pessoa, chaveDeDesvios(partes)]));
}
export const CHAVE_ERRO_GENERICO_DESVIOS = "rhDesvios.erro.generico";

/** A chave de traducao do erro (`rhDesvios.erro.<codigo>`); sem codigo conhecido, a generica. */
export const chaveDoErroDesvios = (codigo: string | null): string =>
  codigo && CODIGOS_CONHECIDOS.has(codigo) ? `rhDesvios.erro.${codigo}` : CHAVE_ERRO_GENERICO_DESVIOS;

/** Todas as chaves de erro (para o teste das traducoes). */
export const CHAVES_DE_ERRO_DESVIOS: readonly string[] = [...CODIGOS_CONHECIDOS].map((c) => `rhDesvios.erro.${c}`).concat(CHAVE_ERRO_GENERICO_DESVIOS);
