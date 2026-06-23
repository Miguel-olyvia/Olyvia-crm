export type ExportModule = "clients" | "contacts" | "quotes" | "leads";
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
