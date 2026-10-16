import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { textoPrazoPasso } from "../formatoPessoas";
import { ExplicacaoDoPasso } from "../processo/ExplicacaoDoPasso";
import { passoDoItem } from "../processo/passosProcesso";
import { useAcaoDoPasso } from "../processo/processoContexto";
import type { ItemProcesso } from "../processo/tiposProcesso";

interface LinhaNegociosPessoaProps {
  pessoaId: string;
  nome: string;
  itens: readonly ItemProcesso[];
  hoje: string;
  /** Abre a ficha da pessoa: o botão do passo só o faz quando o passo ainda não executa (Fases 4 e 5) ou não há `ProcessoProvider`. */
  aoAbrir: (pessoaId: string) => void;
}

/** Uma sub-linha: o trabalho e a etiqueta Pedido/Negócio, a fase, o valor, o prazo (se houver) e "A fazer:" com o botão do passo. */
function SubLinha({ item, pessoaId, nome, hoje, aoAbrir }: Omit<LinhaNegociosPessoaProps, "itens"> & { item: ItemProcesso }) {
  const { t } = useTranslation();
  const acao = useAcaoDoPasso(item, () => aoAbrir(pessoaId));
  const passo = t(passoDoItem(item).chave);
  const prazo = textoPrazoPasso(t, item.prazo, hoje);
  const trabalho = item.trabalho ?? t("pessoasPagina.board.request");
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
      <span className="flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{trabalho}</span>
        <Badge variant="outline" className="shrink-0">
          {t(item.tipo === "pedido" ? "pessoasPagina.deals.kind.request" : "pessoasPagina.deals.kind.deal")}
        </Badge>
      </span>
      {/* Fase, valor e prazo levam um rótulo só para leitores de ecrã e um separador, para não se lerem como texto solto. */}
      <span className="text-muted-foreground">
        <span className="sr-only">{t("pessoasPagina.deals.sr.phase")} </span>
        {t(`pessoasPagina.board.col.${item.fase}`)}
        <span className="sr-only">, </span>
      </span>
      <span className={cn("tabular-nums", item.valor === null ? "text-muted-foreground" : "font-medium text-foreground")}>
        <span className="sr-only">{t("pessoasPagina.deals.sr.value")} </span>
        {item.valor === null ? t("pessoasPagina.deals.value.none") : formatarMeta("euro", item.valor)}
        <span className="sr-only">, </span>
      </span>
      {prazo && (
        <span className={cn("flex items-center gap-1", item.atrasado ? "font-medium text-foreground" : "text-muted-foreground")}>
          {item.atrasado && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
          <span className="sr-only">{t("pessoasPagina.deals.sr.deadline")} </span>
          {prazo}
          <span className="sr-only">, </span>
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{t("pessoasPagina.todo.label")}</span>
        <Button
          type="button" variant="outline" onClick={acao.aoClicar} {...acao.atributos}
          // Começa pelo texto visível (WCAG 2.5.3) e diz de que trabalho é; "(abre a ficha)" só nos passos que ainda não executam (Fases 4 e 5).
          aria-label={t(acao.executa ? "pessoasPagina.process.stepLabel" : "pessoasPagina.deals.stepLabel", { step: passo, work: trabalho, name: nome })}
          className={cn("h-auto min-h-11 whitespace-normal py-2 text-left motion-reduce:transition-none", FOCO)}
        >
          {passo}
        </Button>
      </span>
      {acao.bloqueio && acao.idBloqueio && (
        <div className="basis-full"><ExplicacaoDoPasso id={acao.idBloqueio} texto={acao.bloqueio} /></div>
      )}
    </li>
  );
}

/** Os itens em curso de uma pessoa, um por linha (pedidos e negócios). Sem itens não desenha nada. */
export function LinhaNegociosPessoa({ pessoaId, nome, itens, hoje, aoAbrir }: LinhaNegociosPessoaProps) {
  const { t } = useTranslation();
  if (itens.length === 0) return null;
  return (
    <ul role="list" aria-label={t("pessoasPagina.deals.list", { name: nome })} className="list-none divide-y divide-border p-0">
      {itens.map((item) => <SubLinha key={item.id} item={item} pessoaId={pessoaId} nome={nome} hoje={hoje} aoAbrir={aoAbrir} />)}
    </ul>
  );
}
