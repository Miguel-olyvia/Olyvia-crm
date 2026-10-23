/**
 * A máquina de estados da ADMISSÃO de uma pessoa (de exemplo): funções puras, sem memória nem ecrã.
 *
 *   convite_enviado -> a_preencher -> submetida -> (devolvida -> a_preencher) | rejeitada | aprovada
 *   aprovada -> contrato_por_assinar -> contrato_assinado -> acesso_enviado -> acesso_ativo
 *
 * «Expirado» NÃO se guarda: deriva-se do prazo do login temporário (7 dias) e das fases em que a pessoa ainda precisa
 * dele (`ESTADOS_COM_LOGIN`). Renovar ou reenviar o link gera um login novo e invalida o anterior; devolver mantém o
 * mesmo login e renova o prazo. As credenciais só se enviam com o contrato assinado; rejeitar revoga o login.
 * Cada transição acrescenta um evento (quem, quando, motivo) ao histórico. Nada aqui envia nada a lado nenhum.
 */

export const DIAS_LOGIN = 7;
export const MIN_MOTIVO = 3;
const MS_DIA = 24 * 60 * 60 * 1000;

export type EstadoAdmissao =
  | "convite_enviado" | "a_preencher" | "submetida" | "devolvida" | "rejeitada" | "aprovada"
  | "contrato_por_assinar" | "contrato_assinado" | "acesso_enviado" | "acesso_ativo";

/** O estado que se mostra: os guardados mais «expirado», que se deriva do prazo. */
export type EstadoVisivel = EstadoAdmissao | "expirado";

export type AcaoAdmissao =
  | "convidar" | "abrir" | "retomar" | "submeter" | "devolver" | "rejeitar" | "aprovar" | "gerarContrato"
  | "recusarContrato" | "reenviarContrato" | "anularContrato" | "assinarContrato" | "enviarCredenciais"
  | "ativarAcesso" | "renovarLogin" | "reenviarLink";

export type ErroAdmissao =
  | "transicao_invalida" | "expirado" | "nao_expirado" | "motivo_curto" | "sem_comentarios" | "contrato_nao_assinado"
  | "nome_nao_confere" | "aceite_obrigatorio" | "role_obrigatorio" | "email_invalido" | "modelo_obrigatorio";

export interface LoginTemporario {
  token: string;
  criadoEm: string;
  expiraEm: string;
  revogadoEm: string | null;
  /** Links que já não servem (foram substituídos por este). */
  anteriores: string[];
}

export interface ContratoAdmissao {
  modeloId: string;
  documentoId: string | null;
  /** O texto do contrato como foi gerado (a pessoa lê este, mesmo que a ficha mude depois). */
  titulo: string;
  linhas: string[];
  geradoEm: string;
  recusa: { motivo: string; em: string } | null;
  assinadoEm: string | null;
  assinaturaNome: string | null;
}

export interface CredenciaisAdmissao {
  email: string;
  roleId: string;
  enviadasEm: string;
  ativoEm: string | null;
}

export interface EventoAdmissao {
  id: string;
  em: string;
  por: string;
  acao: AcaoAdmissao;
  para: EstadoAdmissao;
  motivo: string | null;
}

export interface Admissao {
  pessoaId: string;
  estado: EstadoAdmissao;
  /** O role previsto: o RH escolhe e confirma ao enviar as credenciais; a pessoa nunca escolhe. */
  roleId: string | null;
  emailConvite: string;
  login: LoginTemporario;
  /** O que a pessoa já escreveu (chaves do ecrã), para voltar dentro dos 7 dias. */
  rascunho: Record<string, unknown>;
  rascunhoEm: string | null;
  /** O que a pessoa submeteu (chaves do contrato do convite): é o que o RH revê e comenta. */
  dadosSubmetidos: Record<string, unknown>;
  submetidaEm: string | null;
  /** Comentários do RH por campo, da última devolução. */
  comentarios: Record<string, string>;
  motivoRejeicao: string | null;
  contrato: ContratoAdmissao | null;
  credenciais: CredenciaisAdmissao | null;
  historico: EventoAdmissao[];
}

export interface EntradaAdmissao {
  dados?: Record<string, unknown>;
  comentarios?: Record<string, string>;
  motivo?: string;
  modeloId?: string;
  documentoId?: string | null;
  titulo?: string;
  linhas?: string[];
  nome?: string;
  nomeEsperado?: string;
  aceite?: boolean;
  email?: string;
  roleId?: string;
}

export interface ContextoAdmissao {
  agora: Date;
  quem: string;
  novoToken: () => string;
}

// Os dois ramos trazem as duas propriedades (uma `undefined`): sem `strictNullChecks` o TypeScript não estreita só por `ok`.
export type ResultadoAdmissao =
  | { ok: true; admissao: Admissao; erro?: undefined }
  | { ok: false; erro: ErroAdmissao; admissao?: undefined };

/** As fases em que a pessoa ainda precisa do login temporário (e por isso este pode expirar). */
const ESTADOS_COM_LOGIN: readonly EstadoAdmissao[] = ["convite_enviado", "a_preencher", "devolvida", "contrato_por_assinar"];
/** As ações da própria pessoa, na página pública: exigem um login que ainda sirva. */
const ACOES_DA_PESSOA: readonly AcaoAdmissao[] = ["abrir", "retomar", "submeter", "recusarContrato", "assinarContrato"];

function somarDias(base: Date, dias: number): string {
  return new Date(base.getTime() + dias * MS_DIA).toISOString();
}

export function criarAdmissao(
  dados: { pessoaId: string; roleId: string | null; email: string; token: string },
  c: Pick<ContextoAdmissao, "agora" | "quem">,
): Admissao {
  const em = c.agora.toISOString();
  return {
    pessoaId: dados.pessoaId, estado: "convite_enviado", roleId: dados.roleId, emailConvite: dados.email,
    login: { token: dados.token, criadoEm: em, expiraEm: somarDias(c.agora, DIAS_LOGIN), revogadoEm: null, anteriores: [] },
    rascunho: {}, rascunhoEm: null, dadosSubmetidos: {}, submetidaEm: null, comentarios: {}, motivoRejeicao: null, contrato: null, credenciais: null,
    historico: [{ id: `${dados.pessoaId}-1`, em, por: c.quem, acao: "convidar", para: "convite_enviado", motivo: null }],
  };
}

export function estaExpirada(adm: Admissao, agora: Date): boolean {
  return ESTADOS_COM_LOGIN.includes(adm.estado) && adm.login.revogadoEm === null && agora.getTime() >= Date.parse(adm.login.expiraEm);
}

export function estadoVisivel(adm: Admissao, agora: Date): EstadoVisivel {
  return estaExpirada(adm, agora) ? "expirado" : adm.estado;
}

export type PrazoLogin = { tipo: "dias" | "horas"; n: number } | { tipo: "expirado" | "sem" };

/** Quanto resta ao login: em dias (arredondado para cima), em horas quando falta menos de um dia, ou expirado. */
export function prazoDoLogin(adm: Admissao, agora: Date): PrazoLogin {
  if (!loginServe(adm, agora, true)) return estaExpirada(adm, agora) ? { tipo: "expirado" } : { tipo: "sem" };
  const resta = Date.parse(adm.login.expiraEm) - agora.getTime();
  if (resta < MS_DIA) return { tipo: "horas", n: Math.max(1, Math.ceil(resta / (60 * 60 * 1000))) };
  return { tipo: "dias", n: Math.ceil(resta / MS_DIA) };
}

/** O login existe e não foi revogado; com `contarPrazo`, também tem de estar dentro do prazo. */
export function loginServe(adm: Admissao, agora: Date, contarPrazo = true): boolean {
  if (adm.login.revogadoEm !== null || adm.estado === "rejeitada" || adm.estado === "acesso_ativo") return false;
  return !contarPrazo || !estaExpirada(adm, agora);
}

function comEvento(adm: Admissao, acao: AcaoAdmissao, para: EstadoAdmissao, motivo: string | null, c: ContextoAdmissao): Admissao {
  const evento: EventoAdmissao = {
    id: `${adm.pessoaId}-${adm.historico.length + 1}`, em: c.agora.toISOString(), por: c.quem, acao, para, motivo,
  };
  return { ...adm, estado: para, historico: [...adm.historico, evento] };
}

function loginRenovado(l: LoginTemporario, c: ContextoAdmissao, novo: boolean): LoginTemporario {
  if (!novo) return { ...l, expiraEm: somarDias(c.agora, DIAS_LOGIN) };
  return {
    token: c.novoToken(), criadoEm: c.agora.toISOString(), expiraEm: somarDias(c.agora, DIAS_LOGIN), revogadoEm: null,
    anteriores: [...l.anteriores, l.token],
  };
}

const normalizar = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const motivoValido = (m: string | undefined): m is string => (m ?? "").trim().length >= MIN_MOTIVO;
const emailValido = (e: string | undefined): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e ?? "").trim());

type Alteracao = { para: EstadoAdmissao; patch?: Partial<Admissao>; motivo?: string | null };
type Manipulador = (adm: Admissao, e: EntradaAdmissao, c: ContextoAdmissao) => Alteracao | ErroAdmissao;

const DEVOLVER: Manipulador = (a, e, c) => {
  const comentarios = Object.fromEntries(Object.entries(e.comentarios ?? {}).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ""));
  if (Object.keys(comentarios).length === 0) return "sem_comentarios";
  return { para: "devolvida", patch: { comentarios, submetidaEm: null, login: loginRenovado(a.login, c, false) } };
};

const GERAR_CONTRATO: Manipulador = (a, e, c) => {
  if (!e.modeloId) return "modelo_obrigatorio";
  const contrato: ContratoAdmissao = {
    modeloId: e.modeloId, documentoId: e.documentoId ?? null, titulo: e.titulo ?? "", linhas: e.linhas ?? [], geradoEm: c.agora.toISOString(), recusa: null, assinadoEm: null, assinaturaNome: null,
  };
  return { para: "contrato_por_assinar", patch: { contrato, login: loginRenovado(a.login, c, false) } };
};

const ASSINAR: Manipulador = (a, e, c) => {
  if (!e.aceite) return "aceite_obrigatorio";
  if (!e.nome || !e.nomeEsperado || normalizar(e.nome) !== normalizar(e.nomeEsperado)) return "nome_nao_confere";
  const contrato = a.contrato && { ...a.contrato, recusa: null, assinadoEm: c.agora.toISOString(), assinaturaNome: e.nome.trim() };
  return { para: "contrato_assinado", patch: { contrato } };
};

const CREDENCIAIS: Manipulador = (a, e, c) => {
  if (!a.contrato?.assinadoEm) return "contrato_nao_assinado";
  if (!e.roleId) return "role_obrigatorio";
  if (!emailValido(e.email)) return "email_invalido";
  const credenciais = { email: (e.email ?? "").trim(), roleId: e.roleId, enviadasEm: c.agora.toISOString(), ativoEm: null };
  return { para: "acesso_enviado", patch: { credenciais, roleId: e.roleId } };
};

const NOVO_LINK: Manipulador = (a, _e, c) => ({ para: a.estado, patch: { login: loginRenovado(a.login, c, true) } });

/** Cada ação: de que estados parte e o que faz. `para` igual ao estado atual quer dizer «fica onde está». */
const ACOES: Record<Exclude<AcaoAdmissao, "convidar">, { de: readonly EstadoAdmissao[]; faz: Manipulador }> = {
  abrir: { de: ["convite_enviado"], faz: () => ({ para: "a_preencher" }) },
  retomar: { de: ["devolvida"], faz: () => ({ para: "a_preencher" }) },
  submeter: {
    de: ["convite_enviado", "a_preencher", "devolvida"],
    faz: (a, e, c) => ({
      para: "submetida",
      patch: { submetidaEm: c.agora.toISOString(), comentarios: {}, dadosSubmetidos: { ...a.dadosSubmetidos, ...e.dados } },
    }),
  },
  devolver: { de: ["submetida"], faz: DEVOLVER },
  rejeitar: {
    de: ["submetida"],
    faz: (a, e, c) => (motivoValido(e.motivo)
      ? { para: "rejeitada", motivo: e.motivo.trim(), patch: { motivoRejeicao: e.motivo.trim(), login: { ...a.login, revogadoEm: c.agora.toISOString() } } }
      : "motivo_curto"),
  },
  aprovar: { de: ["submetida"], faz: () => ({ para: "aprovada" }) },
  gerarContrato: { de: ["aprovada"], faz: GERAR_CONTRATO },
  recusarContrato: {
    de: ["contrato_por_assinar"],
    faz: (a, e, c) => (motivoValido(e.motivo) && a.contrato
      ? { para: a.estado, motivo: e.motivo.trim(), patch: { contrato: { ...a.contrato, recusa: { motivo: e.motivo.trim(), em: c.agora.toISOString() } } } }
      : "motivo_curto"),
  },
  reenviarContrato: {
    de: ["contrato_por_assinar"],
    faz: (a, e, c) => ({ para: a.estado, patch: { contrato: a.contrato && { ...a.contrato, recusa: null }, login: loginRenovado(a.login, c, true) }, motivo: e.motivo ?? null }),
  },
  anularContrato: {
    de: ["contrato_por_assinar"],
    faz: (_a, e) => (motivoValido(e.motivo) ? { para: "aprovada", motivo: e.motivo.trim(), patch: { contrato: null } } : "motivo_curto"),
  },
  assinarContrato: { de: ["contrato_por_assinar"], faz: ASSINAR },
  enviarCredenciais: { de: ["contrato_assinado"], faz: CREDENCIAIS },
  ativarAcesso: {
    de: ["acesso_enviado"],
    faz: (a, _e, c) => ({
      para: "acesso_ativo",
      patch: { login: { ...a.login, revogadoEm: c.agora.toISOString() }, credenciais: a.credenciais && { ...a.credenciais, ativoEm: c.agora.toISOString() } },
    }),
  },
  renovarLogin: { de: ESTADOS_COM_LOGIN, faz: NOVO_LINK },
  reenviarLink: { de: ESTADOS_COM_LOGIN, faz: NOVO_LINK },
};

/** Aplica uma ação. Nunca altera `adm`: devolve uma admissão nova ou o código do erro. */
export function aplicar(adm: Admissao, acao: Exclude<AcaoAdmissao, "convidar">, entrada: EntradaAdmissao, c: ContextoAdmissao): ResultadoAdmissao {
  const regra = ACOES[acao];
  if (acao === "enviarCredenciais" && !adm.contrato?.assinadoEm) return { ok: false, erro: "contrato_nao_assinado" };
  if (!regra.de.includes(adm.estado)) return { ok: false, erro: "transicao_invalida" };
  if (ACOES_DA_PESSOA.includes(acao) && !loginServe(adm, c.agora)) return { ok: false, erro: "expirado" };
  if (acao === "renovarLogin" && !estaExpirada(adm, c.agora)) return { ok: false, erro: "nao_expirado" };
  if (acao === "reenviarLink" && estaExpirada(adm, c.agora)) return { ok: false, erro: "expirado" };
  const feito = regra.faz(adm, entrada, c);
  if (typeof feito === "string") return { ok: false, erro: feito };
  const base = { ...adm, ...feito.patch };
  return { ok: true, admissao: comEvento(base, acao, feito.para, feito.motivo ?? entrada.motivo?.trim() ?? null, c) };
}

/** Grava o rascunho da pessoa; só se o login serve e a ficha ainda é dela (não submetida). */
export function guardarRascunho(adm: Admissao, rascunho: Record<string, unknown>, agora: Date): Admissao {
  const editavel = adm.estado === "convite_enviado" || adm.estado === "a_preencher" || adm.estado === "devolvida";
  return editavel && loginServe(adm, agora) ? { ...adm, rascunho, rascunhoEm: agora.toISOString() } : adm;
}

/** As ações que o RH pode fazer agora, por estado (o que a ficha e o pipeline oferecem). */
export function acoesPossiveis(adm: Admissao, agora: Date): AcaoAdmissao[] {
  const visivel = estadoVisivel(adm, agora);
  if (visivel === "expirado") return adm.estado === "contrato_por_assinar" ? ["renovarLogin", "anularContrato"] : ["renovarLogin"];
  switch (adm.estado) {
    case "convite_enviado": case "a_preencher": case "devolvida": return ["reenviarLink"];
    case "submetida": return ["aprovar", "devolver", "rejeitar"];
    case "aprovada": return ["gerarContrato"];
    case "contrato_por_assinar": return ["reenviarContrato", "anularContrato"];
    case "contrato_assinado": return ["enviarCredenciais"];
    case "acesso_enviado": return ["ativarAcesso"];
    default: return [];
  }
}

export type AcaoDaLinha = "rever" | "gerarContrato" | "enviarCredenciais" | "renovarLogin" | "reenviarLink" | "reenviarContrato" | "abrir";

/** A única ação que a linha compacta do pipeline mostra. */
export function acaoDaLinha(adm: Admissao, agora: Date): AcaoDaLinha {
  if (estaExpirada(adm, agora)) return "renovarLogin";
  const porEstado: Partial<Record<EstadoAdmissao, AcaoDaLinha>> = {
    submetida: "rever", aprovada: "gerarContrato", contrato_assinado: "enviarCredenciais", convite_enviado: "reenviarLink",
    a_preencher: "reenviarLink", devolvida: "reenviarLink", contrato_por_assinar: "reenviarContrato",
  };
  return porEstado[adm.estado] ?? "abrir";
}

export type VistaPublica = "invalida" | "revogada" | "encerrada" | "expirada" | "preencher" | "submetida" | "contrato" | "assinado";

/** O que a página pública do link mostra. `atual` diz se o token é o link em vigor (e não um que foi substituído). */
export function vistaPublica(adm: Admissao | null, atual: boolean, agora: Date): VistaPublica {
  if (!adm) return "invalida";
  if (!atual || adm.estado === "rejeitada") return "revogada";
  if (adm.estado === "acesso_ativo") return "encerrada";
  if (estaExpirada(adm, agora)) return "expirada";
  switch (adm.estado) {
    case "convite_enviado": case "a_preencher": case "devolvida": return "preencher";
    case "contrato_por_assinar": return "contrato";
    case "contrato_assinado": case "acesso_enviado": return "assinado";
    default: return "submetida";
  }
}

/** Os campos que o RH devolveu e a pessoa pode editar de novo; vazio = pode editar tudo. */
export function camposEditaveis(adm: Admissao): string[] | null {
  return Object.keys(adm.comentarios).length > 0 ? Object.keys(adm.comentarios) : null;
}

/** O passo atual da faixa de progresso (0 a 5): Convite, Ficha, Aprovação do RH, Contrato, Assinado, Acesso. */
export function passoDaFaixa(estado: EstadoAdmissao): number {
  const passos: Record<EstadoAdmissao, number> = {
    convite_enviado: 0, a_preencher: 1, devolvida: 1, submetida: 2, rejeitada: 2, aprovada: 3,
    contrato_por_assinar: 3, contrato_assinado: 4, acesso_enviado: 5, acesso_ativo: 5,
  };
  return passos[estado];
}
