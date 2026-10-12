// Mais peças com o DOM do mockup: chips de filtro (.chip), interruptor (.switch), caixa de seleção (.check), edição na própria célula (função ie()),
// e o menu "Mais ações" (.menu). O que muda de perfil para perfil (can) lê-se do módulo perfil.ts; o contexto traz `perfil` para os ecrãs redesenharem.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Lock, MoreHorizontal, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCtxInv } from "./ctxInv";
import { can, porqueNao } from "./perfil";

/** Um chip de filtro (`.chip` com aria-pressed); `n` é o número que o mockup mostra em .cnt. */
export function Chip({ ativo, aoClicar, children, n }: { ativo: boolean; aoClicar: () => void; children: ReactNode; n?: number | string }) {
  return <button type="button" className="chip" aria-pressed={ativo} onClick={aoClicar}>{children}{n != null ? <> <span className="cnt">{n}</span></> : null}</button>;
}

/** O interruptor `.switch` (checkbox escondida e trilho). */
export function Sw({ rotulo, ativo, aoMudar, desativado }: { rotulo: ReactNode; ativo: boolean; aoMudar: (v: boolean) => void; desativado?: boolean }) {
  return <label className="switch"><input type="checkbox" checked={ativo} disabled={desativado} onChange={(e) => aoMudar(e.target.checked)} /><span className="sw" aria-hidden="true" /><span>{rotulo}</span></label>;
}

/** A caixa `.check` com texto. */
export function Check({ rotulo, ativo, aoMudar, desativado }: { rotulo: ReactNode; ativo: boolean; aoMudar: (v: boolean) => void; desativado?: boolean }) {
  return <label className="check"><input type="checkbox" checked={ativo} disabled={desativado} onChange={(e) => aoMudar(e.target.checked)} /> {rotulo}</label>;
}

type TipoEd = "text" | "number" | "email" | "tel" | "date" | "select" | "textarea" | "bool";
interface EdProps {
  valor: string | number | boolean | null | undefined;
  /** Grava; devolve o resultado de `agir` (um erro de regra fica no aviso). */
  aoGravar: (v: string | boolean) => unknown;
  tipo?: TipoEd; opcoes?: readonly (readonly [string, string])[]; atributos?: React.InputHTMLAttributes<HTMLInputElement>;
  /** O que se vê quando não se edita (por omissão o valor, ou "—"). */
  mostrar?: ReactNode; rotulo?: string;
  /** A permissão que o perfil tem de ter para editar; sem ela vê-se o cadeado. */
  perm?: string;
  /** Bloqueio por regra de negócio: o texto aparece no cadeado e `desbloquear` é o botão que o resolve. */
  bloqueio?: string; desbloquear?: ReactNode;
}

const Cadeado = ({ texto }: { texto: string }) => <span className="lk-ic" title={texto} aria-label={`Bloqueado: ${texto}`}><Lock className="ic sm" aria-hidden="true" /></span>;

/** Clicar → editar → Enter/sair grava, Esc cancela (função ie() do mockup). */
export function Ed({ valor, aoGravar, tipo = "text", opcoes, atributos, mostrar, rotulo = "Editar", perm, bloqueio, desbloquear }: EdProps) {
  useCtxInv(); // o perfil muda → redesenha
  const [aEditar, setAEditar] = useState(false);
  const campo = useRef<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>(null);
  const vista = mostrar ?? (valor === "" || valor == null ? "—" : String(valor));
  useEffect(() => { if (aEditar) { campo.current?.focus(); try { campo.current?.select?.(); } catch { /* select não existe em todos os controlos */ } } }, [aEditar]);
  if (bloqueio) return <span className="lk">{vista} <Cadeado texto={bloqueio} />{desbloquear}</span>;
  if (perm && !can(perm)) return <span className="lk">{vista} <span className="lk-ic" title={porqueNao(perm)}><Lock className="ic sm" aria-hidden="true" /></span></span>;
  if (tipo === "bool") return <label className="switch" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!valor} aria-label={rotulo} onChange={(e) => aoGravar(e.target.checked)} /><span className="sw" aria-hidden="true" /><span>{mostrar}</span></label>;
  const gravar = (v: string): void => { if (!aEditar) return; setAEditar(false); aoGravar(v); };
  if (aEditar) {
    const comum = {
      ref: campo as never, className: "ie-in", "aria-label": rotulo, onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onBlur: (e: React.FocusEvent<HTMLElement & { value: string }>) => gravar(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLElement & { value: string }>) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAEditar(false); }
        else if (e.key === "Enter" && (e.currentTarget.tagName !== "TEXTAREA" || e.ctrlKey || e.metaKey)) { e.preventDefault(); gravar(e.currentTarget.value); }
      },
    };
    if (tipo === "select") return <select {...comum} defaultValue={String(valor ?? "")} onChange={(e) => gravar(e.target.value)}>{(opcoes ?? []).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>;
    if (tipo === "textarea") return <><textarea {...comum} rows={3} maxLength={2000} defaultValue={String(valor ?? "")} /><small className="muted">Ctrl+Enter grava · Esc cancela</small></>;
    return <input {...comum} type={tipo} defaultValue={String(valor ?? "")} {...atributos} />;
  }
  return <button type="button" className="ie" title="Clique para editar" onClick={(e) => { e.stopPropagation(); setAEditar(true); }}><span>{vista}</span><Pencil className="ic sm ie-ic" aria-hidden="true" /></button>;
}

export interface ItemMenu { label: string; icone?: ReactNode; perigo?: boolean; desativado?: boolean; porque?: string; fonte?: string; run: () => void }
/** O botão "Mais ações" (⋯) e o seu menu (`.menu` do mockup), que fecha ao escolher, com Esc ou ao clicar fora. */
export function MenuMais({ itens, rotulo = "Mais ações" }: { itens: readonly (ItemMenu | "-")[]; rotulo?: string }) {
  const { tema } = useCtxInv();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const fora = (): void => setPos(null);
    const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") setPos(null); };
    document.addEventListener("click", fora); document.addEventListener("keydown", esc);
    menu.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => { document.removeEventListener("click", fora); document.removeEventListener("keydown", esc); };
  }, [pos]);
  const abrir = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(r.right - 250, window.innerWidth - 258)), top: r.bottom + 4 });
  };
  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label={rotulo} aria-haspopup="menu" aria-expanded={!!pos} onClick={abrir}><MoreHorizontal className="ic" aria-hidden="true" /></button>
      {pos && createPortal(
        <div ref={menu} role="menu" className={cn("inv-root menu")} data-theme={tema} style={{ left: pos.left, top: pos.top }} onClick={(e) => e.stopPropagation()}>
          {itens.map((it, i) => it === "-" ? <hr key={i} /> : (
            <button key={it.label} type="button" role="menuitem" className={it.perigo ? "danger" : undefined} disabled={it.desativado} onClick={() => { setPos(null); it.run(); }}>
              {it.icone}<span>{it.label}</span>{it.desativado && it.porque ? <small>{it.porque}</small> : null}{it.fonte ? <small><span className="src">{it.fonte}</span></small> : null}
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}
