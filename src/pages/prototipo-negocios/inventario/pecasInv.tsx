// As peças pequenas do Inventário, com o DOM e as classes do mockup (badge, alert, empty, fl, inp-ic, btn, link, ...). O CSS é o do mockup (inventario.css, escopo .inv-root).
import { useId, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Search, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tom } from "./tipos";

/** Antes era a classe Tailwind dos campos; o CSS do mockup já estiliza os controlos, por isso é vazia. */
export const CAMPO = "";
const ICONE: Record<Tom, LucideIcon> = { ok: CheckCircle2, info: Info, warn: AlertTriangle, bad: XCircle, violet: Info, neu: Info };

/** Um estado (função B() do mockup): `<span class="badge b-tom">`. */
export function Selo({ tom = "neu", children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  return <span className={cn("badge", `b-${tom}`, className)}>{children}</span>;
}

/** Um aviso (classe .alert do mockup): ícone e texto. */
export function Nota({ tom = "info", children, alerta }: { tom?: Tom; children: ReactNode; alerta?: boolean }) {
  const I = ICONE[tom];
  return <div role={alerta ? "alert" : undefined} className={cn("alert", tom === "violet" ? "neu" : tom)}><I className="ic" aria-hidden="true" /><div>{children}</div></div>;
}

/** Sem resultados (função empty() do mockup). */
export function Vazio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return <div className="empty"><Search className="ic lg" aria-hidden="true" /><b>{titulo}</b><p>{texto ?? ""}</p>{children}</div>;
}

/** A caixa de pesquisa das listas (`.inp-ic` do mockup). */
export function Pesquisa({ valor, aoMudar, rotulo, dica, inputRef }: { valor: string; aoMudar: (v: string) => void; rotulo: string; dica?: string; inputRef?: React.RefObject<HTMLInputElement> }) {
  return (
    <div className="inp-ic">
      <Search className="ic" aria-hidden="true" />
      <input ref={inputRef} type="search" placeholder={dica ?? rotulo} aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </div>
  );
}

interface CampoProps { rotulo: string; erro?: string; ajuda?: string; obrigatorio?: boolean; className?: string; children: (id: string) => ReactNode }
/** Um campo de formulário (função fld() do mockup): `<label class="fl">` com o texto por cima, o erro e a ajuda por baixo. */
export function Rotulo({ rotulo, erro, ajuda, obrigatorio, className, children }: CampoProps) {
  const id = useId();
  return (
    <label className={cn("fl", className)} htmlFor={id}>
      <span>{rotulo}{obrigatorio ? <> <b className="req" aria-hidden="true">*</b></> : null}</span>
      {children(id)}
      {erro ? <span className="ferr" role="alert">{erro}</span> : null}
      {ajuda && !erro ? <small className="help">{ajuda}</small> : null}
    </label>
  );
}

export function Texto({ rotulo, valor, aoMudar, tipo = "text", erro, ajuda, obrigatorio, className, atributos }: { rotulo: string; valor: string | number; aoMudar: (v: string) => void; tipo?: string; erro?: string; ajuda?: string; obrigatorio?: boolean; className?: string; atributos?: React.InputHTMLAttributes<HTMLInputElement> }) {
  return <Rotulo rotulo={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>{(id) => <input id={id} type={tipo} value={valor} onChange={(e) => aoMudar(e.target.value)} {...atributos} />}</Rotulo>;
}

export function Lista({ rotulo, valor, aoMudar, opcoes, erro, ajuda, obrigatorio, className, desativado }: { rotulo: string; valor: string; aoMudar: (v: string) => void; opcoes: readonly (readonly [string, string])[]; erro?: string; ajuda?: string; obrigatorio?: boolean; className?: string; desativado?: boolean }) {
  return (
    <Rotulo rotulo={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
      {(id) => <select id={id} value={valor} disabled={desativado} onChange={(e) => aoMudar(e.target.value)}>{opcoes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
    </Rotulo>
  );
}

export function Notas({ rotulo, valor, aoMudar, linhas = 3, ajuda, obrigatorio, maximo }: { rotulo: string; valor: string; aoMudar: (v: string) => void; linhas?: number; ajuda?: string; obrigatorio?: boolean; maximo?: number }) {
  return <Rotulo rotulo={rotulo} ajuda={ajuda} obrigatorio={obrigatorio}>{(id) => <textarea id={id} rows={linhas} maxLength={maximo} value={valor} onChange={(e) => aoMudar(e.target.value)} />}</Rotulo>;
}

type PropsBotao = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "destructive" };
/** Um botão normal (`.btn`). */
export function Sec({ className, variant: _variant, ...p }: PropsBotao) {
  return <button type="button" className={cn("btn", className)} {...p} />;
}
/** O botão primário (`.btn-p`); `variant="destructive"` é `.btn-danger`. */
export function Pri({ className, variant, ...p }: PropsBotao) {
  return <button type="button" className={cn("btn", variant === "destructive" ? "btn-danger" : "btn-p", className)} {...p} />;
}
/** Um botão pequeno (`.btn-sm`). */
export function Peq({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn("btn btn-sm", className)} {...p} />;
}
/** Uma ligação que é um botão (`.link` do mockup). */
export function Ligacao({ children, aoClicar, className }: { children: ReactNode; aoClicar: () => void; className?: string }) {
  return <button type="button" onClick={(e) => { e.stopPropagation(); aoClicar(); }} className={cn("link", className)}>{children}</button>;
}

/** Um bloco com título (h2 de 16 px como no mockup). */
export function Bloco({ titulo, accao, children, id }: { titulo: string; accao?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="stack">
      <div className="row between"><h2 id={id} style={{ fontSize: 16 }}>{titulo}</h2>{accao}</div>
      {children}
    </section>
  );
}

/** Pares rótulo/valor para os cabeçalhos das folhas (`.sh-info` e `.lbl` do mockup). */
export function Dados({ itens }: { itens: readonly (readonly [string, ReactNode])[] }) {
  return <div className="sh-info">{itens.map(([r, v]) => <div key={r}><span className="lbl">{r}</span>{v}</div>)}</div>;
}
