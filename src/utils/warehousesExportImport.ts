import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";
import type { Database } from "@/integrations/supabase/types";

type WarehouseInsert = Database["public"]["Tables"]["warehouses"]["Insert"];

export const exportWarehousesToCSV = (warehouses: any[]) => {
  downloadStandardXlsx({
    sheetName: "Armazéns",
    columns: [
      { key: "name", header: "Nome", width: 28 },
      { key: "code", header: "Código", width: 16 },
      { key: "address", header: "Morada", width: 36 },
      { key: "city", header: "Cidade", width: 20 },
      { key: "postalCode", header: "Código postal", width: 16 },
      { key: "country", header: "País", width: 16 },
      { key: "manager", header: "Gestor", width: 24 },
      { key: "phone", header: "Telefone", width: 18 },
      { key: "email", header: "Email", width: 30 },
      { key: "capacity", header: "Capacidade", type: "number", width: 14 },
      { key: "active", header: "Ativo", type: "boolean", width: 10 },
      { key: "servesCustomers", header: "Serve clientes", type: "boolean", width: 14 },
      { key: "latitude", header: "Latitude", type: "number", width: 12 },
      { key: "longitude", header: "Longitude", type: "number", width: 12 },
    ],
    rows: warehouses.map((warehouse) => ({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      city: warehouse.city,
      postalCode: warehouse.postal_code,
      country: warehouse.country,
      manager: warehouse.manager_name,
      phone: warehouse.phone,
      email: warehouse.email,
      capacity: warehouse.capacity,
      active: warehouse.is_active,
      servesCustomers: warehouse.serves_customers,
      latitude: warehouse.latitude,
      longitude: warehouse.longitude,
    })),
  }, `armazens_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

type ImportField =
  | "name"
  | "code"
  | "address"
  | "city"
  | "postal_code"
  | "country"
  | "manager_name"
  | "phone"
  | "email"
  | "capacity"
  | "is_active"
  | "serves_customers"
  | "latitude"
  | "longitude";

/** Ordem das colunas do export — usada quando o cabeçalho não é reconhecido. */
const POSITIONAL_FIELDS: readonly ImportField[] = [
  "name",
  "code",
  "address",
  "city",
  "postal_code",
  "country",
  "manager_name",
  "phone",
  "email",
  "capacity",
  "is_active",
  "serves_customers",
  "latitude",
  "longitude",
];

const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

/** Cabeçalhos aceites (export em PT, nomes das colunas da BD e EN). */
const HEADER_ALIASES: Record<string, ImportField> = {
  nome: "name",
  name: "name",
  codigo: "code",
  code: "code",
  morada: "address",
  address: "address",
  cidade: "city",
  city: "city",
  "codigo postal": "postal_code",
  "postal code": "postal_code",
  pais: "country",
  country: "country",
  gestor: "manager_name",
  "manager name": "manager_name",
  manager: "manager_name",
  telefone: "phone",
  phone: "phone",
  email: "email",
  capacidade: "capacity",
  capacity: "capacity",
  ativo: "is_active",
  "is active": "is_active",
  active: "is_active",
  "serve clientes": "serves_customers",
  "serves customers": "serves_customers",
  latitude: "latitude",
  lat: "latitude",
  longitude: "longitude",
  long: "longitude",
  lng: "longitude",
};

const TRUE_VALUES = new Set(["sim", "s", "true", "1", "yes", "y", "verdadeiro"]);

/** Vazio → undefined (fica o default da BD); "Sim"/true/1 → true; resto → false. */
const parseBool = (raw: string | undefined): boolean | undefined => {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  return TRUE_VALUES.has(normalizeHeader(v));
};

/** Vazio → null; fora de [-limit, limit] ou não numérico → erro com o nº da linha. */
const parseCoordinate = (raw: string | undefined, limit: number, label: string, lineNo: number): number | null => {
  const v = (raw ?? "").trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < -limit || n > limit) {
    throw new Error(`Linha ${lineNo}: ${label} inválida ("${raw}"), tem de estar entre -${limit} e ${limit}`);
  }
  return n;
};

/**
 * CSV (;) → linhas para inserir em `warehouses`. Lê as colunas pelo cabeçalho
 * (nomes do export); se nenhum cabeçalho for reconhecido usa a ordem do
 * export. Colunas em falta (ou células vazias em Ativo / Serve clientes /
 * coordenadas) não são enviadas, ficando os defaults da BD
 * (is_active = true, serves_customers = true, coordenadas = null).
 */
export const parseWarehousesCSV = (text: string, userId: string, companyId: string): WarehouseInsert[] => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error("O ficheiro CSV está vazio ou inválido");
  }

  const splitLine = (line: string) =>
    line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

  const header = splitLine(lines[0]!);
  const mapped = header.map((h) => HEADER_ALIASES[normalizeHeader(h)]);
  const useHeader = mapped.some((f) => f === "name") && mapped.some((f) => f === "code");
  const columnIndex = new Map<ImportField, number>();
  if (useHeader) {
    mapped.forEach((field, i) => {
      if (field && !columnIndex.has(field)) columnIndex.set(field, i);
    });
  } else {
    POSITIONAL_FIELDS.forEach((field, i) => {
      if (i < header.length) columnIndex.set(field, i);
    });
  }

  const warehousesToInsert: WarehouseInsert[] = [];

  lines.slice(1).forEach((line, idx) => {
    const lineNo = idx + 2;
    const values = splitLine(line);
    const get = (field: ImportField): string | undefined => {
      const i = columnIndex.get(field);
      return i === undefined ? undefined : values[i];
    };

    const name = get("name");
    const code = get("code");
    if (!name || !code) return;

    const capacity = get("capacity");
    const row: WarehouseInsert = {
      name,
      code,
      address: get("address") || null,
      city: get("city") || null,
      postal_code: get("postal_code") || null,
      country: get("country") || null,
      manager_name: get("manager_name") || null,
      phone: get("phone") || null,
      email: get("email") || null,
      capacity: capacity ? parseInt(capacity) : null,
      created_by: userId,
      organization_id: companyId,
    };

    const isActive = parseBool(get("is_active"));
    if (isActive !== undefined) row.is_active = isActive;
    const servesCustomers = parseBool(get("serves_customers"));
    if (servesCustomers !== undefined) row.serves_customers = servesCustomers;

    const latitude = parseCoordinate(get("latitude"), 90, "latitude", lineNo);
    const longitude = parseCoordinate(get("longitude"), 180, "longitude", lineNo);
    if ((latitude === null) !== (longitude === null)) {
      throw new Error(`Linha ${lineNo}: indique latitude e longitude, ou deixe as duas vazias`);
    }
    if (latitude !== null && longitude !== null) {
      row.latitude = latitude;
      row.longitude = longitude;
    }

    warehousesToInsert.push(row);
  });

  return warehousesToInsert;
};
