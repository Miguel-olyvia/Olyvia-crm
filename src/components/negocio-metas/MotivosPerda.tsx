import { useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EstadoWorkflowTag } from "./EstadoWorkflowTag";
import { FOCO } from "./estilos";
import { MAX_CARACTERES_MOTIVO, MAX_MOTIVOS, traduzir, validarMotivo, type Texto } from "./workflowNegocio";

interface MotivosPerdaProps {
  motivos: readonly string[];
  aoMudar: (motivos: string[]) => void;
}

/** Texto com número de série: o número serve de `key`, para repetir o mesmo texto voltar a anunciar-se. */
interface Anuncio<T> {
  id: number;
  valor: T;
}

/** F · Os motivos de perda: lista editável (de 1 a 8, até 40 caracteres), marcada "A confirmar". */
export function MotivosPerda({ motivos, aoMudar }: MotivosPerdaProps) {
  const { t } = useTranslation();
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const serie = useRef(0);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<Anuncio<Texto> | null>(null);
  const [anuncio, setAnuncio] = useState<Anuncio<string> | null>(null);
  const ultimo = motivos.length <= 1;
  const anunciar = (chave: string, motivo: string, total: number) =>
    setAnuncio({ id: ++serie.current, valor: t(chave, { motivo, count: total, max: MAX_MOTIVOS }) });

  const acrescentar = (e: FormEvent) => {
    e.preventDefault();
    const problema = validarMotivo(texto, motivos);
    setErro(problema ? { id: ++serie.current, valor: problema } : null);
    if (problema) return;
    aoMudar([...motivos, texto.trim()]);
    anunciar("businessGoals.workflow.motivos.added", texto.trim(), motivos.length + 1);
    setTexto("");
  };
  const remover = (motivo: string) => {
    if (ultimo) return;
    aoMudar(motivos.filter((m) => m !== motivo));
    anunciar("businessGoals.workflow.motivos.removed", motivo, motivos.length - 1);
    setErro(null);
    entrada.current?.focus();
  };

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1">
        <h4 className="text-sm font-semibold text-foreground">{t("businessGoals.workflow.motivos.legend")}</h4>
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("businessGoals.workflow.motivos.help", { max: MAX_MOTIVOS, chars: MAX_CARACTERES_MOTIVO })}
        </p>
        <EstadoWorkflowTag estado="confirmar" />
      </div>
      <ul aria-label={t("businessGoals.workflow.motivos.list")} className="space-y-1.5">
        {motivos.map((m) => (
          <li key={m} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border px-3 text-sm text-foreground">
            <span className="min-w-0 break-words">{m}</span>
            <Button
              type="button" variant="ghost" size="icon" onClick={() => remover(m)}
              aria-disabled={ultimo ? "true" : undefined}
              aria-label={t("businessGoals.workflow.motivos.remove", { motivo: m })}
              aria-describedby={ultimo ? `${id}-ultimo` : undefined}
              className={`h-11 w-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${FOCO}`}
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {ultimo && <p id={`${id}-ultimo`} className="text-xs text-muted-foreground">{t("businessGoals.workflow.motivos.removeLast")}</p>}
      <div role="status" className="sr-only">
        {anuncio && <p key={anuncio.id}>{anuncio.valor}</p>}
      </div>
      <form onSubmit={acrescentar} noValidate className="space-y-1.5">
        <Label htmlFor={`${id}-novo`}>{t("businessGoals.workflow.motivos.new")}</Label>
        <div className="flex flex-wrap items-start gap-2">
          <Input
            id={`${id}-novo`} ref={entrada} value={texto} onChange={(e) => { setTexto(e.target.value); setErro(null); }}
            aria-invalid={erro !== null} aria-describedby={erro ? `${id}-erro` : undefined}
            autoComplete="off" className={`h-11 min-w-0 flex-1 ${FOCO}`}
          />
          <Button type="submit" variant="outline" className={`min-h-11 ${FOCO}`}>{t("businessGoals.workflow.motivos.add")}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("businessGoals.workflow.motivos.count", { count: motivos.length, max: MAX_MOTIVOS })}
        </p>
        {erro && (
          <p key={erro.id} id={`${id}-erro`} role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
            {traduzir(t, erro.valor)}
          </p>
        )}
      </form>
    </fieldset>
  );
}
