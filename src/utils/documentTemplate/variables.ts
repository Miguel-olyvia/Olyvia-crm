// Brace-style document template variables ({{cliente_nome}}, ...) used by
// proposal / quote / contract PDF and HTML templates.
//
// This registry is ADDITIVE and DESCRIPTIVE only. It does not replace
// `src/utils/contractVariables.ts` (which still owns the substitution
// logic and the keys actually persisted in user templates). The picker
// reads from here to render a unified, context-aware UI.
//
// Distinct from `src/utils/documentVariables/` (dot-style keys used by
// email/proposal-link variable resolution — different system).

export type DocumentVariableContext = "proposal" | "quote" | "contract";

export type DocumentVariableGroup =
  | "empresa"
  | "cliente"
  | "comercial"
  | "documento"
  | "orcamento"
  | "contrato"
  | "sistema";

export interface DocumentVariable {
  key: string; // e.g. "{{cliente_nome}}"
  label: string;
  description: string;
  group: DocumentVariableGroup;
  contexts: DocumentVariableContext[];
  aliases?: string[];
}

export const DOCUMENT_TEMPLATE_VARIABLES: DocumentVariable[] = [
  // Empresa
  { key: "{{empresa_nome}}",   label: "Nome da Empresa",   description: "Nome da organização",  group: "empresa", contexts: ["proposal", "quote", "contract"] },
  { key: "{{empresa_nif}}",    label: "NIF da Empresa",    description: "NIF da organização",   group: "empresa", contexts: ["proposal", "quote", "contract"] },
  { key: "{{empresa_morada}}", label: "Morada da Empresa", description: "Morada da organização", group: "empresa", contexts: ["proposal", "quote", "contract"] },

  // Cliente
  { key: "{{cliente_nome}}",     label: "Nome do Cliente",     description: "Nome do cliente/contacto", group: "cliente", contexts: ["proposal", "quote", "contract"] },
  { key: "{{cliente_nif}}",      label: "NIF do Cliente",      description: "NIF do cliente",           group: "cliente", contexts: ["proposal", "quote", "contract"] },
  { key: "{{cliente_morada}}",   label: "Morada do Cliente",   description: "Morada do cliente",        group: "cliente", contexts: ["proposal", "quote", "contract"] },
  { key: "{{cliente_email}}",    label: "Email do Cliente",    description: "Email do cliente",         group: "cliente", contexts: ["proposal", "quote", "contract"] },
  { key: "{{cliente_telefone}}", label: "Telefone do Cliente", description: "Telefone do cliente",      group: "cliente", contexts: ["proposal", "quote", "contract"] },

  // Comercial
  { key: "{{comercial_nome}}", label: "Nome do Comercial", description: "Nome do comercial responsável", group: "comercial", contexts: ["proposal", "quote", "contract"] },

  // Sistema
  { key: "{{data_atual}}", label: "Data Atual", description: "Data de hoje", group: "sistema", contexts: ["proposal", "quote", "contract"] },

  // Orçamento
  { key: "{{orcamento_itens}}", label: "Itens do Orçamento", description: "Tabela com itens do orçamento (respeita configuração do layout)", group: "orcamento", contexts: ["proposal", "quote", "contract"], aliases: ["{{tabela_artigos}}"] },

  // Documento (proposta)
  { key: "{{proposta_numero}}", label: "Nº da Proposta", description: "Número da proposta associada", group: "documento", contexts: ["proposal", "contract"] },

  // Contrato
  { key: "{{contrato_numero}}",         label: "Nº do Contrato",         description: "Número do contrato (CC-2026-XXXX)",   group: "contrato", contexts: ["contract"] },
  { key: "{{contrato_valor}}",          label: "Valor do Contrato",      description: "Valor total do contrato",             group: "contrato", contexts: ["contract"] },
  { key: "{{contrato_valor_extenso}}",  label: "Valor por Extenso",      description: "Valor do contrato por extenso",       group: "contrato", contexts: ["contract"] },
  { key: "{{contrato_data_inicio}}",    label: "Data de Início",         description: "Data de início do contrato",          group: "contrato", contexts: ["contract"] },
  { key: "{{contrato_data_fim}}",       label: "Data de Fim",            description: "Data de fim do contrato",             group: "contrato", contexts: ["contract"] },
  { key: "{{contrato_duracao}}",        label: "Duração",                description: "Duração do contrato (ex: 12 meses)",  group: "contrato", contexts: ["contract"] },
];


export function getDocumentTemplateVariablesForContext(context: DocumentVariableContext): DocumentVariable[] {
  return DOCUMENT_TEMPLATE_VARIABLES.filter((v) => v.contexts.includes(context));
}

export function groupDocumentTemplateVariables(
  variables: DocumentVariable[],
): Partial<Record<DocumentVariableGroup, DocumentVariable[]>> {
  const out: Partial<Record<DocumentVariableGroup, DocumentVariable[]>> = {};
  for (const v of variables) {
    (out[v.group] ||= []).push(v);
  }
  return out;
}

export const DOCUMENT_VARIABLE_GROUP_LABELS: Record<DocumentVariableGroup, string> = {
  empresa:   "Empresa",
  cliente:   "Cliente",
  comercial: "Comercial",
  documento: "Documento",
  orcamento: "Orçamento",
  contrato:  "Contrato",
  sistema:   "Sistema",
};
