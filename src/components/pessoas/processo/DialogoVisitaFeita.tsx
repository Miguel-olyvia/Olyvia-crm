// "A visita já foi feita?": um diálogo curto com uma nota opcional (até 200 caracteres). Confirmar marca a visita como feita
// (o passo seguinte é o levantamento); cancelar não muda nada. Montado uma vez, ao nível da página, pelo `ProcessoProvider`.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "../CamposDataHora";
import { MAX_NOTA_VISITA_FEITA } from "../visitaPessoa";

const P = "pessoasPagina.process.visitDone.";

interface FormProps {
  aoConfirmar: (nota: string) => void;
  aoFechar: () => void;
}

function Formulario({ aoConfirmar, aoFechar }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [nota, setNota] = useState("");
  const [tentou, setTentou] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const comprida = nota.trim().length > MAX_NOTA_VISITA_FEITA;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (comprida) { campo.current?.focus(); return; }
    aoConfirmar(nota.trim());
  };
  const erro = tentou && comprida;
  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>{t(`${P}note`)}</Label>
        <Textarea
          id={`${id}-nota`} ref={campo} value={nota} rows={3} className={cn("min-h-0", FOCO)} aria-invalid={erro || undefined}
          aria-describedby={erro ? `${id}-erro ${id}-contagem` : `${id}-contagem`} onChange={(e) => setNota(e.target.value)}
        />
        <p id={`${id}-contagem`} className="text-right text-xs tabular-nums text-muted-foreground">
          {t(`${P}count`, { count: nota.length, max: MAX_NOTA_VISITA_FEITA })}
        </p>
        {erro && <MensagemErro id={`${id}-erro`} texto={t(`${P}noteError`, { max: MAX_NOTA_VISITA_FEITA })} />}
      </div>
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${P}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${P}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

interface DialogoVisitaFeitaProps {
  /** A pessoa cuja visita se vai marcar; `null` com o diálogo fechado. */
  pessoa: { id: string; nome: string } | null;
  aoConfirmar: (pessoaId: string, nota: string) => void;
  aoFechar: () => void;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function DialogoVisitaFeita({ pessoa, aoConfirmar, aoFechar, aoDevolverFoco }: DialogoVisitaFeitaProps) {
  const { t } = useTranslation();
  const ultima = useRef(pessoa);
  if (pessoa) ultima.current = pessoa;
  const mostrada = pessoa ?? ultima.current;
  return (
    <Dialog open={pessoa !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent hideClose className="motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t(`${P}title`)}</DialogTitle>
          <DialogDescription>{t(`${P}description`, { name: mostrada?.nome ?? "" })}</DialogDescription>
        </DialogHeader>
        {mostrada && <Formulario key={mostrada.id} aoConfirmar={(nota) => aoConfirmar(mostrada.id, nota)} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
