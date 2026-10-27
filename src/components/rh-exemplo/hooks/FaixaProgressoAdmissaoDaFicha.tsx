/**
 * A faixa de progresso da admissão no topo da ficha, a real, a partir do resumo do convite que a ficha já lê
 * (`rpc_hr_convite_admissao_resumo`). Sem convite, ou sem saber onde vai (cancelada, mascarado, desconhecido), não aparece.
 */
import { FaixaProgressoAdmissao } from "@/components/hr/admissao/FaixaProgressoAdmissao";
import type { ResumoConvite } from "@/hooks/useConviteAdmissaoResumo";
import { passoDaFaixa } from "@/lib/hr/admissaoPipeline";

export function FaixaProgressoAdmissaoDaFicha({ resumo }: { resumo: ResumoConvite | null }) {
  if (!resumo || !passoDaFaixa(resumo.estado)) return null;
  return (
    <div className="px-6 pb-3">
      <FaixaProgressoAdmissao estado={resumo.estado} />
    </div>
  );
}
