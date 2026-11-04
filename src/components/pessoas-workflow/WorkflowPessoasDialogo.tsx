import { useEffect, useState } from "react";
import { Briefcase, ClipboardList, ListChecks } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { CfgCampos } from "@/emylia/campos";
import type { CfgEfeitos } from "@/emylia/efeitosLevantamento";
import { useCamposConfig } from "@/hooks/pessoas/workflow/useCamposConfig";
import { useLigacoesFase } from "@/hooks/pessoas/workflow/useLigacoesFase";
import { useConfigNegocios } from "@/hooks/pessoas/workflow/useConfigNegocios";
import { useQuestionarioLevantamento } from "@/hooks/pessoas/workflow/useQuestionarioLevantamento";
import { useRascunhoQuestionario } from "@/hooks/pessoas/workflow/useRascunhoQuestionario";
import { useTranslation } from "@/hooks/useTranslation";
import { CamposFasesSeparador, camposSujos } from "./CamposFasesSeparador";
import { edicaoSuja, type EdicaoNegocios } from "./edicaoNegocios";
import { EfeitosCamposSeccao, efeitosSujos } from "./EfeitosCamposSeccao";
import { LevantamentoSeparador } from "./LevantamentoSeparador";
import { NegociosSeparador } from "./NegociosSeparador";

const W = "pessoasPagina.real.workflow.";

type Separador = "levantamento" | "campos" | "negocios";

export interface WorkflowPessoasDialogoProps {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  /** Ao fechar, o foco volta ao botão «Workflow». */
  aoFocarOrigem: () => void;
}

/**
 * O diálogo do botão «Workflow» de Pessoas, com o aspeto do de Leads (título, descrição e separadores): «Levantamento» (as perguntas do questionário e, por baixo, o impacto dos campos da Olyvia no orçamento), «Campos das fases» (3/11: os campos
 * de cada fase do Negócio, com o editor da Emylia) e «Negócios» (cinco campos do fecho; não é um workflow). O questionário e a configuração dos
 * negócios só se leem com o seu separador à vista. O separador «Qualificação» (regras MQL e SQL) saiu a 4/11: o selo classifica-se à mão na ficha.
 * O rascunho do levantamento vive aqui, para sobreviver à troca de separador e para se poder avisar antes de fechar com alterações por gravar.
 * Enquanto grava, não se fecha (nem por Escape, nem por clique fora, nem pelo X): o resultado chegaria a um diálogo já fechado.
 */
export function WorkflowPessoasDialogo({ aberto, aoMudarAberto, aoFocarOrigem }: WorkflowPessoasDialogoProps) {
  const { t } = useTranslation();
  const [separador, setSeparador] = useState<Separador>("levantamento");
  const [aConfirmarFecho, setAConfirmarFecho] = useState(false);
  const questionario = useQuestionarioLevantamento(aberto && separador === "levantamento");
  const rascunho = useRascunhoQuestionario(questionario.dados, aberto);
  const configNegocios = useConfigNegocios(aberto && separador === "negocios");
  // 3/11 (Rúben): os campos das fases e o impacto no orçamento (uma só leitura para os dois separadores) e os rascunhos de cada um
  const camposConfig = useCamposConfig(aberto && (separador === "campos" || separador === "levantamento"));
  const ligacoes = useLigacoesFase(aberto && separador === "campos");
  const [edicaoCampos, setEdicaoCampos] = useState<CfgCampos | null>(null);
  const [edicaoEfeitos, setEdicaoEfeitos] = useState<CfgEfeitos | null>(null);
  // O que se escolheu em «Negócios» e ainda não se gravou vive aqui, como o rascunho do levantamento, para sobreviver à troca de separador.
  const [edicaoNegocios, setEdicaoNegocios] = useState<EdicaoNegocios | null>(null);
  const ocupado = questionario.aGuardar || configNegocios.aGuardar || camposConfig.aGuardar;
  const porGravar = rascunho.sujo || edicaoSuja(edicaoNegocios, configNegocios.dados ?? null)
    || camposSujos(edicaoCampos, camposConfig.dados?.campos) || efeitosSujos(edicaoEfeitos, camposConfig.dados?.efeitos);

  useEffect(() => {
    if (!aberto) {
      setSeparador("levantamento");
      setAConfirmarFecho(false);
      setEdicaoNegocios(null);
      setEdicaoCampos(null);
      setEdicaoEfeitos(null);
    }
  }, [aberto]);

  const aoMudar = (seguinte: boolean) => {
    if (!seguinte && ocupado) return;
    // Fechar com alterações por gravar (levantamento ou negócios) pergunta primeiro, em qualquer separador.
    if (!seguinte && porGravar) {
      setAConfirmarFecho(true);
      return;
    }
    aoMudarAberto(seguinte);
  };
  const descartarEFechar = () => {
    setAConfirmarFecho(false);
    rascunho.descartar();
    setEdicaoNegocios(null);
    setEdicaoCampos(null);
    setEdicaoEfeitos(null);
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
              <TabsTrigger value="levantamento" className={`min-h-11 gap-1.5 ${FOCO}`}>
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`${W}tabs.survey`)}
              </TabsTrigger>
              <TabsTrigger value="campos" className={`min-h-11 gap-1.5 ${FOCO}`}>
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`${W}tabs.fields`)}
              </TabsTrigger>
              <TabsTrigger value="negocios" className={`min-h-11 gap-1.5 ${FOCO}`}>
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`${W}tabs.deals`)}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="levantamento" className="mt-4">
              <LevantamentoSeparador questionario={questionario} rascunho={rascunho} />
              <EfeitosCamposSeccao config={camposConfig} rascunho={edicaoEfeitos} aoMudar={setEdicaoEfeitos} />
            </TabsContent>
            <TabsContent value="campos" className="mt-4">
              <CamposFasesSeparador config={camposConfig} ligacoes={ligacoes} rascunho={edicaoCampos} aoMudar={setEdicaoCampos} />
            </TabsContent>
            <TabsContent value="negocios" className="mt-4">
              <NegociosSeparador config={configNegocios} edicao={edicaoNegocios} aoEditar={setEdicaoNegocios} />
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
