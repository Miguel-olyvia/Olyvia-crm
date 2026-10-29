// Catálogo › Produtos (29/10, só na página real): os materiais do modelo de cada linha de negócio (neg_ler_linhas_modelo, migration
// 20270101300000) e o produto do Catálogo de cada um. É esse produto que vai à encomenda de cliente; trocá-lo é neg_ligar_material_modelo
// (products.edit). As escolhas mostram primeiro os produtos do ramo da parte da estimativa (Revestimentos › Parede…).
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Catalogo } from "./v2/catalogoModelo";
import { nosAbaixo } from "./produtosVisita";
import { Escolha } from "./v2/pecasCustos";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { aplicarLinhasModelo, linhasModeloDe, textoRegra, type LinhaModeloBase } from "./real/linhasModelo";

const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
const NOTA = "text-[15px] text-muted-foreground";

let pCliente: Promise<typeof import("@/integrations/supabase/client")["supabase"]> | null = null;
const cliente = () => (pCliente ??= import("@/integrations/supabase/client").then((m) => m.supabase, (e) => { pCliente = null; throw e; }));

type Material = LinhaModeloBase["materiais"][number];

export function MateriaisModelo({ K, real, anunciar }: { K: Catalogo; real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const [L, setL] = useState<LinhaModeloBase[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [escolha, setEscolha] = useState("");
  const [aGravar, setAGravar] = useState(false);

  const ler = useCallback(async () => {
    const sb = await cliente();
    const { data, error } = await sb.rpc("neg_ler_linhas_modelo" as never, { p_org: real.org } as never);
    if (error) { setErro(error.message); return; }
    const linhas = linhasModeloDe(data);
    aplicarLinhasModelo(linhas);
    setL(linhas);
  }, [real.org]);
  useEffect(() => { ler().catch((e: Error) => setErro(e.message)); }, [ler]);

  const gravar = async (m: Material) => {
    setAGravar(true);
    try {
      const sb = await cliente();
      const { error } = await sb.rpc("neg_ligar_material_modelo" as never, { p_org: real.org, p_material: m.id, p_produto: escolha || null } as never);
      if (error) { anunciar(`Não gravou: ${error.message}`); return; }
      await ler();
      setAberto(null);
      anunciar(`«${m.nome}» ${escolha ? "ligado ao produto escolhido" : "ficou sem produto"}.`);
    } finally { setAGravar(false); }
  };

  /** Os produtos para escolher: primeiro os do ramo da parte, depois os outros. */
  const opcoes = (l: LinhaModeloBase, m: Material) => {
    const p = l.partes.find((x) => x.descricao === m.parte);
    const of = p?.ramo_oficio ? K.arvore.find((x) => x.pai == null && x.n === p.ramo_oficio) : undefined;
    const no = of && p?.ramo_sub ? K.arvore.find((x) => x.pai === of.id && x.n === p.ramo_sub) ?? of : of;
    const ordenados = [...K.produtos].sort((a, b) => a.n.localeCompare(b.n, "pt"));
    const nos = no ? nosAbaixo(K.arvore, no.id) : null;
    const doRamo = nos ? ordenados.filter((x) => x.no && nos.has(x.no)) : [];
    const resto = nos ? ordenados.filter((x) => !(x.no && nos.has(x.no))) : ordenados;
    return [{ v: "", t: "Sem produto (não vai à encomenda)" }, ...doRamo.map((x) => ({ v: x.id, t: x.n })), ...resto.map((x) => ({ v: x.id, t: x.n }))];
  };

  const comMateriais = (L ?? []).filter((l) => l.materiais.length);
  return (
    <section aria-labelledby="materiais-modelo" className="mt-10">
      <h2 id="materiais-modelo" className="text-xl font-semibold tracking-tight">Materiais do modelo</h2>
      <p className={cn(NOTA, "mt-1")}>
        Quando o orçamento tem a linha de materiais do modelo, cada material vai à encomenda de cliente com este produto e a quantidade das medidas da visita.
      </p>
      {erro && <p className="mt-3 text-[15px] text-destructive">{erro}</p>}
      {!erro && !L && <p className={cn(NOTA, "mt-3")}>A ler…</p>}
      {L && !comMateriais.length && <p className={cn(NOTA, "mt-3")}>Esta organização ainda não tem materiais do modelo.</p>}
      {comMateriais.map((l) => (
        <div key={l.chave} className="mt-5">
          <h3 className="text-[15px] font-semibold">{l.nome} · {l.modelo}</h3>
          <ul className={cn(LISTA, "mt-2")}>
            {l.materiais.map((m) => (
              <li key={m.id} className="flex min-h-[4.5rem] flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{m.nome}</span>
                  <span className={cn(NOTA, "block")}>{textoRegra(m)}</span>
                  <span className={cn("block text-[15px]", m.produto ? "text-foreground" : "text-destructive")}>
                    {m.produto ? `Produto: ${m.produto_nome ?? K.produtos.find((p) => p.id === m.produto)?.n ?? "do Catálogo"}` : "Sem produto: não vai à encomenda"}
                  </span>
                </span>
                {real.podeEditar && aberto !== m.id && (
                  <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => { setAberto(m.id); setEscolha(m.produto ?? ""); }}>
                    Trocar o produto
                  </Button>
                )}
                {aberto === m.id && (
                  <span className="flex basis-full flex-wrap items-end gap-2">
                    <Escolha rotulo={`Produto de ${m.nome}`} w="w-full sm:w-96" v={escolha} opcoes={opcoes(l, m)} onSet={setEscolha} />
                    <Button className="min-h-11 text-[15px]" disabled={aGravar} onClick={() => gravar(m)}>{aGravar ? "A gravar…" : "Gravar"}</Button>
                    <Button variant="ghost" className="min-h-11 text-[15px]" disabled={aGravar} onClick={() => setAberto(null)}>Cancelar</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
