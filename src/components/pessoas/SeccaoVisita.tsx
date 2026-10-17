// As visitas de um pedido no Resumo da ficha: uma secção por pedido com visitas (a pessoa pode ter vários pedidos em paralelo, cada um com
// as suas visitas). Diz de que pedido são, lista as visitas e tem o botão do passo do pedido: "Marcar a visita como feita" (que abre o
// painel de visita e levantamento) ou, com a visita feita e as medidas guardadas, "Criar o negócio". É o MESMO caminho dos botões do
// Quadro e da Lista (`useProcesso().executar`). Uma visita cujo dia já passou diz "Visita por concluir"; sem visitas, não há secção.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ordenarVisitas } from "@/components/negocio-metas/visitasNegocio";
import { nomeDoPedido, prazoDoPedido } from "./pedidoNegocio";
import type { AcoesFicha } from "./PainelBase";
import type { PedidoNegocio, Pessoa } from "./pessoasTipos";
import { ExplicacaoDoPasso } from "./processo/ExplicacaoDoPasso";
import { passoDoItem } from "./processo/passosProcesso";
import { useAcaoDoPasso } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { MarcaExemplo } from "./SelosPessoa";
import { VisitaDoPedido } from "./VisitaDoPedido";

const K = "pessoasPagina.nextVisit.";

interface SeccaoVisitaProps {
  pessoa: Pessoa;
  pedido: PedidoNegocio;
  /** Todos os pedidos da pessoa: o nome do pedido distingue-se dos outros (ver `nomeDoPedido`). */
  pedidos: readonly PedidoNegocio[];
  /** O item do processo deste pedido: o botão do passo executa-o; sem ele (ou sem `ProcessoProvider`) não há botão. */
  item: ItemProcesso | undefined;
  hoje: string;
  alterarVisita: AcoesFicha["alterarVisita"];
}

/** O botão do passo do pedido, com a explicação do portão (se o passo não puder avançar) a seguir. */
function BotaoDoPasso({ item, trabalho, nome }: { item: ItemProcesso; trabalho: string; nome: string }) {
  const { t } = useTranslation();
  const acao = useAcaoDoPasso(item, () => {});
  if (!acao.executa) return null;
  const passo = t(passoDoItem(item).chave);
  return (
    <>
      <Button
        type="button" className={cn("min-h-11", FOCO)} aria-label={t("pessoasPagina.process.stepLabel", { step: passo, work: trabalho, name: nome })}
        onClick={acao.aoClicar} {...acao.atributos}
      >
        {passo}
      </Button>
      {acao.bloqueio && acao.idBloqueio && <ExplicacaoDoPasso id={acao.idBloqueio} texto={acao.bloqueio} />}
    </>
  );
}

export function SeccaoPedidoVisita({ pessoa, pedido, pedidos, item, hoje, alterarVisita }: SeccaoVisitaProps) {
  const { t } = useTranslation();
  const visitas = ordenarVisitas(pedido.visitas).filter((v) => v.estado !== "cancelada");
  const feita = visitas.some((v) => v.estado === "feita");
  const proxima = prazoDoPedido(pedido);
  const porConcluir = proxima !== null && proxima < hoje;
  const titulo = t(`${K}${feita ? "titleDone" : porConcluir ? "titleOverdue" : "title"}`);
  const trabalho = nomeDoPedido(t, pedido, pedidos);
  return (
    <Seccao titulo={`${titulo} · ${trabalho}`} marca={<MarcaExemplo />}>
      <div className="space-y-2">
        <p className="text-[15px] text-foreground">{t(`${K}request`, { service: trabalho })}</p>
        <ul role="list" className="list-none divide-y divide-border p-0">
          {visitas.map((v) => (
            <VisitaDoPedido key={v.id} pessoa={pessoa} pedidoId={pedido.id} visita={v} trabalho={trabalho} hoje={hoje} alterarVisita={alterarVisita} />
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">{item && <BotaoDoPasso item={item} trabalho={trabalho} nome={pessoa.nome} />}</div>
        <p className="text-sm text-muted-foreground">{t(`${K}${feita ? "doneHintDone" : "doneHint"}`)}</p>
      </div>
    </Seccao>
  );
}
