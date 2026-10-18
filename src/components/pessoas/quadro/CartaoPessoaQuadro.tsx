import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { textoPrazoPasso } from "../formatoPessoas";
import { LINHA_PESSOA } from "../useAtalhosPessoas";
import { ExplicacaoDoPasso } from "../processo/ExplicacaoDoPasso";
import { passoDoItem } from "../processo/passosProcesso";
import { useAcaoDoPasso } from "../processo/processoContexto";
import { trabalhoDoItem } from "../processo/trabalhoDoItem";
import type { ItemProcesso } from "../processo/tiposProcesso";
import type { CartaoQuadro } from "./cartoesQuadroPessoas";

interface CartaoPessoaQuadroProps {
  cartao: CartaoQuadro;
  hoje: string;
  /** O item do processo deste cartão (ver `itensDaPessoa`): com ele o botão do passo diz o passo do "A fazer" e, se já executa, executa-o. */
  item?: ItemProcesso;
  /** Abre a ficha da pessoa: o nome abre-a sempre; o botão do passo só quando o passo ainda não executa (Fases 4 e 5). */
  aoAbrir: (pessoaId: string, negocioId?: string) => void;
}

/**
 * Um cartão do quadro: o nome (botão) abre a ficha; o rótulo Lead ou Cliente, o trabalho, o valor e o próximo passo
 * vêm em texto. O botão do passo executa-o (chamada, visita, levantamento, negócio) quando há `ProcessoProvider` e o passo é
 * dos que já executam; senão abre a ficha, como o do nome. Com `item` o texto é o do "A fazer" (o mesmo da Lista); sem ele,
 * o da coluna "Próximo passo".
 * O botão do nome leva `data-linha-pessoa` para os atalhos j/k/setas/o percorrerem os cartões pela ordem do DOM.
 */
export function CartaoPessoaQuadro({ cartao, hoje, item, aoAbrir }: CartaoPessoaQuadroProps) {
  const { t } = useTranslation();
  // Um cartão de negócio abre a pessoa com ESSE negócio aberto; um de pessoa em abordagem abre só a pessoa.
  const negocioId = cartao.tipo === "negocio" ? cartao.id : undefined;
  const acao = useAcaoDoPasso(item, () => aoAbrir(cartao.pessoaId, negocioId));
  const passo = cartao.passo === "nenhum" ? null : t(item ? passoDoItem(item).chave : `pessoasPagina.next.${cartao.passo}`);
  const prazo = textoPrazoPasso(t, cartao.prazo, hoje);
  const trabalho = trabalhoDoItem(t, cartao);
  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <button
          type="button" {...{ [LINHA_PESSOA]: cartao.pessoaId }} aria-label={t("pessoasPagina.board.open", { name: cartao.nome })} onClick={() => aoAbrir(cartao.pessoaId, negocioId)}
          className={cn("min-h-11 min-w-11 cursor-pointer rounded-md text-left font-medium text-foreground hover:underline motion-reduce:transition-none", FOCO)}
        >
          {cartao.nome}
        </button>
        <Badge variant="outline" className="shrink-0">{t(`pessoasPagina.role.${cartao.papel}`)}</Badge>
      </div>
      <p className="text-muted-foreground">{trabalho}</p>
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
          // Começa pelo texto visível (WCAG 2.5.3) e diz de que trabalho é; "(abre a ficha)" só nos passos que ainda não executam.
          aria-label={t(acao.executa ? "pessoasPagina.board.step" : "pessoasPagina.board.stepOpens", { step: passo, work: trabalho, name: cartao.nome })}
          onClick={acao.aoClicar} {...acao.atributos}
        >
          {passo}
        </Button>
      )}
      {acao.bloqueio && acao.idBloqueio && <ExplicacaoDoPasso id={acao.idBloqueio} texto={acao.bloqueio} />}
    </li>
  );
}
