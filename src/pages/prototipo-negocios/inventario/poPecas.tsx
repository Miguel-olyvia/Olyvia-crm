// Peças pequenas das encomendas, com o DOM do mockup: o selo do estado, o selo do portal, a origem (chip-o), o dinheiro que depende de permissão (money) e o botão que levanta um bloqueio (unlockBtn).
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { eur } from "./base";
import { useCtxInv } from "./ctxInv";
import { can } from "./perfil";
import { Selo } from "./pecasInv";
import { poStatus, poStatusLabel, selarPortal } from "./po";
import type { Po, Tom } from "./tipos";

const TOM: Record<string, Tom> = { pending: "warn", ordered: "info", partial: "violet", received: "ok", cancelled: "neu" };

export const SeloEstadoPo = ({ p }: { p: Po }) => <Selo tom={TOM[poStatus(p)]}>{poStatusLabel[poStatus(p)]}</Selo>;

/** O selo do portal da PO (portalTag), ou nada. */
export function SeloPortal({ p }: { p: Po }) {
  const s = selarPortal(p);
  return s ? <Selo tom={s[1]}>{s[0]}</Selo> : null;
}

/** money() do mockup: o valor, ou um traço se o perfil não vê preços de compra. */
export function Dinheiro({ n }: { n: number }) {
  useCtxInv();
  return can("purchase_orders.view_prices") ? <>{eur(n)}</> : <span className="muted" title="Sem permissão para ver preços de compra">—</span>;
}

/** unlockBtn() do mockup: o botão pequeno com cadeado que resolve um bloqueio. */
export function Desbloquear({ rotulo, aoClicar }: { rotulo: ReactNode; aoClicar: () => void }) {
  return <>{" "}<button type="button" className="btn btn-xs" onClick={(e) => { e.stopPropagation(); aoClicar(); }}><Lock className="ic sm" aria-hidden="true" />{rotulo}</button></>;
}

/** A origem de uma PO (originChip): "Stock", ou a referência e o cliente, que abre a Encomenda Cliente se o perfil a vê. */
export function OrigemChip({ o }: { o: Po["origin"] }) {
  const { abrir } = useCtxInv();
  if (!o || o.k === "stock") return <span className="chip-o">Stock</span>;
  const lab = (o.ref || o.ec) + (o.client ? " · " + o.client : "");
  const ec = o.ec;
  return ec && can("contracts.view")
    ? <button type="button" className="chip-o" title={lab} onClick={(e) => { e.stopPropagation(); abrir({ t: "ec", id: ec }); }}>{lab}</button>
    : <span className="chip-o" title={lab}>{lab}</span>;
}
