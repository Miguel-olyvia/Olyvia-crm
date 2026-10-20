import { Target } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useRegrasQualificacao } from "@/hooks/pessoas/workflow/useRegrasQualificacao";
import { useTranslation } from "@/hooks/useTranslation";
import { QualificacaoSeparador } from "./QualificacaoSeparador";

const W = "pessoasPagina.real.workflow.";

export interface WorkflowPessoasDialogoProps {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  /** Ao fechar, o foco volta ao botão «Workflow». */
  aoFocarOrigem: () => void;
}

/**
 * O diálogo do botão «Workflow» de Pessoas, com o aspeto do de Leads (título, descrição e separadores). Por agora só tem a «Qualificação»;
 * o «Levantamento» é de uma fase seguinte. As regras só se leem com o diálogo aberto. Enquanto grava, não se fecha (nem por Escape, nem
 * por clique fora, nem pelo X): o resultado chegaria a um diálogo já fechado.
 */
export function WorkflowPessoasDialogo({ aberto, aoMudarAberto, aoFocarOrigem }: WorkflowPessoasDialogoProps) {
  const { t } = useTranslation();
  const regras = useRegrasQualificacao(aberto);
  const aoMudar = (seguinte: boolean) => {
    if (!seguinte && regras.aGuardar) return;
    aoMudarAberto(seguinte);
  };
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent
        hideClose={regras.aGuardar} className="max-h-[85vh] max-w-4xl overflow-y-auto"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          aoFocarOrigem();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`${W}title`)}</DialogTitle>
          <DialogDescription>{t(`${W}description`)}</DialogDescription>
        </DialogHeader>
        <Tabs value="qualificacao">
          <TabsList aria-label={t(`${W}tabs.label`)}>
            <TabsTrigger value="qualificacao" className={`min-h-11 gap-1.5 ${FOCO}`}>
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`${W}tabs.qualification`)}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="qualificacao" className="mt-4">
            <QualificacaoSeparador regras={regras} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
