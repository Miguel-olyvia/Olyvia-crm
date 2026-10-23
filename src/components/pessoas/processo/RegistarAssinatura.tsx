// «Registar a assinatura»: confirma que o contrato foi assinado, e o negócio fica ganho. Só exemplo. Montado uma vez, ao nível da página,
// pelo `ProcessoProvider`.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "../CamposDataHora";
import { useAvisoAlternado } from "./avisoAlternado";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";

const P = "pessoasPagina.sign.";

interface FormProps {
  aoConfirmar: () => FaltaProcesso[];
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
}

function Formulario({ aoConfirmar, explicar, aoFechar }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const alternar = useAvisoAlternado();
  const [falta, setFalta] = useState<string | null>(null);
  const confirmar = (e: FormEvent) => {
    e.preventDefault();
    const faltas = aoConfirmar();
    setFalta(faltas.length > 0 ? alternar(explicar(faltas)) : null);
  };
  return (
    <form onSubmit={confirmar} noValidate className="space-y-4">
      {falta !== null && <MensagemErro id={`${id}-falta`} texto={falta} />}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${P}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${P}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

interface RegistarAssinaturaProps extends FormProps {
  /** O negócio cujo contrato se assina; `null` com o diálogo fechado. */
  negocio: NegocioDoPasso | null;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function RegistarAssinatura({ negocio, aoDevolverFoco, ...form }: RegistarAssinaturaProps) {
  const { t } = useTranslation();
  const ultimo = useRef(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) form.aoFechar(); }}>
      <DialogContent hideClose className="motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t(`${P}title`, { work: mostrado?.trabalho ?? "" })}</DialogTitle>
          <DialogDescription>{t(`${P}description`, { name: mostrado?.nome ?? "" })}</DialogDescription>
        </DialogHeader>
        {mostrado && <Formulario key={mostrado.id} {...form} />}
      </DialogContent>
    </Dialog>
  );
}
