// Preparar a «Nova lead» de Pessoas: os campos base, a validação e a extração de nome, email, telefone e NIF dos valores do formulário.
// Cópia de AnewLeads.tsx:3385-3519 e 4426-4438 (a página de Leads não se altera); funções puras, sem toasts. O nome sai como em Leads
// (os campos de texto cuja chave tem «nome» ou «name», incluindo «company_name», juntam-se ao nome: é o comportamento que se copia).
import { isBaseFieldCoveredByCampaignFields, stripCampaignCoveredBaseValues } from "./coberturaCampanha";
import { validateLeadFieldValues, type LeadFieldError } from "./validarCamposLead";
import type { Escrito } from "./tiposNovaLead";

/** A definição de um campo do formulário (base, da campanha ou do formulário da campanha). */
export interface DefinicaoCampo {
  id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  contact_field_mapping?: string | null;
  client_field_mapping?: string | null;
  options?: { options?: string[] } | null;
  placeholder?: string | null;
  help_text?: string | null;
  display_style?: string | null;
  pattern?: string | null;
  pattern_message?: string | null;
  min_length?: number | null;
  max_length?: number | null;
}

export type Traduzir = (chave: string) => string;

/**
 * Os campos base do diálogo, sempre: nome próprio e apelido (obrigatórios), email, telefone, empresa e notas. A morada saiu por RGPD
 * (a morada só se pede no fluxo de cliente e faturação). As etiquetas vêm das traduções de Pessoas.
 */
export function camposBase(t: Traduzir): DefinicaoCampo[] {
  const F = "pessoasPagina.real.newLead.fields.";
  return [
    { id: "base_first_name", field_key: "first_name", field_label: t(`${F}firstName`), field_type: "text", is_required: true, contact_field_mapping: "first_name" },
    { id: "base_last_name", field_key: "last_name", field_label: t(`${F}lastName`), field_type: "text", is_required: true, contact_field_mapping: "last_name" },
    { id: "base_email", field_key: "email", field_label: t(`${F}email`), field_type: "email", is_required: false, contact_field_mapping: "email" },
    { id: "base_phone", field_key: "phone", field_label: t(`${F}phone`), field_type: "phone", is_required: false, contact_field_mapping: "phone" },
    { id: "base_company", field_key: "company_name", field_label: t(`${F}companyName`), field_type: "text", is_required: false, client_field_mapping: "name" },
    { id: "base_notes", field_key: "notes", field_label: t(`${F}notes`), field_type: "textarea", is_required: false },
  ];
}

/** O que se extrai dos valores: o que se grava na pessoa e na lead. */
export interface DadosLead {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  telefone: string;
  nif: string;
}

const mapeamento = (d: DefinicaoCampo): string | null | undefined => d.contact_field_mapping;

/** Extrai nome, email, telefone e NIF pelos mapeamentos e pelos nomes das chaves (AnewLeads.tsx:3477-3519). */
export function extrairDados(defs: readonly DefinicaoCampo[], valores: Readonly<Record<string, unknown>>): DadosLead {
  let displayName = "";
  let email = "";
  let telefone = "";
  let nif = "";
  for (const def of defs) {
    const val = valores[def.field_key];
    if (!val) continue;
    const mapping = mapeamento(def);
    const key = def.field_key.toLowerCase();
    const tipo = def.field_type;
    if (mapping === "first_name" || mapping === "last_name" || mapping === "full_name" || (tipo === "text" && (key.includes("nome") || key.includes("name")))) {
      displayName = displayName ? `${displayName} ${val}` : String(val);
    }
    if (mapping === "email" || tipo === "email" || key.includes("email")) email = String(val);
    if (mapping === "phone" || tipo === "phone" || key.includes("phone") || key.includes("telefone") || key.includes("telemovel")) telefone = String(val);
    if (mapping === "vat" || key.includes("vat") || key.includes("nif")) nif = String(val);
  }
  email = email.trim().toLowerCase();
  telefone = telefone.trim();
  nif = nif.trim().toUpperCase();
  if (!displayName) displayName = email || telefone || "Lead sem nome";

  const mapeado = (chave: string): string | null => {
    for (const def of defs) if (mapeamento(def) === chave && valores[def.field_key]) return String(valores[def.field_key]);
    return null;
  };
  const partes = displayName.trim().split(" ");
  return {
    displayName,
    firstName: mapeado("first_name") ?? (partes[0] || null),
    lastName: mapeado("last_name") ?? (partes.length > 1 ? partes.slice(1).join(" ") : null),
    email,
    telefone,
    nif,
  };
}

export interface LeadPreparada {
  /** Os valores a gravar: sem os campos base que a campanha cobre. */
  valores: Record<string, unknown>;
  erros: LeadFieldError[];
  /** O que se escreveu, para procurar duplicados (vazio é null). */
  escrito: Escrito;
  dados: DadosLead;
  /** Os campos que contam para a lead (os base visíveis e os da campanha). */
  definicoes: DefinicaoCampo[];
}

/**
 * Valida os campos visíveis e extrai os dados. Os campos base que a campanha cobre não são desenhados, por isso nem se validam nem se
 * gravam (o que a pessoa escreveu antes de escolher a campanha ficava em memória e era gravado na mesma).
 */
export function prepararLead(args: {
  base: readonly DefinicaoCampo[]; campanha: readonly DefinicaoCampo[]; valores: Readonly<Record<string, unknown>>;
}): LeadPreparada {
  const visiveis = args.base.filter((b) => !isBaseFieldCoveredByCampaignFields(b.field_key, args.campanha));
  const definicoes = [...visiveis, ...args.campanha];
  const valores = stripCampaignCoveredBaseValues(args.valores, args.base, args.campanha);
  const erros = validateLeadFieldValues(definicoes, valores);
  const dados = extrairDados(definicoes, valores);
  return {
    valores,
    erros,
    dados,
    definicoes,
    escrito: { nome: dados.displayName, email: dados.email || null, telefone: dados.telefone || null, nif: dados.nif || null },
  };
}
