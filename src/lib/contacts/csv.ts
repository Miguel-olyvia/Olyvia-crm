export interface ContactCsvRow {
  entityType: "person" | "organization";
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  vat: string;
  status: string;
}

export interface ParsedContactCsvRow extends ContactCsvRow {
  displayName: string;
}

const EXPORT_HEADERS = [
  "Tipo",
  "Nome",
  "Primeiro Nome",
  "Último Nome",
  "Empresa",
  "Email",
  "Telefone",
  "NIF",
  "Status",
] as const;

const HEADER_ALIASES: Record<string, keyof HeaderLookup> = {
  tipo: "type",
  type: "type",
  nome: "name",
  name: "name",
  primeironome: "firstName",
  firstname: "firstName",
  ultimonome: "lastName",
  apelido: "lastName",
  lastname: "lastName",
  empresa: "companyName",
  company: "companyName",
  companyname: "companyName",
  email: "email",
  telefone: "phone",
  phone: "phone",
  telemovel: "phone",
  nif: "vat",
  vat: "vat",
  taxid: "vat",
  status: "status",
  estado: "status",
};

interface HeaderLookup {
  type?: number;
  name?: number;
  firstName?: number;
  lastName?: number;
  companyName?: number;
  email?: number;
  phone?: number;
  vat?: number;
  status?: number;
}

export function serializeContactsCsv(rows: readonly ContactCsvRow[], includeBom: boolean = true): string {
  const csvRows = [
    [...EXPORT_HEADERS],
    ...rows.map((row) => {
      const displayName = buildDisplayName(row);
      return [
        row.entityType,
        displayName,
        row.firstName,
        row.lastName,
        row.companyName,
        row.email,
        row.phone,
        row.vat,
        row.status || "active",
      ];
    }),
  ];

  const csv = csvRows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(";"))
    .join("\r\n");

  return includeBom ? `\uFEFF${csv}` : csv;
}

export function parseContactsCsv(text: string): ParsedContactCsvRow[] {
  const rows = parseDelimitedRows(text.replace(/^\uFEFF/, ""), ";");
  if (rows.length < 2) return [];

  const headers = buildHeaderLookup(rows[0]);
  const parsed: ParsedContactCsvRow[] = [];

  for (const row of rows.slice(1)) {
    const raw = {
      type: readCell(row, headers.type),
      name: readCell(row, headers.name),
      firstName: readCell(row, headers.firstName),
      lastName: readCell(row, headers.lastName),
      companyName: readCell(row, headers.companyName),
      email: readCell(row, headers.email),
      phone: readCell(row, headers.phone),
      vat: readCell(row, headers.vat),
      status: readCell(row, headers.status) || "active",
    };

    const entityType = inferEntityType(raw.type, raw.companyName, raw.firstName, raw.lastName, raw.name);
    const normalized = normalizeNames(entityType, raw.name, raw.firstName, raw.lastName, raw.companyName);
    const displayName = buildDisplayName({
      entityType,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      companyName: normalized.companyName,
      email: raw.email,
      phone: raw.phone,
      vat: raw.vat,
      status: raw.status,
    });

    if (!displayName && !raw.email && !raw.phone && !raw.vat) continue;

    parsed.push({
      entityType,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      companyName: normalized.companyName,
      displayName,
      email: raw.email,
      phone: raw.phone,
      vat: raw.vat,
      status: raw.status,
    });
  }

  return parsed;
}

function escapeCsvCell(value: unknown): string {
  const text = `${value ?? ""}`;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") index += 1;
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  return rows;
}

function buildHeaderLookup(headers: readonly string[]): HeaderLookup {
  return headers.reduce<HeaderLookup>((lookup, header, index) => {
    const alias = HEADER_ALIASES[normalizeHeader(header)];
    if (alias) lookup[alias] = index;
    return lookup;
  }, {});
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readCell(row: readonly string[], index?: number): string {
  if (index === undefined) return "";
  return (row[index] || "").trim();
}

function inferEntityType(
  rawType: string,
  companyName: string,
  firstName: string,
  lastName: string,
  name: string,
): "person" | "organization" {
  const normalized = rawType.trim().toLowerCase();
  if (["organization", "company", "empresa", "org"].includes(normalized)) return "organization";
  if (normalized === "person" || normalized === "pessoa") return "person";
  if (companyName) return "organization";
  if (!firstName && !lastName && name) return "organization";
  return "person";
}

function normalizeNames(
  entityType: "person" | "organization",
  name: string,
  firstName: string,
  lastName: string,
  companyName: string,
) {
  if (entityType === "organization") {
    return {
      firstName: "",
      lastName: "",
      companyName: companyName || name,
    };
  }

  if (firstName || lastName) {
    return {
      firstName,
      lastName,
      companyName: "",
    };
  }

  const [resolvedFirstName, ...rest] = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: resolvedFirstName || "",
    lastName: rest.join(" "),
    companyName: "",
  };
}

function buildDisplayName(row: ContactCsvRow): string {
  if (row.entityType === "organization") {
    return row.companyName.trim();
  }

  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
}
