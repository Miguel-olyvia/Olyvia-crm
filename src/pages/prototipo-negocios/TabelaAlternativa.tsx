// A alternativa em texto de um gráfico: uma tabela com os mesmos números, para quem não vê o gráfico ou prefere ler. Cabeçalhos de coluna reais e uma linha de total.
import { pctTexto, type BarraG } from "./graficosTipos";

type Celula = string | number;

interface TabelaProps {
  legenda: string;
  colunas: readonly string[];
  linhas: readonly (readonly Celula[])[];
  total?: readonly Celula[];
}

export function TabelaAlternativa({ legenda, colunas, linhas, total }: TabelaProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px] tabular-nums">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b border-border">
            {colunas.map((c, i) => <th key={c} scope="col" className={`px-1 py-1.5 font-medium ${i === 0 ? "" : "text-right"}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, r) => (
            <tr key={r} className="border-b border-border">
              {l.map((c, i) => (i === 0 ? <th key={i} scope="row" className="px-1 py-1.5 font-normal">{c}</th> : <td key={i} className="px-1 py-1.5 text-right">{c}</td>))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr>{total.map((c, i) => (i === 0 ? <th key={i} scope="row" className="px-1 py-1.5 font-semibold">{c}</th> : <td key={i} className="px-1 py-1.5 text-right font-semibold">{c}</td>))}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** As linhas de uma tabela de barras: nome, número e percentagem do total. */
export function linhasDeBarras<A>(barras: readonly BarraG<A>[], total: number): Celula[][] {
  return barras.map((b) => [b.rotulo, b.n, pctTexto(b.n, total)]);
}
