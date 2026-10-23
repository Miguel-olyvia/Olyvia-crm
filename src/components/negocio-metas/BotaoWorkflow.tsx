import { useRef } from "react";
import { Zap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AbaWorkflow } from "./AbaWorkflow";
import { FOCO } from "./estilos";
import { useWorkflowExemplo } from "./useWorkflowExemplo";

interface BotaoWorkflowProps {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
}

/**
 * O botão "Workflow" do cabeçalho (como o da página de Deals) e a configuração do workflow num diálogo
 * grande. Ao abrir, o foco vai para o próprio diálogo (o leitor de ecrã diz o papel, o título e a descrição); ao fechar (Esc ou "Fechar"), volta ao botão. Só exemplo:
 * nada é gravado na organização.
 */
export function BotaoWorkflow({ aberto, aoMudar }: BotaoWorkflowProps) {
  const { t } = useTranslation();
  const botao = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDivElement>(null);
  const { limparAvisos } = useWorkflowExemplo();
  // Ao fechar, o aviso e o "Predefinição reposta" da última alteração não ficam à espera da próxima abertura.
  const mudar = (abrir: boolean) => {
    if (!abrir) limparAvisos();
    aoMudar(abrir);
  };
  return (
    <>
      <Button ref={botao} type="button" variant="outline" onClick={() => mudar(true)} className={`min-h-11 ${FOCO}`}>
        <Zap aria-hidden="true" />
        {t("businessGoals.workflow.open")}
      </Button>
      <Dialog open={aberto} onOpenChange={mudar}>
        <DialogContent
          ref={dialogo} hideClose tabIndex={-1}
          onOpenAutoFocus={(e) => { e.preventDefault(); dialogo.current?.focus(); }}
          onCloseAutoFocus={(e) => { e.preventDefault(); botao.current?.focus(); }}
          className="max-h-[90vh] max-w-5xl focus:outline-none motion-reduce:!animate-none motion-reduce:!duration-0"
        >
          <DialogHeader>
            <DialogTitle>
              {t("businessGoals.workflow.title")}
            </DialogTitle>
            <DialogDescription>{t("businessGoals.workflow.banner")}</DialogDescription>
          </DialogHeader>
          <AbaWorkflow emDialogo />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`}>
                {t("businessGoals.workflow.dialog.close")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
