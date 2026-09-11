/**
 * O CONTRATO DE CHAVES do convite de admissao -- o unico sitio onde se decide
 * como se chama cada campo que viaja do formulario publico ate a base.
 *
 * PORQUE ESTE FICHEIRO EXISTE
 * ----------------------------
 * O convite tem tres lados: este ecra, a Edge Function `convite-admissao` e a
 * RPC `rpc_hr_convite_admissao_submeter`. Ate 27/11 cada um falava a sua
 * lingua: o ecra mandava chaves planas (`linha1`), a Edge Function reagrupava
 * num objecto aninhado (`{ pessoas_moradas: { linha1 } }`) e a RPC lia chaves
 * planas com prefixo de tabela (`morada_linha1`). NENHUM `->>` da RPC acertava,
 * e como os `ON CONFLICT ... DO UPDATE` eram incondicionais, o NULL resultante
 * era ESCRITO: uma submissao apagava a ficha inteira -- NIF, NISS, morada --
 * marcava o convite como usado e devolvia ok, em silencio.
 *
 * A FORMA ESCOLHIDA: planas, com prefixo de tabela so onde o nome colidiria
 * (`morada_*`). E a que a RPC ja esperava, logo a que menos muda.
 *
 * `conviteAdmissaoContrato.test.ts` amarra as tres listas: a daqui, a da Edge
 * Function e a que a RPC le do jsonb. Se divergirem outra vez, o teste parte.
 */

/** O estado do formulario publico. Nomes de ECRA, nao nomes de contrato. */
export interface RascunhoConvite {
  // Pagina 1 -- pessoas_dados_pessoais, pessoas_identificacao, pessoas_moradas.
  data_nascimento: string;
  genero: string;
  nacionalidade: string;
  telefone_pessoal: string;
  email_pessoal: string;
  estado_civil: string;
  dependentes: string;
  naturalidade_freguesia: string;
  naturalidade_concelho: string;
  naturalidade_pais: string;
  conjuge_situacao_profissional: string;
  dependentes_deficientes: string;
  habilitacao_academica: string;
  habilitacao_data_conclusao: string;
  tipo_documento: string;
  numero_documento: string;
  validade_documento: string;
  nif: string;
  niss: string;
  carta_conducao_numero: string;
  carta_conducao_categorias: string;
  carta_conducao_validade: string;
  linha1: string;
  linha2: string;
  codigo_postal: string;
  localidade: string;
  distrito: string;
  pais: string;
  // Pagina 2 -- conta bancaria, fardamento, sindicalizacao, assinatura.
  //
  // `conta_formato` fica FORA do contrato: o convite so sabe gravar IBAN (e o
  // unico ramo que a RPC tem) e por isso nao ha formato nenhum a escolher.
  // Continua no rascunho, fixo em "iban", para a linha de
  // pessoas_dados_bancarios ficar com o formato certo.
  conta_formato: string;
  conta_numero: string;
  conta_titular: string;
  conta_banco: string;
  tamanho_cima: string;
  tamanho_cima_detalhe: string;
  tamanho_baixo: string;
  tamanho_baixo_detalhe: string;
  tamanho_blazer: string;
  tamanho_blazer_detalhe: string;
  sindicalizado: boolean;
  sindicato: string;
  assinatura_nome: string;
  aceite: boolean;
}

export const RASCUNHO_CONVITE_VAZIO: RascunhoConvite = {
  data_nascimento: "",
  genero: "",
  nacionalidade: "",
  telefone_pessoal: "",
  email_pessoal: "",
  estado_civil: "",
  dependentes: "",
  naturalidade_freguesia: "",
  naturalidade_concelho: "",
  naturalidade_pais: "",
  conjuge_situacao_profissional: "",
  dependentes_deficientes: "",
  habilitacao_academica: "",
  habilitacao_data_conclusao: "",
  tipo_documento: "",
  numero_documento: "",
  validade_documento: "",
  nif: "",
  niss: "",
  carta_conducao_numero: "",
  carta_conducao_categorias: "",
  carta_conducao_validade: "",
  linha1: "",
  linha2: "",
  codigo_postal: "",
  localidade: "",
  distrito: "",
  pais: "PT",
  conta_formato: "iban",
  conta_numero: "",
  conta_titular: "",
  conta_banco: "",
  tamanho_cima: "",
  tamanho_cima_detalhe: "",
  tamanho_baixo: "",
  tamanho_baixo_detalhe: "",
  tamanho_blazer: "",
  tamanho_blazer_detalhe: "",
  sindicalizado: false,
  sindicato: "",
  assinatura_nome: "",
  aceite: false,
};

/**
 * AS CHAVES DO CONTRATO, por ordem alfabetica -- a mesma ordem por que o teste
 * compara os tres lados. Acrescentar uma chave aqui obriga a acrescenta-la a
 * lista branca da Edge Function E a faze-la ser lida pela RPC; o teste recusa
 * qualquer uma das tres sozinha.
 */
export const CHAVES_PAYLOAD_CONVITE = [
  "carta_conducao_categorias",
  "carta_conducao_numero",
  "carta_conducao_validade",
  "conjuge_situacao_profissional",
  "conta_banco",
  "conta_titular",
  "data_nascimento",
  "dependentes",
  "dependentes_deficientes",
  "email_pessoal",
  "estado_civil",
  "genero",
  "habilitacao_academica",
  "habilitacao_data_conclusao",
  // O numero da conta viaja como `iban` porque e o que a RPC le e porque e o
  // unico formato que ela sabe gravar. No ecra chama-se `conta_numero`.
  "iban",
  "morada_codigo_postal",
  "morada_distrito",
  "morada_linha1",
  "morada_linha2",
  "morada_localidade",
  "morada_pais",
  "nacionalidade",
  "naturalidade_concelho",
  "naturalidade_freguesia",
  "naturalidade_pais",
  "nif",
  "niss",
  "numero_documento",
  "sindicalizado",
  "sindicato",
  "tamanho_baixo",
  "tamanho_baixo_detalhe",
  "tamanho_blazer",
  "tamanho_blazer_detalhe",
  "tamanho_cima",
  "tamanho_cima_detalhe",
  "telefone_pessoal",
  "tipo_documento",
  "validade_documento",
] as const;

export type ChavePayloadConvite = (typeof CHAVES_PAYLOAD_CONVITE)[number];

function ouNull(valor: string): string | null {
  return valor.trim() === "" ? null : valor.trim();
}

function numeroOuNull(valor: string): number | null {
  return valor.trim() === "" ? null : Number(valor);
}

/** O detalhe do tamanho so faz sentido quando o tamanho escolhido e "outro". */
function detalheOuNull(tamanho: string, detalhe: string): string | null {
  return tamanho === "outro" ? ouNull(detalhe) : null;
}

/**
 * O payload de submissao. Devolve SEMPRE todas as chaves do contrato -- uma
 * chave presente com valor `null` diz "a pessoa deixou isto em branco", e a
 * RPC distingue isso de "a chave nem veio". Sem esta garantia, um campo
 * limpado de proposito nunca chegaria a ser limpado.
 */
export function construirPayloadConvite(
  r: RascunhoConvite,
): Record<ChavePayloadConvite, unknown> {
  return {
    data_nascimento: ouNull(r.data_nascimento),
    genero: ouNull(r.genero),
    nacionalidade: ouNull(r.nacionalidade)?.toUpperCase() ?? null,
    telefone_pessoal: ouNull(r.telefone_pessoal),
    email_pessoal: ouNull(r.email_pessoal),
    estado_civil: ouNull(r.estado_civil),
    dependentes: numeroOuNull(r.dependentes),
    naturalidade_freguesia: ouNull(r.naturalidade_freguesia),
    naturalidade_concelho: ouNull(r.naturalidade_concelho),
    naturalidade_pais: ouNull(r.naturalidade_pais)?.toUpperCase() ?? null,
    conjuge_situacao_profissional: ouNull(r.conjuge_situacao_profissional),
    dependentes_deficientes: numeroOuNull(r.dependentes_deficientes),
    habilitacao_academica: ouNull(r.habilitacao_academica),
    habilitacao_data_conclusao: ouNull(r.habilitacao_data_conclusao),
    tipo_documento: ouNull(r.tipo_documento),
    numero_documento: ouNull(r.numero_documento),
    validade_documento: ouNull(r.validade_documento),
    nif: ouNull(r.nif),
    niss: ouNull(r.niss),
    carta_conducao_numero: ouNull(r.carta_conducao_numero),
    carta_conducao_categorias: ouNull(r.carta_conducao_categorias),
    carta_conducao_validade: ouNull(r.carta_conducao_validade),
    morada_linha1: ouNull(r.linha1),
    morada_linha2: ouNull(r.linha2),
    morada_codigo_postal: ouNull(r.codigo_postal),
    morada_localidade: ouNull(r.localidade),
    morada_distrito: ouNull(r.distrito),
    morada_pais: ouNull(r.pais)?.toUpperCase() ?? "PT",
    tamanho_cima: ouNull(r.tamanho_cima),
    tamanho_cima_detalhe: detalheOuNull(r.tamanho_cima, r.tamanho_cima_detalhe),
    tamanho_baixo: ouNull(r.tamanho_baixo),
    tamanho_baixo_detalhe: detalheOuNull(r.tamanho_baixo, r.tamanho_baixo_detalhe),
    tamanho_blazer: ouNull(r.tamanho_blazer),
    tamanho_blazer_detalhe: detalheOuNull(r.tamanho_blazer, r.tamanho_blazer_detalhe),
    sindicalizado: r.sindicalizado,
    sindicato: r.sindicalizado ? ouNull(r.sindicato) : null,
    // A conta bancaria, que ate 28/11 nao passava daqui: a Edge Function nao a
    // reencaminhava e o ramo do IBAN da RPC era inalcancavel. Os espacos saem
    // aqui e a RPC valida o resto -- quem escreve um IBAN copia-o com espacos.
    iban: ouNull(r.conta_numero)?.replace(/\s+/g, "").toUpperCase() ?? null,
    conta_titular: ouNull(r.conta_titular),
    conta_banco: ouNull(r.conta_banco),
  };
}

