// As peças pequenas do Inventário nativo, nas regras de desenho do protótipo: texto de 15 px no mínimo, alvos de 44 px, cor só nos ícones, nada de cartões dentro de cartões.
import { useId, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, Info, Search, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BORDA_CTRL } from "../PessoaLinha";
import { FOCO } from "../FiltrosPopover";
import type { Tom } from "./tipos";

export const CAMPO = cn("h-11 w-full rounded-md border bg-card px-3 text-[15px]", BORDA_CTRL, FOCO);
const ICONE: Record<Tom, [LucideIcon, string]> = {
  ok: [CheckCircle2, "text-emerald-700"], info: [Info, "text-sky-700"], warn: [AlertTriangle, "text-amber-700"], bad: [XCircle, "text-destructive"], violet: [Circle, "text-violet-700"], neu: [Circle, "text-muted-foreground"],
};

/** Um estado: ícone com a cor do tom e o texto sempre na cor normal (a cor sozinha nunca diz nada). */
export function Selo({ tom = "neu", children }: { tom?: Tom; children: ReactNode }) {
  const [I, cor] = ICONE[tom];
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[15px] leading-5"><I className={cn("h-4 w-4 shrink-0", cor)} aria-hidden="true" />{children}</span>;
}

/** O texto de um erro ou aviso numa linha, com ícone: nunca só cor. */
export function Nota({ tom = "info", children, alerta }: { tom?: Tom; children: ReactNode; alerta?: boolean }) {
  const [I, cor] = ICONE[tom];
  return <p role={alerta ? "alert" : undefined} className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-[15px]"><I className={cn("mt-0.5 h-4 w-4 shrink-0", cor)} aria-hidden="true" /><span className="min-w-0">{children}</span></p>;
}

export function Vazio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <p className="text-base font-semibold">{titulo}</p>
      {texto && <p className="max-w-prose text-[15px] text-muted-foreground">{texto}</p>}
      {children}
    </div>
  );
}

export function Pesquisa({ valor, aoMudar, rotulo, dica, inputRef }: { valor: string; aoMudar: (v: string) => void; rotulo: string; dica?: string; inputRef?: React.RefObject<HTMLInputElement> }) {
  return (
    <label className="relative block min-w-0 basis-full sm:basis-80">
      <span className="sr-only">{rotulo}</span>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input ref={inputRef} type="search" placeholder={dica ?? rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)}
        className={cn("h-11 w-full rounded-lg border bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25", BORDA_CTRL)} />
    </label>
  );
}

interface CampoProps { rotulo: string; erro?: string; ajuda?: string; obrigatorio?: boolean; className?: string; children: (id: string) => ReactNode }
/** Etiqueta visível por cima, o controlo por baixo e o erro em texto (com role=alert). */
export function Rotulo({ rotulo, erro, ajuda, obrigatorio, className, children }: CampoProps) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="block text-[15px] text-muted-foreground">{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      {children(id)}
      {ajuda && !erro && <p className="mt-1 text-[15px] text-muted-foreground">{ajuda}</p>}
      {erro && <p role="alert" className="mt-1 text-[15px]">{erro}</p>}
    </div>
  );
}

export function Texto({ rotulo, valor, aoMudar, tipo = "text", erro, ajuda, obrigatorio, className, atributos }: { rotulo: string; valor: string | number; aoMudar: (v: string) => void; tipo?: string; erro?: string; ajuda?: string; obrigatorio?: boolean; className?: string; atributos?: React.InputHTMLAttributes<HTMLInputElement> }) {
  return <Rotulo rotulo={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>{(id) => <input id={id} type={tipo} value={valor} onChange={(e) => aoMudar(e.target.value)} className={CAMPO} {...atributos} />}</Rotulo>;
}

export function Lista({ rotulo, valor, aoMudar, opcoes, erro, ajuda, obrigatorio, className, desativado }: { rotulo: string; valor: string; aoMudar: (v: string) => void; opcoes: readonly (readonly [string, string])[]; erro?: string; ajuda?: string; obrigatorio?: boolean; className?: string; desativado?: boolean }) {
  return (
    <Rotulo rotulo={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
      {(id) => <select id={id} value={valor} disabled={desativado} onChange={(e) => aoMudar(e.target.value)} className={cn(CAMPO, "cursor-pointer")}>{opcoes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
    </Rotulo>
  );
}

export function Notas({ rotulo, valor, aoMudar, linhas = 3, ajuda, obrigatorio, maximo }: { rotulo: string; valor: string; aoMudar: (v: string) => void; linhas?: number; ajuda?: string; obrigatorio?: boolean; maximo?: number }) {
  return <Rotulo rotulo={rotulo} ajuda={ajuda} obrigatorio={obrigatorio}>{(id) => <textarea id={id} rows={linhas} maxLength={maximo} value={valor} onChange={(e) => aoMudar(e.target.value)} className={cn("w-full rounded-md border bg-card px-3 py-2 text-[15px]", BORDA_CTRL, FOCO)} />}</Rotulo>;
}

/** Um botão secundário (contorno); o único primário do ecrã é o `Button` normal. */
export function Sec({ className, ...p }: React.ComponentProps<typeof Button>) {
  return <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL, className)} {...p} />;
}
export function Pri({ className, ...p }: React.ComponentProps<typeof Button>) {
  return <Button type="button" className={cn("min-h-11 cursor-pointer text-[15px]", className)} {...p} />;
}
/** Uma ligação que é um botão (abre outro detalhe). */
export function Ligacao({ children, aoClicar, className }: { children: ReactNode; aoClicar: () => void; className?: string }) {
  return <button type="button" onClick={(e) => { e.stopPropagation(); aoClicar(); }} className={cn("min-h-11 cursor-pointer rounded-md px-1 text-left font-medium text-primary underline-offset-4 hover:underline", FOCO, className)}>{children}</button>;
}

/** Um bloco com título, sem moldura dentro de moldura. */
export function Bloco({ titulo, accao, children, id }: { titulo: string; accao?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id={id} className="text-lg font-semibold">{titulo}</h2>{accao}</div>
      {children}
    </section>
  );
}

/** Pares rótulo/valor para os cabeçalhos das folhas. */
export function Dados({ itens }: { itens: readonly (readonly [string, ReactNode])[] }) {
  return <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">{itens.map(([r, v]) => <div key={r} className="min-w-0"><dt className="text-[15px] text-muted-foreground">{r}</dt><dd className="text-[15px]">{v}</dd></div>)}</dl>;
}
