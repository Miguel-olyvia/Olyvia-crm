// 18/11: o SKU do produto bem visível («nos produtos deveria ter o SKU, onde está?»). Antes ia misturado na linha pequena a cinzento («marca · modelo · ref. …»).
// Na lista (SkuLinha): linha própria, a etiqueta «SKU» e o valor em letra de código, selecionável com um clique, sem cortar. Na ficha (SkuFicha): o mesmo, com «Copiar».
// Sem SKU, ou com a referência provisória (CAT-XXXXXXXXXX), diz «SKU por gerar» em estilo suave (e na ficha não há nada para copiar).
import { useRef } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROVISORIA } from "./ReferenciaFicha";
import { copiarTexto, selecionar } from "./FuncCopiar";
import { useAviso } from "./useAviso";

/** Sem referência verdadeira: vazia ou a provisória que a base põe até se gerar o SKU. */
const skuPorGerar = (sku: string | null | undefined): boolean => !sku?.trim() || PROVISORIA.test(sku.trim());

const ETIQUETA = "text-[15px] font-medium text-muted-foreground";
const VALOR = "select-all break-all font-mono text-[15px] font-medium text-foreground";
const POR_GERAR = "text-[15px] italic text-muted-foreground";

/** A linha do SKU na lista de produtos, por baixo do nome. */
export function SkuLinha({ sku }: { sku: string | null | undefined }) {
  if (skuPorGerar(sku)) return <span className={cn(POR_GERAR, "block")}>SKU por gerar</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className={ETIQUETA}>SKU</span>
      {/* um clique seleciona o SKU (para copiar) e não chega à linha: sem isto abria a ficha (ou marcava a linha) */}
      <span className={VALOR} onClick={(e) => { e.stopPropagation(); selecionar(e.currentTarget); }}>{sku!.trim()}</span>
    </span>
  );
}

/** O SKU no cabeçalho da ficha, em destaque, com o botão «Copiar» e o aviso («SKU copiado») numa região status. */
export function SkuFicha({ sku }: { sku: string | null | undefined }) {
  const [aviso, anunciar] = useAviso();
  const valor = useRef<HTMLSpanElement>(null);
  if (skuPorGerar(sku)) return <p className={cn(POR_GERAR, "mt-1")}>SKU por gerar</p>;
  const texto = sku!.trim();
  const copiar = async (): Promise<void> => {
    if (await copiarTexto(texto)) { anunciar("SKU copiado"); return; }
    selecionar(valor.current);
    anunciar("Não foi possível copiar: o SKU ficou selecionado, prima Ctrl+C.");
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={ETIQUETA}>SKU</span>
      <span ref={valor} className={cn(VALOR, "text-lg")}>{texto}</span>
      <Button type="button" variant="outline" aria-label="Copiar SKU" onClick={() => { void copiar(); }} className="min-h-11 gap-2 px-3 text-[15px]">
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copiar
      </Button>
      <span role="status" className="text-[15px] text-muted-foreground">{aviso}</span>
    </div>
  );
}
