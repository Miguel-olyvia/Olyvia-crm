// A Direção (simulada): quando o orçamento tem um bloqueio mole (margem abaixo do mínimo), o comercial pede a aprovação e, aqui,
// escolhe-se o que a Direção responde: aprovar a exceção (o orçamento fica verificado) ou recusar (volta a ficar por verificar). Só
// exemplo. Montado uma vez, ao nível da página, pelo `ProcessoProvider`.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "../CamposDataHora";
import { useAvisoAlternado } from "./avisoAlternado";
import { GrupoOpcoesProcesso } from "./GrupoOpcoesProcesso";
import { pct } from "./formatoOrcamento";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";

const P = "pessoasPagina.direction.";

type Resposta = "aprovar" | "recusar";

interface FormProps {
  aoResponder: (aprovada: boolean) => FaltaProcesso[];
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
}

function Formulario({ aoResponder, explicar, aoFechar }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const alternar = useAvisoAlternado();
  const [resposta, setResposta] = useState<Resposta | "">("");
  const [tentou, setTentou] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const grupo = useRef<HTMLDivElement>(null);
  const semResposta = tentou && resposta === "";
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (resposta === "") { grupo.current?.querySelector<HTMLElement>('[role="radio"]')?.focus(); return; }
    const faltas = aoResponder(resposta === "aprovar");
    // O motivo diz-se DENTRO do diálogo (alerta): a região live da página fica fora do modal. Alterna um espaço inseparável para repetir.
    setMotivo(faltas.length > 0 ? alternar(explicar(faltas)) : null);
  };
  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <GrupoOpcoesProcesso<Resposta>
        legenda={t(`${P}group`)} valor={resposta} grupoRef={grupo} obrigatorio erro={semResposta ? t(`${P}error`) : null} aoMudar={setResposta}
        opcoes={[{ valor: "aprovar", rotulo: t(`${P}approve`) }, { valor: "recusar", rotulo: t(`${P}refuse`) }]}
      />
      {motivo !== null && <MensagemErro id={`${id}-motivo`} texto={motivo} />}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${P}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${P}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

interface DirecaoSimuladaProps {
  /** O negócio cujo orçamento se pediu à Direção; `null` com o diálogo fechado. */
  negocio: NegocioDoPasso | null;
  /** A margem do orçamento (de 0 a 1), que a descrição diz. */
  margem: number;
  /** Regista a resposta; devolve o que falta (vazio = registou, e quem chama fecha o diálogo). */
  aoResponder: (aprovada: boolean) => FaltaProcesso[];
  /** O texto de "o que falta" de um portão, já traduzido (o diálogo di-lo num alerta). */
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function DirecaoSimulada({ negocio, margem, aoResponder, explicar, aoFechar, aoDevolverFoco }: DirecaoSimuladaProps) {
  const { t } = useTranslation();
  const ultimo = useRef(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent hideClose className="motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t(`${P}title`, { work: mostrado?.trabalho ?? "" })}</DialogTitle>
          <DialogDescription>{t(`${P}description`, { name: mostrado?.nome ?? "", margin: pct(margem) })}</DialogDescription>
        </DialogHeader>
        {mostrado && <Formulario key={mostrado.id} aoResponder={aoResponder} explicar={explicar} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
