// Armazém › Receção › "Recebidas" (16/10): o histórico das entradas no armazém, a partir dos registos de receção das POs (p.receipts, tipo
// "Receção"): quando, a PO, o fornecedor, o cliente/origem, o que entrou (e quanto ficou reservado para a EC), quem, a guia e o estado.
// "Reverter" usa o diálogo e a regra que já existiam (reverterRececao, com motivo).
import { useState } from "react";
import { fmtDT, nomeForn, nomeProd } from "./base";
import { useCtxInv } from "./ctxInv";
import { Peq, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { PoDialogos } from "./PoDialogos";
import { OrigemChip } from "./poPecas";
import { TabelaInv } from "./TabelaInv";
import type { Inventario, Po, PoRecibo } from "./tipos";

export interface LinhaRecebida { p: Po; r: PoRecibo }
/** As receções (mais recentes primeiro), com a pesquisa por PO, fornecedor, cliente/origem ou produto. */
export function recebidas(db: Inventario, q = ""): LinhaRecebida[] {
  const t = q.trim().toLowerCase();
  return db.pos.filter((p) => !p.deleted).flatMap((p) => p.receipts.filter((r) => r.type === "Receção").map((r) => ({ p, r })))
    .filter(({ p, r }) => !t || [p.id, nomeForn(db, p.sup), p.origin.client ?? "", p.origin.ref ?? "", p.origin.ec ?? "", r.sku, nomeProd(db, r.sku)].join(" ").toLowerCase().includes(t))
    .sort((a, b) => b.r.at.localeCompare(a.r.at) || b.r.id.localeCompare(a.r.id));
}

export function RecebidasInv() {
  const { db } = useCtxInv();
  const [q, setQ] = useState("");
  const [rev, setRev] = useState<{ po: string; rid: string } | null>(null);
  const L = recebidas(db, q);
  const pode = can("inventory.receive");
  return (
    <section aria-label="Receções feitas">
      <label className="fl" style={{ maxWidth: 420, marginBottom: 8 }}>Pesquisar<input type="search" value={q} placeholder="Nº da PO, fornecedor, cliente ou produto" onChange={(e) => setQ(e.target.value)} /></label>
      {L.length === 0 ? <Vazio titulo="Sem receções" texto={q ? "Nenhuma receção com esta pesquisa." : "As entradas no armazém aparecem aqui."} /> : (
        <TabelaInv titulo="Receções feitas" minimo={1000} chave={(x) => x.r.id} linhas={L}
          colunas={[
            { id: "d", titulo: "Quando", celula: (x) => fmtDT(x.r.at), valor: (x) => x.r.at },
            { id: "po", titulo: "PO", classe: () => "mono", celula: (x) => <b>{x.p.id}</b>, valor: (x) => x.p.id },
            { id: "f", titulo: "Fornecedor", celula: (x) => nomeForn(db, x.p.sup) },
            { id: "o", titulo: "Cliente/origem", celula: (x) => <OrigemChip o={x.p.origin} /> },
            { id: "q", titulo: "Entrou", celula: (x) => <>{x.r.qty} un · {nomeProd(db, x.r.sku)}{x.r.toEC ? <><br /><small className="muted">{x.r.toEC} reservadas para {x.r.ec}</small></> : null}</> },
            { id: "u", titulo: "Quem", celula: (x) => x.r.user },
            { id: "g", titulo: "Guia", celula: (x) => x.r.guia ?? "—" },
            { id: "e", titulo: "Estado", celula: (x) => x.r.state === "Ativa" ? <Selo tom="ok">Entrou</Selo> : <Selo tom="neu">Revertida</Selo> },
          ]}
          acoes={(x) => x.r.state === "Ativa" ? <Peq disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} aria-label={`Reverter a receção de ${x.p.id} (${x.r.sku})`} onClick={() => setRev({ po: x.p.id, rid: x.r.id })}>Reverter</Peq> : null} />
      )}
      {rev && <PoDialogos id={rev.po} dlg={{ t: "reverter", rid: rev.rid }} fechar={() => setRev(null)} />}
    </section>
  );
}
