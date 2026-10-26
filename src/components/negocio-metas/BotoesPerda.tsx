// Os botões «Perder negócio» (abre o diálogo do motivo) e «Anular perda» (o negócio volta onde estava). Servem o painel do negócio e a ficha
// da pessoa. O aviso sai por `aoPerder` / `aoAnular` (o leitor de ecrã); sem eles diz-se num toast (e no anúncio da ficha). Na ficha real (com as
// mutações por contexto) «Anular perda» abre o diálogo que pede a razão, em vez de anular no store.
import { useRef, useState } from "react";
import { Ban, Undo2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnularPerdaDialogo } from "./AnularPerdaDialogo";
import { FOCO } from "./estilos";
import { useMutacoesDaFicha } from "./mutacoesNegocio";
import type { NegocioMes } from "./negocioMetas";
import { anularPerda, perdaDoNegocio } from "./negociosAlterados";
import { PerderNegocioDialogo } from "./PerderNegocioDialogo";
import { useAvisarNegocio } from "./useAvisarNegocio";
import { useConfigWorkflow } from "./useWorkflowExemplo";

const L = "businessGoals.lose.";

interface BotaoPerderNegocioProps {
  negocio: NegocioMes;
  /** O dia de hoje (AAAA-MM-DD). */
  hoje: string;
  /** Depois de perder: o texto para o leitor de ecrã. Sem ele, um toast. */
  aoPerder?: (anuncio: string) => void;
  className?: string;
  /** A chave do texto do botão (o Pipeline diz «Marcar como perdido»); sem ela, «Perder negócio». A ação é a mesma. */
  rotuloChave?: string;
}

export function BotaoPerderNegocio({ negocio, hoje, aoPerder, className, rotuloChave }: BotaoPerderNegocioProps) {
  const { t } = useTranslation();
  const config = useConfigWorkflow();
  const avisar = useAvisarNegocio();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={botao} type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO, className)} onClick={() => setAberto(true)}>
        <Ban className="h-4 w-4" aria-hidden="true" />
        {t(rotuloChave ?? `${L}button`)}
      </Button>
      <PerderNegocioDialogo
        negocio={aberto ? negocio : null} hoje={hoje} motivos={config.motivosPerda} aoFechar={() => setAberto(false)}
        aoPerder={aoPerder ?? avisar}
      />
    </>
  );
}

interface BotaoAnularPerdaProps {
  /** O negócio perdido. */
  negocio: NegocioMes;
  /** Depois de anular: o texto para o leitor de ecrã. Sem ele, um toast. */
  aoAnular?: (anuncio: string) => void;
  className?: string;
}

export function BotaoAnularPerda({ negocio, aoAnular, className }: BotaoAnularPerdaProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const [aberto, setAberto] = useState(false);
  const anular = () => {
    // Na ficha real a razão pede-se num diálogo e a base é que anula.
    if (mutacoes) { setAberto(true); return; }
    const perda = perdaDoNegocio(negocio.id);
    if (!perda) return;
    anularPerda(negocio.id);
    const texto = t(`${L}undo.done`, { name: negocio.pessoa, phase: t(`${L}phase.${perda.fase}`) });
    (aoAnular ?? avisar)(texto);
  };
  return (
    <>
      <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO, className)} onClick={anular}>
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        {t(`${L}undo`)}
      </Button>
      <AnularPerdaDialogo negocio={aberto ? negocio : null} aoFechar={() => setAberto(false)} aoAnulado={aoAnular ?? avisar} />
    </>
  );
}
