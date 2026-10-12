// "Confirmar saída" de uma EC (shipDlg e shipGo do mockup): cada linha pronta gera uma Saída no livro; uma linha que falha não bloqueia as outras e fica com a sua mensagem.
import { useState } from "react";
import { Truck } from "lucide-react";
import { ErroInv, ecPorId, nomeArm, nomeProd } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { ecLinhaInfo } from "./ec";
import { confirmarSaida } from "./ecAcoes";
import { Pri, Sec } from "./pecasInv";
import { armazemServe, qtyAt } from "./stock";
import { TabelaInv } from "./TabelaInv";

interface Linha { id: string; qty: number; wh: string; on: boolean }
type Res = Record<string, { ok: boolean; msg: string }>;

export function SaidaDialogo({ ecId, apenas, aoFechar }: { ecId: string; apenas?: string[]; aoFechar: () => void }) {
  const { db, agir, avisar } = useCtxInv();
  const e = ecPorId(db, ecId);
  const [res, setRes] = useState<Res | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() => (e ? e.lines.filter((l) => l.sku && !l.voided && (apenas ? apenas.includes(l.id) : ecLinhaInfo(db, e, l).ready > 0)).map((l) => ({ id: l.id, qty: ecLinhaInfo(db, e, l).ready || 1, wh: e.wh, on: true })) : []));
  if (!e) return null;
  const mudar = (id: string, p: Partial<Linha>): void => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const confirmar = (): void => {
    const r = agir((d) => {
      const out: Res = {};
      const ec = ecPorId(d, ecId)!;
      for (const x of linhas.filter((y) => y.on)) {
        try { confirmarSaida(d, ec, ec.lines.find((l) => l.id === x.id)!, Number(x.qty), x.wh); out[x.id] = { ok: true, msg: `Saída registada: ${x.qty} un.` }; } catch (err) { if (!(err instanceof ErroInv)) throw err; out[x.id] = { ok: false, msg: err.message }; }
      }
      return out;
    });
    if (!r.ok) return;
    const falhas = Object.values(r.valor).filter((x) => !x.ok).length, certas = Object.values(r.valor).length - falhas;
    if (!falhas) aoFechar(); else setRes(r.valor);
    avisar(falhas ? `${certas} registada(s), ${falhas} falhada(s).` : `${certas} linha(s) saíram de armazém. Encomenda atualizada.`, falhas > 0 && certas === 0);
  };
  const linhaDe = (x: Linha) => e.lines.find((y) => y.id === x.id)!;
  return (
    <Dlg aberto aoFechar={aoFechar} largo titulo={`Confirmar saída · ${e.id}`}
      rodape={<><Sec onClick={aoFechar}>{res ? "Fechar" : "Cancelar"}</Sec><Pri onClick={confirmar}><Truck className="ic" aria-hidden="true" />Confirmar saída</Pri></>}>
      <p className="muted">Cada linha gera uma Saída no livro. Uma linha que falha não bloqueia as outras.</p>
      <TabelaInv titulo="Linhas a sair" minimo={640} linhas={linhas} chave={(x) => x.id}
        extra={(x) => (res?.[x.id] ? <tr><td /><td colSpan={4}><div className={`alert ${res[x.id].ok ? "ok" : "bad"}`} style={{ padding: "5px 10px" }}>{res[x.id].msg}</div></td></tr> : null)}
        colunas={[
          { id: "on", titulo: "", nome: "Incluir", celula: (x) => <input type="checkbox" aria-label="Incluir" checked={x.on} onChange={(ev) => mudar(x.id, { on: ev.target.checked })} /> },
          { id: "p", titulo: "Produto", celula: (x) => nomeProd(db, linhaDe(x).sku as string) },
          { id: "r", titulo: "Pronto", direita: true, celula: (x) => <>{ecLinhaInfo(db, e, linhaDe(x)).ready} / {linhaDe(x).qty - linhaDe(x).served}</> },
          { id: "q", titulo: "Quantidade", celula: (x) => <input type="number" min={1} step={1} style={{ width: 90 }} value={x.qty} aria-label={`Quantidade de ${nomeProd(db, linhaDe(x).sku as string)}`} onChange={(ev) => mudar(x.id, { qty: Number(ev.target.value) })} /> },
          { id: "w", titulo: "Armazém", celula: (x) => {
            const sku = linhaDe(x).sku as string;
            const whs = db.warehouses.filter((w) => armazemServe(db, w.id) && qtyAt(db, sku, w.id) > 0);
            return whs.length >= 2 ? <select aria-label="Armazém de saída" value={x.wh} onChange={(ev) => mudar(x.id, { wh: ev.target.value })}>{whs.map((w) => <option key={w.id} value={w.id}>{w.name} ({qtyAt(db, sku, w.id)})</option>)}</select> : nomeArm(db, x.wh);
          } },
        ]} />
      <Fonte>rpc_confirm_client_order_stock_exit · stock_movements</Fonte>
    </Dlg>
  );
}
