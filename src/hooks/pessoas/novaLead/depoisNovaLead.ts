// Depois de gravar a lead (cópia de AnewLeads.tsx:3993-4021): sincroniza a morada da pessoa a partir dos campos do formulário. É
// «melhor esforço»: a lead já está gravada e uma falha aqui nunca a desfaz; só se avisa. O de Leads também refazia o nome de uma pessoa
// reutilizada e avisava de coerência parcial: em Pessoas nunca se reutiliza uma pessoa, por isso isso não se copia.
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { syncEntityPrimaryAddressFromLead } from "./moradaNovaLead";

export interface ResultadoDepois {
  moradaFalhou: boolean;
  motivo: string | null;
}

export async function depoisDeGravar(args: {
  entityId: string; organizationId: string; actorId: string | null; valores: Readonly<Record<string, unknown>>;
}): Promise<ResultadoDepois> {
  try {
    const r = await syncEntityPrimaryAddressFromLead({
      supabase,
      entityId: args.entityId,
      organizationId: args.organizationId,
      fieldValues: args.valores as Record<string, unknown>,
      actorId: args.actorId,
      // Nunca se escreve por cima de uma morada válida.
      allowOverwriteValid: false,
    });
    if (r.decision === "error") {
      captureFlowError(new Error(r.reason ?? "post-commit address sync failed"), "lead-lifecycle");
      return { moradaFalhou: true, motivo: r.reason ?? null };
    }
    return { moradaFalhou: false, motivo: null };
  } catch (excecao) {
    captureFlowError(excecao, "lead-lifecycle");
    return { moradaFalhou: true, motivo: excecao instanceof Error ? excecao.message : null };
  }
}
