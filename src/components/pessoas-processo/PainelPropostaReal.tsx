// «Criar proposta» na ficha real: hospeda o diálogo de propostas que a app já tem (`ProposalCreateDialog`), já com a pessoa e o orçamento do
// negócio (carregado por id, mesmo em rascunho), e liga a proposta ao negócio (neg_ligar_registo) assim que é guardada. Se a ligação falhar,
// a proposta fica criada e diz-se (com a causa traduzida); aparece em «Documentos por ligar». As condições da proposta (prazo, início,
// pagamento e garantia, em `proposals.terms`) NÃO se fazem aqui: `terms` chega ao portal anónimo e o formato por decidir.
import { useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { chaveDoErroDeEnvio } from "@/components/negocio-metas/useEnvioAssincrono";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { ProposalCreateDialog } from "@/components/proposals/ProposalCreateDialog";

const P = "pessoasPagina.neg.process.";

export interface NegocioDaProposta {
  /** O negócio a que a proposta se liga. */
  id: string;
  /** A pessoa (`anew_entities.id`). */
  entityId: string;
  /** O orçamento de que a proposta parte; `null` se o negócio não tem nenhum. */
  orcamentoId: string | null;
}

interface PainelPropostaRealProps {
  /** O negócio a que se cria a proposta; `null` = fechado. */
  negocio: NegocioDaProposta | null;
  mutacoes: MutacoesNegocio;
  aoFechar: () => void;
}

export function PainelPropostaReal({ negocio, mutacoes, aoFechar }: PainelPropostaRealProps) {
  const { t } = useTranslation();
  // O diálogo pede para fechar ANTES de chamar `onSaved`: nessa altura o painel já pode ter passado a `null`. A proposta guardada é do último
  // negócio que esteve aberto, por isso guarda-se esse (e nunca se depende da versão antiga da função).
  const ultimo = useRef<NegocioDaProposta | null>(negocio);
  if (negocio !== null) ultimo.current = negocio;

  const aoGuardar = (propostaId: string): void => {
    const doNegocio = ultimo.current;
    if (doNegocio === null) return;
    mutacoes.ligar(doNegocio.id, { tipo: "proposta", id: propostaId }).then(
      () => { toast.success(t(`${P}proposal.linked`)); },
      (falha: unknown) => {
        mutacoes.refrescar();
        toast.error(`${t(`${P}proposal.notLinked`)} ${t(chaveDoErroDeEnvio(falha))}`);
      },
    );
  };

  return (
    <ProposalCreateDialog
      open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }} onSaved={aoGuardar}
      presetEntityId={negocio?.entityId}
      presetQuoteIds={negocio?.orcamentoId ? [negocio.orcamentoId] : undefined}
    />
  );
}
