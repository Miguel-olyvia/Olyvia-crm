// As visitas da PESSOA no Resumo da ficha: uma só secção com as visitas dela (as canceladas aparecem marcadas, mas sozinhas não abrem a secção), por ordem cronológica, e o botão
// do passo da pessoa: "Marcar a visita como feita" (que abre o painel de visita e levantamento) ou, com a visita feita, "Criar o negócio".
// É o MESMO caminho dos botões do Quadro e da Lista (`useProcesso().executar`). Sem visitas, não há secção.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { ordenarVisitas } from "@/components/negocio-metas/visitasNegocio";
import { CarregarMais, type MaisItens } from "./CarregarMais";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa } from "./pessoasTipos";
import { ExplicacaoDoPasso } from "./processo/ExplicacaoDoPasso";
import { passoDoItem } from "./processo/passosProcesso";
import { useAcaoDoPasso } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { MarcaExemplo } from "./SelosPessoa";
import { LinhaVisitaPessoa } from "./LinhaVisitaPessoa";

const K = "pessoasPagina.nextVisit.";

interface SeccaoVisitasProps {
  pessoa: Pessoa;
  /** As visitas da pessoa (todas: por ligar e ligadas). */
  visitas: readonly VisitaPessoa[];
  /** O item do processo da pessoa em abordagem: o botão do passo executa-o; sem ele (ou sem `ProcessoProvider`) não há botão. */
  item: ItemProcesso | undefined;
  hoje: string;
  /** O nome de cada negócio, pelo id: uma visita ligada diz a que negócio. */
  negocios: ReadonlyMap<string, string>;
  alterarVisita?: AcoesFicha["alterarVisita"];
  /** A ficha real: alterar visitas grava na base pelo próprio diálogo. */
  naBase?: boolean;
  /** Cancela uma visita na base (a ficha real); sem isto não há «Cancelar visita». */
  cancelarVisita?: AcoesFicha["cancelarVisita"];
  aoRegistarResultado: (visitaId: string) => void;
  /** «Carregar mais» visitas (a ficha real). */
  mais?: MaisItens;
}

/** O botão do passo da pessoa, com a explicação do portão (se o passo não puder avançar) a seguir. */
function BotaoDoPasso({ item, nome }: { item: ItemProcesso; nome: string }) {
  const { t } = useTranslation();
  const acao = useAcaoDoPasso(item, () => {});
  if (!acao.executa) return null;
  const passo = t(passoDoItem(item).chave);
  return (
    <>
      <Button
        type="button" className={cn("min-h-11", FOCO)} aria-label={t("pessoasPagina.process.stepLabel", { step: passo, work: t("pessoasPagina.board.approach"), name: nome })}
        onClick={acao.aoClicar} {...acao.atributos}
      >
        {passo}
      </Button>
      {acao.bloqueio && acao.idBloqueio && <ExplicacaoDoPasso id={acao.idBloqueio} texto={acao.bloqueio} />}
    </>
  );
}

/**
 * O botão do passo da pessoa e a dica a seguir («marca a visita como feita» ou «cria o negócio à mão»). Vive no Resumo, junto da próxima visita
 * (ou no «Próximo passo e prazo» quando não há próxima); a aba Visitas usa `SeccaoVisitas` sem `item`, para não o repetir.
 */
export function AcaoDoPassoPessoa({ item, nome, feita }: { item: ItemProcesso; nome: string; feita: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-wrap gap-2 pt-1"><BotaoDoPasso item={item} nome={nome} /></div>
      <p className="text-sm text-muted-foreground">{t(`${K}${feita ? "doneHintDone" : "doneHint"}`)}</p>
    </>
  );
}

/** Há uma visita feita da pessoa, ainda por ligar a um negócio: o passo passa a ser criar o negócio. */
export const temVisitaFeitaPorLigar = (visitas: readonly VisitaPessoa[]): boolean => visitas.some((v) => v.negocioId === null && v.estado === "feita");

export function SeccaoVisitas({ pessoa, visitas, item, hoje, negocios, alterarVisita, naBase, cancelarVisita, aoRegistarResultado, mais }: SeccaoVisitasProps) {
  const { t } = useTranslation();
  const todas = ordenarVisitas(visitas) as VisitaPessoa[];
  if (!todas.some((v) => v.estado !== "cancelada")) return null;
  const feita = temVisitaFeitaPorLigar(todas);
  return (
    <Seccao titulo={t("pessoasPagina.reg.visits.title")} marca={<MarcaExemplo />}>
      <div className="space-y-2">
        <ul role="list" className="list-none divide-y divide-border p-0">
          {todas.map((v) => (
            <LinhaVisitaPessoa
              key={v.id} pessoa={pessoa} visita={v} negocio={v.negocioId ? negocios.get(v.negocioId) : undefined} hoje={hoje}
              alterarVisita={alterarVisita} naBase={naBase} cancelarVisita={cancelarVisita} aoRegistarResultado={aoRegistarResultado}
            />
          ))}
        </ul>
        <CarregarMais tipo="visitas" estado={mais} />
        {item && <AcaoDoPassoPessoa item={item} nome={pessoa.nome} feita={feita} />}
      </div>
    </Seccao>
  );
}
