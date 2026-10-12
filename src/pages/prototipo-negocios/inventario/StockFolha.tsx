// O detalhe de um produto no Stock (folha lateral): uma linha por armazém com quantidade, reservado, livre e limites, e as ações (ajuste, movimento, editar, histórico, eliminar).
import { useState } from "react";
import { eliminarLinhaStock, restaurarLinhaStock } from "./cadastros";
import { estadoStock, ESTADOS_STOCK } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg, Folha } from "./DialogosInv";
import { N, nomeArm, produto } from "./base";
import { editarLinhaStock } from "./stock";
import { livreEm, reservadoEm, reservas } from "./ec";
import { MovimentoDialogo, type PreMov } from "./MovimentoDialogo";
import { Dados, Nota, Pri, Sec, Selo, Texto } from "./pecasInv";
import { TabelaInv } from "./TabelaInv";
import type { LinhaStock, Tom } from "./tipos";

const TOM: Record<string, Tom> = { low: "bad", ok: "ok", high: "warn" };
type Dlg2 = { t: "mov"; pre: PreMov } | { t: "editar"; id: string } | { t: "eliminar"; id: string };

function EditarDialogo({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const r = db.stocks.find((x) => x.id === id);
  const [f, setF] = useState({ loc: r?.loc ?? "", min: String(r?.min ?? 0), max: String(r?.max ?? 0), rop: String(r?.rop ?? 0), erro: "" });
  if (!r) return null;
  const gravar = (): void => {
    const x = agir((d) => editarLinhaStock(d, id, { loc: f.loc, min: Number(f.min), max: Number(f.max), rop: Number(f.rop) }), "Linha de stock gravada.");
    if (x.ok) aoFechar(); else setF((s) => ({ ...s, erro: x.erro }));
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={`Editar ${produto(db, r.sku)?.name}`} descricao={nomeArm(db, r.wh)} rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Gravar</Pri></>}>
      <Nota tom="info">A quantidade ({N(r.qty)} un) só muda por movimentos: use «Registar ajuste».</Nota>
      <div className="grid gap-3 sm:grid-cols-2">
        <Texto rotulo="Localização" valor={f.loc} aoMudar={(v) => setF({ ...f, loc: v, erro: "" })} />
        <Texto rotulo="Mínimo" tipo="number" valor={f.min} aoMudar={(v) => setF({ ...f, min: v, erro: "" })} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Máximo" tipo="number" valor={f.max} aoMudar={(v) => setF({ ...f, max: v, erro: "" })} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Ponto de encomenda" tipo="number" valor={f.rop} aoMudar={(v) => setF({ ...f, rop: v, erro: "" })} atributos={{ min: 0, step: 1 }} />
      </div>
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}

export function StockFolha({ sku, aoFechar }: { sku: string; aoFechar: () => void }) {
  const { db, agir, ir, filtros } = useCtxInv();
  const [dlg, setDlg] = useState<Dlg2 | null>(null);
  const p = produto(db, sku);
  if (!p) return null;
  const linhas = db.stocks.filter((s) => s.sku === sku && (filtros.stock.eliminadas || !s.deleted));
  const por = (r: LinhaStock): string[] => reservas(db).resBy[r.sku + "|" + r.wh] ?? [];
  const alvo = dlg && dlg.t !== "mov" ? db.stocks.find((x) => x.id === dlg.id) : undefined;
  const total = linhas.filter((l) => !l.deleted).reduce((a, l) => a + l.qty, 0);
  return (
    <Folha aberta aoFechar={aoFechar} chave={sku} titulo={p.name} subtitulo={`Armazém › Existências · ${p.sku} · EAN ${p.ean}`}
      selos={<><Selo>{p.cat} · {p.sub}</Selo><Selo>{N(total)} {p.unit} no total</Selo></>}
      rodape={<><Sec onClick={() => { aoFechar(); ir({ aba: "mov", f: { q: p.sku } }); }}>Histórico</Sec><Pri onClick={() => setDlg({ t: "mov", pre: { sku } })}>Registar movimento</Pri></>}>
      <Dados itens={[["Custo médio", p.avg ? `${p.avg.toFixed(2).replace(".", ",")} €` : "—"], ["Preço de venda", `${p.sale.toFixed(2).replace(".", ",")} €`]]} />
      <TabelaInv rolar titulo="Stock por armazém" chave={(r) => r.id} linhas={linhas}
        colunas={[
          { id: "wh", titulo: "Armazém", celula: (r) => <>{nomeArm(db, r.wh)}{r.deleted ? " · Eliminado" : ""}</> },
          { id: "loc", titulo: "Localização", celula: (r) => r.loc || "—" },
          { id: "q", titulo: "Quantidade", direita: true, celula: (r) => N(r.qty) },
          { id: "res", titulo: "Reservado", direita: true, celula: (r) => (reservadoEm(db, r.sku, r.wh) ? <span title={por(r).join(", ")}>{N(reservadoEm(db, r.sku, r.wh))} · {por(r).length} EC</span> : "0") },
          { id: "liv", titulo: "Livre", direita: true, celula: (r) => N(livreEm(db, r.sku, r.wh)) },
          { id: "lim", titulo: "Mín. / Máx. / PE", direita: true, celula: (r) => `${r.min} / ${r.max} / ${r.rop}` },
          { id: "st", titulo: "Estado", celula: (r) => (r.deleted ? <Selo>Eliminado</Selo> : <Selo tom={TOM[estadoStock(db, r)]}>{ESTADOS_STOCK[estadoStock(db, r)]}</Selo>) },
        ]}
        acoes={(r) => r.deleted ? <Sec onClick={() => agir((d) => restaurarLinhaStock(d, r.id), "Linha de stock restaurada.")}>Restaurar</Sec> : (
          <><Sec onClick={() => setDlg({ t: "mov", pre: { type: "adjust", sku: r.sku, wh: r.wh } })}>Registar ajuste</Sec><Sec onClick={() => setDlg({ t: "editar", id: r.id })}>Editar</Sec><Sec onClick={() => setDlg({ t: "eliminar", id: r.id })}>Eliminar</Sec></>)} />
      <p className="text-[15px] text-muted-foreground">Livre = stock − reservas das Encomendas Clientes (FIFO); encomendas a caminho não contam. A quantidade só muda por movimentos.</p>
      {dlg?.t === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} pre={dlg.pre} />}
      {dlg?.t === "editar" && <EditarDialogo id={dlg.id} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "eliminar" && alvo && <Confirmar aberto aoFechar={() => setDlg(null)} titulo="Eliminar linha de stock" ok="Eliminar" perigo texto={<p>{p.name} em {nomeArm(db, alvo.wh)}. O stock só muda por movimentos: a linha só se elimina com quantidade 0 e sem reservas.</p>} aoConfirmar={() => agir((d) => eliminarLinhaStock(d, alvo.id), "Linha de stock eliminada.")} />}
    </Folha>
  );
}
