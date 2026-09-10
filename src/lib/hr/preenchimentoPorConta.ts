/**
 * O calculo puro de "escolher uma conta preenche estes campos".
 *
 * NAO ha React nem acesso a base aqui -- so as regras de preenchimento
 * decididas no plano, para poderem ser testadas sem montar um formulario.
 *
 * A REGRA QUE GOVERNA TUDO: NUNCA ESCREVER POR CIMA DE UMA ESCOLHA
 * ------------------------------------------------------------------
 * Um campo so e preenchido se estiver vazio OU se o valor que la esta for
 * EXACTAMENTE o que uma conta anterior tinha escrito (`autoAnterior`). Tudo o
 * resto e escrita deliberada e fica. `tocados` (o mecanismo de Campos.tsx) NAO
 * chega para isto: um campo escrito e nunca desfocado nao esta em `tocados`, e
 * um campo preenchido pelo codigo e depois desfocado esta -- por isso este
 * modulo guarda o SEU PROPRIO registo do que foi palpite (`autoAnterior` /
 * `autoNovo`), independente de `tocados`.
 *
 * TROCAR DE CONTA: reverter primeiro, preencher depois
 * ------------------------------------------------------
 * `reverterAutoPreenchido` limpa so os campos cujo valor actual ainda e
 * exactamente o que a conta ANTERIOR la tinha posto. Chama-se antes de
 * `preenchimentoDaConta` da conta nova (ou sozinha, ao limpar a escolha).
 * Simetrico, e nunca apaga uma letra escrita por alguem.
 */

export interface ContaParaPreencher {
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  location: string | null;
}

export interface LocalParaCorrespondencia {
  id: string;
  nome: string;
}

export interface CamposPreenchiveis {
  primeiro_nome: string;
  apelido: string;
  email_trabalho: string;
  telefone_trabalho: string;
  cargo: string;
  local_id: string;
}

export interface AvisoPreenchimento {
  campoId: string;
  mensagemKey: string;
  parametros?: Record<string, string>;
}

export interface ResultadoPreenchimento {
  patchGeral: Partial<
    Pick<CamposPreenchiveis, "primeiro_nome" | "apelido" | "email_trabalho" | "telefone_trabalho">
  >;
  patchLaborais: Partial<Pick<CamposPreenchiveis, "cargo" | "local_id">>;
  /** O que a conta escreveu em cada campo que ela conseguiu preencher, para a
   * proxima troca de conta saber o que reverter. So entram aqui os campos
   * efectivamente aplicados -- um campo recusado por estar escrito a mao NAO
   * entra, porque nao foi a conta que la pos o valor. */
  autoNovo: Record<string, string>;
  avisos: AvisoPreenchimento[];
}

export const CAMPO_PRIMEIRO_NOME = "hr-novo-primeiro-nome";
export const CAMPO_APELIDO = "hr-novo-apelido";
export const CAMPO_EMAIL_TRABALHO = "hr-novo-email-trabalho";
export const CAMPO_TELEFONE_TRABALHO = "hr-novo-telefone-trabalho";
export const CAMPO_CARGO = "hr-novo-cargo";
export const CAMPO_LOCAL = "hr-novo-local";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NomeDividido {
  primeiroNome: string;
  apelido: string;
  umaSoPalavra: boolean;
}

/**
 * Parte `anew_users.name` no ULTIMO espaco. Acerta na maioria, falha em nomes
 * com varios apelidos ("Maria do Carmo Silva Pereira") -- e por isso quem
 * chama isto tem SEMPRE de mostrar o palpite e deixa-lo corrigivel, nunca
 * guarda-lo calado.
 */
export function dividirNome(name: string): NomeDividido | null {
  const limpo = name.trim().replace(/\s+/g, " ");
  if (limpo === "") return null;

  const ultimoEspaco = limpo.lastIndexOf(" ");
  if (ultimoEspaco === -1) {
    return { primeiroNome: limpo, apelido: "", umaSoPalavra: true };
  }
  return {
    primeiroNome: limpo.slice(0, ultimoEspaco),
    apelido: limpo.slice(ultimoEspaco + 1),
    umaSoPalavra: false,
  };
}

/** Um campo so e sobrescrevivel se estiver vazio ou se ainda tiver o palpite
 * anterior -- nunca se tiver uma escrita deliberada. */
function podeEscrever(valorActual: string, valorAutoAnterior: string | undefined): boolean {
  const actual = valorActual.trim();
  if (actual === "") return true;
  return valorAutoAnterior !== undefined && valorActual === valorAutoAnterior;
}

/**
 * Encontra, por correspondencia EXACTA (aparada, sem distinguir maiusculas),
 * o local cujo nome bate com o texto livre `anew_users.location`. Nunca cria
 * um local novo, e nunca escolhe entre duas correspondencias.
 */
function localCorrespondente(
  location: string,
  locais: readonly LocalParaCorrespondencia[],
): LocalParaCorrespondencia | null {
  const alvo = location.trim().toLowerCase();
  if (alvo === "") return null;
  const encontrados = locais.filter((local) => local.nome.trim().toLowerCase() === alvo);
  return encontrados.length === 1 ? encontrados[0] : null;
}

/**
 * Calcula o que preencher a partir de uma conta, respeitando o que ja esta
 * escrito. Nao muta nada -- devolve patches parciais para quem chama aplicar.
 */
export function preenchimentoDaConta(
  conta: ContaParaPreencher,
  actual: CamposPreenchiveis,
  autoAnterior: Readonly<Record<string, string>>,
  locais: readonly LocalParaCorrespondencia[],
): ResultadoPreenchimento {
  const patchGeral: ResultadoPreenchimento["patchGeral"] = {};
  const patchLaborais: ResultadoPreenchimento["patchLaborais"] = {};
  const autoNovo: Record<string, string> = {};
  const avisos: AvisoPreenchimento[] = [];

  // -- Nome: primeiro_nome + apelido, partidos no ultimo espaco -------------
  const nome = dividirNome(conta.name);
  if (nome) {
    if (nome.umaSoPalavra) {
      if (podeEscrever(actual.primeiro_nome, autoAnterior[CAMPO_PRIMEIRO_NOME])) {
        patchGeral.primeiro_nome = nome.primeiroNome;
        autoNovo[CAMPO_PRIMEIRO_NOME] = nome.primeiroNome;
      }
      avisos.push({
        campoId: CAMPO_APELIDO,
        mensagemKey: "hr.preenchimento.avisoNomeUmaPalavra",
      });
    } else {
      if (podeEscrever(actual.primeiro_nome, autoAnterior[CAMPO_PRIMEIRO_NOME])) {
        patchGeral.primeiro_nome = nome.primeiroNome;
        autoNovo[CAMPO_PRIMEIRO_NOME] = nome.primeiroNome;
      }
      if (podeEscrever(actual.apelido, autoAnterior[CAMPO_APELIDO])) {
        patchGeral.apelido = nome.apelido;
        autoNovo[CAMPO_APELIDO] = nome.apelido;
      }
      avisos.push({
        campoId: CAMPO_PRIMEIRO_NOME,
        mensagemKey: "hr.preenchimento.avisoNome",
        parametros: { nome: conta.name.trim() },
      });
    }
  }

  // -- E-mail de trabalho -----------------------------------------------------
  const email = conta.email.trim();
  if (email === "") {
    avisos.push({ campoId: CAMPO_EMAIL_TRABALHO, mensagemKey: "hr.preenchimento.avisoSemEmail" });
  } else if (!EMAIL.test(email)) {
    avisos.push({
      campoId: CAMPO_EMAIL_TRABALHO,
      mensagemKey: "hr.preenchimento.avisoEmailInvalido",
    });
  } else if (podeEscrever(actual.email_trabalho, autoAnterior[CAMPO_EMAIL_TRABALHO])) {
    patchGeral.email_trabalho = email;
    autoNovo[CAMPO_EMAIL_TRABALHO] = email;
  }

  // -- Telefone de trabalho ---------------------------------------------------
  const telefone = (conta.phone ?? "").trim();
  if (telefone !== "" && podeEscrever(actual.telefone_trabalho, autoAnterior[CAMPO_TELEFONE_TRABALHO])) {
    patchGeral.telefone_trabalho = telefone;
    autoNovo[CAMPO_TELEFONE_TRABALHO] = telefone;
  }

  // -- Cargo --------------------------------------------------------------
  const cargo = (conta.position ?? "").trim();
  if (cargo !== "" && podeEscrever(actual.cargo, autoAnterior[CAMPO_CARGO])) {
    patchLaborais.cargo = cargo;
    autoNovo[CAMPO_CARGO] = cargo;
  }

  // -- Local de trabalho: so por correspondencia exacta ------------------
  const location = (conta.location ?? "").trim();
  if (location !== "") {
    const local = localCorrespondente(location, locais);
    if (local && podeEscrever(actual.local_id, autoAnterior[CAMPO_LOCAL])) {
      patchLaborais.local_id = local.id;
      autoNovo[CAMPO_LOCAL] = local.id;
    } else if (!local) {
      avisos.push({
        campoId: CAMPO_LOCAL,
        mensagemKey: "hr.preenchimento.avisoLocalSemCorrespondencia",
        parametros: { local: location },
      });
    }
  }

  return { patchGeral, patchLaborais, autoNovo, avisos };
}

/**
 * Reverte, para o par (geral, laborais), os campos cujo valor actual ainda e
 * exactamente o palpite que a conta ANTERIOR tinha posto -- nada mais. Um
 * campo escrito a mao (que ja falhou a mesma comparacao ao preencher) nao e
 * tocado.
 */
export function reverterAutoPreenchido(
  actual: CamposPreenchiveis,
  autoAnterior: Readonly<Record<string, string>>,
): { patchGeral: ResultadoPreenchimento["patchGeral"]; patchLaborais: ResultadoPreenchimento["patchLaborais"] } {
  const patchGeral: ResultadoPreenchimento["patchGeral"] = {};
  const patchLaborais: ResultadoPreenchimento["patchLaborais"] = {};

  if (
    autoAnterior[CAMPO_PRIMEIRO_NOME] !== undefined &&
    actual.primeiro_nome === autoAnterior[CAMPO_PRIMEIRO_NOME]
  ) {
    patchGeral.primeiro_nome = "";
  }
  if (autoAnterior[CAMPO_APELIDO] !== undefined && actual.apelido === autoAnterior[CAMPO_APELIDO]) {
    patchGeral.apelido = "";
  }
  if (
    autoAnterior[CAMPO_EMAIL_TRABALHO] !== undefined &&
    actual.email_trabalho === autoAnterior[CAMPO_EMAIL_TRABALHO]
  ) {
    patchGeral.email_trabalho = "";
  }
  if (
    autoAnterior[CAMPO_TELEFONE_TRABALHO] !== undefined &&
    actual.telefone_trabalho === autoAnterior[CAMPO_TELEFONE_TRABALHO]
  ) {
    patchGeral.telefone_trabalho = "";
  }
  if (autoAnterior[CAMPO_CARGO] !== undefined && actual.cargo === autoAnterior[CAMPO_CARGO]) {
    patchLaborais.cargo = "";
  }
  if (autoAnterior[CAMPO_LOCAL] !== undefined && actual.local_id === autoAnterior[CAMPO_LOCAL]) {
    patchLaborais.local_id = "";
  }

  return { patchGeral, patchLaborais };
}
