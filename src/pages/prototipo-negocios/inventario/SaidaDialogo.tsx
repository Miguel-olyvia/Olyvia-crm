// "Confirmar saída" de uma EC: cada linha pronta gera uma Saída no livro; uma linha que falha não bloqueia as outras e fica com a sua mensagem.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BORDA_CTRL } from "../PessoaLinha";
import { ErroInv, ecPorId, nomeArm, nomeProd } from "./base";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { ecLinhaInfo, sairLinha } from "./ec";
import { Nota, Pri, Sec } from "./pecasInv";
import { armazemServe, qtyAt } from "./stock";

interface Linha { id: string; qty: number; wh: string; on: boolean }
type Res = Record<string, { ok: boolean; msg: string }>;

export function SaidaDialogo({ ecId, apenas, aoFechar }: { ecId: string; apenas?: string[]; aoFechar: () => void }) {
  const { db, agir, avisar } = useCtxInv();
  const e = ecPorId(db, ecId);
  const [res, setRes] = useState<Res | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() => (e ? e.lines.filter((l) => l.sku && !l.voided && (apenas ? apenas.includes(l.id) : ecLinhaInfo(db, e, l).ready > 0)).map((l) => ({ id: l.id, qty: ecLinhaInfo(db, e, l).ready || 1, wh: e.wh, on: true })) : []));
  if (!e) return null;
  const mudar = (i: number, p: Partial<Linha>): void => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const confirmar = (): void => {
    const r = agir((d) => {
      const out: Res = {};
      const ec = ecPorId(d, ecId)!;
      for (const x of linhas.filter((y) => y.on)) {
        try { sairLinha(d, ec, ec.lines.find((l) => l.id === x.id)!, Number(x.qty), x.wh); out[x.id] = { ok: true, msg: `Saída registada: ${x.qty} un.` }; } catch (err) { if (!(err instanceof ErroInv)) throw err; out[x.id] = { ok: false, msg: err.message }; }
      }
      return out;
    });
    if (!r.ok) return;
    const falhas = Object.values(r.valor).filter((x) => !x.ok).length, certas = Object.values(r.valor).length - falhas;
    if (!falhas) aoFechar(); else setRes(r.valor);
    avisar(falhas ? `${certas} registada(s), ${falhas} falhada(s).` : `${certas} linha(s) saíram de armazém. Encomenda atualizada.`, falhas > 0 && certas === 0);
  };
  return (
    <Dlg aberto aoFechar={aoFechar} largo titulo={`Confirmar saída · ${e.id}`} descricao="Cada linha gera uma Saída no livro. Uma linha que falha não bloqueia as outras."
      rodape={<><Sec onClick={aoFechar}>{res ? "Fechar" : "Cancelar"}</Sec><Pri onClick={confirmar}>Confirmar saída</Pri></>}>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {linhas.map((x, i) => {
          const l = e.lines.find((y) => y.id === x.id)!, info = ecLinhaInfo(db, e, l);
          const whs = db.warehouses.filter((w) => armazemServe(db, w.id) && qtyAt(db, l.sku as string, w.id) > 0);
          return (
            <li key={x.id} className="grid gap-2 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]"><input type="checkbox" checked={x.on} onChange={(ev) => mudar(i, { on: ev.target.checked })} className="h-5 w-5 accent-foreground" /><span><b>{nomeProd(db, l.sku as string)}</b> · pronto {info.ready} / {l.qty - l.served}</span></label>
                <label className="w-28 text-[15px] text-muted-foreground">Quantidade<input type="number" min={1} step={1} value={x.qty} onChange={(ev) => mudar(i, { qty: Number(ev.target.value) })} className={cn("block h-11 w-full rounded-md border bg-card px-3 text-[15px] text-foreground", BORDA_CTRL)} /></label>
                {whs.length >= 2 ? <label className="text-[15px] text-muted-foreground">Armazém<select value={x.wh} onChange={(ev) => mudar(i, { wh: ev.target.value })} className={cn("block h-11 rounded-md border bg-card px-3 text-[15px] text-foreground", BORDA_CTRL)}>{whs.map((w) => <option key={w.id} value={w.id}>{w.name} ({qtyAt(db, l.sku as string, w.id)})</option>)}</select></label> : <span className="text-[15px]">{nomeArm(db, x.wh)}</span>}
              </div>
              {res?.[x.id] && <Nota tom={res[x.id].ok ? "ok" : "bad"} alerta={!res[x.id].ok}>{res[x.id].msg}</Nota>}
            </li>
          );
        })}
      </ul>
    </Dlg>
  );
}
