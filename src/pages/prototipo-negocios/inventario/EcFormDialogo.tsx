// "Nova encomenda manual" e "Editar" (ecFormDlg e ecFormGo do mockup, só manuais): cada linha reserva o stock livre do armazém de expedição e o que falta vai para a PO do preferencial;
// as linhas já servidas ficam trancadas (a quantidade não desce abaixo do servido) e os pacotes expandem-se.
import { useState } from "react";
import { Info, Lock, Plus, X } from "lucide-react";
import { ecPorId, exigir } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { criarEc, editarEcManual } from "./ec";
import { useAbrirEc } from "./ecAbrir";
import { ListaProdutos } from "./EditorLinhas";
import { eansDe, reconhecerProduto } from "./prodTexto";
import { opcoesExpedicao, opcoesProdutos } from "./opcoes";
import { Lista, Nota, Pri, Sec, Texto } from "./pecasInv";

interface LinhaF { id?: string; p: string; sku: string; qty: number | ""; servido: number }

export function EcFormDialogo({ aberto, aoFechar, id }: { aberto: boolean; aoFechar: () => void; id?: string }) {
  const { db, agir } = useCtxInv();
  const abrirEc = useAbrirEc();
  const e = id ? ecPorId(db, id) : undefined;
  const opcoes = opcoesProdutos(db);
  const [f, setF] = useState(() => ({
    client: e?.client ?? "", addr: e?.addr ?? "", notes: e?.notes ?? "", wh: e?.wh ?? db.settings.defaultWh, erro: "",
    linhas: (e ? e.lines.filter((l) => l.sku).map((l): LinhaF => ({ id: l.id, p: `${l.sku} — ${db.products.find((p) => p.sku === l.sku)?.name ?? l.sku}`, sku: l.sku as string, qty: l.qty, servido: l.served })) : [{ p: "", sku: "", qty: 1, servido: 0 }]),
  }));
  const m = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const mudarLinha = (i: number, p: Partial<LinhaF>): void => m({ linhas: f.linhas.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  /** ecFormGo() do mockup: reconhece os produtos escritos e grava; se a regra recusar, o aviso diz porquê e o diálogo fica aberto. */
  const gravar = (): void => {
    const eans = eansDe(db), linhas: { id?: string; sku?: string; qty: number }[] = [];
    for (const l of f.linhas) {
      if (l.id) { linhas.push({ id: l.id, qty: Number(l.qty) }); continue; }
      if (!l.p.trim()) continue;
      const sku = reconhecerProduto(l.p, opcoes, eans);
      if (!sku) { setF((x) => ({ ...x, erro: `Produto não reconhecido: ${l.p}` })); return; }
      linhas.push({ sku, qty: Number(l.qty) });
    }
    const r = agir((d) => {
      exigir("inventory.manage", "criar encomendas");
      if (id) { editarEcManual(d, ecPorId(d, id)!, { client: f.client, addr: f.addr, notes: f.notes }, linhas); return ecPorId(d, id)!; }
      return criarEc(d, { origin: { k: "manual", ref: null }, client: f.client, addr: f.addr, wh: f.wh, notes: f.notes, lines: linhas });
    }, id ? "Encomenda gravada." : "Encomenda manual criada.");
    if (!r.ok) return;
    aoFechar();
    abrirEc(r.valor.id);
  };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} largo titulo={id ? `Editar ${id}` : "Nova encomenda manual"}
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Gravar</Pri></>}>
      <div className="fg">
        <Texto rotulo="Cliente" valor={f.client} aoMudar={(v) => m({ client: v })} obrigatorio />
        <Texto rotulo="Morada de entrega" valor={f.addr} aoMudar={(v) => m({ addr: v })} />
        <Lista rotulo="Armazém de expedição" valor={f.wh} aoMudar={(v) => m({ wh: v })} opcoes={opcoesExpedicao(db)} desativado={!!id} />
        <Texto rotulo="Notas" valor={f.notes} aoMudar={(v) => m({ notes: v })} />
      </div>
      <ListaProdutos opcoes={opcoes} />
      <div className="stack" style={{ gap: 8 }}>
        <b style={{ fontSize: 13 }}>Linhas (quantidade em unidades inteiras)</b>
        {f.linhas.map((l, i) => (
          <div key={l.id ?? `n${i}`} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input className="grow" list="dl-prod" value={l.p} aria-label="Produto" disabled={!!l.id} title={l.id ? "Produto de linha existente: para trocar, remova a quantidade e adicione nova linha" : undefined} onChange={(ev) => mudarLinha(i, { p: ev.target.value })} />
            <input type="number" min={l.servido || 1} step={1} style={{ width: 90 }} value={l.qty} aria-label="Quantidade" onChange={(ev) => mudarLinha(i, { qty: ev.target.value === "" ? "" : Number(ev.target.value) })} />
            {l.servido ? <span className="badge b-neu" title={`Linha trancada: já saíram ${l.servido} un`}><Lock className="ic sm" aria-hidden="true" /> {l.servido} servidas</span> : null}
            {!l.id && <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Remover" onClick={() => m({ linhas: f.linhas.filter((_, j) => j !== i) })}><X className="ic" aria-hidden="true" /></button>}
          </div>
        ))}
        <div><button type="button" className="btn btn-sm" onClick={() => m({ linhas: [...f.linhas, { p: "", sku: "", qty: 1, servido: 0 }] })}><Plus className="ic" aria-hidden="true" />Adicionar linha</button></div>
      </div>
      <p className="rules"><Info className="ic sm" aria-hidden="true" />Ao gravar, cada linha reserva o stock livre do armazém de expedição; o que falta vai para a PO do fornecedor preferencial. Linhas já servidas ficam trancadas. Pacotes são expandidos.</p>
      {f.erro && <Nota tom="bad">{f.erro}</Nota>}
      <Fonte>{id ? "rpc_update_manual_client_order" : "rpc_create_manual_client_order"}</Fonte>
    </Dlg>
  );
}
