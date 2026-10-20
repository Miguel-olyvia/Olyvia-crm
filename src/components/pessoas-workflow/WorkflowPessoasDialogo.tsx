import { useEffect, useState } from "react";
import { ClipboardList, Target } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useQuestionarioLevantamento } from "@/hooks/pessoas/workflow/useQuestionarioLevantamento";
import { useRascunhoQuestionario } from "@/hooks/pessoas/workflow/useRascunhoQuestionario";
import { useRegrasQualificacao } from "@/hooks/pessoas/workflow/useRegrasQualificacao";
import { useTranslation } from "@/hooks/useTranslation";
import { LevantamentoSeparador } from "./LevantamentoSeparador";
import { QualificacaoSeparador } from "./QualificacaoSeparador";

const W = "pessoasPagina.real.workflow.";

type Separador = "qualificacao" | "levantamento";

export interface WorkflowPessoasDialogoProps {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  /** Ao fechar, o foco volta ao botão «Workflow». */
  aoFocarOrigem: () => void;
}

/**
 * O diálogo do botão «Workflow» de Pessoas, com o aspeto do de Leads (título, descrição e separadores): «Qualificação» (regras MQL e SQL) e
 * «Levantamento» (as perguntas do questionário). As regras só se leem com o diálogo aberto, e o questionário só com o seu separador à vista.
 * O rascunho do levantamento vive aqui, para sobreviver à troca de separador e para se poder avisar antes de fechar com alterações por gravar.
 * Enquanto grava, não se fecha (nem por Escape, nem por clique fora, nem pelo X): o resultado chegaria a um diálogo já fechado.
 */
export function WorkflowPessoasDialogo({ aberto, aoMudarAberto, aoFocarOrigem }: WorkflowPessoasDialogoProps) {
  const { t } = useTranslation();
  const [separador, setSeparador] = useState<Separador>("qualificacao");
  const [aConfirmarFecho, setAConfirmarFecho] = useState(false);
  const regras = useRegrasQualificacao(aberto);
  const questionario = useQuestionarioLevantamento(aberto && separador === "levantamento");
  const rascunho = useRascunhoQuestionario(questionario.dados, aberto);
  const ocupado = regras.aGuardar || questionario.aGuardar;

  useEffect(() => {
    if (!aberto) {
      setSeparador("qualificacao");
      setAConfirmarFecho(false);
    }
  }, [aberto]);

  const aoMudar = (seguinte: boolean) => {
    if (!seguinte && ocupado) return;
    // Fechar com alterações do levantamento por gravar pergunta primeiro (em qualquer separador).
    if (!seguinte && rascunho.sujo) {
      setAConfirmarFecho(true);
      return;
    }
    aoMudarAberto(seguinte);
  };
  const descartarEFechar = () => {
    setAConfirmarFecho(false);
    rascunho.descartar();
    aoMudarAberto(false);
  };

  return (
    <>
      <Dialog open={aberto} onOpenChange={aoMudar}>
        <DialogContent
          hideClose={ocupado} className="max-h-[85vh] max-w-4xl overflow-y-auto"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            aoFocarOrigem();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t(`${W}title`)}</DialogTitle>
            <DialogDescription>{t(`${W}description`)}</DialogDescription>
          </DialogHeader>
          <Tabs value={separador} onValueChange={(v) => setSeparador(v as Separador)}>
            <TabsList aria-label={t(`${W}tabs.label`)}>
              <TabsTrigger value="qualificacao" className={`min-h-11 gap-1.5 ${FOCO}`}>
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`${W}tabs.qualification`)}
              </TabsTrigger>
              <TabsTrigger value="levantamento" className={`min-h-11 gap-1.5 ${FOCO}`}>
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`${W}tabs.survey`)}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="qualificacao" className="mt-4">
              <QualificacaoSeparador regras={regras} />
            </TabsContent>
            <TabsContent value="levantamento" className="mt-4">
              <LevantamentoSeparador questionario={questionario} rascunho={rascunho} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <AlertDialog open={aConfirmarFecho} onOpenChange={setAConfirmarFecho}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${W}lev.unsaved.title`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${W}lev.unsaved.body`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t(`${W}lev.unsaved.keep`)}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={descartarEFechar}>{t(`${W}lev.unsaved.discard`)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
