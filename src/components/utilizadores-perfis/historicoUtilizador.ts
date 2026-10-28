// A atividade de um utilizador vem de anew_entity_history (a mesma fonte de UserHistoryDialog). Puro: a leitura vive em
// hooks/useHistoricoUtilizador.ts e o texto compõe-se no ecrã, com as traduções.
export interface LinhaHistorico {
  id: string;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface EntradaHistorico {
  id: string;
  /** AAAA-MM-DD */
  data: string;
  tipo: "created" | "updated" | "status_changed" | "other";
  campo: string | null;
  antes: string | null;
  depois: string | null;
  /** Nome de quem fez a alteração, se se conseguiu resolver. */
  quem: string | null;
}

const TIPOS = new Set(["created", "updated", "status_changed"]);
export const MAX_HISTORICO = 50;

export function entradaDeHistorico(l: LinhaHistorico, nomes: ReadonlyMap<string, string>): EntradaHistorico {
  return {
    id: l.id, data: (l.created_at ?? "").slice(0, 10),
    tipo: TIPOS.has(l.change_type) ? (l.change_type as EntradaHistorico["tipo"]) : "other",
    campo: l.field_name, antes: l.old_value, depois: l.new_value, quem: l.changed_by ? nomes.get(l.changed_by) ?? null : null,
  };
}

/** Estado da leitura do histórico que a ficha mostra: nunca se confunde «sem permissão» ou «falhou» com «sem atividade». */
export type EstadoAtividade =
  | { estado: "carregando" }
  | { estado: "semPermissao" }
  | { estado: "erro"; mensagem: string }
  | { estado: "ok"; entradas: EntradaHistorico[] };
