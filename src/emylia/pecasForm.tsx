// 13/11: as peças do formulário do Catálogo (campo, número, chips, retirar e as classes que partilham), tiradas de CriarNoCatalogo.tsx
// para o editor de atributos (AtributosProduto.tsx) as usar sem uma importação circular. O comportamento é o mesmo.
import { useEffect, useId, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const NOTA = "text-[15px] text-muted-foreground";
export const CAMPO = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none transition-shadow focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
export const CHIP = (on: boolean) => cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3.5 text-[15px] transition-all", on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground");

export function Campo({ rot, dica, children, className }: { rot: string; dica?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  const idDica = `${id}-dica`;
  // a dica fica ligada ao campo (aria-describedby) sem apagar o que o campo já declara; corre em cada render porque o campo pode reescrever o atributo
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const toks = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    const tem = toks.includes(idDica);
    if (dica && !tem) el.setAttribute("aria-describedby", [idDica, ...toks].join(" "));
    else if (!dica && tem) { const r = toks.filter((t) => t !== idDica); if (r.length) el.setAttribute("aria-describedby", r.join(" ")); else el.removeAttribute("aria-describedby"); }
  });
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="text-[15px] font-medium">{rot}</label>
      {children(id)}
      {dica && <span id={idDica} className="text-sm text-muted-foreground">{dica}</span>}
    </div>
  );
}
export function Num({ id, v, set, suf, rot, ph = "0" }: { id?: string; v: string; set: (s: string) => void; suf?: string; rot?: string; ph?: string }) {
  return (
    <span className="relative block">
      <input id={id} aria-label={rot} type="text" inputMode="decimal" value={v} placeholder={ph} onChange={(e) => set(e.target.value.replace(/[^\d,.-]/g, ""))}
        className={cn(CAMPO, "text-right tabular-nums", suf ? "pr-14" : "")} />
      {suf && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suf}</span>}
    </span>
  );
}
export function Chips<T extends string | null>({ rot, opcoes, v, set }: { rot: string; opcoes: readonly (readonly [T, string])[]; v: T; set: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={rot} className="flex flex-wrap gap-2">
      {opcoes.map(([k, t]) => (
        <button key={String(k)} type="button" role="radio" aria-checked={v === k} onClick={() => set(k)} className={CHIP(v === k)}>
          {v === k && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}{t}
        </button>
      ))}
    </div>
  );
}
export const Retirar = ({ rot, onClick }: { rot: string; onClick: () => void }) => (
  <button type="button" aria-label={rot} onClick={onClick} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
    <Trash2 className="h-4 w-4" aria-hidden="true" />
  </button>
);
