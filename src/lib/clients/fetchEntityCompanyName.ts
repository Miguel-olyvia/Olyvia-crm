/**
 * Le a empresa da ficha (anew_entities.company_name) numa consulta propria.
 *
 * Nao vai para o useEntityIdentity partilhado de proposito: a coluna so existe
 * depois de a migration do nome unico estar aplicada, e um select de coluna
 * inexistente parte TODAS as leituras da ficha em todos os ecras. Aqui o erro de
 * «coluna nao existe» e tolerado (a empresa fica desconhecida e o ecra comporta-se
 * como antes), por isso o codigo pode ser publicado antes ou depois da migration.
 */
export type EntityCompanyResult =
  | { status: "ok"; company: string | null }
  | { status: "no-column"; company: null }
  | { status: "error"; company: null; error: unknown };

interface CompanyReader {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

const isMissingColumn = (error: unknown): boolean => {
  const e = (error ?? {}) as { code?: string; message?: string };
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const message = (e.message ?? "").toLowerCase();
  return message.includes("company_name") && (message.includes("does not exist") || message.includes("could not find"));
};

export async function fetchEntityCompanyName(
  client: unknown,
  entityId: string | null | undefined,
): Promise<EntityCompanyResult> {
  if (!entityId) return { status: "no-column", company: null };
  try {
    const { data, error } = await (client as CompanyReader)
      .from("anew_entities")
      .select("company_name")
      .eq("id", entityId)
      .maybeSingle();
    if (error) {
      return isMissingColumn(error)
        ? { status: "no-column", company: null }
        : { status: "error", company: null, error };
    }
    const raw = (data as { company_name?: unknown } | null)?.company_name;
    const company = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    return { status: "ok", company };
  } catch (error) {
    return { status: "error", company: null, error };
  }
}
