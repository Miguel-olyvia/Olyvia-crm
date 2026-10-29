// «Stock e armazéns» (29/10) na ficha do produto e do consumível: os produtos do Catálogo gerem sempre stock (decisão do Rafael, 29/10);
// os armazéns marcados só dizem onde o produto está ou pode estar. Lê cat_produto_stock; grava cat_definir_armazem_produto.
// Mínimo, máximo, ponto de encomenda e localização editam-se nos armazéns marcados. A quantidade só se lê (mexe-se no Inventário).
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  definirArmazemProduto, lerArmazensOrg, lerInteiro, lerStockProduto,
  type ArmazemOrg, type ArmazemProduto, type FichaProdutoReal, type StockProduto,
} from "./fichaProdutoDados";

const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-6";
const NOTA = "text-[15px] text-muted-foreground";
const ENTRADA = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60";

type Leitura = { k: "a-ler" } | { k: "erro"; t: string } | { k: "ok"; s: StockProduto };
const txt = (v: number | string | null | undefined) => (v == null ? "" : String(v));

export function StockArmazens({ productId, nome, real, anunciar }: { productId: string; nome: string; real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const [l, setL] = useState<Leitura>({ k: "a-ler" });
  const [org, setOrg] = useState<Map<string, ArmazemOrg> | null>(null);
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [erro, setErro] = useState<{ w: string; t: string } | null>(null);
  const ler = useCallback(async () => {
    const r = await lerStockProduto(productId);
    setL(r.ok ? { k: "ok", s: r.v } : { k: "erro", t: r.erro });
  }, [productId]);
  useEffect(() => { void ler(); }, [ler]);
  // o "Serve clientes" e o "ativo" do armazém vêm da tabela warehouses; se a leitura falhar, não se mostram
  useEffect(() => {
    let vivo = true;
    void lerArmazensOrg(real.org).then((r) => { if (vivo && r.ok) setOrg(new Map(r.v.map((w) => [w.id, w]))); });
    return () => { vivo = false; };
  }, [real.org]);

  const gravar = async (w: ArmazemProduto, ativo: boolean, campos?: { minimo: number | null; maximo: number | null; ponto: number | null; local: string | null }) => {
    setAGravar(w.warehouse_id); setErro(null);
    const r = await definirArmazemProduto({
      productId, warehouseId: w.warehouse_id, ativo,
      minimo: campos?.minimo ?? null, maximo: campos?.maximo ?? null, pontoEncomenda: campos?.ponto ?? null, localizacao: campos?.local ?? null,
    });
    if (!r.ok || !r.v.ok) { setAGravar(null); setErro({ w: w.warehouse_id, t: r.ok ? r.v.motivo || "Não foi possível gravar o armazém." : r.erro }); return; }
    anunciar(r.v.motivo || (campos ? `${w.nome}: gravado.` : ativo ? `${nome} passa a estar em ${w.nome}.` : `${nome} saiu de ${w.nome}.`));
    await ler();
    try { await real.recarregar(); } catch { /* fica o que está */ }
    setAGravar(null);
  };

  return (
    <section aria-labelledby="fp-stock" className={cn(CARTAO, "mt-6")}>
      <h2 id="fp-stock" className="text-xl font-semibold tracking-tight">Stock e armazéns</h2>
      {l.k === "a-ler" && <p className={cn(NOTA, "mt-3")}>A ler…</p>}
      {l.k === "erro" && <p className={cn(NOTA, "mt-3")} role="alert">{l.t}</p>}
      {l.k === "ok" && (
        <>
          <p className={cn(NOTA, "mt-2")}>O stock é sempre avaliado na encomenda de cliente: o que faltar vai ao fornecedor. Marque os armazéns onde este produto está ou pode estar.</p>
          {!l.s.armazens.length && <p className={cn(NOTA, "mt-3")}>A organização ainda não tem armazéns.</p>}
          <ul className="mt-3 divide-y divide-border">
            {l.s.armazens.map((w) => (
              <LinhaArmazem key={`${w.warehouse_id}:${w.ativo}:${w.minimo}:${w.maximo}:${w.ponto_encomenda}:${w.localizacao}`} w={w} o={org?.get(w.warehouse_id)}
                pode={l.s.pode_editar} aGravar={aGravar === w.warehouse_id} ocupado={!!aGravar} erro={erro?.w === w.warehouse_id ? erro.t : null} gravar={gravar} />
            ))}
          </ul>
          {!l.s.pode_editar && <p className={cn(NOTA, "mt-2")}>Só quem pode editar o Inventário muda os armazéns.</p>}
        </>
      )}
    </section>
  );
}

function LinhaArmazem({ w, o, pode, aGravar, ocupado, erro, gravar }: {
  w: ArmazemProduto; o: ArmazemOrg | undefined; pode: boolean; aGravar: boolean; ocupado: boolean; erro: string | null;
  gravar: (w: ArmazemProduto, ativo: boolean, campos?: { minimo: number | null; maximo: number | null; ponto: number | null; local: string | null }) => Promise<void>;
}) {
  const [min, setMin] = useState(txt(w.minimo));
  const [max, setMax] = useState(txt(w.maximo));
  const [ponto, setPonto] = useState(txt(w.ponto_encomenda));
  const [local, setLocal] = useState(txt(w.localizacao));
  const nums = [lerInteiro(min), lerInteiro(max), lerInteiro(ponto)];
  const invalido = nums.some((n) => n != null && Number.isNaN(n));
  const mudou = min !== txt(w.minimo) || max !== txt(w.maximo) || ponto !== txt(w.ponto_encomenda) || local !== txt(w.localizacao);
  const inativo = o ? !o.is_active : false;
  const editar = pode && w.ativo;
  const campo = (rot: string, v: string, set: (s: string) => void, larg = "w-24") => (
    <label className="grid gap-1"><span className="text-[15px]">{rot}</span>
      <input type="text" inputMode={rot === "Localização" ? "text" : "numeric"} value={v} onChange={(e) => set(e.target.value)} disabled={!editar || aGravar}
        aria-label={`${rot} em ${w.nome}`} className={cn(ENTRADA, larg, "tabular-nums")} />
    </label>
  );
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className={cn("flex min-h-11 flex-1 items-center gap-3 text-[15px]", pode && !inativo ? "cursor-pointer" : "cursor-default")}>
          <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={w.ativo} disabled={!pode || ocupado || (inativo && !w.ativo)}
            onChange={(e) => void gravar(w, e.target.checked)} aria-label={`${w.nome}: este armazém tem este produto`} />
          <span className="min-w-0">
            <span className="block font-medium">{w.nome}{w.codigo ? <span className="font-normal text-muted-foreground"> · {w.codigo}</span> : null}</span>
            <span className={cn(NOTA, "block")}>
              {[w.ativo ? "Este armazém tem este produto" : "Não tem este produto", o ? (o.serves_customers ? "serve clientes" : "não serve clientes") : "", inativo ? "armazém inativo" : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
          {aGravar && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        </label>
        <span className="text-[15px] tabular-nums" aria-label={`Quantidade em ${w.nome}`}>{w.ativo || w.quantidade ? `${w.quantidade ?? 0} em stock` : ""}</span>
      </div>
      {w.ativo && (
        <div className="mt-2 flex flex-wrap items-end gap-3 pl-8">
          {campo("Mínimo", min, setMin)}
          {campo("Máximo", max, setMax)}
          {campo("Ponto de encomenda", ponto, setPonto, "w-28")}
          {campo("Localização", local, setLocal, "w-48")}
          {editar && (
            <Button variant="outline" className="min-h-11 text-[15px]" disabled={!mudou || invalido || ocupado}
              onClick={() => void gravar(w, true, { minimo: nums[0], maximo: nums[1], ponto: nums[2], local: local.trim() || null })}>Guardar</Button>
          )}
        </div>
      )}
      {invalido && <p className="mt-1 pl-8 text-[15px] text-destructive" role="alert">Mínimo, máximo e ponto de encomenda são números inteiros, 0 ou mais.</p>}
      {erro && <p className="mt-1 pl-8 text-[15px] text-destructive" role="alert">{erro}</p>}
    </li>
  );
}
