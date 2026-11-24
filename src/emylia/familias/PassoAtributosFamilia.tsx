// Famílias (interface), passo 2 «Atributos dos produtos»: os atributos de cada produto vêm do catálogo e só se leem. O utilizador escolhe que atributo faz as bolinhas de
// cor e quais compõem o seletor de medida, e exclui produtos. Os avisos e erros são os do núcleo (nucleo.ts). O que falta corrige-se no produto do catálogo.
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Produto } from "../v2/catalogoModelo";
import { NOTA } from "../pecasForm";
import { problemasDoPasso } from "./derivarFamilia";
import { BTN, preco } from "./estilosFamilias";
import { ALVO_PROTO, refDoProduto, type EixosCfg, type ItemEixos, type Problema } from "./nucleo";
import { AmostraDeCor, ListasDeProblemas } from "./pecasFamilias";
import type { EstadoAtributos } from "./usarAtributosEscolhidos";

export interface PassoAtributosProps {
  produtos: readonly Produto[];
  /** a leitura dos atributos de cada produto (a ler / erro / ok) */
  estados: ReadonlyMap<string, EstadoAtributos>;
  /** os produtos já lidos, como o núcleo os vê */
  itens: readonly ItemEixos[];
  /** os nomes dos atributos que existem nestes produtos */
  nomes: readonly string[];
  eixos: EixosCfg; onEixos: (e: EixosCfg) => void; onExcluir: (id: string) => void; onTentar: (id: string) => void;
  /** todos os problemas do núcleo (aqui mostram-se os deste passo) e o resumo «N produtos geram N variantes» */
  problemas: readonly Problema[]; resumo: string;
}

const CAIXA = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-background px-4 text-[15px] hover:bg-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary";
const CEL = "px-2 py-1.5", CAB = `sticky top-0 bg-muted ${CEL}`;

export function PassoAtributosFamilia({ produtos, estados, itens, nomes, eixos, onEixos, onExcluir, onTentar, problemas, resumo }: PassoAtributosProps) {
  const grupo = useId(), idErros = `${grupo}-erros`, idTabela = `${grupo}-tabela`, noSeletor = new Set(eixos.medida);
  const [nota, setNota] = useState<string | null>(null);
  const doPasso = problemasDoPasso(problemas, 2);
  const erros = doPasso.filter((p) => p.gravidade === "erro").map((p) => p.msg), porId = new Map(itens.map((i) => [i.ref.id, i] as const));
  const descricao = erros.length > 0 ? idErros : undefined;
  const escolherCor = (n: string | null) => {
    setNota(n && noSeletor.has(n) ? `«${n}» passou a ser o atributo das bolinhas e deixou de fazer parte do seletor de medida.` : null);
    onEixos({ cor: n, medida: eixos.medida.filter((x) => x !== n) });
  };
  const alternarMedida = (n: string) => { setNota(null); onEixos({ cor: eixos.cor, medida: noSeletor.has(n) ? eixos.medida.filter((x) => x !== n) : [...eixos.medida, n] }); };
  const exemplo = itens.map((i) => eixos.medida.map((n) => i.atributos[n]?.trim() ?? "").filter(Boolean).join(" · ")).find(Boolean) ?? "";
  const tentar = (id: string) => { onTentar(id); document.getElementById(`linha-atr-${id}`)?.focus(); };
  return (
    <div className="grid gap-4">
      <p className={NOTA}>Os atributos vêm dos produtos do catálogo e só se leem aqui: nada se escreve. Escolha qual deles faz as bolinhas de cor e quais compõem o seletor de medida, e que produtos ficam na família.
        Para mudar um valor, corrija-o no produto do catálogo ou exclua o produto. O SKU e o preço são os do catálogo.</p>
      {nomes.length === 0
        ? <p className={NOTA}>Estes produtos não têm atributos reconhecidos: corrija-os no produto do catálogo.</p>
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset aria-describedby={descricao} className="grid min-w-0 content-start gap-2 rounded-xl border border-border p-3">
              <legend className="px-1 text-[15px] font-semibold">Atributo das bolinhas de cor</legend>
              <div className="flex flex-wrap gap-2">
                {nomes.map((n) => (
                  <label key={n} className={cn(CAIXA, eixos.cor === n && "border-primary bg-primary/10")}>
                    <input type="radio" name={`${grupo}-cor`} className="h-5 w-5" checked={eixos.cor === n} onChange={() => escolherCor(n)} />{n}
                  </label>
                ))}
                <label className={cn(CAIXA, eixos.cor === null && "border-primary bg-primary/10")}>
                  <input type="radio" name={`${grupo}-cor`} className="h-5 w-5" checked={eixos.cor === null} onChange={() => escolherCor(null)} />Nenhum (sem bolinhas)
                </label>
              </div>
            </fieldset>
            <fieldset aria-describedby={descricao} className="grid min-w-0 content-start gap-2 rounded-xl border border-border p-3">
              <legend className="px-1 text-[15px] font-semibold">Atributos do seletor de medida</legend>
              <div className="flex flex-wrap gap-2">
                {nomes.filter((n) => n !== eixos.cor).map((n) => (
                  <label key={n} className={cn(CAIXA, noSeletor.has(n) && "border-primary bg-primary/10")}>
                    <input type="checkbox" className="h-5 w-5" checked={noSeletor.has(n)} onChange={() => alternarMedida(n)} />{n}
                  </label>
                ))}
              </div>
              {eixos.cor && <p className={NOTA}>O atributo escolhido para as bolinhas não aparece aqui.</p>}
              <p className={NOTA}>{exemplo ? `O seletor mostra os valores juntos, por exemplo «${exemplo}».` : "Sem atributos escolhidos, o seletor de medida mostra «Única»."}</p>
            </fieldset>
          </div>
        )}
      <p role="status" aria-label="Alteração dos eixos" className="text-[15px] font-medium">{nota}</p>
      <div className="grid gap-2">
        <p role="status" aria-label="Resumo da atribuição" className="text-[15px] font-semibold">{resumo}</p>
        <ListasDeProblemas erros={erros} avisos={doPasso.filter((p) => p.gravidade === "aviso").map((p) => p.msg)} rotuloErros="Erros dos atributos" rotuloAvisos="Avisos dos atributos" viva="alert" idErros={idErros} />
      </div>
      <div role="region" aria-labelledby={idTabela} tabIndex={0} className="max-h-96 overflow-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[15px]">
          <caption id={idTabela} className="px-2 py-1 text-left text-sm font-medium text-muted-foreground">Atributos dos produtos</caption>
          <thead>
            <tr className="border-y border-border">
              <th scope="col" className={CAB}>Produto</th>
              {nomes.map((n) => (
                <th key={n} scope="col" className={CAB}>{n}{eixos.cor === n ? <span className="block text-xs font-normal text-muted-foreground">bolinhas</span> : noSeletor.has(n) ? <span className="block text-xs font-normal text-muted-foreground">medida</span> : null}</th>
              ))}
              <th scope="col" className={CAB}>SKU</th><th scope="col" className={CAB}>Preço</th><th scope="col" className={CAB}><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <LinhaProduto key={p.id} p={p} estado={estados.get(p.id) ?? { k: "a-ler" }} item={porId.get(p.id)} nomes={nomes} eixos={eixos} onExcluir={onExcluir} onTentar={tentar} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface LinhaProps { p: Produto; estado: EstadoAtributos; item: ItemEixos | undefined; nomes: readonly string[]; eixos: EixosCfg; onExcluir: (id: string) => void; onTentar: (id: string) => void }

function LinhaProduto({ p, estado, item, nomes, eixos, onExcluir, onTentar }: LinhaProps) {
  const r = refDoProduto({ id: p.id, n: p.n, custo: p.custo, ...(p.pvp != null ? { pvp: p.pvp } : {}), ...(p.sku ? { sku: p.sku } : {}) });
  const usados = [...eixos.medida, ...(eixos.cor ? [eixos.cor] : [])];
  return (
    <tr id={`linha-atr-${p.id}`} tabIndex={-1} aria-busy={estado.k === "a-ler"} className="border-b border-border align-top last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <th scope="row" className={`break-words text-left font-medium ${CEL}`}>{p.n}</th>
      {estado.k === "ok" && item
        ? nomes.map((n) => <td key={n} className={`break-words ${CEL}`}><Valor valor={item.atributos[n]?.trim() ?? ""} hex={item.hex?.[n]} foto={item.foto?.[n]} comoCor={eixos.cor === n} usado={usados.includes(n)} /></td>)
        : (
          <td colSpan={Math.max(nomes.length, 1)} className={CEL}>
            {estado.k === "erro"
              ? (
                <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-destructive">
                  Não foi possível ler os atributos: {estado.erro}
                  <Button type="button" variant="outline" className={BTN} aria-label={`Tentar de novo: ${p.n}`} onClick={() => onTentar(p.id)}>Tentar de novo</Button>
                </p>
              )
              : <span className="text-muted-foreground">A ler os atributos…</span>}
          </td>
        )}
      <td className={`break-all ${CEL}`}>{r.sku}</td>
      <td className={CEL}>{r.preco > 0 ? preco(r.preco) : "em falta"}{r.semPvp && r.preco > 0 ? <span className="block text-sm text-muted-foreground">{`sem PVP: custo + margem de ${ALVO_PROTO} %`}</span> : null}</td>
      <td className={CEL}><Button type="button" id={`excluir-${p.id}`} variant="outline" className={BTN} aria-label={`Excluir ${p.n} da família`} onClick={() => onExcluir(p.id)}>Excluir</Button></td>
    </tr>
  );
}

/** O valor de um atributo; o das bolinhas leva a amostra (decorativa) com o hex da opção e o nome em texto (sem hex: diz-o, não inventa cor). */
function Valor({ valor, hex, foto, comoCor, usado }: { valor: string; hex: readonly string[] | undefined; foto: string | undefined; comoCor: boolean; usado: boolean }) {
  if (!valor) return <span className={usado ? "text-destructive" : "text-muted-foreground"}>sem valor</span>;
  if (!comoCor) return <>{valor}</>;
  return (
    <span className="inline-flex min-h-8 flex-wrap items-center gap-2">
      {((hex && hex.length > 0) || foto) && <AmostraDeCor hex={hex ?? []} foto={foto} />}
      <span className="break-words">{valor}</span>
      {(!hex || hex.length === 0) && !foto && <span className="text-sm text-muted-foreground">sem hex</span>}
    </span>
  );
}
