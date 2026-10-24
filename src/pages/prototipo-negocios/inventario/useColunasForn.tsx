// As colunas da tabela de fornecedores, como no mockup (scrSup): seleção, nome, código, contacto, cidade, POs abertas, SLA %, portal, preços por aprovar, estado e ações.
// Cada valor da tabela edita-se na própria célula (Ed); com portal ativo, NIF e empresa ficam bloqueados na regra (definirCampoForn).
import { Play } from "lucide-react";
import { PortalSelo } from "./FornColunas";
import { pct } from "./base";
import { useCtxInv } from "./ctxInv";
import { posAbertas, precosPorAprovar, slaStats } from "./fornecedores";
import { Ed, type ItemMenu } from "./mockPecas";
import { Ligacao, Selo } from "./pecasInv";
import { can } from "./perfil";
import { PM } from "./permForn";
import { definirCampoForn, type CampoForn } from "./regrasForn";
import type { Coluna } from "./TabelaInv";
import type { Fornecedor } from "./tipos";

interface Acoes { selecionados: Record<string, boolean>; marcar: (id: string, v: boolean) => void; marcarTodos: (v: boolean) => void; todosMarcados: boolean; simular: (id: string) => void; menu: (s: Fornecedor) => readonly (ItemMenu | "-")[] }

/** As colunas, ligadas às ações do ecrã (`a`) e ao contexto (a base e como agir sobre ela). */
export function useColunasForn(a: Acoes): Coluna<Fornecedor>[] {
  const { db, agir, ir, abrir } = useCtxInv();
  const ed = (s: Fornecedor, k: CampoForn, extra: Partial<React.ComponentProps<typeof Ed>> = {}): React.ReactNode => (
    <Ed valor={s[k] as string | number | boolean} perm={PM} aoGravar={(v) => agir((d) => definirCampoForn(d, s.id, k, v), "Gravado.")} {...extra} />
  );
  return [
    { id: "sel", titulo: <input type="checkbox" aria-label="Selecionar todos" checked={a.todosMarcados} onChange={(e) => a.marcarTodos(e.target.checked)} />, celula: (s) => <input type="checkbox" aria-label={`Selecionar ${s.name}`} checked={!!a.selecionados[s.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => a.marcar(s.id, e.target.checked)} /> },
    { id: "n", titulo: "Nome", valor: (s) => s.name, celula: (s) => <><b>{ed(s, "name")}</b>{s.deleted ? <> <Selo>Eliminado</Selo></> : null}<br /><small className="muted">{s.company}</small></> },
    { id: "c", titulo: "Código", valor: (s) => s.code, classe: () => "mono", celula: (s) => ed(s, "code") },
    { id: "ct", titulo: "Contacto", celula: (s) => <div className="stk">{ed(s, "contact")}<small>{ed(s, "email", { tipo: "email" })}</small><small>{ed(s, "phone", { tipo: "tel" })}</small></div> },
    { id: "ci", titulo: "Cidade", valor: (s) => s.city, celula: (s) => ed(s, "city") },
    { id: "po", titulo: "POs abertas", direita: true, valor: (s) => posAbertas(db, s.id), celula: (s) => (posAbertas(db, s.id) ? <Ligacao aoClicar={() => ir({ aba: "po", f: { sup: s.id } })}>{posAbertas(db, s.id)}</Ligacao> : "0") },
    { id: "sla", titulo: "SLA %", direita: true, valor: (s) => slaStats(db, s.id).pct, celula: (s) => {
      const p = slaStats(db, s.id).pct;
      return <><span style={{ color: `var(--i-${p >= 90 ? "ok" : p >= 75 ? "warn" : "bad"})`, fontWeight: 650 }}>{pct(p)}</span><br /><small className="muted">prazo {ed(s, "sla", { tipo: "number", atributos: { min: 0, step: 1 }, mostrar: `${s.sla} d` })}</small></>;
    } },
    { id: "pt", titulo: "Portal", celula: (s) => <div className="stk"><PortalSelo s={s} />{s.portal === "invited" ? <button type="button" className="btn btn-xs" onClick={(e) => { e.stopPropagation(); a.simular(s.id); }}><Play className="ic sm" aria-hidden="true" />Simular entrada no portal</button> : null}</div> },
    { id: "pr", titulo: "Preços por aprovar", celula: (s) => { const n = precosPorAprovar(db, s.id).length; return n ? <button type="button" className="badge b-warn" style={{ border: 0, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); abrir({ t: "sup", id: s.id, tab: "precos" }); }}>{n} por aprovar</button> : <span className="muted">—</span>; } },
    { id: "e", titulo: "Estado", celula: (s) => ed(s, "active", { tipo: "bool", rotulo: s.active ? "Ativo" : "Inativo", mostrar: can(PM) ? (s.active ? "Ativo" : "Inativo") : <Selo tom={s.active ? "ok" : "neu"}>{s.active ? "Ativo" : "Inativo"}</Selo> }) },
  ];
}

