// O editor de linhas "produto + quantidade" dos diálogos (venda, encomenda, guia, movimento): escolhe-se o produto numa lista (nunca se escreve o SKU),
// a quantidade é um número inteiro e cada linha tem o seu botão de remover. Alvos de 44 px.
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BORDA_CTRL } from "../PessoaLinha";
import { FOCO } from "../FiltrosPopover";
import { CAMPO, Sec } from "./pecasInv";
import type { ReactNode } from "react";
import type { LinhaEd } from "./linhasEd";

interface Props {
  linhas: LinhaEd[]; aoMudar: (l: LinhaEd[]) => void; opcoes: readonly (readonly [string, string])[]; titulo?: string; rotuloQtd?: string; comCusto?: boolean;
  /** Avisos por baixo de cada linha (por exemplo "só há 3 un"). */
  nota?: (l: LinhaEd, i: number) => ReactNode; minimo?: number;
}

export function EditorLinhas({ linhas, aoMudar, opcoes, titulo = "Linhas", rotuloQtd = "Quantidade", comCusto, nota, minimo = 1 }: Props) {
  const mudar = (i: number, p: Partial<LinhaEd>): void => aoMudar(linhas.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <fieldset className="grid gap-2">
      <legend className="text-[15px] font-medium">{titulo}</legend>
      {linhas.map((l, i) => (
        <div key={i} className="grid gap-1">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 basis-48"><span className="block text-[15px] text-muted-foreground">Produto da linha {i + 1}</span>
              <select value={l.sku} onChange={(e) => mudar(i, { sku: e.target.value })} className={cn(CAMPO, "cursor-pointer")}>
                <option value="">Escolher produto…</option>
                {opcoes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="w-28"><span className="block text-[15px] text-muted-foreground">{rotuloQtd}</span>
              <input type="number" min={1} step={1} inputMode="numeric" value={l.qty} onChange={(e) => mudar(i, { qty: e.target.value === "" ? "" : Number(e.target.value) })} className={CAMPO} />
            </label>
            {comCusto && (
              <label className="w-36"><span className="block text-[15px] text-muted-foreground">Custo unitário</span>
                <input type="number" min={0} step={0.01} value={l.cost ?? ""} onChange={(e) => mudar(i, { cost: e.target.value === "" ? "" : Number(e.target.value) })} className={CAMPO} />
              </label>
            )}
            <button type="button" aria-label={`Remover a linha ${i + 1}`} disabled={linhas.length <= minimo} onClick={() => aoMudar(linhas.filter((_, j) => j !== i))}
              className={cn("grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-md border bg-card disabled:cursor-not-allowed disabled:opacity-50", BORDA_CTRL, FOCO)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {nota?.(l, i)}
        </div>
      ))}
      <div><Sec onClick={() => aoMudar([...linhas, { sku: "", qty: 1, cost: comCusto ? "" : undefined }])}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Adicionar linha</Sec></div>
    </fieldset>
  );
}
