// A "Fila de trabalho" do Inventário: cartões com o número grande, a barra de cor à esquerda, a descrição e "Abrir lista filtrada →". O cartão não conta nada:
// recebe o número já calculado por quem o usa, e esse número é o da lista que o clique abre. Precisa de um ancestral com a classe pg-root.
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import "./blocosPagina.css";

export type TomFila = "ok" | "warn" | "bad" | "info" | "neu";

export interface ItemFila { id: string; n: number; titulo: string; desc: string; tom: TomFila }

export function CartaoFila({ item, aoAbrir }: { item: ItemFila; aoAbrir: () => void }) {
  return (
    <button type="button" className={cn("qcard", `t-${item.tom}`, !item.n && "zero")} onClick={aoAbrir}>
      <span className="qn">{item.n}</span>
      <span>
        <span className="qt">{item.titulo}</span><span className="qd">{item.desc}</span>
        <span className="go">{item.n ? "Abrir lista filtrada" : "Nada pendente"}<ArrowRight aria-hidden="true" /></span>
      </span>
    </button>
  );
}

/** O bloco com o título, a frase de ajuda e a grelha dos cartões. */
export function GrelhaFila({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="blk">
      <div className="blk-h"><h2>{titulo}</h2>{ajuda ? <span>{ajuda}</span> : null}</div>
      <div className="queue">{children}</div>
    </section>
  );
}
