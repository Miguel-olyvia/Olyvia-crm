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
  /** As coordenadas do código postal completo (a mesma API as devolve); só presentes quando a API as deu. */
  latitude?: number;
  longitude?: number;
}

/** O ponto de um código postal completo (para a deslocação das visitas). */
export interface CoordenadasCp7 {
  lat: number;
  lng: number;
}

interface CpLido {
  morada: MoradaDoCodigoPostal | null;
  coords: CoordenadasCp7 | null;
}

const API = "https://fidelidadeapi.quickflowai.com/Olyvia/postcodes/";
const cache = new Map<string, CpLido>();

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Lê (uma vez por código postal) a morada e as coordenadas. Null = a procura falhou (não se guarda: tenta-se outra vez).
 * Com `lancar`, uma falha de rede ou um erro do serviço (que não seja 404) LANÇA em vez de dar null: quem precisa de distinguir
 * «o código postal não existe» de «o serviço não respondeu» (a deslocação das visitas) usa-o.
 */
async function lerCodigoPostal(chave: string, signal?: AbortSignal, lancar = false): Promise<CpLido | null> {
  const guardado = cache.get(chave);
  if (guardado) return guardado;
  try {
    const r = await fetch(API + encodeURIComponent(chave), { signal });
    if (!r.ok) {
      if (r.status !== 404) {
        if (lancar) throw new Error(`codigo-postal-http-${r.status}`);
        return null;
      }
      const vazio: CpLido = { morada: null, coords: null };
      cache.set(chave, vazio);
      return vazio;
    }
    const d = await r.json() as { district?: unknown; municipality?: unknown; locality?: unknown; address?: { street?: unknown }; latitude?: unknown; longitude?: unknown };
    const lat = numero(d.latitude);
    const lng = numero(d.longitude);
    const coords = lat !== null && lng !== null ? { lat, lng } : null;
    const m: MoradaDoCodigoPostal = {
      rua: texto(d.address?.street), localidade: texto(d.locality), concelho: texto(d.municipality), distrito: texto(d.district),
      ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
    };
    const lido: CpLido = { morada: m.rua || m.localidade || m.concelho ? m : null, coords };
    cache.set(chave, lido);
    return lido;
  } catch (erro) {
    if (lancar) throw erro;
    return null;
  }
}

/** A morada de um código postal português. Null se não existir ou se a procura falhar (a pessoa escreve à mão). */
export async function procurarCodigoPostal(cp: string, signal?: AbortSignal): Promise<MoradaDoCodigoPostal | null> {
  const chave = cpCompleto(cp);
  if (!chave) return null;
  return (await lerCodigoPostal(chave, signal))?.morada ?? null;
}

/**
 * As coordenadas de um código postal completo (7 dígitos), com a mesma cache da morada. Null só quando o código postal não existe (404) ou a API
 * não deu coordenadas. Uma falha de rede ou do serviço (5xx...) LANÇA: não é «sem localização», é «não foi possível ligar».
 */
export async function geocodificarCp7(cp: string, signal?: AbortSignal): Promise<CoordenadasCp7 | null> {
  const chave = cpCompleto(cp);
  if (!chave) return null;
  return (await lerCodigoPostal(chave, signal, true))?.coords ?? null;
}
