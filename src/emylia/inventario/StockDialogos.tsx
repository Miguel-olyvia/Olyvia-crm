// Os diálogos de uma linha de stock, com o DOM do mockup: "Adicionar stock" (addStockDlg) e "Editar <produto>" (stockEdit).
import { useState } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { ehInteiro, produto } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { opcoesArmazens } from "./opcoes";
import { Lista, Rotulo, Sec, Pri, Texto } from "./pecasInv";
import { ListaProdutos, analisarProduto } from "./ProdutoCampo";
import { adicionarStock, editarLinhaStock, linhaStock } from "./stock";

const Erro = ({ texto }: { texto: string }) => <div className="alert bad"><AlertTriangle className="ic" aria-hidden="true" />{texto}</div>;

export function AdicionarStockDlg({ aoFechar }: { aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const [f, setF] = useState({ p: "", wh: db.settings.defaultWh, loc: "", min: "0", max: "0", rop: "0", qty: "0", cost: "", erro: "" });
  const m = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p }));
  const gravar = (): void => {
    const sku = analisarProduto(db, f.p);
    const erro = !sku ? "Escolha um produto válido." : produto(db, sku)?.kit ? "Pacotes não têm stock próprio: são expandidos nos componentes."
      : linhaStock(db, sku, f.wh) ? "Já existe uma linha para este produto neste armazém." : !ehInteiro(Number(f.qty)) || Number(f.qty) < 0 ? "Quantidade inteira ≥ 0." : "";
    if (erro || !sku) { m({ erro }); return; }
    const r = agir((d) => adicionarStock(d, { sku, wh: f.wh, loc: f.loc, min: Number(f.min) || 0, max: Number(f.max) || 0, rop: Number(f.rop) || 0, qty: Number(f.qty), cost: f.cost === "" ? null : Number(f.cost) }), "Stock adicionado.");
    if (r.ok) aoFechar(); else m({ erro: r.erro });
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Adicionar stock" rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Adicionar</Pri></>}>
      <ListaProdutos db={db} />
      <div className="fg">
        <Rotulo rotulo="Produto" obrigatorio>{(id) => <input id={id} list="dl-prod" value={f.p} onChange={(e) => m({ p: e.target.value })} placeholder="Nome, SKU ou EAN" />}</Rotulo>
        <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => m({ wh: v })} opcoes={opcoesArmazens(db)} />
        <Texto rotulo="Localização" valor={f.loc} aoMudar={(v) => m({ loc: v })} />
        <Texto rotulo="Mínimo" tipo="number" valor={f.min} aoMudar={(v) => m({ min: v })} />
        <Texto rotulo="Máximo" tipo="number" valor={f.max} aoMudar={(v) => m({ max: v })} />
        <Texto rotulo="Ponto de encomenda" tipo="number" valor={f.rop} aoMudar={(v) => m({ rop: v })} />
        <Texto rotulo="Quantidade inicial" tipo="number" valor={f.qty} aoMudar={(v) => m({ qty: v })} atributos={{ min: 0, step: 1 }} ajuda="Entra por um movimento de Entrada (fica no livro)." />
        <Texto rotulo="Custo unitário" tipo="number" valor={f.cost} aoMudar={(v) => m({ cost: v })} atributos={{ min: 0, step: 0.01 }} ajuda="Atualiza o custo médio ponderado." />
      </div>
      {f.erro ? <Erro texto={f.erro} /> : null}
      <Fonte>stocks · rpc_register_stock_entry</Fonte>
    </Dlg>
  );
}

export function EditarStockDlg({ id, aoFechar, aoAjuste }: { id: string; aoFechar: () => void; aoAjuste: () => void }) {
  const { db, agir } = useCtxInv();
  const r = db.stocks.find((x) => x.id === id);
  const [f, setF] = useState({ loc: r?.loc ?? "", min: String(r?.min ?? 0), max: String(r?.max ?? 0), rop: String(r?.rop ?? 0), erro: "" });
  const p = r ? produto(db, r.sku) : undefined;
  if (!r || !p) return null;
  const m = (x: Partial<typeof f>): void => setF((s) => ({ ...s, ...x }));
  const gravar = (): void => {
    if ((["min", "max", "rop"] as const).some((k) => f[k] === "" || !ehInteiro(Number(f[k])) || Number(f[k]) < 0)) { m({ erro: "Mínimo, máximo e ponto de encomenda: inteiros ≥ 0." }); return; }
    if (Number(f.max) && Number(f.min) > Number(f.max)) { m({ erro: "O mínimo não pode ser maior que o máximo." }); return; }
    const x = agir((d) => editarLinhaStock(d, id, { loc: f.loc, min: Number(f.min), max: Number(f.max), rop: Number(f.rop) }), "Linha de stock gravada.");
    if (x.ok) aoFechar(); else m({ erro: x.erro });
  };
  const nomeArm = db.warehouses.find((w) => w.id === r.wh)?.name ?? r.wh;
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={`Editar ${p.name}`} rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Gravar</Pri></>}>
      <p className="muted">{nomeArm}</p>
      <div className="fg">
        <Rotulo rotulo="Quantidade" ajuda="Só leitura: o stock só muda por movimentos.">{(i) => <input id={i} value={`${r.qty} ${p.unit}`} disabled readOnly />}</Rotulo>
        <div style={{ alignSelf: "end" }}><Sec onClick={() => { aoFechar(); aoAjuste(); }}><ClipboardList className="ic" aria-hidden="true" />Registar ajuste</Sec></div>
        <Texto rotulo="Localização" valor={f.loc} aoMudar={(v) => m({ loc: v })} />
        <Texto rotulo="Mínimo" tipo="number" valor={f.min} aoMudar={(v) => m({ min: v })} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Máximo" tipo="number" valor={f.max} aoMudar={(v) => m({ max: v })} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Ponto de encomenda" tipo="number" valor={f.rop} aoMudar={(v) => m({ rop: v })} atributos={{ min: 0, step: 1 }} />
      </div>
      {f.erro ? <Erro texto={f.erro} /> : null}
      <Fonte>stocks (location, min_quantity, max_quantity, reorder_point)</Fonte>
    </Dlg>
  );
}
