// O que a lista de pessoas lembra entre visitas: a ordem e o chip. localStorage pode
// falhar ou ter lixo: nesse caso arranca com os valores por defeito (padrão de
// `preferenciasQuadro.ts`). A pesquisa não se guarda.
import { CHIPS, ORDENS } from "./filtrosPessoas";
import type { ChipPessoa, OrdemPessoa } from "./pessoasTipos";

export const CHAVE_PREFS_PESSOAS = "pessoas.prefs";

export interface PreferenciasPessoas {
  ordem: OrdemPessoa;
  chip: ChipPessoa;
}

export const PREFS_PESSOAS_INICIAIS: PreferenciasPessoas = { ordem: "atencao", chip: "todos" };

export function lerPrefsPessoas(): PreferenciasPessoas {
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(CHAVE_PREFS_PESSOAS) ?? "null");
    if (typeof bruto !== "object" || bruto === null) return PREFS_PESSOAS_INICIAIS;
    const p = bruto as Record<string, unknown>;
    return {
      ordem: ORDENS.find((o) => o === p.ordem) ?? PREFS_PESSOAS_INICIAIS.ordem,
      chip: CHIPS.find((c) => c === p.chip) ?? PREFS_PESSOAS_INICIAIS.chip,
    };
  } catch {
    return PREFS_PESSOAS_INICIAIS;
  }
}

/** O chip "Voltou a contactar" guardado só vale com permissão para ver submissões; sem ela, volta a "Todos". */
export function chipEfetivo(chip: ChipPessoa, podeVerSubmissoes: boolean): ChipPessoa {
  return !podeVerSubmissoes && chip === "voltou" ? "todos" : chip;
}

export function guardarPrefsPessoas(p: PreferenciasPessoas): void {
  try {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify(p));
  } catch {
    // sem armazenamento: a escolha vale só para esta visita
  }
}
