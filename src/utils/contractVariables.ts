// Contract template variable definitions and substitution logic.
//
// Adapter sobre `documentVariables/registry.ts`: campos simples (cliente_*,
// empresa_*, comercial_*) são resolvidos via registry partilhado com paridade
// frontend↔edge. Lógica específica de contrato (valor por extenso, duração,
// datas formatadas pt-PT, tabela de artigos, highlight mode) fica aqui.

import { getVariableDefinition, resolveAlias } from "./documentVariables/registry";
import type { RenderContext } from "./documentVariables/context";
import { EMPTY_CLIENT, EMPTY_COMPANY, EMPTY_COMMERCIAL } from "./documentVariables/context";


export const CONTRACT_VARIABLES = [
  { key: "{{empresa_nome}}", label: "Nome da Empresa", description: "Nome da organização" },
  { key: "{{empresa_nif}}", label: "NIF da Empresa", description: "NIF da organização" },
  { key: "{{empresa_morada}}", label: "Morada da Empresa", description: "Morada da organização" },
  { key: "{{cliente_nome}}", label: "Nome do Cliente", description: "Nome do cliente/contacto" },
  { key: "{{cliente_nif}}", label: "NIF do Cliente", description: "NIF do cliente" },
  { key: "{{cliente_morada}}", label: "Morada do Cliente", description: "Morada do cliente" },
  { key: "{{cliente_email}}", label: "Email do Cliente", description: "Email do cliente" },
  { key: "{{cliente_telefone}}", label: "Telefone do Cliente", description: "Telefone do cliente" },
  { key: "{{cliente_localidade}}", label: "Localidade do Cliente", description: "Código postal e cidade do cliente" },
  { key: "{{contrato_numero}}", label: "Nº do Contrato", description: "Número do contrato (CC-2026-XXXX)" },
  { key: "{{contrato_valor}}", label: "Valor do Contrato", description: "Valor total do contrato" },
  { key: "{{contrato_valor_extenso}}", label: "Valor por Extenso", description: "Valor do contrato por extenso" },
  { key: "{{contrato_data_inicio}}", label: "Data de Início", description: "Data de início do contrato" },
  { key: "{{contrato_data_fim}}", label: "Data de Fim", description: "Data de fim do contrato" },
  { key: "{{contrato_duracao}}", label: "Duração", description: "Duração do contrato (ex: 12 meses)" },
  { key: "{{proposta_numero}}", label: "Nº da Proposta", description: "Número da proposta associada" },
  { key: "{{proposta_valor}}", label: "Valor da Proposta", description: "Valor da proposta original" },
  { key: "{{proposta_data}}", label: "Data da Proposta", description: "Data de emissão da proposta" },
  { key: "{{orcamento_itens}}", label: "Itens do Orçamento", description: "Tabela com itens do orçamento (respeita configuração do layout da minuta)" },
  { key: "{{tabela_artigos}}", label: "Tabela de Artigos (alias)", description: "Alias de {{orcamento_itens}} — mesma tabela" },
  { key: "{{comercial_nome}}", label: "Nome do Comercial", description: "Nome do comercial responsável" },
  { key: "{{comercial_email}}", label: "Email do Comercial", description: "Email do comercial responsável" },
  { key: "{{comercial_telefone}}", label: "Telefone do Comercial", description: "Telefone do comercial responsável" },
  { key: "{{signatario_nome}}", label: "Nome do Signatário", description: "Nome do signatário pela empresa (configurado em Assinaturas)" },
  { key: "{{signatario_cargo}}", label: "Cargo do Signatário", description: "Cargo/role do signatário pela empresa" },
  { key: "{{data_atual}}", label: "Data Atual", description: "Data de hoje" },
];


// Convert number to Portuguese words
function numberToPortugueseWords(num: number): string {
  if (num === 0) return "zero euros";
  
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function convertGroup(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";
    
    let result = "";
    if (n >= 100) {
      result += hundreds[Math.floor(n / 100)];
      n %= 100;
      if (n > 0) result += " e ";
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)];
      n %= 10;
      if (n > 0) result += " e ";
    }
    if (n >= 10) {
      result += teens[n - 10];
      return result;
    }
    if (n > 0) {
      result += units[n];
    }
    return result;
  }

  const euros = Math.floor(num);
  const cents = Math.round((num - euros) * 100);
  
  let result = "";
  
  if (euros >= 1000) {
    const thousands = Math.floor(euros / 1000);
    if (thousands === 1) {
      result += "mil";
    } else {
      result += convertGroup(thousands) + " mil";
    }
    const remainder = euros % 1000;
    if (remainder > 0) {
      result += (remainder < 100 ? " e " : " ") + convertGroup(remainder);
    }
  } else {
    result = convertGroup(euros);
  }
  
  result += euros === 1 ? " euro" : " euros";
  
  if (cents > 0) {
    result += " e " + convertGroup(cents) + (cents === 1 ? " cêntimo" : " cêntimos");
  }
  
  return result;
}

function calculateDuration(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "—";
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (months <= 0) {
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} dias`;
  }
  return `${months} meses`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

export interface ContractVariableData {
  empresa_nome?: string;
  empresa_nif?: string;
  empresa_morada?: string;
  cliente_nome?: string;
  cliente_nif?: string;
  cliente_morada?: string;
  cliente_email?: string;
  cliente_telefone?: string;
  contrato_numero?: string;
  contrato_valor?: number;
  contrato_data_inicio?: string;
  contrato_data_fim?: string;
  proposta_numero?: string;
  proposta_valor?: number;
  proposta_data?: string;
  orcamento_itens?: {
    descricao: string;
    qtd: number;
    unidade: string;
    valor: number;
    preco_unitario?: number;
    kind?: "product" | "service" | "bundle" | "manual";
    components?: { descricao: string; qtd: number; unidade?: string }[];
  }[];
  signatarios?: { nome: string; email: string; papel: string; ordem: number }[];
  comercial_nome?: string;
  comercial_email?: string;
  comercial_telefone?: string;
  signatario_nome?: string;
  signatario_cargo?: string;
}


export function substituteVariables(html: string, data: ContractVariableData, highlightMode: boolean = false): string {
  // Alias legado: {{tabela_artigos}} deve produzir a mesma tabela que {{orcamento_itens}}.
  let result = html.split("{{tabela_artigos}}").join("{{orcamento_itens}}");

  const missingPlaceholder = (label: string) =>
    highlightMode
      ? `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:3px;font-weight:500;">[${label} em falta]</span>`
      : "____________";

  const filledWrap = (value: string) =>
    highlightMode
      ? `<span style="background:#d1fae5;color:#065f46;padding:2px 4px;border-radius:3px;font-weight:500;">${value}</span>`
      : value;

  const resolveValue = (value: string | undefined | null, fallbackLabel: string): string => {
    if (value && value !== "—") return filledWrap(value);
    return missingPlaceholder(fallbackLabel);
  };

  // Constrói RenderContext a partir do ContractVariableData para
  // resolver os campos simples via registry partilhado.
  const ctx: RenderContext = {
    client: {
      ...EMPTY_CLIENT,
      display_name: data.cliente_nome || "",
      email: data.cliente_email || "",
      phone: data.cliente_telefone || "",
      vat: data.cliente_nif || "",
      address: data.cliente_morada || "",
    },
    company: {
      ...EMPTY_COMPANY,
      name: data.empresa_nome || "",
      vat: data.empresa_nif || "",
      address: data.empresa_morada || "",
    },
    commercial: {
      ...EMPTY_COMMERCIAL,
      name: data.comercial_nome || "",
    },
    authUser: null,
  };

  // Resolve um alias pt-PT via registry (mantém o mesmo valor, mas com fonte única).
  const fromRegistry = (alias: string): string => {
    const def = getVariableDefinition(resolveAlias(alias));
    return def ? def.defaultResolver(ctx) : "";
  };

  const replacements: Record<string, string> = {
    "{{empresa_nome}}": resolveValue(fromRegistry("empresa_nome"), "Nome da empresa"),
    "{{empresa_nif}}": resolveValue(fromRegistry("empresa_nif"), "NIF da empresa"),
    "{{empresa_morada}}": resolveValue(fromRegistry("empresa_morada"), "Morada da empresa"),
    "{{cliente_nome}}": resolveValue(fromRegistry("cliente_nome"), "Nome do cliente"),
    "{{cliente_nif}}": resolveValue(fromRegistry("cliente_nif"), "NIF do cliente"),
    "{{cliente_morada}}": resolveValue(fromRegistry("cliente_morada"), "Morada do cliente"),
    "{{cliente_email}}": resolveValue(fromRegistry("cliente_email"), "Email do cliente"),
    "{{cliente_telefone}}": resolveValue(fromRegistry("cliente_telefone"), "Telefone do cliente"),
    "{{comercial_nome}}": resolveValue(fromRegistry("comercial_nome"), "Nome do comercial"),
    "{{comercial_email}}": resolveValue(data.comercial_email, "Email do comercial"),
    "{{comercial_telefone}}": resolveValue(data.comercial_telefone, "Telefone do comercial"),
    "{{contrato_numero}}": resolveValue(data.contrato_numero, "Nº do contrato"),
    "{{contrato_valor}}": data.contrato_valor != null
      ? filledWrap((() => { const f = Math.abs(data.contrato_valor!).toFixed(2); const [i, d] = f.split('.'); return '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; })())
      : missingPlaceholder("Valor do contrato"),
    "{{contrato_valor_extenso}}": data.contrato_valor != null
      ? filledWrap(numberToPortugueseWords(data.contrato_valor))
      : missingPlaceholder("Valor por extenso"),
    "{{contrato_data_inicio}}": data.contrato_data_inicio
      ? filledWrap(formatDate(data.contrato_data_inicio))
      : missingPlaceholder("Data de início"),
    "{{contrato_data_fim}}": data.contrato_data_fim
      ? filledWrap(formatDate(data.contrato_data_fim))
      : missingPlaceholder("Data de fim"),
    "{{contrato_duracao}}": data.contrato_data_inicio && data.contrato_data_fim
      ? filledWrap(calculateDuration(data.contrato_data_inicio, data.contrato_data_fim))
      : missingPlaceholder("Duração"),
    "{{proposta_numero}}": resolveValue(data.proposta_numero, "Nº da proposta"),
    "{{proposta_valor}}": data.proposta_valor != null
      ? filledWrap((() => { const f = Math.abs(data.proposta_valor!).toFixed(2); const [i, d] = f.split('.'); return '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; })())
      : missingPlaceholder("Valor da proposta"),
    "{{proposta_data}}": data.proposta_data
      ? filledWrap(formatDate(data.proposta_data))
      : missingPlaceholder("Data da proposta"),
    "{{data_atual}}": filledWrap(formatDate(new Date().toISOString())),
    "{{cliente_localidade}}": resolveValue((data as any).cliente_localidade, "Localidade"),
  };


  // Handle orcamento_itens separately (generates a table)
  if (data.orcamento_itens && data.orcamento_itens.length > 0) {
    const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:10px 0;color:#111827;">
      <thead><tr style="background:#f3f4f6;">
        <th style="border:1px solid #d1d5db;padding:8px;text-align:left;color:#111827;">Descrição</th>
        <th style="border:1px solid #d1d5db;padding:8px;text-align:center;color:#111827;">Qtd</th>
        <th style="border:1px solid #d1d5db;padding:8px;text-align:center;color:#111827;">Un.</th>
        <th style="border:1px solid #d1d5db;padding:8px;text-align:right;color:#111827;">Valor</th>
      </tr></thead>
      <tbody>${data.orcamento_itens.map(item => `<tr>
        <td style="border:1px solid #d1d5db;padding:8px;color:#111827;">${item.descricao}</td>
        <td style="border:1px solid #d1d5db;padding:8px;text-align:center;color:#111827;">${item.qtd}</td>
        <td style="border:1px solid #d1d5db;padding:8px;text-align:center;color:#111827;">${item.unidade}</td>
        <td style="border:1px solid #d1d5db;padding:8px;text-align:right;color:#111827;">€${item.valor.toFixed(2)}</td>
      </tr>`).join("")}</tbody>
    </table>`;
    replacements["{{orcamento_itens}}"] = highlightMode ? filledWrap(tableHtml) : tableHtml;
  } else {
    replacements["{{orcamento_itens}}"] = missingPlaceholder("Itens do orçamento");
  }

  for (const [key, value] of Object.entries(replacements)) {
    while (result.includes(key)) {
      result = result.replace(key, value);
    }
  }

  // Generic pass for custom variables: any remaining {{key}} token whose bare
  // key has a string/number value on `data` is substituted. Unknown tokens are
  // left untouched so downstream cleaners or templates can handle them.
  result = result.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const v = (data as any)[key];
    if (v == null || v === "") return match;
    if (typeof v === "string" || typeof v === "number") return filledWrap(String(v));
    return match;
  });


  return result;
}


// Sample data for preview
export const SAMPLE_VARIABLE_DATA: ContractVariableData = {
  empresa_nome: "Mudelar",
  empresa_nif: "514234567",
  empresa_morada: "Rua da Empresa 42, 1200-100 Lisboa",
  cliente_nome: "Adelino Armindo",
  cliente_nif: "123456789",
  cliente_morada: "Rua do Brejo n4 2esq, 2615-339 Alverca",
  cliente_email: "adelino@email.com",
  cliente_telefone: "912 345 678",
  contrato_numero: "CC-2026-0003",
  contrato_valor: 392.37,
  contrato_data_inicio: "2026-03-13",
  contrato_data_fim: "2027-03-13",
  proposta_numero: "P-2026-0004",
  orcamento_itens: [
    { descricao: "Remodelação cozinha", qtd: 1, unidade: "vg", valor: 320.00 },
    { descricao: "Material acabamento", qtd: 1, unidade: "vg", valor: 72.37 },
  ],
  signatarios: [
    { nome: "Mudelar, Lda.", email: "geral@mudelar.pt", papel: "Primeira Contratante", ordem: 1 },
    { nome: "Adelino Armindo", email: "adelino@email.com", papel: "Segundo Contratante", ordem: 2 },
  ],
  comercial_nome: "Ricardo Pereira",
  comercial_email: "ricardo@mudelar.pt",
  comercial_telefone: "917 000 000",
  proposta_valor: 380.50,
  proposta_data: "2026-02-20",
  signatario_nome: "Ricardo Pereira",
  signatario_cargo: "Administrador",
};

(SAMPLE_VARIABLE_DATA as any).cliente_localidade = "2615-399 Alverca do Ribatejo";

