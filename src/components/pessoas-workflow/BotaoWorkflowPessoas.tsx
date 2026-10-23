import { useRef, useState } from "react";
import { Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import { WorkflowPessoasDialogo } from "./WorkflowPessoasDialogo";

/**
 * O botão «Workflow» do cabeçalho de Pessoas (como o de Leads) e o diálogo que abre. Só se monta no modo real, com a permissão
 * `pessoas.config` (a guarda está em quem o usa, o `PessoasReal`); a base volta a verificá-la em cada gravação.
 */
export function BotaoWorkflowPessoas() {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={botao} type="button" variant="outline" aria-haspopup="dialog" className={`min-h-11 gap-2 ${FOCO}`}
        onClick={() => setAberto(true)}
      >
        <Workflow className="h-4 w-4" aria-hidden="true" />
        {t("pessoasPagina.real.workflow.open")}
      </Button>
      <WorkflowPessoasDialogo aberto={aberto} aoMudarAberto={setAberto} aoFocarOrigem={() => botao.current?.focus()} />
    </>
  );
}
