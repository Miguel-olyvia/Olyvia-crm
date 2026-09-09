/**
 * Escreve nas tabelas `*_stage_actions` o que `deriveEdgeWrites` derivou.
 *
 * Separado da derivação de propósito: a derivação é pura e testável sem base de
 * dados; esta parte é a única que escreve, e nunca decide nada.
 */
import { supabase } from "@/integrations/supabase/client";
import type { EdgeWrites, StageActionRule } from "./deriveEdgeWrites";

export const MODULE_TO_TABLE: Record<string, string> = {
  pedido: "deal_stage_actions",
  orcamento: "quote_stage_actions",
  proposta: "proposal_stage_actions",
  contrato: "contract_stage_actions",
};

/** Lê TODAS as regras (activas e não) dos quatro módulos, para uma organização. */
export async function loadAllStageActions(companyId: string): Promise<StageActionRule[]> {
  const entradas = Object.entries(MODULE_TO_TABLE);
  const resultados = await Promise.all(
    entradas.map(([, tabela]) =>
      (supabase.from(tabela as any) as any)
        .select("id, stage_id, action_type, is_active")
        .eq("organization_id", companyId),
    ),
  );
  const regras: StageActionRule[] = [];
  entradas.forEach(([modulo], i) => {
    for (const r of resultados[i]?.data || []) {
      regras.push({ id: r.id, module: modulo, stage_id: r.stage_id, action_type: r.action_type, is_active: r.is_active });
    }
  });
  return regras;
}

export interface ApplyResult {
  desactivadas: number;
  reactivadas: number;
  inseridas: number;
  erros: string[];
}

/**
 * Aplica as escritas. Nunca apaga: o que sai de cena fica `is_active = false`,
 * para se poder voltar atrás sem perder a fase de disparo que lá estava.
 */
export async function applyEdgeWrites(
  companyId: string,
  writes: EdgeWrites,
  createdBy: string,
): Promise<ApplyResult> {
  const out: ApplyResult = { desactivadas: 0, reactivadas: 0, inseridas: 0, erros: [] };

  const mudarEstado = async (regras: StageActionRule[], activa: boolean) => {
    for (const r of regras) {
      const tabela = MODULE_TO_TABLE[r.module];
      if (!tabela) { out.erros.push(`módulo desconhecido: ${r.module}`); continue; }
      const { error } = await (supabase.from(tabela as any) as any)
        .update({ is_active: activa })
        .eq("id", r.id)
        .eq("organization_id", companyId);
      if (error) out.erros.push(error.message);
      else if (activa) out.reactivadas++;
      else out.desactivadas++;
    }
  };

  await mudarEstado(writes.deactivate, false);
  await mudarEstado(writes.reactivate, true);

  for (const ins of writes.insert) {
    const tabela = MODULE_TO_TABLE[ins.module];
    if (!tabela) { out.erros.push(`módulo desconhecido: ${ins.module}`); continue; }
    const { error } = await (supabase.from(tabela as any) as any).insert([{
      organization_id: companyId,
      stage_id: ins.stage_id,
      action_type: ins.action_type,
      is_active: true,
      execution_order: 0,
      created_by: createdBy,
    }]);
    if (error) out.erros.push(error.message);
    else out.inseridas++;
  }

  return out;
}
