// Os ids dos controlos do painel "Nova pessoa", por aba. São os mesmos que a validação do assistente real devolve
// (`hr-novo-...`): assim o erro aponta para o controlo certo, e o foco vai para ele. Uma só fonte para a aba de cada campo.
export type AbaNova = "dados" | "contacto" | "contrato" | "retribuicao" | "outros" | "acesso";

export const ABAS_NOVA: readonly AbaNova[] = ["dados", "contacto", "contrato", "retribuicao", "outros", "acesso"];

/** Os campos de cada aba, pela ordem do ecra: o primeiro com erro desta ordem recebe o foco. */
export const CAMPOS_POR_ABA: Readonly<Record<AbaNova, readonly string[]>> = {
  dados: [
    "hr-novo-conta", "hr-novo-primeiro-nome", "hr-novo-apelido", "hr-novo-data-nascimento", "hr-novo-genero",
    "hr-novo-nacionalidade", "hr-novo-estado-civil", "hr-novo-conjuge-situacao", "hr-novo-dependentes",
    "hr-novo-dependentes-deficientes", "hr-novo-naturalidade-freguesia", "hr-novo-naturalidade-concelho",
    "hr-novo-naturalidade-pais", "hr-novo-tipo-documento", "hr-novo-numero-documento", "hr-novo-validade-documento",
    "hr-novo-nif", "hr-novo-niss", "hr-novo-carta-numero", "hr-novo-carta-categorias", "hr-novo-carta-validade",
  ],
  contacto: [
    "hr-novo-email-pessoal", "hr-novo-telefone-pessoal", "hr-novo-email-trabalho", "hr-novo-telefone-trabalho",
    "hr-novo-morada-linha1", "hr-novo-morada-linha2", "hr-novo-morada-codigo-postal", "hr-novo-morada-localidade",
    "hr-novo-morada-distrito", "hr-novo-morada-pais", "hr-novo-emergencia-nome", "hr-novo-emergencia-relacao",
    "hr-novo-emergencia-telefone", "hr-novo-emergencia-telefone-alt", "hr-novo-emergencia-email",
  ],
  contrato: [
    "hr-novo-local", "hr-novo-reporta-a", "hr-novo-cargo", "hr-novo-numero-interno", "hr-novo-data-admissao",
    "hr-novo-data-antiguidade", "hr-novo-categoria-profissional", "hr-novo-categoria-funcao", "hr-novo-tipo-contrato",
    "hr-novo-regime-contratual", "hr-novo-regime", "hr-novo-tipo-trabalho", "hr-novo-data-inicio", "hr-novo-data-fim",
    "hr-novo-duracao-meses", "hr-novo-renovavel", "hr-novo-periodo-experimental-dias", "hr-novo-horas-trabalho",
    "hr-novo-horas-frequencia", "hr-novo-tempo-trabalho-pct", "hr-novo-politica-feriados", "hr-novo-horas-semanais-maximas",
    "hr-novo-horas-anuais-maximas",
  ],
  retribuicao: [
    "hr-novo-subsidio", "hr-novo-subsidio-modo", "hr-novo-duodecimos", "hr-novo-conta-formato", "hr-novo-conta-numero",
    "hr-novo-conta-titular", "hr-novo-conta-banco", "hr-novo-conta-agencia", "hr-novo-conta-bic",
  ],
  outros: [
    "hr-novo-habilitacao", "hr-novo-habilitacao-data", "hr-novo-saude-incapacidade", "hr-novo-saude-validade",
    "hr-novo-saude-adaptacoes", "hr-novo-saude-observacoes", "hr-novo-sindicalizado", "hr-novo-sindicato",
    "hr-novo-sindicato-quota", "hr-novo-tamanho-cima", "hr-novo-tamanho-baixo", "hr-novo-tamanho-calcado",
  ],
  acesso: ["hr-novo-criar-acesso", "hr-novo-papel", "hr-novo-email-acesso", "hr-novo-email-convite"],
};

const POR_CAMPO = new Map<string, AbaNova>(
  ABAS_NOVA.flatMap((aba) => CAMPOS_POR_ABA[aba].map((id): [string, AbaNova] => [id, aba])),
);

const ORDEM = new Map<string, number>(
  ABAS_NOVA.flatMap((aba, i) => CAMPOS_POR_ABA[aba].map((id, j): [string, number] => [id, i * 1000 + j])),
);

/** A aba onde está um controlo; um id que não se conhece cai na primeira aba. */
export function abaDoCampo(campoId: string): AbaNova {
  return POR_CAMPO.get(campoId) ?? "dados";
}

/** Posição de um controlo na ordem do ecrã (para ordenar erros). */
export function ordemDoCampo(campoId: string): number {
  return ORDEM.get(campoId) ?? Number.MAX_SAFE_INTEGER;
}

/** Os ids de campo que a configuração da admissão chama por código, e a secção do convite a que cada um pertence. */
export type SeccaoConvite =
  | "identificacao" | "nascimento" | "documentos" | "contactos" | "morada" | "conta" | "habilitacoes" | "fardamento";

export const SECCOES_CONVITE: readonly SeccaoConvite[] = [
  "identificacao", "nascimento", "documentos", "contactos", "morada", "conta", "habilitacoes", "fardamento",
];

/** O campo de cada código de admissão da pessoa: id do controlo e secção do convite. */
export const CAMPO_DO_CODIGO: Readonly<Record<string, { id: string; seccao: SeccaoConvite }>> = {
  genero: { id: "hr-novo-genero", seccao: "identificacao" },
  nacionalidade: { id: "hr-novo-nacionalidade", seccao: "identificacao" },
  estado_civil: { id: "hr-novo-estado-civil", seccao: "identificacao" },
  conjuge_situacao_profissional: { id: "hr-novo-conjuge-situacao", seccao: "identificacao" },
  dependentes: { id: "hr-novo-dependentes", seccao: "identificacao" },
  dependentes_deficientes: { id: "hr-novo-dependentes-deficientes", seccao: "identificacao" },
  data_nascimento: { id: "hr-novo-data-nascimento", seccao: "nascimento" },
  naturalidade_freguesia: { id: "hr-novo-naturalidade-freguesia", seccao: "nascimento" },
  naturalidade_concelho: { id: "hr-novo-naturalidade-concelho", seccao: "nascimento" },
  naturalidade_pais: { id: "hr-novo-naturalidade-pais", seccao: "nascimento" },
  tipo_documento: { id: "hr-novo-tipo-documento", seccao: "documentos" },
  numero_documento: { id: "hr-novo-numero-documento", seccao: "documentos" },
  validade_documento: { id: "hr-novo-validade-documento", seccao: "documentos" },
  nif: { id: "hr-novo-nif", seccao: "documentos" },
  niss: { id: "hr-novo-niss", seccao: "documentos" },
  email_pessoal: { id: "hr-novo-email-pessoal", seccao: "contactos" },
  telefone_pessoal: { id: "hr-novo-telefone-pessoal", seccao: "contactos" },
  linha1: { id: "hr-novo-morada-linha1", seccao: "morada" },
  codigo_postal: { id: "hr-novo-morada-codigo-postal", seccao: "morada" },
  localidade: { id: "hr-novo-morada-localidade", seccao: "morada" },
  conta_numero: { id: "hr-novo-conta-numero", seccao: "conta" },
  conta_titular: { id: "hr-novo-conta-titular", seccao: "conta" },
  conta_banco: { id: "hr-novo-conta-banco", seccao: "conta" },
  conta_bic: { id: "hr-novo-conta-bic", seccao: "conta" },
  habilitacao_academica: { id: "hr-novo-habilitacao", seccao: "habilitacoes" },
  habilitacao_data_conclusao: { id: "hr-novo-habilitacao-data", seccao: "habilitacoes" },
  tamanho_cima: { id: "hr-novo-tamanho-cima", seccao: "fardamento" },
  tamanho_baixo: { id: "hr-novo-tamanho-baixo", seccao: "fardamento" },
  tamanho_calcado: { id: "hr-novo-tamanho-calcado", seccao: "fardamento" },
};

const SECCAO_DO_ID = new Map<string, SeccaoConvite>(
  Object.values(CAMPO_DO_CODIGO).map(({ id, seccao }): [string, SeccaoConvite] => [id, seccao]),
);

/** A secção do convite a que um controlo pertence, ou `undefined` (campos só do RH, por exemplo). */
export function seccaoDoCampo(campoId: string): SeccaoConvite | undefined {
  return SECCAO_DO_ID.get(campoId);
}
