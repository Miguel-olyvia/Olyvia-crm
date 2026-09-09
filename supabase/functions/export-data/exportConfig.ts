export type ExportModule = "clients" | "contacts" | "quotes" | "leads" | "proposals" | "client_contracts";
export type ExportCellType = "text" | "number" | "date" | "boolean";

export interface ExportColumnDefinition {
  key: string;
  header: string;
  type?: ExportCellType;
  width?: number;
  sensitive?: boolean;
}

export interface ExportDefinition {
  module: ExportModule;
  sheetName: string;
  filenamePrefix: string;
  basePermission: string;
  sensitivePermission: string;
  viewPermission: string;
  columns: ExportColumnDefinition[];
}

const DEFINITIONS: Record<ExportModule, ExportDefinition> = {
  clients: {
    module: "clients",
    sheetName: "Clientes",
    filenamePrefix: "clientes",
    basePermission: "clients.export",
    sensitivePermission: "clients.export_sensitive",
    viewPermission: "clients.view",
    columns: [
      { key: "name", header: "Nome", width: 30 },
      { key: "status", header: "Estado", width: 16 },
      { key: "clientType", header: "Tipo", width: 16 },
      { key: "assignedTo", header: "Comercial", width: 24 },
      { key: "createdAt", header: "Criado em", type: "date", width: 14 },
      { key: "email", header: "Email", width: 30, sensitive: true },
      { key: "phone", header: "Telefone", width: 18, sensitive: true },
      { key: "vat", header: "NIF", width: 16, sensitive: true },
    ],
  },
  contacts: {
    module: "contacts",
    sheetName: "Contactos",
    filenamePrefix: "contactos",
    basePermission: "contacts.export",
    sensitivePermission: "contacts.export_sensitive",
    viewPermission: "contacts.view",
    columns: [
      { key: "name", header: "Nome", width: 30 },
      { key: "entityType", header: "Tipo", width: 16 },
      { key: "position", header: "Cargo", width: 24 },
      { key: "status", header: "Estado", width: 16 },
      { key: "createdAt", header: "Criado em", type: "date", width: 14 },
      { key: "email", header: "Email", width: 30, sensitive: true },
      { key: "phone", header: "Telefone", width: 18, sensitive: true },
      { key: "vat", header: "NIF", width: 16, sensitive: true },
    ],
  },
  quotes: {
    module: "quotes",
    sheetName: "Orçamentos",
    filenamePrefix: "orcamentos",
    basePermission: "quotes.export",
    sensitivePermission: "quotes.export_sensitive",
    viewPermission: "quotes.view",
    columns: [
      { key: "quoteNumber", header: "N.º Orçamento", width: 18 },
      { key: "organization", header: "Organização", width: 28 },
      { key: "client", header: "Cliente", width: 30 },
      { key: "status", header: "Estado", width: 16 },
      { key: "createdAt", header: "Criado em", type: "date", width: 14 },
      { key: "total", header: "Valor total", type: "number", width: 16 },
      { key: "currency", header: "Moeda", width: 10 },
      { key: "baseModel", header: "Modelo base", width: 20 },
      { key: "siteAddress", header: "Morada da obra", width: 36, sensitive: true },
    ],
  },
  leads: {
    module: "leads",
    sheetName: "Leads",
    filenamePrefix: "leads",
    basePermission: "leads.export",
    sensitivePermission: "leads.export_sensitive",
    viewPermission: "leads.view",
    columns: [
      { key: "name", header: "Nome", width: 30 },
      { key: "status", header: "Estado", width: 16 },
      { key: "source", header: "Origem", width: 20 },
      { key: "assignedTo", header: "Responsável", width: 24 },
      { key: "createdAt", header: "Criado em", type: "date", width: 14 },
      { key: "email", header: "Email", width: 30, sensitive: true },
      { key: "phone", header: "Telefone", width: 18, sensitive: true },
      { key: "vat", header: "NIF", width: 16, sensitive: true },
    ],
  },
  // Neither proposals nor client_contracts have a column marked `sensitive`
  // (product decision — see task notes: no proposal column is personal data,
  // and the contracts EMAIL column is already visible to anyone with
  // `client_contracts.view` in the UI, so exporting it reveals nothing new).
  // `sensitivePermission` is set equal to `basePermission` rather than minted
  // as a separate, never-checked permission: since no column carries
  // `sensitive: true`, `getEffectiveColumns` always returns every column
  // regardless of `includeSensitive`, so a distinct sensitive permission would
  // never gate anything real. This also means the frontend never needs to show
  // the "com ou sem dados sensíveis" dialog for these two modules.
  proposals: {
    module: "proposals",
    sheetName: "Propostas",
    filenamePrefix: "propostas",
    basePermission: "proposals.export",
    sensitivePermission: "proposals.export",
    viewPermission: "proposals.view",
    columns: [
      { key: "title", header: "Título", width: 30 },
      { key: "client", header: "Cliente", width: 30 },
      { key: "assignedTo", header: "Comercial", width: 24 },
      { key: "deal", header: "Pedido", width: 24 },
      { key: "value", header: "Valor", type: "number", width: 16 },
      { key: "status", header: "Estado", width: 18 },
      { key: "validUntil", header: "Válido até", type: "date", width: 14 },
      { key: "pipeline", header: "Pipeline", width: 36 },
      { key: "portal", header: "Portal", width: 16 },
      { key: "createdAt", header: "Criado em", type: "date", width: 14 },
    ],
  },
  client_contracts: {
    module: "client_contracts",
    sheetName: "Contratos",
    filenamePrefix: "contratos",
    basePermission: "client_contracts.export",
    sensitivePermission: "client_contracts.export",
    viewPermission: "client_contracts.view",
    columns: [
      { key: "number", header: "Número", width: 18 },
      { key: "client", header: "Cliente", width: 30 },
      { key: "proposal", header: "Proposta", width: 30 },
      { key: "value", header: "Valor", type: "number", width: 16 },
      { key: "period", header: "Período", width: 24 },
      { key: "progress", header: "Progresso", width: 20 },
      { key: "renewal", header: "Renovação", width: 18 },
      { key: "status", header: "Estado", width: 18 },
      { key: "signature", header: "Assinatura", width: 24 },
      { key: "email", header: "Email", width: 30 },
      { key: "pipeline", header: "Pipeline", width: 24 },
      { key: "portal", header: "Portal", width: 16 },
      { key: "assignedTo", header: "Comercial", width: 24 },
    ],
  },
};

export function isSupportedExportModule(value: string): value is ExportModule {
  return Object.prototype.hasOwnProperty.call(DEFINITIONS, value);
}

export function getExportDefinition(value: string): ExportDefinition {
  if (!isSupportedExportModule(value)) {
    throw new Error("Unsupported export module");
  }
  return DEFINITIONS[value];
}

export function getEffectiveColumns(
  definition: ExportDefinition,
  includeSensitive: boolean,
): ExportColumnDefinition[] {
  return definition.columns.filter((column) => includeSensitive || !column.sensitive);
}
