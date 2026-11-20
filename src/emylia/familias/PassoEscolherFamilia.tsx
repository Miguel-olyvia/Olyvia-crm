// Famílias (interface), passo 1 «Escolher produtos»: a pesquisa é NO SERVIDOR (a base tem dezenas de milhares de produtos), com os mesmos filtros em cascata que a
// página de Produtos, texto com debounce e páginas de 50. Os escolhidos são objetos Produto (até MAX_SELECAO). Só lê: nada se altera no catálogo.
// 20/11: a marca «já está noutra família» passa a vir da base (useFamiliasDosProdutos), em vez das famílias da sessão.
import { memo, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Catalogo, Produto } from "../v2/catalogoModelo";
import { NOTA } from "../pecasForm";
import { Procurar } from "../pecasListaCatalogo";
import { refDoProduto } from "./nucleo";
import { FiltrosEscolherFamilia } from "./FiltrosEscolherFamilia";
import { BTN, BTN_DESATIVAVEL, plural, preco } from "./estilosFamilias";
import { ErroLeitura } from "./pecasFamilias";
import { MAX_SELECAO, produtoDaLinha, temPreco } from "./selecao";
import { useFiltrosFamilia } from "./usarFiltrosFamilia";
import { usePesquisaFamilias } from "./usarPesquisaFamilias";
import { useFamiliasDosProdutos } from "./usarFamilias";
import { useTranslation } from "@/hooks/useTranslation";

export interface PassoEscolherProps {
  org: string; K: Catalogo; escolhidos: readonly Produto[];
  /** a família que se edita (id da base; null = nova): os produtos dela não contam como «já está noutra família» */
  familiaAtual: string | null;
  /** `onAlternar` (juntar/tirar) tem de ser estável: as linhas da lista não se redesenham sem necessidade */
  onAlternar: (p: Produto) => void; onRemover: (p: Produto) => void; onSelecionarPagina: (ps: Produto[]) => void; onLimpar: () => void;
}

export function PassoEscolherFamilia({ org, K, escolhidos, familiaAtual, onAlternar, onRemover, onSelecionarPagina, onLimpar }: PassoEscolherProps) {
  const filtros = useFiltrosFamilia(K, org);
  const pag = usePesquisaFamilias(org, filtros.pesquisa, { ativa: !filtros.aEsperarMarcas });
  const [soComPreco, setSoComPreco] = useState(false);
  const tituloLista = useId(), alvoFoco = useRef<HTMLHeadingElement>(null);
  const ids = useMemo(() => new Set(escolhidos.map((p) => p.id)), [escolhidos]);
  const produtos = useMemo(() => pag.linhas.map(produtoDaLinha), [pag.linhas]);
  const visiveis = useMemo(() => (soComPreco ? produtos.filter(temPreco) : produtos), [soComPreco, produtos]);
  // a marca «já está noutra família» vem da base (cat_familias_dos_produtos), só para os ids desta página
  const idsPagina = useMemo(() => produtos.map((p) => p.id), [produtos]);
  const { ocupados, erro: erroMarcas } = useFamiliasDosProdutos(org, idsPagina, familiaAtual);
  const { t } = useTranslation();
  const cheio = escolhidos.length >= MAX_SELECAO, cabem = Math.max(0, MAX_SELECAO - escolhidos.length);
  const novos = visiveis.filter((p) => !ids.has(p.id));
  const paginas = Math.max(pag.paginas, 1), paginaAtual = Math.min(Math.max(pag.pagina, 1), paginas);
  const aEsbater = pag.aCarregar || filtros.aEsperarMarcas;
  const estado = aEsbater ? "A ler os produtos…"
    : pag.erro ? ""
      : `${soComPreco ? `${visiveis.length} de ${produtos.length} neste carregamento` : `${visiveis.length} de ${pag.total} produtos`} · Página ${paginaAtual} de ${paginas}`;
  const irPara = (p: number, pode: boolean) => { if (!pode) return; pag.irPara(p); alvoFoco.current?.focus(); };

  return (
    <div className="grid gap-4">
      <p className={NOTA}>Escolha os produtos que já existem no catálogo e fazem parte desta família (por exemplo, as lava-loiças de um modelo). Nada se altera no catálogo: só se lê.</p>
      <Procurar v={filtros.q} onChange={filtros.setQ} rotulo="Procurar produto" ph="Nome, marca, referência ou subcategoria" className="max-w-none" />
      <FiltrosEscolherFamilia f={filtros} />
      <div className="grid gap-1">
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-[15px]">
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={soComPreco} onChange={() => setSoComPreco((v) => !v)} />
          Só com preço de venda
        </label>
        <p className={NOTA}>Só nos produtos carregados desta página: não pede nada ao servidor.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p role="status" aria-label="Resultados" className="text-[15px] font-medium">{estado}</p>
        <p role="status" aria-label="Produtos escolhidos" className="text-[15px] font-semibold">{escolhidos.length === 0 ? "Nenhum produto escolhido" : plural(escolhidos.length, "escolhido", "escolhidos")}</p>
      </div>
      {erroMarcas && <p className={NOTA}>{t("catFamilias.marcas.erro")}</p>}
      {pag.erro && <ErroLeitura texto="Não foi possível ler os produtos" erro={pag.erro} tentar={pag.tentar} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className={BTN} disabled={cheio || novos.length === 0} onClick={() => onSelecionarPagina(visiveis)}>Selecionar os desta página</Button>
        {escolhidos.length > 0 && <Button type="button" variant="outline" className={BTN} onClick={onLimpar}>Limpar seleção</Button>}
      </div>
      {cheio && <p role="status" className={NOTA}>Chegou ao máximo de {MAX_SELECAO} produtos por família: tire algum para juntar outros.</p>}
      {!cheio && novos.length > cabem && <p className={NOTA}>Só cabem {cabem} dos {novos.length} desta página (máximo {MAX_SELECAO} produtos por família).</p>}
      {/* o título é o alvo do foco ao mudar de página (estático); a região viva é o contador de cima */}
      <h4 id={tituloLista} ref={alvoFoco} tabIndex={-1} className="rounded-sm text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Produtos do catálogo</h4>
      <div role="region" aria-labelledby={tituloLista} tabIndex={0} className="max-h-96 overflow-y-auto rounded-xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ul aria-label="Produtos do catálogo" aria-busy={aEsbater} className={cn("divide-y divide-border", aEsbater && "opacity-60")}>
          {visiveis.map((p) => <LinhaEscolha key={p.id} p={p} marcado={ids.has(p.id)} desativado={cheio && !ids.has(p.id)} noutra={ocupados.has(p.id)} onAlternar={onAlternar} />)}
          {!aEsbater && !pag.erro && visiveis.length === 0 && <li className={cn(NOTA, "px-4 py-4")}>Nenhum produto com esse nome ou filtro.</li>}
        </ul>
      </div>
      <nav aria-label="Paginação de produtos" className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className={BTN_DESATIVAVEL} aria-disabled={paginaAtual <= 1 || undefined} onClick={() => irPara(paginaAtual - 1, paginaAtual > 1)}>Página anterior</Button>
        <Button type="button" variant="outline" className={BTN_DESATIVAVEL} aria-disabled={paginaAtual >= paginas || undefined} onClick={() => irPara(paginaAtual + 1, paginaAtual < paginas)}>Página seguinte</Button>
      </nav>
      {escolhidos.length > 0 && (
        <section aria-label={`Escolhidos (${escolhidos.length})`} tabIndex={0} className="grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-primary/40 bg-card p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <h4 className="text-[15px] font-semibold">{`Escolhidos (${escolhidos.length})`}</h4>
          <ul className="flex flex-wrap gap-2">
            {escolhidos.map((p) => (
              <li key={p.id} className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border border-input bg-background pl-3 text-[15px]">
                <span className="min-w-0 break-words">{p.n}</span>
                <button type="button" id={`remover-${p.id}`} aria-label={`Remover ${p.n} dos escolhidos`} onClick={() => onRemover(p)}
                  className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span aria-hidden="true">✕</span></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface LinhaProps { p: Produto; marcado: boolean; desativado: boolean; noutra: boolean; onAlternar: (p: Produto) => void }

/** Uma linha da lista. Só se redesenha se mudar o que ela mostra (o produto, estar marcada, desativada ou noutra família). */
const LinhaEscolha = memo(function LinhaEscolha({ p, marcado, desativado, noutra, onAlternar }: LinhaProps) {
  const id = useId();
  const r = refDoProduto({ id: p.id, n: p.n, custo: p.custo, ...(p.pvp != null ? { pvp: p.pvp } : {}), ...(p.marca ? { marca: p.marca } : {}), ...(p.sku ? { sku: p.sku } : {}) });
  const detalhe = [`SKU ${r.sku}`, p.marca || "sem marca", r.preco > 0 ? `${preco(r.preco)}${r.semPvp ? " (sem PVP: custo + margem)" : ""}` : "sem preço de venda", p.sub, noutra ? "já está noutra família" : ""].filter(Boolean).join(" · ");
  return (
    <li className={cn("flex items-stretch", marcado && "bg-primary/10")}>
      <label className={cn("flex min-h-11 min-w-0 flex-1 items-start gap-3 px-3 py-2 text-[15px] hover:bg-accent", desativado ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
        <input type="checkbox" aria-labelledby={`${id}-nome`} aria-describedby={`${id}-detalhe`} className="mt-1 h-5 w-5 shrink-0" checked={marcado} disabled={desativado} onChange={() => onAlternar(p)} />
        <span className="min-w-0 break-words">
          <span id={`${id}-nome`} className="block font-medium">{p.n}</span>
          <span id={`${id}-detalhe`} className="block text-sm text-muted-foreground">{detalhe}</span>
        </span>
      </label>
    </li>
  );
});
