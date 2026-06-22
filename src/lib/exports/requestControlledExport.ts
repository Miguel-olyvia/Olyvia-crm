import { supabase } from "@/integrations/supabase/client";

import {
  downloadStandardXlsx,
  type StandardExportColumn,
  type StandardExportPayload,
} from "./xlsxExport";

export type ControlledExportModule = "clients" | "contacts" | "quotes";

interface ControlledExportResponse {
  filename: string;
  sheetName: string;
  columns: StandardExportColumn[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  includesSensitive: boolean;
}

interface ControlledExportClient {
  functions: {
    invoke: (
      name: string,
      options: { body: Record<string, unknown> },
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
}

export interface RequestControlledExportOptions {
  client?: ControlledExportClient;
  module: ControlledExportModule;
  organizationId: string;
  includeSensitive?: boolean;
  filters?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  download?: (payload: StandardExportPayload, filename: string) => void;
}

function isControlledExportResponse(value: unknown): value is ControlledExportResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<ControlledExportResponse>;
  return (
    typeof response.filename === "string" &&
    typeof response.sheetName === "string" &&
    Array.isArray(response.columns) &&
    Array.isArray(response.rows) &&
    typeof response.rowCount === "number"
  );
}

export async function requestControlledExport(
  options: RequestControlledExportOptions,
): Promise<{ rowCount: number; includesSensitive: boolean }> {
  const client = options.client ?? (supabase as unknown as ControlledExportClient);
  const download = options.download ?? downloadStandardXlsx;
  const { data, error } = await client.functions.invoke("export-data", {
    body: {
      module: options.module,
      organizationId: options.organizationId,
      includeSensitive: options.includeSensitive === true,
      filters: options.filters ?? {},
    },
  });

  if (error || !isControlledExportResponse(data)) {
    throw new Error("Não foi possível exportar os dados");
  }

  download(
    {
      sheetName: data.sheetName,
      columns: data.columns,
      rows: data.rows,
    },
    data.filename,
  );

  return {
    rowCount: data.rowCount,
    includesSensitive: data.includesSensitive === true,
  };
}
