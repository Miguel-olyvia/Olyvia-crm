// Peças dos formulários da Frota: o campo (rótulo, controlo, ajuda e erro ligados por aria), o alerta e a nota.
import { useId, type ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Uma caixa de aviso dentro do diálogo, com ícone (nunca só cor). */
export function Alerta({ tom, icone: I, children }: { tom: "ok" | "bad" | "warn" | "info"; icone: LucideIcon; children: ReactNode }) {
  const cls = { ok: "border-success/40 bg-success/10", bad: "border-destructive/40 bg-destructive/10", warn: "border-warning/50 bg-warning/15", info: "border-info/40 bg-info/10" }[tom];
  const ic = { ok: "text-green-700 dark:text-success", bad: "text-destructive", warn: "text-amber-700 dark:text-warning", info: "text-sky-700 dark:text-info" }[tom];
  return <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", cls)}><I className={cn("mt-0.5 h-4 w-4 shrink-0", ic)} aria-hidden="true" /><span>{children}</span></div>;
}
export const Nota = ({ icone: I = Info, children }: { icone?: LucideIcon; children: ReactNode }) => (
  <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><I className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{children}</p>
);

/** O rótulo, o controlo, a ajuda e o erro de um campo (aria-invalid + aria-describedby). */
export function Campo({ rotulo, erro, ajuda, largo, children }: { rotulo: string; erro?: string; ajuda?: string; largo?: boolean; children: (p: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId(), idAjuda = `${id}-ajuda`, idErro = `${id}-erro`;
  const desc = [erro ? idErro : null, ajuda ? idAjuda : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", largo && "sm:col-span-2")}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children({ id, "aria-invalid": erro ? true : undefined, "aria-describedby": desc })}
      {erro ? <p id={idErro} role="alert" className="text-sm font-medium text-destructive">{erro}</p> : null}
      {ajuda ? <p id={idAjuda} className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

