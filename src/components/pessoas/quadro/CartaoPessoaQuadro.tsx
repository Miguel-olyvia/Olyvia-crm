import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { textoPrazoPasso } from "../formatoPessoas";
import { LINHA_PESSOA } from "../useAtalhosPessoas";
import type { CartaoQuadro } from "./cartoesQuadroPessoas";

interface CartaoPessoaQuadroProps {
  cartao: CartaoQuadro;
  hoje: string;
  /** Abre a ficha da pessoa (nesta fase, o nome e o botão do próximo passo fazem o mesmo). */
  aoAbrir: (pessoaId: string) => void;
}

/**
 * Um cartão do quadro: o nome (botão) abre a ficha; o rótulo Lead ou Cliente, o trabalho, o valor e o próximo passo
 * vêm em texto. Nesta fase o botão do passo só abre a ficha, como o do nome; na Fase 2 passa a executar o passo.
 * O botão do nome leva `data-linha-pessoa` para os atalhos j/k/setas/o percorrerem os cartões pela ordem do DOM.
 */
export function CartaoPessoaQuadro({ cartao, hoje, aoAbrir }: CartaoPessoaQuadroProps) {
  const { t } = useTranslation();
  const passo = cartao.passo === "nenhum" ? null : t(`pessoasPagina.next.${cartao.passo}`);
  const prazo = textoPrazoPasso(t, cartao.prazo, hoje);
  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <button
          type="button" {...{ [LINHA_PESSOA]: cartao.pessoaId }} aria-label={t("pessoasPagina.board.open", { name: cartao.nome })} onClick={() => aoAbrir(cartao.pessoaId)}
          className={cn("min-h-11 min-w-11 cursor-pointer rounded-md text-left font-medium text-foreground hover:underline motion-reduce:transition-none", FOCO)}
        >
          {cartao.nome}
        </button>
        <Badge variant="outline" className="shrink-0">{t(`pessoasPagina.role.${cartao.papel}`)}</Badge>
      </div>
      <p className="text-muted-foreground">{cartao.trabalho ?? t("pessoasPagina.board.request")}</p>
      {cartao.valor !== null && <p className="font-medium tabular-nums text-foreground">{formatarMeta("euro", cartao.valor)}</p>}
      {prazo && (
        <p className={cn("flex items-center gap-1 text-xs", cartao.atrasado ? "font-medium text-foreground" : "text-muted-foreground")}>
          {cartao.atrasado && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
          {prazo}
        </p>
      )}
      {passo && (
        <Button
          type="button" variant="outline" className={cn("h-auto min-h-11 w-full justify-start py-2 whitespace-normal text-left motion-reduce:transition-none", FOCO)}
          aria-label={t("pessoasPagina.board.step", { step: passo, name: cartao.nome })} onClick={() => aoAbrir(cartao.pessoaId)}
        >
          {passo}
        </Button>
      )}
    </li>
  );
}
