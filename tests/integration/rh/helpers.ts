import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Base DEV do RH. Qualquer outro ref aborta o teste. */
export const REF_DEV = "uetjghdkwbywbftedtth";
/** Unica organizacao onde estes testes escrevem (nike). */
export const ORG_NIKE = "b6ffce4f-f630-4933-833a-008649757a33";
export const PREFIXO_FIXTURE = "ZZ-TESTE-";

export const ENV_FILE = process.env.RH_TEST_ENV_FILE;
export const TEM_ENV = Boolean(ENV_FILE && existsSync(ENV_FILE));

if (!TEM_ENV) {
  console.warn(
    "[integracao RH] SALTADO: defina RH_TEST_ENV_FILE com o caminho de um ficheiro " +
      "com E2E_EMAIL e E2E_PASSWORD (utilizador real da nike na dev).",
  );
}

function lerEnv(ficheiro: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const linha of readFileSync(ficheiro, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

export interface SessaoDev {
  sb: SupabaseClient;
  userId: string;
}

/** Autentica como o utilizador real da nike. Nunca usa service_role. */
export async function entrarNaDev(): Promise<SessaoDev> {
  const app = lerEnv(".env.local");
  const url = process.env.VITE_SUPABASE_URL ?? app.VITE_SUPABASE_URL;
  const chave = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? app.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) throw new Error("Falta VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY em .env.local");

  const ref = new URL(url).hostname.split(".")[0];
  if (ref !== REF_DEV) {
    throw new Error(`ABORTADO: o ref do URL (${ref}) nao e o da dev (${REF_DEV}).`);
  }

  const teste = lerEnv(ENV_FILE as string);
  if (!teste.E2E_EMAIL || !teste.E2E_PASSWORD) {
    throw new Error("O ficheiro de RH_TEST_ENV_FILE nao tem E2E_EMAIL e E2E_PASSWORD.");
  }

  const sb = createClient(url, chave, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({
    email: teste.E2E_EMAIL,
    password: teste.E2E_PASSWORD,
  });
  if (error || !data.user) throw new Error(`Login na dev falhou: ${error?.message ?? "sem utilizador"}`);
  return { sb, userId: data.user.id };
}

/** Token de teste: 64 hex minusculos (CHECK token_hash_formato). */
export function tokenHashAleatorio(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validadeEmDias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}
