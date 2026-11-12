// Protótipo (visualizador 3D): os passos «Escolher produtos» e «Atribuir medidas e acabamentos» do Configurador de famílias, para criar uma família A PARTIR DE
// PRODUTOS QUE JÁ EXISTEM no catálogo (só leitura: nada se escreve no catalogoStore). O assistente (PainelConfigurador.tsx) guarda o estado; aqui só se desenha.
import { useMemo, useState } from "react";
import type { No, Produto } from "../v2/catalogoModelo";
import { sem } from "./catalogo3d";
import { ALVO_PROTO, ficheirosCompativeis, refDoProduto, type AtribuicaoProduto, type FamiliaCfg } from "./configurador";
import { BTN, CAMPO, INP, eur } from "./estilosPainel";
import { chaveFicheiro } from "./modelosHtml/ficheiros";

/** O máximo de produtos desenhados de cada vez (o catálogo de exemplo tem milhares): a pesquisa afina. */
export const MAX_LISTA = 100;
const NOMES_DIM = ["Largura", "Profundidade", "Altura"] as const;
const numero = (v: string): number => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

export interface CatalogoLido { produtos: readonly Produto[]; arvore: readonly No[] }

export function PassoEscolher({ catalogo, escolhidos, onAlternar, onLimpar }: { catalogo: CatalogoLido; escolhidos: readonly string[]; onAlternar: (id: string) => void; onLimpar: () => void }) {
  const [q, setQ] = useState("");
  // o texto de pesquisa de cada produto (nome, marca, referência e categoria), calculado uma vez por catálogo
  const indice = useMemo(() => {
    const nos = new Map(catalogo.arvore.map((n) => [n.id, n.n] as const));
    return catalogo.produtos.map((p) => ({ p, h: sem(`${p.n} ${p.marca} ${p.sku ?? ""} ${p.sub ?? ""} ${p.no ? nos.get(p.no) ?? "" : ""}`) }));
  }, [catalogo]);
  const s = sem(q.trim());
  const achados = useMemo(() => (s ? indice.filter((x) => s.split(/\s+/).every((t) => x.h.includes(t))) : indice), [indice, s]);
  const n = escolhidos.length;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Escolha os produtos que já existem no catálogo e que fazem parte desta família (por exemplo, as nove lava-loiças de um modelo). Nada se altera no catálogo: só se lê.</p>
      <label className={CAMPO}>Procurar produtos do catálogo
        <input type="search" className={INP} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca, referência ou categoria" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" aria-label="Produtos escolhidos" className="text-[15px] font-semibold">{n === 0 ? "Nenhum produto escolhido" : plural(n, "escolhido", "escolhidos")}</p>
        {n > 0 && <button type="button" className={BTN} onClick={onLimpar}>Limpar a escolha</button>}
      </div>
      {achados.length === 0
        ? <p className="text-[15px] text-muted-foreground">Nenhum produto do catálogo corresponde a «{q.trim()}».</p>
        : (
          <>
            {achados.length > MAX_LISTA && <p className="text-sm text-muted-foreground">A mostrar os primeiros {MAX_LISTA} de {achados.length} produtos: escreva mais para afinar a pesquisa.</p>}
            <ul aria-label="Produtos do catálogo" className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {achados.slice(0, MAX_LISTA).map(({ p }) => {
                const r = refDoProduto(p), marcado = escolhidos.includes(p.id);
                return (
                  <li key={p.id}>
                    <label className={`flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-[15px] hover:bg-accent ${marcado ? "bg-primary/10" : ""}`}>
                      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={marcado} onChange={() => onAlternar(p.id)} />
                      <span className="min-w-0 break-words">
                        <span className="block font-medium">{p.n}</span>{" "}
                        <span className="block text-sm text-muted-foreground">SKU {r.sku} · {p.marca || "sem marca"} · {r.preco > 0 ? eur(r.preco) : "sem preço de venda"}{r.semPvp && r.preco > 0 ? " (sem PVP: custo + margem)" : ""}{p.sub ? ` · ${p.sub}` : ""}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
    </div>
  );
}

export function PassoAtribuir({ familia, produtos, atribuicoes, conflitos, onAtribuir, onTirar }: {
  familia: FamiliaCfg; produtos: readonly Produto[]; atribuicoes: Readonly<Record<string, AtribuicaoProduto>>; conflitos: readonly string[];
  onAtribuir: (id: string, p: Partial<AtribuicaoProduto>) => void; onTirar: (id: string) => void;
}) {
  const ficheiros = ficheirosCompativeis(familia.tipo);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Diga a que medida e a que acabamento corresponde cada produto. A sugestão vem do nome e pode corrigir-se. Produtos com a mesma medida juntam-se num só produto da família; o SKU e o preço são os do catálogo e não se editam aqui.</p>
      <p role="status" aria-label="Resumo da atribuição" className="text-[15px] font-semibold">{plural(produtos.length, "produto", "produtos")} = {plural(familia.medidas.length, "medida", "medidas")} × {plural(familia.acabamentos.length, "acabamento", "acabamentos")}</p>
      {conflitos.length > 0 && (
        <ul role="alert" className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {conflitos.map((c) => <li key={c}>Erro: {c}</li>)}
        </ul>
      )}
      {produtos.map((p, i) => {
        const a = atribuicoes[p.id];
        if (!a) return null;
        const n = i + 1, r = refDoProduto(p), nome = `produto ${n}`;
        return (
          <fieldset key={p.id} className="grid min-w-0 gap-2 rounded-xl border border-border p-2">
            <legend className="max-w-full break-words px-1 text-sm font-semibold">Produto {n}: {p.n}</legend>
            <p className="break-words text-sm text-muted-foreground">SKU {r.sku} · {p.marca || "sem marca"} · {r.preco > 0 ? eur(r.preco) : "preço em falta"}{r.semPvp && r.preco > 0 ? ` (sem PVP: custo + margem de ${ALVO_PROTO} %)` : ""} · vem do produto do catálogo</p>
            {r.preco <= 0 && <p className="text-sm font-medium text-destructive">Sem preço de venda no catálogo (sem PVP nem custo): não pode entrar na família.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={CAMPO}>Medida (rótulo)<input aria-label={`Medida do ${nome}`} className={INP} value={a.medida} onChange={(e) => onAtribuir(p.id, { medida: e.target.value })} /></label>
              <div className="grid grid-cols-3 gap-2">
                {NOMES_DIM.map((d, j) => (
                  <label key={d} className={CAMPO}>{d} (cm)
                    <input aria-label={`${d} do ${nome} (cm)`} type="number" min="0" step="0.1" inputMode="decimal" className={INP} defaultValue={a.dim[j]}
                      onChange={(e) => onAtribuir(p.id, { dim: a.dim.map((x, k) => (k === j ? numero(e.target.value) : x)) as [number, number, number] })} />
                  </label>
                ))}
              </div>
              <label className={CAMPO}>Acabamento<input aria-label={`Acabamento do ${nome}`} className={INP} value={a.acabamento} onChange={(e) => onAtribuir(p.id, { acabamento: e.target.value })} /></label>
              <label className={CAMPO}>Código do acabamento<input aria-label={`Código do acabamento do ${nome}`} className={INP} value={a.codigo} onChange={(e) => onAtribuir(p.id, { codigo: e.target.value })} /></label>
              <label className={CAMPO}>Cor<input aria-label={`Cor do acabamento do ${nome}`} type="color" className="h-11 w-16 rounded-lg border border-input bg-card p-1" value={a.cor} onChange={(e) => onAtribuir(p.id, { cor: e.target.value })} /></label>
              {ficheiros.length === 0
                ? <p className="self-end text-sm text-muted-foreground">Modelo genérico: este tipo de produto não tem 3D do fabricante.</p>
                : (
                  <label className={CAMPO}>Modelo 3D
                    <select aria-label={`Modelo 3D do ${nome}`} className={INP} value={a.glb ?? ""} onChange={(e) => onAtribuir(p.id, { glb: e.target.value })}>
                      <option value="">Modelo genérico</option>
                      {ficheiros.map((x) => <option key={x.ficheiro} value={chaveFicheiro(x.familia, x.modelo, x.acab)}>{x.marca} · {x.modelo} · {x.acab}</option>)}
                    </select>
                  </label>
                )}
            </div>
            {ficheiros.length > 0 && <p><span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">{a.glb ? "3D do fabricante (proposto pelo nome, pode mudar)" : "Modelo genérico"}</span></p>}
            <div><button type="button" className={BTN} aria-label={`Tirar o ${nome} da família`} onClick={() => onTirar(p.id)}>Tirar da família</button></div>
          </fieldset>
        );
      })}
    </div>
  );
}
