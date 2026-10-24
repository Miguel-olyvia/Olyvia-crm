// O que o Quadro e a Lista lembram entre visitas: a ordem, "Os meus" e as fases
// ligadas (o modo Quadro | Lista vive em `vistaGuardada.ts`). localStorage pode
// falhar ou ter lixo: nesse caso a página arranca com os valores por defeito.
import { FASES } from "./logicaQuadro";
import type { FaseNegocio } from "./negocioMetas";
import { DIRECAO_INICIAL, type Ordem } from "./ordenacaoQuadro";

export const CHAVE_PREFERENCIAS = "negocioMetas.preferencias";

export interface PreferenciasQuadro {
  /** `null` = a ordem por defeito (urgência). */
  ordem: Ordem | null;
  meus: boolean;
  fases: FaseNegocio[];
}

/** "Os meus" começa ligado: cada comercial abre a página nos seus negócios. */
export const PREFERENCIAS_INICIAIS: PreferenciasQuadro = { ordem: null, meus: true, fases: [] };

function lerOrdem(valor: unknown): Ordem | null {
  const o = valor as Partial<Ordem> | null;
  if (!o || typeof o.coluna !== "string" || !Object.prototype.hasOwnProperty.call(DIRECAO_INICIAL, o.coluna)) return null;
  return { coluna: o.coluna, dir: o.dir === "desc" ? "desc" : "asc" };
}

/** O valor guardado "financeiro" (nome antigo da última fase) lê-se como "ganho". */
function lerFases(guardadas: unknown[]): FaseNegocio[] {
  const nomes = guardadas.map((f) => (f === "financeiro" ? "ganho" : f));
  return FASES.filter((f) => nomes.includes(f));
}

/** Lê as preferências, campo a campo: o que estiver estragado volta ao valor por defeito. */
export function lerPreferencias(): PreferenciasQuadro {
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(CHAVE_PREFERENCIAS) ?? "null");
    if (typeof bruto !== "object" || bruto === null) return PREFERENCIAS_INICIAIS;
    const p = bruto as Record<string, unknown>;
    return {
      ordem: lerOrdem(p.ordem),
      meus: typeof p.meus === "boolean" ? p.meus : PREFERENCIAS_INICIAIS.meus,
      fases: Array.isArray(p.fases) ? lerFases(p.fases) : [],
    };
  } catch {
    return PREFERENCIAS_INICIAIS;
  }
}

export function guardarPreferencias(p: PreferenciasQuadro): void {
  try {
    window.localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p));
  } catch {
    // sem armazenamento: a escolha vale só para esta visita
  }
}
