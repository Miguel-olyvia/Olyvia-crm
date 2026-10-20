// «Quem vai à visita»: um botão por recurso da agenda, ligado e desligado (`aria-pressed`), como os chips de recursos de Leads. Um recurso ocupado
// nesse horário di-lo em texto dentro do próprio botão (a cor não é o único sinal). Escolher um recurso nunca o bloqueia: a recusa verdadeira é da base.
import type { Ref } from "react";
import { Check } from "lucide-react";
import type { RecursoVisita } from "@/hooks/pessoas/useAgendaVisita";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "./CamposDataHora";

const A = "pessoasPagina.real.visit.agenda.";

interface SeletorRecursosVisitaProps {
  /** A base dos ids (o do erro leva `-erro`). */
  id: string;
  recursos: readonly RecursoVisita[];
  escolhidos: readonly string[];
  /** Os recursos que já têm uma marcação ou uma ausência nesse horário (pré-aviso, ou a recusa da base). */
  emConflito: readonly string[];
  aoMudar: (ids: string[]) => void;
  /** A guardar: os botões ficam `aria-disabled` (continuam no teclado) e ignoram os cliques. */
  desativado?: boolean;
  /** O erro já traduzido, ligado ao grupo. */
  erro?: string | null;
  /** O grupo aceita foco por código (a recusa NG010 leva o foco para aqui). */
  grupoRef?: Ref<HTMLFieldSetElement>;
}

const CHIP = "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors motion-reduce:transition-none";

export function SeletorRecursosVisita({ id, recursos, escolhidos, emConflito, aoMudar, desativado, erro, grupoRef }: SeletorRecursosVisitaProps) {
  const { t } = useTranslation();
  const idErro = `${id}-erro`;
  const alternar = (recurso: string) => {
    if (desativado) return;
    aoMudar(escolhidos.includes(recurso) ? escolhidos.filter((r) => r !== recurso) : [...escolhidos, recurso]);
  };
  return (
    <fieldset
      ref={grupoRef} tabIndex={-1} aria-describedby={erro ? idErro : undefined} aria-invalid={erro ? true : undefined}
      className="space-y-2 outline-none"
    >
      <legend className="mb-1 text-sm font-semibold text-foreground">{t(`${A}resources`)}</legend>
      {recursos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(`${A}resourcesNone`)}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {recursos.map((r) => {
            const ligado = escolhidos.includes(r.id);
            const ocupado = emConflito.includes(r.id);
            return (
              <button
                key={r.id} type="button" aria-pressed={ligado} aria-disabled={desativado || undefined} onClick={() => alternar(r.id)}
                className={cn(
                  CHIP, FOCO, desativado && "cursor-not-allowed opacity-70",
                  ligado ? "border-primary bg-primary/10 font-medium text-foreground ring-1 ring-primary" : "border-input bg-background text-foreground hover:bg-accent",
                )}
              >
                {ligado && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span>{r.name}</span>
                {ocupado && <span className="text-xs font-normal text-muted-foreground">({t(`${A}resourceBusy`)})</span>}
              </button>
            );
          })}
        </div>
      )}
      {erro && <MensagemErro id={idErro} texto={erro} />}
    </fieldset>
  );
}
