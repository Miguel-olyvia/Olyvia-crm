// «Criar orçamento» na ficha real: hospeda o editor de orçamentos que a app já tem (`QuoteBuilder`, o mesmo de Orçamentos), num diálogo de ecrã
// inteiro e já com a pessoa escolhida, e liga o orçamento ao negócio (neg_ligar_registo) logo a seguir a ele ser guardado: o editor só fecha
// depois de a ligação acabar. Se a ligação falhar, o orçamento fica criado e diz-se (com a causa traduzida); aparece em «Documentos por ligar».
// Esta pasta é a ÚNICA exceção ao espírito de `semBase.test.ts`: aqui vivem os hospedeiros dos ecrãs que já falam com a base por conta própria;
// o resto da ficha continua sem base. Só importa os ecrãs existentes e tipos das mutações.
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { chaveDoErroDeEnvio } from "@/components/negocio-metas/useEnvioAssincrono";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { QuoteBuilder } from "@/components/QuoteBuilder";

const P = "pessoasPagina.neg.process.";

export interface NegocioDoOrcamento {
  /** O negócio a que o orçamento se liga. */
  id: string;
  /** O nome da pessoa (título do diálogo). */
  nome: string;
  /** A pessoa (`anew_entities.id`) e a organização. */
  entityId: string;
  organizationId: string;
  /** A ficha a que o orçamento fica ligado: a lead, ou o cliente quando a pessoa já o é. */
  origem: { tipo: "lead" | "client"; id: string };
}

interface PainelOrcamentoRealProps {
  /** O negócio a que se cria o orçamento; `null` = fechado. */
  negocio: NegocioDoOrcamento | null;
  mutacoes: MutacoesNegocio;
  aoFechar: () => void;
}

export function PainelOrcamentoReal({ negocio, mutacoes, aoFechar }: PainelOrcamentoRealProps) {
  const { t } = useTranslation();
  if (negocio === null) return null;
  const titulo = t(`${P}quote.title`, { name: negocio.nome });

  /** Liga o orçamento guardado ao negócio. Nunca lança: o editor fecha a seguir, e o orçamento já existe (uma falha diz-se, não se esconde). */
  const aoGuardar = async (orcamentoId: string): Promise<void> => {
    try {
      await mutacoes.ligar(negocio.id, { tipo: "orcamento", id: orcamentoId });
      toast.success(t(`${P}quote.linked`));
    } catch (falha) {
      mutacoes.refrescar();
      toast.error(`${t(`${P}quote.notLinked`)} ${t(chaveDoErroDeEnvio(falha))}`);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent hideClose className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none border-0 p-0 sm:rounded-none">
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{titulo}</DialogDescription>
        <QuoteBuilder
          quoteId={null} onClose={aoFechar} onSaved={aoGuardar}
          initialEntity={{ kind: negocio.origem.tipo, id: negocio.origem.id, name: negocio.nome, entity_id: negocio.entityId, organization_id: negocio.organizationId }}
        />
      </DialogContent>
    </Dialog>
  );
}
