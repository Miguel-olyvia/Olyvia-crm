// O cartão de um armazém (scrWh › whcards do mockup): cada campo edita-se na própria célula, o menu "Mais ações" tem Editar e Eliminar/Restaurar,
// e em baixo vêm as estatísticas e os atalhos para as existências, os movimentos e o registo de um movimento.
import { Lock, Pencil, Trash2, Undo2 } from "lucide-react";
import { eur, produto } from "./base";
import { Fonte } from "./cabInv";
import { MOVEL_NAO_SERVE, definirCampoArmazem, restaurarArmazem, type DadosArmazem } from "./cadastros";
import { useCtxInv } from "./ctxInv";
import { Ed, MenuMais } from "./mockPecas";
import { Peq, Selo } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import type { Armazem, Inventario } from "./tipos";

const CAMPOS: readonly (readonly [string, keyof DadosArmazem])[] = [["Morada", "addr"], ["Código postal", "cp"], ["Cidade", "city"], ["Gestor", "manager"], ["Telefone", "phone"], ["Email", "email"], ["Capacidade", "cap"]];

function estatisticas(db: Inventario, w: Armazem): { prods: number; valor: number; alertas: number } {
  const rows = db.stocks.filter((s) => s.wh === w.id && !s.deleted);
  const custo = (sku: string): number => produto(db, sku)?.avg || produto(db, sku)?.cost || 0;
  return { prods: rows.filter((r) => r.qty > 0).length, valor: rows.reduce((a, r) => a + r.qty * custo(r.sku), 0), alertas: rows.filter((r) => r.min && r.qty < r.min).length };
}

interface Props { w: Armazem; aoEditar: () => void; aoEliminar: () => void; aoMovimento: () => void }

export function ArmazemCartao({ w, aoEditar, aoEliminar, aoMovimento }: Props) {
  const { db, agir, ir } = useCtxInv();
  const man = can("inventory.manage"), st = estatisticas(db, w);
  const porque = man ? undefined : porqueNao("inventory.manage");
  const restaurar = (): void => { agir((d) => restaurarArmazem(d, w.id), "Armazém restaurado."); };
  const desbloquear = <> <button type="button" className="btn btn-xs" onClick={(e) => { e.stopPropagation(); restaurar(); }}><Lock className="ic sm" aria-hidden="true" />Restaurar</button></>;
  const W2 = (k: keyof DadosArmazem, tipo: "text" | "email" | "tel" | "bool" = "text", rotulo?: string) => (
    <Ed valor={w[k]} tipo={tipo} rotulo={rotulo ?? `Editar ${k}`} perm="inventory.manage" mostrar={tipo === "bool" ? rotulo : String(w[k] || "—")} aoGravar={(v) => agir((d) => definirCampoArmazem(d, w.id, k, v), "Gravado.")}
      {...(w.deleted ? { bloqueio: "Armazém eliminado", desbloquear } : {})} />
  );
  const itens = [
    { label: "Editar", icone: <Pencil className="ic" aria-hidden="true" />, desativado: !man || w.deleted, porque: man ? undefined : porque, run: aoEditar },
    "-" as const,
    w.deleted ? { label: "Restaurar", icone: <Undo2 className="ic" aria-hidden="true" />, desativado: !man, porque, run: restaurar }
      : { label: "Eliminar", icone: <Trash2 className="ic" aria-hidden="true" />, perigo: true, desativado: !man, porque, run: aoEliminar },
  ];
  return (
    <article className={"card whcard" + (w.deleted ? " deleted" : "")}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div><h3>{W2("name", "text", "Nome")}</h3><small className="muted mono">{W2("code", "text", "Código")}</small></div>
        <MenuMais itens={itens} />
      </div>
      <div className="row" style={{ gap: 10 }}>
        {w.deleted ? <Selo>Eliminado</Selo> : <>{W2("active", "bool", "Ativo")}{w.tipo === "viatura"
          ? <label className="switch" title={MOVEL_NAO_SERVE} style={{ opacity: 0.6, cursor: "not-allowed" }}><input type="checkbox" checked={false} disabled aria-label="Serve clientes" aria-describedby={`movel-${w.id}`} /><span className="sw" aria-hidden="true" /><span>Serve clientes</span><span id={`movel-${w.id}`} className="sr">{MOVEL_NAO_SERVE}</span></label>
          : W2("serves", "bool", "Serve clientes")}</>}
        {db.settings.defaultWh === w.id && <Selo tom="info">Por defeito</Selo>}
        {w.tipo === "viatura" && <Selo tom="violet">Armazém móvel · viatura {w.matricula}</Selo>}
      </div>
      <div className="dl" style={{ fontSize: 13, gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "6px 12px" }}>
        {CAMPOS.map(([l, k]) => <div key={k}><span className="lbl">{l}</span>{W2(k, k === "email" ? "email" : k === "phone" ? "tel" : "text", l)}</div>)}
        <div><span className="lbl">Coordenadas</span><span className="muted mono">{w.lat ? `${w.lat}, ${w.lng}` : "sem CP válido"}</span></div>
      </div>
      <div className="stats">
        <div><b>{st.prods}</b><span>produtos</span></div>
        <div><b>{can("purchase_orders.view_prices") ? eur(st.valor).replace(",00", "") : "—"}</b><span>valor</span></div>
        <div><b style={{ color: `var(--i-${st.alertas ? "bad" : "ok"})` }}>{st.alertas}</b><span>abaixo do mínimo</span></div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Peq onClick={() => ir({ aba: "stock", f: { wh: w.id, vista: "wh" } })}>Ver existências</Peq>
        <Peq onClick={() => ir({ aba: "mov", f: { wh: w.id } })}>Movimentos</Peq>
        <Peq disabled={w.deleted || !man} title={w.deleted ? "Armazém eliminado: restaure-o no menu ⋯" : porque} onClick={aoMovimento}>Registar movimento</Peq>
      </div>
      <Fonte>warehouses · stocks</Fonte>
    </article>
  );
}
