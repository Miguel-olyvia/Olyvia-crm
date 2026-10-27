/**
 * O cartão «Admissão» da Visão geral da ficha, o real: o mesmo cartão do pipeline (selos, validade, faixa), montado com o
 * resumo do convite que a ficha já lê. O resumo não traz as datas de submissão e devolução; essas só aparecem no pipeline.
 * «Rever» abre a revisão real (só de consulta) e só existe com `hr.onboarding.approve`.
 */
import { useState } from "react";
import { CartaoAdmissao } from "@/components/hr/admissao/CartaoAdmissao";
import { RevisaoAdmissaoDialog } from "@/components/hr/admissao/RevisaoAdmissaoDialog";
import type { ResumoConvite } from "@/hooks/useConviteAdmissaoResumo";
import { usePermissions } from "@/hooks/usePermissions";
import type { ItemPipeline } from "@/lib/hr/admissaoPipeline";

interface CartaoAdmissaoDaFichaProps {
  pessoaId: string;
  nome: string;
  cargo: string | null;
  resumo: ResumoConvite | null;
  aoAbrirFicha: (pessoaId: string) => void;
}

function itemDoResumo(pessoaId: string, nome: string, cargo: string | null, resumo: ResumoConvite): ItemPipeline | null {
  if (!resumo.conviteId) return null;
  return {
    conviteId: resumo.conviteId,
    pessoaId,
    nome,
    cargo,
    estado: resumo.estado,
    estadoPortal: resumo.estadoPortal,
    validUntil: resumo.validUntil,
    submetidoEm: null,
    devolvidaEm: null,
    atualizadoEm: null,
  };
}

export function CartaoAdmissaoDaFicha({ pessoaId, nome, cargo, resumo, aoAbrirFicha }: CartaoAdmissaoDaFichaProps) {
  const { hasPermission } = usePermissions();
  const [emRevisao, setEmRevisao] = useState<ItemPipeline | null>(null);
  const item = resumo ? itemDoResumo(pessoaId, nome, cargo, resumo) : null;
  if (!item) return null;
  return (
    <>
      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        <CartaoAdmissao item={item} podeRever={hasPermission("hr.onboarding.approve")} aoRever={setEmRevisao} aoAbrirFicha={aoAbrirFicha} />
      </ul>
      <RevisaoAdmissaoDialog item={emRevisao} aoFechar={() => setEmRevisao(null)} />
    </>
  );
}
