// "Nova encomenda a fornecedor" (newPODlg e newPOGo do mockup): só se encomendam artigos do fornecedor, em embalagens dele (o stock conta em unidades). Cria um rascunho e abre-o.
import { useState } from "react";
import { Fonte } from "./cabInv";
import { fornecedor, nomeForn } from "./base";
import { Dlg } from "./DialogosInv";
import { useCtxInv } from "./ctxInv";
import { EditorLinhas } from "./EditorLinhas";
import type { LinhaEd } from "./linhasEd";
import { opcoesArmazens, opcoesFornecedores, opcoesProdutos } from "./opcoes";
import { Lista, Nota, Pri, Sec } from "./pecasInv";
import { criarPoManual } from "./po";
import type { Inventario } from "./tipos";

interface Estado { sup: string; wh: string; linhas: LinhaEd[]; erro: string }

/** As linhas escritas, já validadas pela ordem do mockup, ou o erro que o diálogo mostra. */
function lerLinhas(db: Inventario, f: Estado): { sku: string; packs: number }[] | string {
  if (!f.sup) return "Escolha o fornecedor.";
  const out: { sku: string; packs: number }[] = [];
  for (const l of f.linhas) {
    if (!(l.p ?? l.sku).trim()) continue;
    if (!l.sku) return `Produto não reconhecido: ${l.p}`;
    if (!db.items.find((i) => i.sup === f.sup && i.sku === l.sku)) return `${nomeForn(db, f.sup)} não tem o artigo ${l.sku}. Ligue-o em Fornecedores › Artigos e preços.`;
    if (l.qty === "" || !Number.isInteger(l.qty) || l.qty < 1) return "Quantidades inteiras (embalagens).";
    out.push({ sku: l.sku, packs: l.qty });
  }
  return out.length ? out : "Adicione pelo menos uma linha.";
}

export function NovaPoDialogo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const [f, setF] = useState<Estado>({ sup: "", wh: db.settings.defaultWh, linhas: [{ sku: "", qty: 1 }], erro: "" });
  const mudar = (p: Partial<Estado>): void => setF((x) => ({ ...x, ...p }));
  const criar = (): void => {
    const l = lerLinhas(db, f);
    if (typeof l === "string") { mudar({ erro: l }); return; }
    const r = agir((d) => criarPoManual(d, { sup: f.sup, wh: f.wh, linhas: l }), (p) => `${p.id} criada como rascunho.`);
    if (!r.ok) { mudar({ erro: r.erro }); return; }
    aoFechar();
    abrir({ t: "po", id: r.valor.id });
  };
  const artigos = f.sup ? db.items.filter((i) => i.sup === f.sup) : [];
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} titulo="Nova encomenda a fornecedor" largo
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={criar}>Criar rascunho</Pri></>}>
      <div className="fg">
        <Lista rotulo="Fornecedor" valor={f.sup} aoMudar={(v) => mudar({ sup: v })} opcoes={[["", "Escolher…"], ...opcoesFornecedores(db)]} obrigatorio />
        <Lista rotulo="Entregar em" valor={f.wh} aoMudar={(v) => mudar({ wh: v })} opcoes={opcoesArmazens(db)} />
      </div>
      {f.sup && <p className="muted" style={{ fontSize: 12.5 }}>Artigos de {fornecedor(db, f.sup)?.name}: {artigos.map((i, k) => <span key={i.id}>{k ? ", " : ""}<span className="mono">{i.sku}</span> ({i.unitLabel})</span>)}. A quantidade é em embalagens do fornecedor.</p>}
      <EditorLinhas titulo="Linhas (quantidade em embalagens)" linhas={f.linhas} aoMudar={(linhas) => mudar({ linhas })} opcoes={opcoesProdutos(db)} minimo={0} />
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
      <Fonte>rpc_create_purchase_order · item_suppliers</Fonte>
    </Dlg>
  );
}
