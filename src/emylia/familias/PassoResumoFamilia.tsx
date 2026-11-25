// Famílias (interface), passo 3 «Resumo e pré-visualização»: os dados derivados em texto (nada se escreve), a tabela «N produtos geram N variantes», os erros que bloqueiam
// o guardar, os avisos e o cartão ao vivo. O SKU e o preço de cada variante vêm do produto do catálogo e só se leem.
import { useId } from "react";
import { NOTA } from "../pecasForm";
import { CartaoFamiliaPreview } from "./CartaoFamiliaPreview";
import { geram, preco } from "./estilosFamilias";
import type { FamiliaCfg, Problema } from "./nucleo";
import { AmostraDeCor, ListasDeProblemas } from "./pecasFamilias";

const CEL = "px-2 py-1.5", CAB = `sticky top-0 bg-muted ${CEL}`;

export function PassoResumoFamilia({ familia: f, problemas }: { familia: FamiliaCfg; problemas: readonly Problema[] }) {
  const idTabela = useId();
  const erros = problemas.filter((p) => p.gravidade === "erro").map((p) => p.msg), avisos = problemas.filter((p) => p.gravidade === "aviso").map((p) => p.msg);
  const nProdutos = f.variantes.length + new Set(f.excluidos.map((x) => x.produtoId)).size;
  const dados: [string, string][] = [["Nome da família", f.nome || "—"], ["Marca", f.marca || "Sem marca"], ["Categoria", f.categoria || "—"], ["Identificador", f.id]];
  const medidaDe = (id: string) => f.medidas.find((m) => m.id === id), corDe = (id: string) => f.cores.find((c) => c.id === id);
  return (
    <div className="grid gap-4">
      <section aria-label="Dados da família" className="grid gap-3">
        <p className={NOTA}>O nome, a marca e a categoria saem dos produtos escolhidos: não se escrevem aqui.</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} className="grid min-w-0 gap-0.5">
              <dt className="text-sm font-medium text-muted-foreground">{rotulo}</dt>
              <dd className="break-words text-[15px]">{valor}</dd>
            </div>
          ))}
        </dl>
      </section>
      <ListasDeProblemas erros={erros} avisos={avisos} rotuloErros="Erros que bloqueiam o guardar" rotuloAvisos="Avisos da família" viva={{ status: "Erros e avisos da família" }} />
      <p role="status" aria-label="Resumo da família" className="text-[15px] font-semibold">{geram(nProdutos, f.variantes.length)}</p>
      <div role="region" aria-labelledby={idTabela} tabIndex={0} className="max-h-80 overflow-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className="w-full min-w-[32rem] border-collapse text-left text-[15px]">
          <caption id={idTabela} className="px-2 py-1 text-left text-sm font-medium text-muted-foreground">Variantes geradas</caption>
          <thead>
            <tr className="border-y border-border">
              <th scope="col" className={CAB}>Produto</th>
              {f.eixos.medida.map((x) => <th key={x} scope="col" className={CAB}>{x}</th>)}
              {f.eixos.cor && <th scope="col" className={CAB}>{f.eixos.cor}</th>}
              <th scope="col" className={CAB}>SKU</th><th scope="col" className={CAB}>Preço</th>
            </tr>
          </thead>
          <tbody>
            {f.variantes.map((v) => {
              const cor = corDe(v.corId);
              return (
                <tr key={v.produtoId} className="border-b border-border last:border-0">
                  <th scope="row" className={`break-words text-left font-medium ${CEL}`}>{v.produtoNome}</th>
                  {f.eixos.medida.map((x) => <td key={x} className={`break-words ${CEL}`}>{medidaDe(v.medidaId)?.valores[x] || "—"}</td>)}
                  {f.eixos.cor && (
                    <td className={CEL}>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {cor && (cor.hex.length > 0 || cor.foto) && <AmostraDeCor hex={cor.hex} foto={cor.foto} />}
                        <span className="break-words">{cor?.nome ?? "—"}</span>
                      </span>
                    </td>
                  )}
                  <td className={`break-all ${CEL}`}>{v.sku}</td><td className={`whitespace-nowrap ${CEL}`}>{preco(v.preco)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {erros.length === 0
        ? (
          <div className="grid gap-2">
            <p className={NOTA}>É assim que o cartão da família aparece, com o SKU e o preço do produto de cada variante. «Guardar na sessão» põe-na na lista de famílias desta sessão.</p>
            <CartaoFamiliaPreview familia={f} />
          </div>
        )
        : <p className={NOTA}>A pré-visualização aparece quando não houver erros.</p>}
    </div>
  );
}
