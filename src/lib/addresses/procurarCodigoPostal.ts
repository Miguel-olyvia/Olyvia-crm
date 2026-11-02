// Procurar a morada pelo código postal (reunião de 30/10/2026: "procurar e encontrar logo a morada", em todos os formulários).
// Usa a mesma API que src/hooks/usePostalCodeLookup.ts (a da Olyvia). Aqui só se lê; não se grava nada na base, para servir
// também os portais sem sessão (admissão do colaborador, fornecedor).

/** O código postal português completo (NNNN-NNN), ou null se ainda não estiver completo. */
export function cpCompleto(cp: string | null | undefined): string | null {
  const d = (cp ?? "").replace(/\D/g, "");
  return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4)}` : null;
}

/** O país é Portugal (vazio conta como Portugal: é o habitual). Aceita o código (PT) ou o nome. */
export function ehPortugal(pais: string | null | undefined): boolean {
  const p = (pais ?? "").trim().toLowerCase();
  return p === "" || p === "pt" || p === "prt" || p === "portugal";
}

export interface MoradaDoCodigoPostal {
  rua: string;
  localidade: string;
  concelho: string;
  distrito: string;
}

const API = "https://fidelidadeapi.quickflowai.com/Olyvia/postcodes/";
const cache = new Map<string, MoradaDoCodigoPostal | null>();

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A morada de um código postal português. Null se não existir ou se a procura falhar (a pessoa escreve à mão). */
export async function procurarCodigoPostal(cp: string, signal?: AbortSignal): Promise<MoradaDoCodigoPostal | null> {
  const chave = cpCompleto(cp);
  if (!chave) return null;
  if (cache.has(chave)) return cache.get(chave) ?? null;
  try {
    const r = await fetch(API + encodeURIComponent(chave), { signal });
    if (!r.ok) { if (r.status === 404) cache.set(chave, null); return null; }
    const d = await r.json() as { district?: unknown; municipality?: unknown; locality?: unknown; address?: { street?: unknown } };
    const m: MoradaDoCodigoPostal = {
      rua: texto(d.address?.street), localidade: texto(d.locality), concelho: texto(d.municipality), distrito: texto(d.district),
    };
    const achou = m.rua || m.localidade || m.concelho ? m : null;
    cache.set(chave, achou);
    return achou;
  } catch {
    return null;
  }
}
