// «Perder o negócio»: perde-se em qualquer fase, com motivo (um da lista do Workflow, ou «Outro» com texto livre). Muda o negócio EM MEMÓRIA
// (`negociosAlterados.ts`) e guarda a fase em que estava, para a perda se poder anular. Só exemplo: nada é gravado. O aviso para o leitor de
// ecrã sai por `aoPerder`, depois de o diálogo fechar (quem o monta decide como o diz).
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CamposMotivoPerda } from "./CamposMotivoPerda";
import { FOCO } from "./estilos";
import type { NegocioMes } from "./negocioMetas";
import { perderNegocio } from "./negociosAlterados";
import { erroDoMotivoPerda, motivoDaPerda } from "./perdaNegocio";
import { faseNaPerda } from "./percursoNegocio";
import { registosAtuais } from "./registosPessoa";

const L = "businessGoals.lose.";

interface PerderNegocioDialogoProps {
  /** O negócio a perder; `null` = fechado. */
  negocio: NegocioMes | null;
  /** O dia de hoje (AAAA-MM-DD). */
  hoje: string;
  /** Os motivos da lista do Workflow (`ConfigWorkflow.motivosPerda`). */
  motivos: readonly string[];
  aoFechar: () => void;
  /** Depois de perder: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoPerder?: (anuncio: string) => void;
}

function FormPerda({ negocio, hoje, motivos, aoFechar, aoPerder }: Omit<PerderNegocioDialogoProps, "negocio"> & { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const [escolhido, setEscolhido] = useState("");
  const [outro, setOutro] = useState("");
  const [tentou, setTentou] = useState(false);
  const seletor = useRef<HTMLSelectElement>(null);
  const campoOutro = useRef<HTMLInputElement>(null);
  const erro = tentou ? erroDoMotivoPerda(escolhido, outro) : null;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    const falha = erroDoMotivoPerda(escolhido, outro);
    if (falha) { (falha === "outroVazio" ? campoOutro : seletor).current?.focus(); return; }
    const motivo = motivoDaPerda(escolhido, outro);
    if (motivo === null) return;
    perderNegocio(negocio, motivo, hoje);
    aoFechar();
    aoPerder?.(t(`${L}done`, { name: negocio.pessoa, work: negocio.servico, reason: motivo }));
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <CamposMotivoPerda
        motivos={motivos} escolhido={escolhido} outro={outro} erro={erro} seletorRef={seletor} outroRef={campoOutro}
        aoMudar={(p) => { if (p.escolhido !== undefined) setEscolhido(p.escolhido); if (p.outro !== undefined) setOutro(p.outro); }}
      />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${L}cancel`)}</Button>
        <Button type="submit" variant="destructive" className={cn("min-h-11", FOCO)}>{t(`${L}confirm`)}</Button>
      </DialogFooter>
    </form>
  );
}

export function PerderNegocioDialogo({ negocio, hoje, motivos, aoFechar, aoPerder }: PerderNegocioDialogoProps) {
  const { t } = useTranslation();
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  const fase = mostrado ? faseNaPerda(mostrado, registosAtuais()) : "orcamento";
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent className="motion-reduce:!animate-none">
        <DialogHeader>
          <DialogTitle>{t(`${L}title`)}</DialogTitle>
          <DialogDescription>
            {t(`${L}description`, { name: mostrado?.pessoa ?? "", work: mostrado?.servico ?? "", phase: t(`${L}phase.${fase}`) })}
          </DialogDescription>
        </DialogHeader>
        {mostrado && <FormPerda key={mostrado.id} negocio={mostrado} hoje={hoje} motivos={motivos} aoFechar={aoFechar} aoPerder={aoPerder} />}
      </DialogContent>
    </Dialog>
  );
}
