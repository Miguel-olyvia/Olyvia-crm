// A escrita da Frota: SÓ pelas RPCs rpc_fleet_* (as tabelas fleet_* não aceitam INSERT/UPDATE/DELETE do authenticated).
// Os tipos das RPCs estão em fleetTypes.ts (escritos à mão a partir do SQL). Os erros das RPCs já vêm em português;
// aqui só se tornam claros os que vêm de fora da Frota (feriado da Agenda, índices únicos, rede, função em falta).
import { supabase } from "@/integrations/supabase/client";
import type { FleetRpcName, FleetRpcs } from "@/integrations/supabase/fleetTypes";

/** Um erro de uma RPC da Frota, com a mensagem já pronta para mostrar. */
export class ErroFrota extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) { super(message); this.name = "ErroFrota"; this.code = code; }
}

interface ErroBruto { message?: string; code?: string; details?: string | null; hint?: string | null }

const UNICOS: Record<string, string> = {
  fleet_vehicles_org_plate_uq: "Já existe uma viatura com esta matrícula.",
  fleet_assignments_open_perm_vehicle_uq: "Esta viatura já tem uma atribuição permanente aberta. Devolve-a primeiro.",
  fleet_assignments_open_perm_driver_uq: "Este condutor já tem uma viatura permanente. Devolve-a primeiro.",
  fleet_drivers_org_user_uq: "Este utilizador já é condutor nesta organização.",
  fleet_restock_requests_pending_uq: "Já há um pedido de reposição pendente para este artigo.",
  fleet_expense_imports_file_uq: "Este extrato já foi importado: importá-lo outra vez duplicava os custos.",
  fleet_compliance_current_uq: "Já existe um documento atual deste tipo. Atualiza a página e tenta outra vez.",
};

/** A mensagem a mostrar para um erro de uma RPC da Frota (em português). */
export function mensagemErroFrota(e: unknown): string {
  const err = (e ?? {}) as ErroBruto;
  const msg = String(err.message ?? (e instanceof Error ? e.message : "") ?? "").trim();
  // o gatilho prevent_schedule_items_on_holidays (Agenda) recusa reservas e manutenções que apanhem um feriado
  const feriado = /dia bloqueado\/feriado:\s*(.+)$/i.exec(msg);
  if (feriado) {
    return `A Agenda não aceita marcações em feriados ou dias bloqueados (${feriado[1].trim()}). Nada foi gravado: escolhe outras datas. ` +
      "Nota: uma marcação de dia inteiro também é recusada se o dia a seguir ao fim for feriado.";
  }
  if (err.code === "PGRST202" || /Could not find the function/i.test(msg)) return "Esta ação da Frota ainda não está disponível na base de dados.";
  // 23505 vem de duas maneiras: um índice único (texto técnico em inglês) ou um RAISE das RPCs com ERRCODE
  // unique_violation e a frase já em português ("Já existe uma viatura com esta matrícula.") — essa fica como está.
  if (err.code === "23505" && /duplicate key|unique constraint/i.test(msg)) {
    const k = Object.keys(UNICOS).find((c) => msg.includes(c) || (err.details ?? "").includes(c));
    return k ? UNICOS[k] : "Já existe um registo igual.";
  }
  if (err.code === "42501" && !/[áéíóúãõç]/i.test(msg)) return "Sem permissão para esta ação na Frota.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Sem ligação ao servidor. Verifica a internet e tenta outra vez.";
  if (/statement timeout|canceling statement/i.test(msg)) return "O servidor demorou demasiado a responder. Tenta outra vez.";
  return msg || "Não foi possível concluir a ação.";
}

/** Chama uma RPC da Frota com os argumentos do SQL; erro → ErroFrota com a mensagem em português. */
export async function rpcFrota<N extends FleetRpcName>(nome: N, args: FleetRpcs[N]["args"]): Promise<FleetRpcs[N]["returns"]> {
  let res: { data: unknown; error: ErroBruto | null };
  try {
    // os tipos gerados (types.ts) não conhecem as RPCs da Frota: a assinatura vem de FleetRpcs
    res = await (supabase as unknown as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: ErroBruto | null }> }).rpc(nome, args);
  } catch (e) {
    throw new ErroFrota(mensagemErroFrota(e));
  }
  if (res.error) throw new ErroFrota(mensagemErroFrota(res.error), res.error.code);
  return res.data as FleetRpcs[N]["returns"];
}

/** Leitura de uma tabela ou vista (fora dos tipos gerados): o construtor de consultas do supabase-js sem tipos. */
export const tabela = (nome: string): any => (supabase as unknown as { from: (t: string) => unknown }).from(nome);
