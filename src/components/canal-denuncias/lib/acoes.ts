// As ações do responsável do canal (e as respostas do denunciante) como funções puras: recebem uma denúncia e devolvem
// outra, ou um erro com código. A loja em memória limita-se a guardar o resultado.
import { motivoDeBloqueio } from "./conflito";
import { estaEmTratamento, estaFechada, podeTransitar } from "./estados";
import type {
  Anexo, Denuncia, EstadoDenuncia, EventoHistorico, Gravidade, ResultadoDenuncia, Responsavel,
} from "./tipos";

export const QUEM_DENUNCIANTE = "@denunciante";
export const MIN_MOTIVO_ARQUIVO = 3;

export type ErroAcao =
  | "transicao_invalida"
  | "denunciado"
  | "conflito"
  | "texto_vazio"
  | "motivo_curto"
  | "resultado_em_falta"
  | "fundamentacao_em_falta"
  | "fechada";

export type ResultadoAcao = { ok: true; denuncia: Denuncia } | { ok: false; erro: ErroAcao };

/** O contexto de cada ação: quem a faz, quando, e como se criam identificadores novos. */
export interface ContextoAcao {
  quem: string;
  /** AAAA-MM-DDTHH:MM */
  em: string;
  /** AAAA-MM-DD */
  hoje: string;
  novoId: () => string;
}

export interface DadosDecisao {
  resultado: ResultadoDenuncia | "";
  medidas: string;
  fundamentacao: string;
}

/** O código do erro de um resultado, ou null se a ação correu bem (a forma que funciona sem `strictNullChecks`). */
export const erroDe = (r: ResultadoAcao): ErroAcao | null => ("erro" in r ? r.erro : null);

const ok = (denuncia: Denuncia): ResultadoAcao => ({ ok: true, denuncia });
const falha = (erro: ErroAcao): ResultadoAcao => ({ ok: false, erro });

function comEvento(d: Denuncia, c: ContextoAcao, acao: string, detalhe?: string, quem = c.quem): Denuncia {
  const evento: EventoHistorico = { id: c.novoId(), em: c.em, quem, acao, ...(detalhe ? { detalhe } : {}) };
  return { ...d, historico: [...d.historico, evento] };
}

function mudarEstado(d: Denuncia, para: EstadoDenuncia, alteracoes: Partial<Denuncia>, c: ContextoAcao, acao: string, detalhe?: string): ResultadoAcao {
  if (!podeTransitar(d.estado, para)) return falha("transicao_invalida");
  return ok(comEvento({ ...d, ...alteracoes, estado: para }, c, acao, detalhe));
}

export function confirmarRececao(d: Denuncia, c: ContextoAcao): ResultadoAcao {
  return mudarEstado(d, "em_analise", { confirmadaEm: c.hoje }, c, "rececao_confirmada");
}

export function atribuirResponsavel(d: Denuncia, r: Responsavel, c: ContextoAcao): ResultadoAcao {
  const motivo = motivoDeBloqueio(d, r.id);
  if (motivo) return falha(motivo);
  if (d.responsavelId === r.id) return ok(d);
  return ok(comEvento({ ...d, responsavelId: r.id }, c, "responsavel_atribuido", r.nome));
}

/** Regista o conflito; se a pessoa era a responsável, o caso fica sem responsável. */
export function declararConflito(d: Denuncia, r: Responsavel, c: ContextoAcao): ResultadoAcao {
  if (d.conflitos.includes(r.id)) return ok(d);
  const libertar = d.responsavelId === r.id ? { responsavelId: null } : {};
  return ok(comEvento({ ...d, ...libertar, conflitos: [...d.conflitos, r.id] }, c, "conflito_declarado", r.nome));
}

export function enviarMensagem(d: Denuncia, texto: string, c: ContextoAcao): ResultadoAcao {
  if (estaFechada(d.estado)) return falha("fechada");
  if (!texto.trim()) return falha("texto_vazio");
  const mensagem = { id: c.novoId(), autor: "responsavel" as const, texto: texto.trim(), em: c.em, anexos: [] };
  return ok(comEvento({ ...d, mensagens: [...d.mensagens, mensagem] }, c, "mensagem_enviada"));
}

export function pedirInformacao(d: Denuncia, texto: string, c: ContextoAcao): ResultadoAcao {
  if (d.estado !== "em_analise") return falha("transicao_invalida");
  if (!texto.trim()) return falha("texto_vazio");
  const mensagem = { id: c.novoId(), autor: "responsavel" as const, texto: texto.trim(), em: c.em, anexos: [] };
  return mudarEstado(d, "mais_info", { mensagens: [...d.mensagens, mensagem] }, c, "informacao_pedida");
}

/** O denunciante responde (anónimo ou não). Se estávamos à espera dele, a análise retoma. */
export function responderDenunciante(d: Denuncia, texto: string, anexos: Anexo[], c: ContextoAcao): ResultadoAcao {
  if (estaFechada(d.estado)) return falha("fechada");
  if (!texto.trim() && anexos.length === 0) return falha("texto_vazio");
  const mensagem = { id: c.novoId(), autor: "denunciante" as const, texto: texto.trim(), em: c.em, anexos };
  const base = { ...d, mensagens: [...d.mensagens, mensagem] };
  const retoma = d.estado === "mais_info" ? { ...base, estado: "em_analise" as const } : base;
  return ok(comEvento(retoma, c, "denunciante_respondeu", undefined, QUEM_DENUNCIANTE));
}

export function alterarGravidade(d: Denuncia, g: Gravidade, c: ContextoAcao): ResultadoAcao {
  if (d.gravidade === g) return ok(d);
  return ok(comEvento({ ...d, gravidade: g }, c, "gravidade_alterada", g));
}

export function adicionarNota(d: Denuncia, texto: string, c: ContextoAcao): ResultadoAcao {
  if (!texto.trim()) return falha("texto_vazio");
  const nota = { id: c.novoId(), quem: c.quem, em: c.em, texto: texto.trim() };
  return ok(comEvento({ ...d, notas: [...d.notas, nota] }, c, "nota_adicionada"));
}

export function concluir(d: Denuncia, dados: DadosDecisao, c: ContextoAcao): ResultadoAcao {
  if (!estaEmTratamento(d.estado)) return falha("transicao_invalida");
  if (!dados.resultado) return falha("resultado_em_falta");
  if (!dados.fundamentacao.trim()) return falha("fundamentacao_em_falta");
  const decisao = {
    resultado: dados.resultado,
    medidas: dados.medidas.trim(),
    fundamentacao: dados.fundamentacao.trim(),
    em: c.em,
  };
  return mudarEstado(d, "concluida", { decisao }, c, "concluida", dados.resultado);
}

export function arquivar(d: Denuncia, motivo: string, c: ContextoAcao): ResultadoAcao {
  const limpo = motivo.trim();
  if (limpo.length < MIN_MOTIVO_ARQUIVO) return falha("motivo_curto");
  return mudarEstado(d, "arquivada", { motivoArquivo: limpo }, c, "arquivada", limpo);
}

export function reabrir(d: Denuncia, c: ContextoAcao): ResultadoAcao {
  const retoma = { decisao: null, motivoArquivo: null, confirmadaEm: d.confirmadaEm ?? c.hoje };
  return mudarEstado(d, "em_analise", retoma, c, "reaberta");
}
