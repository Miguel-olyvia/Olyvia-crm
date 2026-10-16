// O que a lista de pessoas lembra entre visitas: o tipo (Leads, Clientes, Todos), o chip, a ordem e a vista (Lista ou Quadro). localStorage pode
// falhar ou ter lixo (ou valores de versões antigas): nesse caso, cada valor inválido volta ao seu defeito (padrão de
// `preferenciasQuadro.ts`). A pesquisa e os filtros do popover não se guardam.
import { CHIPS, ORDENS, TIPOS, VISTAS, chipValido } from "./filtrosPessoas";
import type { ChipPessoa, OrdemPessoa, TipoPessoa, VistaPessoas } from "./pessoasTipos";

export const CHAVE_PREFS_PESSOAS = "pessoas.prefs";

export interface PreferenciasPessoas {
  tipo: TipoPessoa;
  chip: ChipPessoa;
  ordem: OrdemPessoa;
  vista: VistaPessoas;
}

export const PREFS_PESSOAS_INICIAIS: PreferenciasPessoas = { tipo: "todos", chip: "todas", ordem: "urgencia", vista: "lista" };

export function lerPrefsPessoas(): PreferenciasPessoas {
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(CHAVE_PREFS_PESSOAS) ?? "null");
    if (typeof bruto !== "object" || bruto === null) return PREFS_PESSOAS_INICIAIS;
    const p = bruto as Record<string, unknown>;
    const tipo = TIPOS.find((t) => t === p.tipo) ?? PREFS_PESSOAS_INICIAIS.tipo;
    return {
      tipo,
      chip: chipValido(tipo, CHIPS.find((c) => c === p.chip) ?? PREFS_PESSOAS_INICIAIS.chip),
      ordem: ORDENS.find((o) => o === p.ordem) ?? PREFS_PESSOAS_INICIAIS.ordem,
      vista: VISTAS.find((v) => v === p.vista) ?? PREFS_PESSOAS_INICIAIS.vista,
    };
  } catch {
    return PREFS_PESSOAS_INICIAIS;
  }
}

export function guardarPrefsPessoas(p: PreferenciasPessoas): void {
  try {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify(p));
  } catch {
    // sem armazenamento: a escolha vale só para esta visita
  }
}
