/**
 * As pecas puras do portal temporario da admissao (V3a): os tipos do contrato da Edge
 * `convite-admissao`, a vista que se mostra em cada caso, o prazo e o seu aviso, a faixa de
 * progresso, o e-mail mascarado, a passagem do que a `ler` devolve para o formulario do convite que
 * ja existia (rascunho, o que e editavel, NISS e IBAN guardados) e as mensagens de erro. Nada aqui
 * chama a rede nem toca em armazenamento (a sessao vive, so em memoria, em `portalSessao.ts`).
 *
 * O CONTRATO (supabase/functions/convite-admissao/accoesPortal.ts e handler.ts):
 *  - `estado` devolve so o minimo publico, SEM sessao: `ConvitePublico`;
 *  - `ler` (exige sessao) devolve `PortalLer`;
 *  - NUNCA se le `error.details`: o corpo de erro so traz `error` (codigo) e, no OTP, `restantes`.
 */
import { chaveDeErroAdmissao, motivoDoCodigo, type MotivoConvite, type TraduzirFn } from "@/lib/hr/errosAdmissao";
import { RASCUNHO_CONVITE_VAZIO, type RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";

// -- constantes (iguais as da base: ver H1 do desenho) -----------------------------

/** Intervalo minimo entre dois pedidos de codigo (a base recusa antes com `otp_espera`). */
export const ESPERA_REENVIO_MS = 60_000;
/** Tentativas de codigo por pedido; a 6.a da `otp_bloqueado`. */
export const TENTATIVAS_OTP = 5;
/** A sessao acaba apos 30 min sem actividade e, no maximo, 4 h depois de aberta. */
export const INATIVIDADE_MS = 30 * 60_000;
export const TETO_SESSAO_MS = 4 * 60 * 60_000;
/** O aviso de sessao a expirar comeca 5 min antes do fim. */
export const AVISO_EXPIRAR_MS = 5 * 60_000;
/** Menos de 2 dias para o prazo do link: aviso ambar. */
const DOIS_DIAS_MS = 2 * 24 * 60 * 60_000;

// -- tipos do contrato --------------------------------------------------------------

export interface ConvitePublico {
  existe: boolean;
  estado: string | null;
  estado_portal: string | null;
  valid_until: string | null;
  primeiro_nome: string | null;
  organizacao_nome: string | null;
  bloqueado: boolean;
  precisa_otp: boolean;
}

export interface DevolucaoPortal {
  campos: Record<string, string>;
  documentos: string[];
  observacao: string | null;
}

export interface AnexoPortal {
  id: string;
  tipo: string;
  nome: string;
  estado: string;
}

export interface PortalLer {
  estado: string | null;
  rascunho: Record<string, unknown> | null;
  campos_obrigatorios: string[];
  campos_editaveis: string[];
  documentos_editaveis: string[];
  niss_ultimos4: string | null;
  iban_ultimos4: string | null;
  devolucao: DevolucaoPortal | null;
  anexos: AnexoPortal[];
  rejeicao_mensagem: string | null;
}

// -- normalizar o que vem da Edge ---------------------------------------------------

function eObjecto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** So o minimo publico, com tipos certos; qualquer chave a mais que a Edge deixasse passar fica de fora. */
export function normalizarConvite(bruto: unknown): ConvitePublico {
  const o = eObjecto(bruto) ? bruto : {};
  return {
    existe: o.existe === true,
    estado: texto(o.estado),
    estado_portal: texto(o.estado_portal),
    valid_until: texto(o.valid_until),
    primeiro_nome: texto(o.primeiro_nome),
    organizacao_nome: texto(o.organizacao_nome),
    bloqueado: o.bloqueado === true,
    // Nunca por omissao: sem a certeza de que ha sessao valida, pede-se o codigo.
    precisa_otp: o.precisa_otp === true,
  };
}

function normalizarDevolucao(bruto: unknown): DevolucaoPortal | null {
  if (!eObjecto(bruto)) return null;
  const campos: Record<string, string> = {};
  if (eObjecto(bruto.campos)) {
    for (const [chave, comentario] of Object.entries(bruto.campos)) {
      if (typeof comentario === "string") campos[chave] = comentario;
    }
  }
  return { campos, documentos: listaDeTextos(bruto.documentos), observacao: texto(bruto.observacao) };
}

function normalizarAnexos(bruto: unknown): AnexoPortal[] {
  if (!Array.isArray(bruto)) return [];
  const anexos: AnexoPortal[] = [];
  for (const a of bruto) {
    if (!eObjecto(a) || typeof a.id !== "string") continue;
    anexos.push({ id: a.id, tipo: texto(a.tipo) ?? "", nome: texto(a.nome) ?? "", estado: texto(a.estado) ?? "" });
  }
  return anexos;
}

/** So as chaves documentadas da `ler`; o resto (um dia a Edge acrescentar algo) nao chega ao ecra. */
export function normalizarPortalLer(bruto: unknown): PortalLer {
  const o = eObjecto(bruto) ? bruto : {};
  return {
    estado: texto(o.estado),
    rascunho: eObjecto(o.rascunho) ? o.rascunho : null,
    campos_obrigatorios: listaDeTextos(o.campos_obrigatorios),
    campos_editaveis: listaDeTextos(o.campos_editaveis),
    documentos_editaveis: listaDeTextos(o.documentos_editaveis),
    niss_ultimos4: texto(o.niss_ultimos4),
    iban_ultimos4: texto(o.iban_ultimos4),
    devolucao: normalizarDevolucao(o.devolucao),
    anexos: normalizarAnexos(o.anexos),
    rejeicao_mensagem: texto(o.rejeicao_mensagem),
  };
}

// -- que vista se mostra ------------------------------------------------------------

/** Os estados em que a pessoa ainda edita (e por isso pede o codigo): convidada, em_preenchimento, devolvida. */
const ESTADOS_EDITAVEIS: readonly string[] = ["convidada", "em_preenchimento", "devolvida"];
/** Em curso mas fora das maos da pessoa: ve so o estado. */
const ESTADOS_EM_ANALISE: readonly string[] = [
  "submetida",
  "aprovada",
  "a_aguardar_assinaturas",
  "assinaturas_concluidas",
  "a_aguardar_ativacao",
];

export function estadoPermiteEditar(estado: string | null | undefined): boolean {
  return typeof estado === "string" && ESTADOS_EDITAVEIS.includes(estado);
}

export type VistaPortal =
  | "consulta"
  | "analise"
  | "invalido"
  | "revogado"
  | "encerrado"
  | "expirado"
  | "bloqueado"
  | "demasiadas";

const VISTA_POR_ERRO: Readonly<Record<string, VistaPortal>> = {
  convite_invalido: "invalido",
  convite_revogado: "revogado",
  convite_expirado: "expirado",
  convite_ja_usado: "encerrado",
  convite_bloqueado: "bloqueado",
  demasiadas_tentativas: "demasiadas",
};

/**
 * A vista de um link: o erro da Edge (se houve) ganha; depois o portal e o estado do processo.
 * Qualquer coisa que nao se perceba e "invalido": nunca se mostra uma consulta por omissao.
 */
export function vistaDoConvite(erro: string | null, convite: ConvitePublico | null): VistaPortal {
  if (erro) return VISTA_POR_ERRO[erro] ?? "invalido";
  if (!convite || !convite.existe) return "invalido";
  if (convite.bloqueado) return "bloqueado";
  if (convite.estado_portal === "expirado") return "expirado";
  if (convite.estado_portal === "revogado") return "revogado";
  if (convite.estado_portal === "encerrado") return "encerrado";
  if (estadoPermiteEditar(convite.estado)) return "consulta";
  if (convite.estado !== null && ESTADOS_EM_ANALISE.includes(convite.estado)) return "analise";
  return convite.estado === null ? "invalido" : "encerrado";
}

// -- prazo --------------------------------------------------------------------------

function milissegundosAte(validUntil: string | null, agora: Date): number | null {
  if (!validUntil) return null;
  const fim = new Date(validUntil).getTime();
  return Number.isNaN(fim) ? null : fim - agora.getTime();
}

/** Menos de 2 dias para o fim (e ainda por acabar): aviso ambar. */
export function prazoEmAviso(validUntil: string | null, agora: Date): boolean {
  const ms = milissegundosAte(validUntil, agora);
  return ms !== null && ms > 0 && ms < DOIS_DIAS_MS;
}

export type RestoDoPrazo = { tipo: "dias" | "horas" | "minutos" | "terminado"; n: number };

export function restoDoPrazo(validUntil: string | null, agora: Date): RestoDoPrazo {
  const ms = milissegundosAte(validUntil, agora);
  if (ms === null || ms <= 0) return { tipo: "terminado", n: 0 };
  const dia = 24 * 60 * 60_000;
  const hora = 60 * 60_000;
  if (ms >= dia) return { tipo: "dias", n: Math.floor(ms / dia) };
  if (ms >= hora) return { tipo: "horas", n: Math.floor(ms / hora) };
  return { tipo: "minutos", n: Math.max(1, Math.floor(ms / 60_000)) };
}

// -- progresso ----------------------------------------------------------------------

/** Os 4 passos da faixa: convite, preenchimento, analise do RH, contrato e activacao. */
export const PASSOS_PROGRESSO = ["convite", "preenchimento", "analise", "contrato"] as const;

const PASSO_POR_ESTADO: Readonly<Record<string, number>> = {
  convidada: 0,
  em_preenchimento: 1,
  devolvida: 1,
  submetida: 2,
  aprovada: 3,
  a_aguardar_assinaturas: 3,
  assinaturas_concluidas: 3,
  a_aguardar_ativacao: 3,
  // Tudo feito: o passo seguinte ao ultimo.
  concluida: PASSOS_PROGRESSO.length,
};

/** O passo actual (0 a 3), 4 quando tudo esta concluido, ou -1 se o estado nao tem lugar na faixa. */
export function passoDoProgresso(estado: string | null | undefined): number {
  return typeof estado === "string" && estado in PASSO_POR_ESTADO ? PASSO_POR_ESTADO[estado] : -1;
}

// -- e-mail mascarado ---------------------------------------------------------------

/**
 * `j***@dominio.pt`. A Edge nao manda o e-mail ao browser (e o do convite, fixado na base);
 * se um dia mandar um campo de e-mail, mascara-se aqui na mesma, para um endereco inteiro
 * nunca chegar ao ecra. O que ja vem mascarado (com `*`) fica como esta.
 */
export function mascararEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const email = valor.trim();
  const arroba = email.indexOf("@");
  if (arroba < 1 || arroba !== email.lastIndexOf("@") || arroba === email.length - 1) return null;
  const local = email.slice(0, arroba);
  if (local.includes("*")) return email;
  return `${local.length === 1 ? "*" : `${local[0]}***`}${email.slice(arroba)}`;
}

// -- rotulos dos campos do rascunho -------------------------------------------------

/**
 * O rascunho guarda chaves de dois vocabularios (as do ecra, `linha1`, e as do contrato,
 * `morada_linha1`). Cada uma que se mostra tem um texto que ja existe nas traducoes: o directo
 * (`hr.pendencias.campo.<chave>`) ou um destes. Uma chave sem texto nao se mostra: nao se
 * escreve um valor solto, sem dizer o que e.
 */
const ROTULO_DO_RASCUNHO: Readonly<Record<string, string>> = {
  morada_linha1: "hr.pendencias.campo.linha1",
  morada_codigo_postal: "hr.pendencias.campo.codigo_postal",
  morada_localidade: "hr.pendencias.campo.localidade",
  linha2: "hr.campos.linha2",
  morada_linha2: "hr.campos.linha2",
  distrito: "employees.form.district",
  morada_distrito: "employees.form.district",
  pais: "employees.form.country",
  morada_pais: "employees.form.country",
  carta_conducao_numero: "hr.campos.cartaConducaoNumero",
  carta_conducao_categorias: "hr.campos.cartaConducaoCategorias",
  carta_conducao_validade: "hr.campos.cartaConducaoValidade",
  conta_swift: "hr.pendencias.campo.conta_bic",
};

/** O texto de um campo do rascunho, ou `null` se nao ha nenhum (a chave nao se mostra). */
export function rotuloDoRascunho(t: TraduzirFn, chave: string): string | null {
  for (const candidata of [ROTULO_DO_RASCUNHO[chave], `hr.pendencias.campo.${chave}`]) {
    if (!candidata) continue;
    const texto = t(candidata);
    if (texto !== candidata) return texto;
  }
  return null;
}

// -- o formulario reutilizado: do que a `ler` devolve ao que o ecra do convite mostra ------

/**
 * O rascunho guarda chaves de dois vocabularios: as do ecra (`linha1`, `conta_bic`) e as do contrato
 * (`morada_linha1`, `conta_swift`). O formulario do convite (ConvitePagina1/2) usa as do ecra.
 */
const CAMPO_DO_ECRA_POR_CHAVE_DO_CONTRATO: Readonly<Record<string, keyof RascunhoConvite>> = {
  morada_linha1: "linha1",
  morada_linha2: "linha2",
  morada_codigo_postal: "codigo_postal",
  morada_localidade: "localidade",
  morada_distrito: "distrito",
  morada_pais: "pais",
  conta_swift: "conta_bic",
};

/** Nunca se restauram: NISS e IBAN vivem no cofre (so os 4 ultimos digitos chegam aqui) e a declaracao nunca se pre-assinala. */
const NUNCA_DO_RASCUNHO: ReadonlySet<string> = new Set(["niss", "iban", "conta_numero", "aceite"]);

function valorEmTexto(valor: unknown): string | null {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

/**
 * O rascunho que a `ler` devolveu, no formato do formulario do convite. A chave do ecra ganha a do
 * contrato quando vem as duas; o que nao e texto nem numero, e o que o formulario nao conhece, fica de
 * fora (nada de chaves soltas no ecra).
 */
export function rascunhoParaFormulario(bruto: Record<string, unknown> | null): RascunhoConvite {
  const formulario: Record<string, string | boolean> = { ...RASCUNHO_CONVITE_VAZIO };
  if (!bruto) return formulario as unknown as RascunhoConvite;
  const aplicar = (chave: string, destino: string) => {
    if (NUNCA_DO_RASCUNHO.has(destino) || !(destino in RASCUNHO_CONVITE_VAZIO)) return;
    const valor = valorEmTexto(bruto[chave]);
    if (valor !== null) formulario[destino] = valor;
  };
  for (const [chaveDoContrato, campo] of Object.entries(CAMPO_DO_ECRA_POR_CHAVE_DO_CONTRATO)) aplicar(chaveDoContrato, campo);
  for (const campo of Object.keys(RASCUNHO_CONVITE_VAZIO)) aplicar(campo, campo);
  return formulario as unknown as RascunhoConvite;
}

/** Marca de "ha um valor guardado no cofre" (sem digitos): so serve para o campo contar como preenchido. */
const GUARDADO_NO_COFRE = "\u2022";

/**
 * O NISS e o IBAN guardados no cofre contam como preenchidos para a obrigatoriedade, sem que o valor
 * (nem os 4 ultimos digitos) entre no rascunho. Devolve um rascunho novo; nunca altera o recebido.
 */
export function comSensiveisGuardados(rascunho: RascunhoConvite, dados: PortalLer): RascunhoConvite {
  return {
    ...rascunho,
    niss: rascunho.niss.trim() !== "" || !dados.niss_ultimos4 ? rascunho.niss : GUARDADO_NO_COFRE,
    conta_numero: rascunho.conta_numero.trim() !== "" || !dados.iban_ultimos4 ? rascunho.conta_numero : GUARDADO_NO_COFRE,
  };
}

/** A assinatura e a declaracao de veracidade pertencem a SUBMISSAO (V3b): ate la ficam inactivas. */
const CAMPOS_DA_SUBMISSAO: ReadonlySet<string> = new Set(["assinatura_nome", "aceite"]);

/** As chaves, na lista `campos_editaveis` da base, que abrem o mesmo campo do ecra. */
function chavesDaListaEditavel(campo: string): string[] {
  const doContrato = Object.entries(CAMPO_DO_ECRA_POR_CHAVE_DO_CONTRATO)
    .filter(([, ecra]) => ecra === campo)
    .map(([chave]) => chave);
  // No ecra o IBAN e o `conta_numero`; para a base e a chave `iban`.
  return [campo, ...doContrato, ...(campo === "conta_numero" ? ["iban"] : [])];
}

/**
 * O que o estado do processo deixa editar neste campo do formulario: a lista `campos_editaveis` da
 * base manda (todos em preenchimento; so os devolvidos em `devolvida`; nenhum nos outros estados).
 */
export function formularioEditavel(dados: PortalLer, campo: keyof RascunhoConvite): boolean {
  if (!estadoPermiteEditar(dados.estado) || CAMPOS_DA_SUBMISSAO.has(campo)) return false;
  return chavesDaListaEditavel(campo).some((chave) => dados.campos_editaveis.includes(chave));
}

/**
 * As vistas sem acesso (menos "em analise", que e do portal) mostram o cartao de link invalido que ja
 * existia, com o motivo que ja tinha.
 */
export function motivoDaVista(vista: Exclude<VistaPortal, "consulta" | "analise">): MotivoConvite {
  const codigo = Object.entries(VISTA_POR_ERRO).find(([, v]) => v === vista)?.[0] ?? null;
  return motivoDoCodigo(codigo);
}

// -- erros --------------------------------------------------------------------------

/**
 * Os codigos da Edge que o portal trata de forma propria (o resto do catalogo vem de
 * `errosAdmissao.ts`, o unico do cliente). Serve ao teste e a quem precisa de saber se um codigo
 * leva a sessao perdida, ao reenvio do codigo ou a um texto proprio.
 */
export const CODIGOS_DE_ERRO_DO_PORTAL: readonly string[] = [
  "otp_invalido",
  "otp_bloqueado",
  "otp_expirado",
  "otp_espera",
  "otp_limite_diario",
  "otp_indisponivel",
  "email_nao_enviado",
  "demasiadas_tentativas",
  "sessao_expirada",
  "sessao_ausente",
  "sessao_substituida",
  "campo_bloqueado",
  "estado_invalido",
  "niss_invalido",
  "iban_invalido",
  "pedido_invalido",
  "portal_em_atualizacao",
  "erro_inesperado",
];

/** Os tres codigos que acabam a sessao: o ecra volta a consulta. */
export const CODIGOS_DE_SESSAO_PERDIDA: readonly string[] = ["sessao_ausente", "sessao_expirada", "sessao_substituida"];

/**
 * Os textos que o portal diz de forma diferente do ecra do RH para o MESMO codigo: ao pedir o codigo,
 * `email_nao_enviado` e "o codigo nao saiu", nao "o convite nao chegou"; `pedido_invalido` nao tem
 * texto proprio no catalogo (erro de programacao) e a pessoa ouve que confira o que escreveu.
 */
const CHAVE_DO_PORTAL: Readonly<Record<string, string>> = {
  email_nao_enviado: "portal.erro.emailNaoEnviado",
  pedido_invalido: "portal.erro.pedidoInvalido",
};

/**
 * Sempre texto na lingua do ecra, nunca o codigo em bruto. O texto sai do catalogo que ja existia
 * (`chaveDeErroAdmissao`); so o codigo errado leva aqui a contagem das tentativas que restam. Um
 * codigo que nao se conhece da a mensagem generica.
 */
export function mensagemErroPortal(t: TraduzirFn, codigo: string | null, extra: { restantes?: number | null } = {}): string {
  if (codigo === "otp_invalido") {
    const r = extra.restantes;
    if (typeof r !== "number") return t("portal.erro.otpInvalidoSemContagem");
    if (r <= 0) return t("portal.erro.otpBloqueado");
    return r === 1 ? t("portal.erro.otpInvalidoUma") : t("portal.erro.otpInvalido", { n: r });
  }
  const propria = codigo ? CHAVE_DO_PORTAL[codigo] : undefined;
  if (propria) return t(propria);
  const entrada = codigo ? chaveDeErroAdmissao(codigo) : null;
  return t(entrada ? entrada.chave : "hr.convite.erro.inesperado");
}
