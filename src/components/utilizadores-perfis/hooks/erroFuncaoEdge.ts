// Wrapper: a mensagem real de uma Edge Function que respondeu com erro (cópia de extractFunctionErrorMessage de UsersNew.tsx).
// O supabase-js só diz «Edge Function returned a non-2xx status code»; a causa vem no corpo da resposta.
const GENERICA = "Edge Function returned a non-2xx status code";

export async function mensagemDaFuncao(resultado: unknown, erro: unknown): Promise<string | null> {
  const dados = (resultado as { data?: unknown } | null)?.data;
  if (dados && typeof dados === "object") {
    const d = dados as { error?: unknown; message?: unknown };
    if (typeof d.error === "string") return d.error;
    if (typeof d.message === "string") return d.message;
  }
  const resposta = (erro as { context?: Response } | null)?.context;
  if (resposta && typeof resposta.clone === "function") {
    try {
      const copia = resposta.clone();
      if ((copia.headers?.get("Content-Type") || "").includes("application/json")) {
        const json = await copia.json().catch(() => null);
        if (json && typeof json.error === "string") return json.error;
        if (json && typeof json.message === "string") return json.message;
        if (json) return JSON.stringify(json);
      }
      const texto = await copia.text().catch(() => "");
      if (texto) return texto;
    } catch {
      // a resposta já foi lida: cai na mensagem do erro
    }
  }
  const mensagem = (erro as { message?: unknown } | null)?.message;
  return typeof mensagem === "string" && mensagem !== GENERICA ? mensagem : null;
}
