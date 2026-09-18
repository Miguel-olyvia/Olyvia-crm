/**
 * Variaveis {{token}} dos modelos de documento de RH.
 *
 * REIMPLEMENTACAO INDEPENDENTE -- NUNCA IMPORTAR DO CRM
 * -------------------------------------------------------
 * Este ficheiro nao importa nada de `src/utils/contractVariables.ts` nem de
 * `src/utils/documentVariables/*`. O padrao (catalogo + substituicao +
 * highlight mode) e o mesmo espirito, mas o dominio de RH (pessoa, vinculo,
 * retribuicao) e outro, e as duas areas nunca partilham codigo por regra do
 * workspace.
 *
 * ESTE FICHEIRO E SO PARA PRE-VISUALIZACAO
 * -------------------------------------------
 * `pessoas_documentos.corpo_html` nao tem privilegio nenhum para
 * `authenticated` (nem SELECT nem INSERT/UPDATE -- ver 20261123030000). A
 * substituicao REAL corre no servidor, dentro de `rpc_hr_documento_emitir`
 * (20261202020000), sobre o corpo do modelo. `substituirVariaveisRH` aqui
 * serve SO para o editor mostrar, com `DADOS_EXEMPLO_RH`, como o documento
 * vai ficar -- nunca e chamado no caminho de emissao.
 *
 * PARIDADE COM O CATALOGO SQL
 * -----------------------------
 * `CATALOGO_VARIAVEIS_RH` tem de listar EXACTAMENTE os mesmos tokens que
 * `hr_documento_variaveis_catalogo()` (20261202020000) -- e isso que o teste
 * de paridade em `__tests__/variaveisDocumentoRH.test.ts` verifica contra um
 * snapshot do catalogo SQL. Nao e paridade de VALORES (o exemplo e ficticio),
 * e paridade de TOKENS: o editor nunca deve oferecer um token que a emissao
 * nao conhece.
 */

export interface VariavelDocumentoRH {
  /** Nome do token, SEM chavetas e sem ponto (ex.: "pessoa_nome_completo"). */
  token: string;
  rotulo: string;
  grupo: string;
}

/** Fonte canonica em TypeScript -- tem de espelhar `hr_documento_variaveis_catalogo()`. */
export const CATALOGO_VARIAVEIS_RH: readonly VariavelDocumentoRH[] = [
  { token: "pessoa_nome_completo", rotulo: "Nome completo", grupo: "pessoa" },
  { token: "pessoa_primeiro_nome", rotulo: "Primeiro nome", grupo: "pessoa" },
  { token: "pessoa_apelido", rotulo: "Apelido", grupo: "pessoa" },
  { token: "pessoa_numero_interno", rotulo: "Numero interno", grupo: "pessoa" },
  { token: "pessoa_cargo", rotulo: "Cargo", grupo: "pessoa" },
  { token: "pessoa_local_trabalho", rotulo: "Local de trabalho", grupo: "pessoa" },
  { token: "pessoa_email_trabalho", rotulo: "Email de trabalho", grupo: "pessoa" },
  { token: "pessoa_telefone_trabalho", rotulo: "Telefone de trabalho", grupo: "pessoa" },
  { token: "pessoa_data_admissao", rotulo: "Data de admissao", grupo: "pessoa" },
  { token: "pessoa_data_antiguidade", rotulo: "Data de antiguidade", grupo: "pessoa" },
  { token: "pessoa_data_nascimento", rotulo: "Data de nascimento", grupo: "pessoa" },
  { token: "pessoa_nacionalidade", rotulo: "Nacionalidade (ISO)", grupo: "pessoa" },
  { token: "pessoa_estado_civil", rotulo: "Estado civil", grupo: "pessoa" },
  { token: "pessoa_nif", rotulo: "NIF", grupo: "identificacao" },
  { token: "pessoa_tipo_documento", rotulo: "Tipo de documento", grupo: "identificacao" },
  { token: "pessoa_numero_documento", rotulo: "Numero do documento", grupo: "identificacao" },
  { token: "pessoa_validade_documento", rotulo: "Validade do documento", grupo: "identificacao" },
  { token: "pessoa_niss_ultimos4", rotulo: "NISS (ultimos 4 digitos)", grupo: "identificacao" },
  { token: "pessoa_morada", rotulo: "Morada", grupo: "morada" },
  { token: "pessoa_codigo_postal", rotulo: "Codigo postal", grupo: "morada" },
  { token: "pessoa_localidade", rotulo: "Localidade", grupo: "morada" },
  { token: "vinculo_tipo_contrato", rotulo: "Tipo de contrato", grupo: "vinculo" },
  { token: "vinculo_regime", rotulo: "Regime (tempo inteiro/parcial)", grupo: "vinculo" },
  { token: "vinculo_data_inicio", rotulo: "Data de inicio do vinculo", grupo: "vinculo" },
  { token: "vinculo_data_fim", rotulo: "Data de fim do vinculo", grupo: "vinculo" },
  { token: "vinculo_motivo_termo", rotulo: "Motivo de termo", grupo: "vinculo" },
  { token: "vinculo_periodo_experimental_ate", rotulo: "Periodo experimental ate", grupo: "vinculo" },
  { token: "vinculo_horas_semanais", rotulo: "Horas semanais equivalentes", grupo: "vinculo" },
  { token: "retribuicao_valor_base", rotulo: "Retribuicao base", grupo: "retribuicao" },
  { token: "retribuicao_periodicidade", rotulo: "Periodicidade da retribuicao", grupo: "retribuicao" },
  { token: "retribuicao_moeda", rotulo: "Moeda", grupo: "retribuicao" },
  { token: "retribuicao_subsidio_alimentacao", rotulo: "Subsidio de alimentacao", grupo: "retribuicao" },
  { token: "retribuicao_subsidio_alimentacao_modo", rotulo: "Modo do subsidio de alimentacao", grupo: "retribuicao" },
  { token: "empresa_nome", rotulo: "Nome da empresa", grupo: "empresa" },
  { token: "documento_titulo", rotulo: "Titulo do documento", grupo: "documento" },
  { token: "documento_tipo", rotulo: "Tipo de documento", grupo: "documento" },
  { token: "documento_data_emissao", rotulo: "Data de emissao", grupo: "documento" },
];

/** Dados de exemplo para a pre-visualizacao no editor de modelo. Propositadamente
 *  incompletos em alguns campos (motivo de termo, subsidio) para que o modo de
 *  realce mostre o que fica em branco num contrato real. */
export const DADOS_EXEMPLO_RH: Readonly<Record<string, string>> = {
  pessoa_nome_completo: "Ana Sofia Ferreira",
  pessoa_primeiro_nome: "Ana Sofia",
  pessoa_apelido: "Ferreira",
  pessoa_numero_interno: "RH-00042",
  pessoa_cargo: "Consultora de Recursos Humanos",
  pessoa_local_trabalho: "Sede — Lisboa",
  pessoa_email_trabalho: "ana.ferreira@empresa.pt",
  pessoa_telefone_trabalho: "912345678",
  pessoa_data_admissao: "01/03/2026",
  pessoa_data_antiguidade: "01/03/2026",
  pessoa_data_nascimento: "15/07/1994",
  pessoa_nacionalidade: "PT",
  pessoa_estado_civil: "Solteiro(a)",
  pessoa_nif: "123456789",
  pessoa_tipo_documento: "Cartao de Cidadao",
  pessoa_numero_documento: "12345678 9 ZZ0",
  pessoa_validade_documento: "01/03/2032",
  pessoa_niss_ultimos4: "1234",
  pessoa_morada: "Rua das Flores, 12",
  pessoa_codigo_postal: "1000-100",
  pessoa_localidade: "Lisboa",
  vinculo_tipo_contrato: "Termo certo",
  vinculo_regime: "Tempo inteiro",
  vinculo_data_inicio: "01/03/2026",
  // vinculo_data_fim, vinculo_motivo_termo e periodo_experimental de proposito
  // AUSENTES: um contrato sem termo nao tem estes campos, e a pre-visualizacao
  // deve mostrar isso a amarelo, nao inventar um valor.
  vinculo_horas_semanais: "40",
  retribuicao_valor_base: "1200.00",
  retribuicao_periodicidade: "Mensal",
  retribuicao_moeda: "EUR",
  // retribuicao_subsidio_alimentacao de proposito AUSENTE.
  empresa_nome: "Empresa Exemplo, Lda.",
  documento_titulo: "Contrato de Trabalho",
  documento_tipo: "contrato",
  documento_data_emissao: "18/09/2026",
};

const PADRAO_TOKEN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Extrai os tokens {{...}} presentes num corpo HTML, sem duplicados, na
 *  ordem em que aparecem. Usado para os "chips" de leitura no ecra de
 *  modelos e para o aviso de token fora do catalogo. */
export function extrairTokensRH(corpoHtml: string): string[] {
  const vistos = new Set<string>();
  const tokens: string[] = [];
  for (const match of corpoHtml.matchAll(PADRAO_TOKEN)) {
    const token = match[1].toLowerCase();
    if (!vistos.has(token)) {
      vistos.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

const TOKENS_CATALOGO = new Set(CATALOGO_VARIAVEIS_RH.map((v) => v.token));

/** Tokens presentes no corpo que NAO existem no catalogo -- a emissao real
 *  (`hr_documento_substituir_variaveis`) apaga-os para "____________" em vez
 *  de os deixar crus, mas quem escreve o modelo deve ver o aviso antes disso. */
export function tokensDesconhecidosRH(corpoHtml: string): string[] {
  return extrairTokensRH(corpoHtml).filter((token) => !TOKENS_CATALOGO.has(token));
}

function realcarPreenchido(valor: string, realce: boolean): string {
  return realce
    ? `<span style="background:#d1fae5;color:#065f46;padding:2px 4px;border-radius:3px;font-weight:500;">${valor}</span>`
    : valor;
}

function realcarEmFalta(token: string, realce: boolean): string {
  return realce
    ? `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:3px;font-weight:500;">[${token} em falta]</span>`
    : "____________";
}

/**
 * Substitui {{token}} pelo valor em `dados`, SO PARA PRE-VISUALIZACAO no
 * editor de modelo. `realce` (por omissao true, ao contrario do CRM onde e
 * opcional) pinta preenchido a verde e em falta a amarelo -- a
 * pre-visualizacao nunca e o documento real, por isso o estado normal aqui
 * e mostrar o que falta, nao escondê-lo.
 */
export function substituirVariaveisRH(
  corpoHtml: string,
  dados: Readonly<Record<string, string | null | undefined>>,
  realce: boolean = true,
): string {
  return corpoHtml.replace(PADRAO_TOKEN, (_match, tokenBruto: string) => {
    const token = tokenBruto.toLowerCase();
    const valor = dados[token];
    if (valor === undefined || valor === null || valor === "") {
      return realcarEmFalta(token, realce);
    }
    return realcarPreenchido(valor, realce);
  });
}
