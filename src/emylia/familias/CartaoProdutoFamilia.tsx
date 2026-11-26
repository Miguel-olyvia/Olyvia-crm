// 26/11: o cartão do produto escolhido na vista da família. É sempre um produto REAL: nome, referência (com «copiar»), preço de venda (só se a leitura o trouxe: com
// services.view), stock informativo (só se a leitura o trouxe: com inventory.view; nunca bloqueia nada), selo «Rascunho» e «Abrir produto» (a ficha do produto).
// Sem a permissão a linha do preço ou do stock simplesmente não aparece (nem «0 €», nem «—», nem «sem acesso»). Nunca custo.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { caminhoProduto } from "../catalogoRotas";
import type { ProdutoVista } from "./escolhaVariacao";

const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

export function CartaoProdutoFamilia({ produto }: { produto: ProdutoVista | null }) {
  const { t } = useTranslation();
  const [copia, setCopia] = useState<"ok" | "erro" | null>(null);
  if (!produto) return <p role="status" className="rounded-xl border border-border bg-card p-4 text-[15px] text-muted-foreground">{t("catFamiliaVer.cartao.semProduto")}</p>;
  const copiar = () => {
    const escrever = navigator.clipboard?.writeText(produto.sku);
    if (!escrever) { setCopia("erro"); return; }
    escrever.then(() => setCopia("ok"), () => setCopia("erro"));
  };
  return (
    <article aria-label={t("catFamiliaVer.cartao.titulo")} className="grid gap-2 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start gap-2">
        <h2 className="min-w-0 flex-1 break-words text-base font-semibold">{produto.nome}</h2>
        {produto.estado === "draft" && <span className="rounded-md border border-input bg-muted px-2 py-1 text-[15px] font-medium">{t("catFamiliaVer.cartao.rascunho")}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        <span className="text-muted-foreground">{t("catFamiliaVer.cartao.referencia")}</span>
        <span className="font-mono">{produto.sku}</span>
        <button type="button" aria-label={t("catFamiliaVer.cartao.copiar", { sku: produto.sku })} onClick={copiar}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input bg-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card">
          <Copy className="h-4 w-4" aria-hidden="true" />
        </button>
        <span role="status" className="text-muted-foreground">{copia === "ok" ? t("catFamiliaVer.cartao.copiada") : copia === "erro" ? t("catFamiliaVer.cartao.naoCopiou") : ""}</span>
      </div>
      {produto.pvp !== null && (
        <p className="flex flex-wrap items-baseline gap-2 text-[15px]">
          <span className="text-muted-foreground">{t("catFamiliaVer.cartao.pvp")}</span>
          <span className="text-xl font-semibold">{eur(produto.pvp)}</span>
        </p>
      )}
      {produto.stock !== null && <p className="text-[15px]">{t(produto.stock === 1 ? "catFamiliaVer.cartao.stock.one" : "catFamiliaVer.cartao.stock.other", { count: produto.stock.toLocaleString("pt-PT") })}</p>}
      <Link to={caminhoProduto(produto.id)} aria-label={t("catFamiliaVer.cartao.abrirNome", { name: produto.nome })} className={cn(buttonVariants({ variant: "default" }), "min-h-11 justify-self-start")}>
        {t("catFamiliaVer.cartao.abrir")}
      </Link>
    </article>
  );
}
