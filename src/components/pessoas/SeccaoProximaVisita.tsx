// O bloco «Próxima visita» do Resumo da ficha: só a primeira visita por fazer a partir de hoje, com «Ver todas» (que abre a aba Visitas) e o botão
// do passo da pessoa («Marcar a visita como feita» ou «Criar o negócio»). Sem próxima visita o bloco não aparece. A lista completa vive na aba Visitas.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { LinhaVisitaPessoa } from "./LinhaVisitaPessoa";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa } from "./pessoasTipos";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { MarcaExemplo } from "./SelosPessoa";
import { AcaoDoPassoPessoa, temVisitaFeitaPorLigar } from "./SeccaoVisitas";

const K = "pessoasPagina.nextVisit.";

interface SeccaoProximaVisitaProps {
  pessoa: Pessoa;
  /** A próxima visita (de `proximaVisitaDaPessoa`); sem ela o bloco não se desenha. */
  visita: VisitaPessoa | undefined;
  /** Todas as visitas à vista da pessoa: dizem quantas há e se o passo é criar o negócio. */
  visitas: readonly VisitaPessoa[];
  /** Quantas visitas não canceladas há (o número da aba Visitas). */
  total: number;
  item: ItemProcesso | undefined;
  hoje: string;
  negocios: ReadonlyMap<string, string>;
  alterarVisita?: AcoesFicha["alterarVisita"];
  naBase?: boolean;
  cancelarVisita?: AcoesFicha["cancelarVisita"];
  aoRegistarResultado: (visitaId: string) => void;
  /** As visitas onde se fez um levantamento (só o exemplo). */
  comLevantamento?: ReadonlySet<string>;
  /** Abre a aba Visitas. */
  aoVerTodas: () => void;
}

export function SeccaoProximaVisita(p: SeccaoProximaVisitaProps) {
  const { t } = useTranslation();
  if (!p.visita) return null;
  return (
    <Seccao titulo={t(`${K}title`)} marca={<MarcaExemplo />}>
      <div className="space-y-2">
        <ul role="list" className="list-none divide-y divide-border p-0">
          <LinhaVisitaPessoa
            pessoa={p.pessoa} visita={p.visita} negocio={p.visita.negocioId ? p.negocios.get(p.visita.negocioId) : undefined} hoje={p.hoje}
            alterarVisita={p.alterarVisita} naBase={p.naBase} cancelarVisita={p.cancelarVisita} aoRegistarResultado={p.aoRegistarResultado} comLevantamento={p.comLevantamento?.has(p.visita.id)}
          />
        </ul>
        <Button
          type="button" variant="link" aria-label={t(`${K}seeAllLabel`, { count: p.total })} onClick={p.aoVerTodas}
          className={cn("relative h-auto min-h-11 px-0 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']", FOCO)}
        >
          {t(`${K}seeAll`)}
        </Button>
        {p.item && <AcaoDoPassoPessoa item={p.item} nome={p.pessoa.nome} feita={temVisitaFeitaPorLigar(p.visitas)} />}
      </div>
    </Seccao>
  );
}
