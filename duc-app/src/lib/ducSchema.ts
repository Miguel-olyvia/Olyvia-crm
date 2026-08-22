import type { AttachmentCategory, DucSection, DucVariant } from "./types";

export const ATTACHMENT_CATEGORIES: Array<{ key: AttachmentCategory; label: string; example: string }> = [
  { key: "layout", label: "Layout / projeto aprovado", example: "layout de cozinha (PDF), folha de WC (PDF)" },
  { key: "renders", label: "Renders / imagens", example: "renders de cozinha (PNG)" },
  { key: "needs_map", label: "Mapa de necessidades / consumíveis", example: "mapa de necessidades (XLSX)" },
  { key: "photos_visit", label: "Fotografias da visita comercial", example: "fotos (JPG/PNG)" },
  { key: "site_photos", label: "Registo fotográfico de obra", example: "fotos por fase" },
  { key: "other", label: "Outros", example: "" },
];

// ============================================================================
// Schema declarativo do DUC — fiel ao documento DUC_Grupo_BMLAR_v1_1.
// A UI (etapas, campos, tabelas) é gerada a partir daqui: estruturado e
// dinâmico. Cada bloco/campo declara a que variante(s) se aplica.
// ============================================================================

export type FieldType = "text" | "textarea" | "date" | "checkbox" | "number" | "select";

export interface DucField {
  key: string;
  label: string;
  type: FieldType;
  /** Variantes onde o campo aparece. Vazio/omitido = todas (universal). */
  variants?: DucVariant[];
  placeholder?: string;
  hint?: string;
  /** Opções quando type === "select". */
  options?: string[];
}

export interface DucItemSection {
  section: DucSection;
  title: string;
  hint?: string;
  variants?: DucVariant[];
  /** Colunas editáveis. `field` mapeia para colunas próprias ou meta.<field>. */
  columns: Array<{
    field: string;
    label: string;
    type: FieldType;
    /** true → coluna própria da tabela; false/omitido → guardado em meta. */
    own?: boolean;
    width?: string;
  }>;
}

export interface DucStage {
  no: number;
  key: string;
  title: string;
  responsible: string;
  intro?: string;
  variants?: DucVariant[];
  fields: DucField[];
  itemSections?: DucItemSection[];
}

export const VARIANT_LABELS: Record<DucVariant, string> = {
  universal: "Universal",
  mudelar_obra: "MUDELAR · obra",
  bmg_contrato: "BMG · contrato",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_progress: "Em curso",
  delivered: "Entregue",
  closed: "Fechado",
};

const M: DucVariant[] = ["mudelar_obra"];
const B: DucVariant[] = ["bmg_contrato"];

/**
 * Deriva a variante do DUC a partir da empresa/organização a que o user tem
 * acesso — não é escolha manual. Mudelar → obra, BMG → contrato, restantes →
 * universal. (Heurística pelo nome da org; não altera dados da Olyvia.)
 */
export function variantForOrgName(name: string | null | undefined): DucVariant {
  const n = (name ?? "").toLowerCase();
  if (n.includes("mudelar")) return "mudelar_obra";
  if (n.includes("bmg")) return "bmg_contrato";
  return "universal";
}

export const DUC_STAGES: DucStage[] = [
  {
    no: 1,
    key: "comercial",
    title: "Comercial — Ficha de cliente e âmbito",
    responsible: "Gestor Comercial",
    intro:
      "Preenche na adjudicação · é o único suporte do que foi vendido. O que não estiver escrito aqui não existe para efeitos de execução.",
    fields: [
      { key: "cliente_ref", label: "Cliente / Ref.", type: "text" },
      { key: "contacto_nome", label: "Contacto — nome", type: "text" },
      { key: "contacto_tel", label: "Contacto — telefone", type: "text" },
      { key: "contacto_email", label: "Contacto — email", type: "text" },
      { key: "contacto_urgencia", label: "Contacto de urgência / 2.º", type: "text" },
      { key: "morada_obra", label: "Morada da obra / instalação", type: "text" },
      { key: "comercial_responsavel", label: "Comercial responsável", type: "text" },
      { key: "data_adjudicacao", label: "Data de adjudicação", type: "date" },
      {
        key: "condicoes_acesso",
        label: "Condições de acesso",
        type: "textarea",
        hint: "elevador, escadas, horários, estacionamento…",
      },
      // MUDELAR · obra
      { key: "tipo_obra", label: "Tipo de obra (parcial / total + âmbito)", type: "text", variants: M },
      { key: "modelo", label: "Modelo", type: "text", variants: M },
      { key: "designer", label: "Designer", type: "text", variants: M },
      // BMG · contrato
      { key: "tipo_contrato", label: "Tipo de contrato", type: "text", variants: B },
      {
        key: "cliente_grande",
        label: "Cliente grande? (≥50.000€/ano · 3+ locais · equipa 2+ · 4+ categorias · SLA)",
        type: "checkbox",
        variants: B,
      },
      { key: "valor_mensal_anual", label: "Valor mensal / anual", type: "text", variants: B },
      { key: "num_localidades_sla", label: "Nº de localidades / SLA", type: "text", variants: B },
      // Universal (texto)
      {
        key: "nao_incluido",
        label: "O que NÃO está incluído (peça anti-surpresa — preencher sempre)",
        type: "textarea",
        hint: "Listar explicitamente tudo o que o cliente possa assumir estar incluído e não está.",
      },
      { key: "compromissos", label: "Compromissos específicos feitos ao cliente", type: "textarea" },
    ],
    itemSections: [
      {
        section: "scope",
        title: "Âmbito — o que foi VENDIDO (área a área)",
        columns: [
          { field: "label", label: "Área / Elemento", type: "text", own: true },
          { field: "description", label: "O que fazer", type: "text", own: true },
          { field: "included", label: "Incluído?", type: "checkbox", own: true },
        ],
      },
    ],
  },
  {
    no: 2,
    key: "financeiro",
    title: "Financeiro — Abertura de cliente e faturação",
    responsible: "Financeiro",
    intro: "Cria o cliente para faturação segundo o acordado.",
    fields: [
      {
        key: "modo_pagamento",
        label: "Modo de pagamento acordado",
        type: "select",
        options: [
          "Transferência bancária",
          "Débito direto",
          "Multibanco",
          "MB WAY",
          "Numerário",
          "Cheque",
          "Cartão",
        ],
      },
      { key: "condicoes_faseamento", label: "Condições / faseamento", type: "textarea" },
      { key: "nif_dados_faturacao", label: "NIF / dados de faturação", type: "textarea" },
      {
        key: "periodicidade_faturacao",
        label: "Periodicidade de faturação",
        type: "select",
        options: ["Mensal", "Trimestral", "Semestral", "Anual", "Por fase"],
        variants: B,
      },
      { key: "revisoes_preco", label: "Revisões de preço previstas", type: "text", variants: B },
    ],
  },
  {
    no: 3,
    key: "operacao",
    title: "Operação (planeia) — Plano e necessidades",
    responsible: "Coord. Operações",
    intro: "Recebe o âmbito, planeia a execução e define DUAS necessidades (materiais + força de trabalho).",
    fields: [
      {
        key: "plano_execucao",
        label: "Plano de execução (cronograma por fases com SLA)",
        type: "textarea",
        variants: M,
        hint: "ex.: WC 10 dias úteis; cozinha 8–10 semanas com M1–M4.",
      },
      {
        key: "necessidades_materiais",
        label: "MATERIAIS → informa o Armazém (o quê, quanto, para quando)",
        type: "textarea",
      },
      {
        key: "necessidades_forca_trabalho",
        label: "FORÇA DE TRABALHO → informa o RH (quantas pessoas, competências, para quando)",
        type: "textarea",
      },
    ],
    itemSections: [
      {
        section: "service_map",
        title: "Mapa de serviços contratados (recorrente)",
        variants: B,
        columns: [
          { field: "label", label: "Serviço", type: "text", own: true },
          { field: "frequencia", label: "Frequência", type: "text" },
          { field: "equipa", label: "Equipa / Responsável", type: "text" },
          { field: "description", label: "Notas de execução", type: "text", own: true },
        ],
      },
    ],
  },
  {
    no: 4,
    key: "rh",
    title: "RH — Força de trabalho",
    responsible: "RH",
    intro:
      "Corre em paralelo com o Armazém. Não há arranque sem equipa confirmada e formada. Quem não está formado não toca numa obra premium.",
    fields: [
      { key: "num_pessoas", label: "Nº de pessoas necessárias", type: "text" },
      { key: "competencias", label: "Competências / ofícios", type: "textarea" },
      { key: "onboarding", label: "Onboarding / formação necessária?", type: "checkbox" },
      { key: "onboarding_desc", label: "Descrição da formação", type: "textarea" },
      { key: "previsao_prontidao", label: "Previsão de prontidão (controlar contra o SLA)", type: "text" },
      { key: "equipa_confirmada", label: "Equipa confirmada e formada?", type: "checkbox" },
      { key: "necessidade_obra", label: "Necessidade por obra (profissionais/ofícios durante a duração)", type: "textarea", variants: M },
      { key: "mobilizacao_equipa", label: "Mobilização de equipa permanente para o contrato", type: "textarea", variants: B },
    ],
  },
  {
    no: 5,
    key: "armazem",
    title: "Armazém + Compras — Materiais e consumíveis",
    responsible: "Armazém / Compras",
    intro:
      "Confirma stock, compra o que falta, prepara e expede. Sem material confirmado em armazém, não há agenda de obra.",
    fields: [],
    itemSections: [
      {
        section: "material",
        title: "Lista de materiais",
        columns: [
          { field: "label", label: "Produto / Referência", type: "text", own: true },
          { field: "modelo_cor", label: "Modelo / Cor", type: "text" },
          { field: "qty", label: "Qtd.", type: "number", own: true },
          { field: "dimensao", label: "Dimensão", type: "text" },
          { field: "description", label: "Observações", type: "text", own: true },
        ],
      },
      {
        section: "consumable",
        title: "Consumíveis por elemento (instalação de equipamentos)",
        hint: "Equipamento/loiça é fornecido à parte e fica fora deste picking.",
        columns: [
          { field: "label", label: "Elemento", type: "text", own: true },
          { field: "consumivel", label: "Consumível", type: "text" },
          { field: "seccao", label: "Secção", type: "text" },
          { field: "unit", label: "Un.", type: "text", own: true },
          { field: "qtd_un", label: "Qtd/un", type: "text" },
          { field: "qty", label: "Qtd total", type: "number", own: true },
        ],
      },
    ],
  },
  {
    no: 6,
    key: "arranque",
    title: "Arranque — Porta das duas cadeias",
    responsible: "Coord. Operações",
    intro: "A execução só começa com as duas verdes.",
    fields: [
      { key: "material_confirmado", label: "Material confirmado e preparado em armazém", type: "checkbox" },
      { key: "equipa_confirmada", label: "Equipa confirmada e formada", type: "checkbox" },
      { key: "retificacao_medidas", label: "Retificação de medidas realizada (quando aplicável)", type: "checkbox" },
      { key: "data_arranque", label: "Data de arranque confirmada", type: "date" },
      { key: "comunicada_por", label: "Comunicada ao cliente por", type: "text" },
    ],
  },
  {
    no: 7,
    key: "execucao",
    title: "Execução + Qualidade",
    responsible: "Supervisor + Qualidade",
    intro:
      "Qualidade durante a obra, não só no fim. Autocontrolo = a Operação verifica e regista (foto). Ponto de paragem = a obra pára até a Qualidade confirmar.",
    fields: [
      {
        key: "checklist_entrega",
        label: "Checklist de entrega (antes de chamar o cliente)",
        type: "textarea",
        hint: "Pontos de controlo fechados · testes funcionais OK · acabamentos e limpeza · registo fotográfico final.",
      },
    ],
    itemSections: [
      {
        section: "control_point",
        title: "Pontos de controlo",
        columns: [
          { field: "label", label: "Ponto de controlo", type: "text", own: true },
          { field: "tipo", label: "Tipo (Paragem / Autocontrolo)", type: "text" },
          { field: "description", label: "Critério de aceitação", type: "text", own: true },
          { field: "resp", label: "Resp.", type: "text" },
          { field: "included", label: "Registo OK", type: "checkbox", own: true },
        ],
      },
    ],
  },
  {
    no: 8,
    key: "entrega",
    title: "Entrega e aceitação",
    responsible: "Supervisor",
    intro: "Auto de entrega · assinatura obrigatória do cliente.",
    fields: [
      { key: "obra_ref", label: "Obra / Referência", type: "text" },
      { key: "morada", label: "Morada", type: "text" },
      { key: "cliente", label: "Cliente", type: "text" },
      { key: "tipo_obra_contrato", label: "Tipo de obra / contrato", type: "text" },
      { key: "data_inicio", label: "Data de início", type: "date" },
      { key: "data_entrega", label: "Data de entrega", type: "date" },
      { key: "supervisor", label: "Supervisor / Responsável", type: "text" },
      { key: "pontos_abertos", label: "Pontos em aberto", type: "textarea" },
      { key: "assinatura_cliente_nome", label: "Assinatura do Cliente — Nome", type: "text" },
      { key: "assinatura_cliente_data", label: "Assinatura do Cliente — Data", type: "date" },
      { key: "assinatura_resp_nome", label: "Assinatura do Responsável — Nome", type: "text" },
      { key: "assinatura_resp_data", label: "Assinatura do Responsável — Data", type: "date" },
    ],
  },
  {
    no: 9,
    key: "posvenda",
    title: "Pós-venda / operação contínua",
    responsible: "Pós-venda / Conta",
    intro: "Onde o projeto acaba e o recorrente NÃO acaba.",
    fields: [
      // MUDELAR · obra
      { key: "handoff_posvenda", label: "Handoff para Pós-venda registado", type: "checkbox", variants: M },
      { key: "garantia_comunicada", label: "Garantia comunicada ao cliente", type: "checkbox", variants: M },
      { key: "acompanhamento_agendado", label: "Acompanhamento pós-obra agendado", type: "checkbox", variants: M },
      // BMG · contrato
      { key: "monitorizacao_sla", label: "Monitorização de SLA em cadência definida", type: "checkbox", variants: B },
      { key: "reporte_periodico", label: "Reporte periódico ao cliente", type: "checkbox", variants: B },
      { key: "reuniao_acompanhamento", label: "Reunião de acompanhamento / review", type: "checkbox", variants: B },
      { key: "renovacao_data_alerta", label: "Renovação de contrato — data de alerta", type: "date", variants: B },
    ],
  },
];

/** Registo de alterações (cross-cutting) — colunas para a tabela change_log. */
export const CHANGE_LOG_COLUMNS: DucItemSection = {
  section: "change_log",
  title: "Registo de alterações",
  hint: "Todo o imprevisto ou necessidade não orçamentada entra aqui. A obra deteta, o cliente decide.",
  columns: [
    { field: "data", label: "Data", type: "date" },
    { field: "detetado_por", label: "Detetado por", type: "text" },
    { field: "description", label: "Descrição da alteração / imprevisto", type: "text", own: true },
    { field: "impacto", label: "Impacto (prazo / custo)", type: "text" },
    { field: "included", label: "Aprov. cliente", type: "checkbox", own: true },
  ],
};

/** Devolve os campos de um bloco aplicáveis a uma variante. */
export function fieldsForVariant(fields: DucField[], variant: DucVariant): DucField[] {
  return fields.filter((f) => !f.variants || f.variants.includes(variant));
}

/** Secções de itens de uma etapa aplicáveis a uma variante. */
export function sectionsForVariant(stage: DucStage, variant: DucVariant): DucItemSection[] {
  return (stage.itemSections ?? []).filter((s) => !s.variants || s.variants.includes(variant));
}

/** Uma etapa aplica-se à variante? Verdadeiro se tiver campos OU secções aplicáveis. */
export function stageAppliesToVariant(stage: DucStage, variant: DucVariant): boolean {
  if (stage.variants && !stage.variants.includes(variant)) return false;
  return fieldsForVariant(stage.fields, variant).length > 0 || sectionsForVariant(stage, variant).length > 0;
}
