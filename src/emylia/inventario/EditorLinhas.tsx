// O editor de linhas "produto + quantidade" dos diálogos (linesEditor do mockup): escreve-se ou escolhe-se o produto (SKU, nome ou EAN, com a lista de sugestões),
// a quantidade é um número inteiro e cada linha tem o seu botão de remover. O texto fica em `p` e o SKU reconhecido em `sku` (vazio enquanto não se reconhece).
import { Plus, X } from "lucide-react";
import { useCtxInv } from "./ctxInv";
import type { LinhaEd } from "./linhasEd";
import { eansDe, reconhecerProduto, type Opcao } from "./prodTexto";
import type { ReactNode } from "react";

interface Props {
  linhas: LinhaEd[]; aoMudar: (l: LinhaEd[]) => void; opcoes: readonly Opcao[]; titulo?: string; rotuloQtd?: string; comCusto?: boolean;
  /** Avisos por baixo de cada linha (por exemplo "só há 3 un"). */
  nota?: (l: LinhaEd, i: number) => ReactNode; minimo?: number;
}

/** O que o campo mostra para uma linha: o que se escreveu ou, se veio só o SKU, o texto da opção. */
const textoDe = (l: LinhaEd, opcoes: readonly Opcao[]): string => l.p ?? (l.sku ? opcoes.find(([v]) => v === l.sku)?.[1] ?? l.sku : "");
/** prodOptsHtml() do mockup: a lista de sugestões do campo do produto. */
export function ListaProdutos({ opcoes }: { opcoes: readonly Opcao[] }) {
  const { db } = useCtxInv();
  const eans = eansDe(db);
  return <datalist id="dl-prod">{opcoes.map(([v, t]) => <option key={v} value={t}>{eans[v] ? `EAN ${eans[v]}` : ""}</option>)}</datalist>;
}

export function EditorLinhas({ linhas, aoMudar, opcoes, titulo = "Linhas", rotuloQtd = "Quantidade", comCusto, nota, minimo = 0 }: Props) {
  const { db } = useCtxInv();
  const eans = eansDe(db);
  const mudar = (i: number, p: Partial<LinhaEd>): void => aoMudar(linhas.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <>
      <ListaProdutos opcoes={opcoes} />
      <div className="stack" style={{ gap: 8 }}>
        <b style={{ fontSize: 13 }}>{titulo}</b>
        {linhas.map((l, i) => (
          <div key={i} className="stack" style={{ gap: 4 }}>
            <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <input className="grow" list="dl-prod" placeholder="Produto, SKU ou EAN" value={textoDe(l, opcoes)} aria-label={`Produto da linha ${i + 1}`}
                onChange={(e) => mudar(i, { p: e.target.value, sku: reconhecerProduto(e.target.value, opcoes, eans) })} />
              <input type="number" min={1} step={1} style={{ width: 90 }} value={l.qty} aria-label={rotuloQtd} onChange={(e) => mudar(i, { qty: e.target.value === "" ? "" : Number(e.target.value) })} />
              {comCusto && <input type="number" min={0} step={0.01} style={{ width: 110 }} value={l.cost ?? ""} aria-label="Custo unitário" placeholder="Custo unitário" onChange={(e) => mudar(i, { cost: e.target.value === "" ? "" : Number(e.target.value) })} />}
              <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Remover linha" disabled={linhas.length <= minimo} onClick={() => aoMudar(linhas.filter((_, j) => j !== i))}><X className="ic" aria-hidden="true" /></button>
            </div>
            {nota?.(l, i)}
          </div>
        ))}
        <div><button type="button" className="btn btn-sm" onClick={() => aoMudar([...linhas, { sku: "", qty: 1, cost: comCusto ? "" : undefined }])}><Plus className="ic" aria-hidden="true" />Adicionar linha</button></div>
      </div>
    </>
  );
}
