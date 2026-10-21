// O bloco «Por fechar» do Resumo da ficha: as visitas que já passaram e ainda estão Por fazer (ninguém as marcou como feitas), da mais antiga para a mais
// recente, cada uma com o seu aviso e o botão de registar o resultado, e o botão do passo da pessoa (que o bloco «Próxima visita» deixa de repetir).
// Sem visitas por fechar o bloco não aparece. A lista completa vive na aba Visitas.
import { useTranslation } from "@/hooks/useTranslation";
import { Seccao } from "@/components/ficha-comum/Seccao";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { LinhaVisitaPessoa } from "./LinhaVisitaPessoa";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa } from "./pessoasTipos";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { MarcaExemplo } from "./SelosPessoa";
import { AcaoDoPassoPessoa, temVisitaFeitaPorLigar } from "./SeccaoVisitas";

const K = "pessoasPagina.nextVisit.";

interface SeccaoVisitasPorFecharProps {
  pessoa: Pessoa;
  /** As visitas por fechar (de `visitasPorFechar`); sem elas o bloco não se desenha. */
  porFechar: readonly VisitaPessoa[];
  /** Todas as visitas à vista da pessoa: dizem se o passo é criar o negócio. */
  visitas: readonly VisitaPessoa[];
  /** O item do processo da pessoa: com ele o bloco leva o botão do passo. */
  item: ItemProcesso | undefined;
  hoje: string;
  negocios: ReadonlyMap<string, string>;
  alterarVisita?: AcoesFicha["alterarVisita"];
  naBase?: boolean;
  cancelarVisita?: AcoesFicha["cancelarVisita"];
  aoRegistarResultado: (visitaId: string) => void;
}

export function SeccaoVisitasPorFechar(p: SeccaoVisitasPorFecharProps) {
  const { t } = useTranslation();
  if (p.porFechar.length === 0) return null;
  return (
    <Seccao titulo={t(`${K}toCloseTitle`)} marca={<MarcaExemplo />}>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t(`${K}toCloseHint`)}</p>
        <ul role="list" className="list-none divide-y divide-border p-0">
          {p.porFechar.map((v) => (
            <LinhaVisitaPessoa
              key={v.id} pessoa={p.pessoa} visita={v} negocio={v.negocioId ? p.negocios.get(v.negocioId) : undefined} hoje={p.hoje}
              alterarVisita={p.alterarVisita} naBase={p.naBase} cancelarVisita={p.cancelarVisita} aoRegistarResultado={p.aoRegistarResultado}
            />
          ))}
        </ul>
        {p.item && <AcaoDoPassoPessoa item={p.item} nome={p.pessoa.nome} feita={temVisitaFeitaPorLigar(p.visitas)} />}
      </div>
    </Seccao>
  );
}
