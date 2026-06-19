/**
 * Extracts a human-readable error message from various error shapes
 * (Supabase FunctionsHttpError, fetch Response, Error, string) and maps
 * known technical messages to friendly Portuguese messages.
 */

const FRIENDLY_MAP: Array<{ match: RegExp; message: string }> = [
  {
    match: /Nenhum SMTP ativo encontrado/i,
    message:
      "Não há servidor de email (SMTP) configurado. Vá a Definições → Email e ative uma conta SMTP antes de enviar.",
  },
  { match: /SMTP/i, message: "Falha ao contactar o servidor de email (SMTP). Verifique as credenciais em Definições → Email." },
  { match: /rate limit|too many requests/i, message: "Demasiadas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente." },
  { match: /unauthorized|not authenticated|jwt/i, message: "Sessão expirada. Por favor inicie sessão novamente." },
  { match: /forbidden|not allowed|permission/i, message: "Não tem permissão para executar esta ação." },
  { match: /not found/i, message: "Recurso não encontrado." },
  { match: /timeout|timed out/i, message: "A operação demorou demasiado tempo. Tente novamente." },
  { match: /network|failed to fetch|load failed/i, message: "Sem ligação ao servidor. Verifique a sua internet e tente novamente." },
  { match: /invalid.*email|email.*invalid/i, message: "Endereço de email inválido." },
  { match: /duplicate|already exists|unique/i, message: "Este registo já existe." },
  { match: /Edge Function returned a non-2xx/i, message: "Ocorreu um erro no servidor. Tente novamente." },
];

function mapFriendly(raw: string): string {
  if (!raw) return "Ocorreu um erro inesperado. Tente novamente.";
  for (const { match, message } of FRIENDLY_MAP) {
    if (match.test(raw)) return message;
  }
  return raw;
}

export async function getFriendlyErrorMessage(error: unknown, fallback = "Ocorreu um erro inesperado."): Promise<string> {
  if (!error) return fallback;

  // String
  if (typeof error === "string") return mapFriendly(error);

  const e = error as any;

  // Try to read Supabase FunctionsHttpError response body
  try {
    if (e?.context && typeof e.context.json === "function") {
      const body = await e.context.json();
      const msg = body?.error || body?.message;
      if (msg) return mapFriendly(String(msg));
    } else if (e?.context && typeof e.context.text === "function") {
      const txt = await e.context.text();
      if (txt) {
        try {
          const parsed = JSON.parse(txt);
          const msg = parsed?.error || parsed?.message;
          if (msg) return mapFriendly(String(msg));
        } catch {
          return mapFriendly(txt);
        }
      }
    }
  } catch {
    // ignore — fall back to message
  }

  // Plain object with error/message
  if (e?.error && typeof e.error === "string") return mapFriendly(e.error);
  if (e?.message) return mapFriendly(String(e.message));

  try {
    return mapFriendly(JSON.stringify(error));
  } catch {
    return fallback;
  }
}
