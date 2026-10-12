// O detalhe de um produto no Stock (folha lateral, aberta pela pesquisa global): uma linha por armazém com as mesmas células e ações da tabela de Existências.
import { useState } from "react";
import { estadoStock, ESTADOS_STOCK } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Folha } from "./DialogosInv";
import { N, nomeArm, produto } from "./base";
import { livreEm, reservadoEm, reservas } from "./ec";
import { MovimentoDialogo, type PreMov } from "./MovimentoDialogo";
import { Dados, Pri, Sec, Selo } from "./pecasInv";
import { EditarStockDlg } from "./StockDialogos";
import { eliminarLinha, perm, restaurarLinha } from "./stockAcoes";
import { TOM_ESTADO } from "./StockTabelas";
import { TabelaInv } from "./TabelaInv";
import type { LinhaStock } from "./tipos";

type Dlg2 = { t: "mov"; pre: PreMov } | { t: "editar"; id: string } | { t: "eliminar"; id: string };

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
      rodape={<><Sec onClick={() => { aoFechar(); ir({ aba: "mov", f: { q: p.sku } }); }}>Histórico</Sec><Pri {...perm("inventory.manage")} onClick={() => setDlg({ t: "mov", pre: { sku } })}>Registar movimento</Pri></>}>
      <Dados itens={[["Custo médio", p.avg ? `${p.avg.toFixed(2).replace(".", ",")} €` : "—"], ["Preço de venda", `${p.sale.toFixed(2).replace(".", ",")} €`]]} />
      <TabelaInv titulo="Stock por armazém" minimo={900} chave={(r) => r.id} linhas={linhas} classeLinha={(r) => (r.deleted ? "deleted" : "")}
        colunas={[
          { id: "wh", titulo: "Armazém", celula: (r) => nomeArm(db, r.wh) },
          { id: "loc", titulo: "Localização", celula: (r) => r.loc || "—" },
          { id: "q", titulo: "Quantidade", direita: true, celula: (r) => N(r.qty) },
          { id: "res", titulo: "Reservado", direita: true, celula: (r) => (reservadoEm(db, r.sku, r.wh) ? <span title={por(r).join(", ")}>{N(reservadoEm(db, r.sku, r.wh))}<br /><small className="muted">{por(r).length} EC</small></span> : "0") },
          { id: "liv", titulo: "Livre", direita: true, celula: (r) => N(livreEm(db, r.sku, r.wh)) },
          { id: "lim", titulo: "Mín. / Máx. / PE", direita: true, celula: (r) => `${r.min} / ${r.max} / ${r.rop}` },
          { id: "st", titulo: "Estado", celula: (r) => (r.deleted ? <Selo>Eliminado</Selo> : <Selo tom={TOM_ESTADO[estadoStock(db, r)]}>{ESTADOS_STOCK[estadoStock(db, r)]}</Selo>) },
        ]}
        acoes={(r) => r.deleted ? <Sec {...perm("inventory.manage")} onClick={() => agir((d) => restaurarLinha(d, r.id), "Linha de stock restaurada.")}>Restaurar</Sec> : (
          <><Sec className="btn-sm" {...perm("inventory.manage")} onClick={() => setDlg({ t: "mov", pre: { type: "adjust", sku: r.sku, wh: r.wh } })}>Registar ajuste</Sec><Sec className="btn-sm" {...perm("inventory.manage")} onClick={() => setDlg({ t: "editar", id: r.id })}>Editar</Sec><Sec className="btn-sm" {...perm("inventory.manage")} onClick={() => setDlg({ t: "eliminar", id: r.id })}>Eliminar</Sec></>)} />
      <p className="muted">Livre = stock − reservas das Encomendas Clientes (FIFO); encomendas a caminho não contam. A quantidade só muda por movimentos.</p>
      {dlg?.t === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} pre={dlg.pre} />}
      {dlg?.t === "editar" && alvo && <EditarStockDlg id={alvo.id} aoFechar={() => setDlg(null)} aoAjuste={() => setDlg({ t: "mov", pre: { type: "adjust", sku: alvo.sku, wh: alvo.wh } })} />}
      {dlg?.t === "eliminar" && alvo && <Confirmar aberto aoFechar={() => setDlg(null)} titulo="Eliminar linha de stock" ok="Eliminar" perigo texto={<><p>{p.name} em {nomeArm(db, alvo.wh)}.</p><p className="muted">O stock só muda por movimentos: a linha só pode ser eliminada com quantidade 0.</p></>} aoConfirmar={() => agir((d) => eliminarLinha(d, alvo.id))} />}
    </Folha>
  );
}
