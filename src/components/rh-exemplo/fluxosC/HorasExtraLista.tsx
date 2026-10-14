/** A lista de trabalho do RH: horas extra de toda a organização, com filtros por estado e Confirmar / Rejeitar. */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useTranslation } from "@/hooks/useTranslation";
import { DecidirHoraExtraDialog, type PedidoDecisao } from "./DecidirHoraExtraDialog";
import { EstadoHoraExtraBadge } from "./EstadoHoraExtraBadge";
import { dataCurta, minutosEmHoras } from "./formatosC";
import { estadoVisivel, type EstadoVisivelHE, type HoraExtra } from "./horasExtraRegras";
import { useFluxosC } from "./lojaFluxosC";

type Filtro = "todas" | EstadoVisivelHE;
const FILTROS: Filtro[] = ["todas", "pendente", "acima_limite", "confirmada", "rejeitada"];

export function HorasExtraLista() {
  const { t } = useTranslation();
  const horas = useFluxosC((e) => e.horasExtra);
  const fichas = useEstadoRh((e) => e.fichas);
  const [filtro, setFiltro] = useState<Filtro>("pendente");
  const [pedido, setPedido] = useState<PedidoDecisao | null>(null);

  const nome = (id: string): string => fichas[id]?.pessoa.nome_completo ?? id;
  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todas: horas.length, pendente: 0, acima_limite: 0, confirmada: 0, rejeitada: 0 };
    horas.forEach((h) => { c[estadoVisivel(h)] += 1; });
    return c;
  }, [horas]);
  const visiveis = useMemo(
    () => horas.filter((h) => filtro === "todas" || estadoVisivel(h) === filtro).sort((a, b) => b.data.localeCompare(a.data)),
    [horas, filtro],
  );

  const decidir = (hora: HoraExtra, decisao: "confirmar" | "rejeitar") => setPedido({ hora, decisao, pessoaNome: nome(hora.pessoaId) });

  return (
    <section aria-labelledby="he-lista-titulo" className="space-y-3">
      <h2 id="he-lista-titulo" className="text-base font-semibold">{t("rhFluxosC.he.lista.titulo")}</h2>
      <div role="group" aria-label={t("rhFluxosC.he.lista.filtros")} className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filtro === f ? "default" : "outline"}
            aria-pressed={filtro === f}
            className="min-h-11"
            onClick={() => setFiltro(f)}
          >
            {t(`rhFluxosC.he.filtro.${f}`)} ({contagem[f]})
          </Button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("rhFluxosC.he.lista.vazio")}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("rhFluxosC.he.lista.titulo")}</caption>
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  {["pessoa", "dia", "tempo", "origem", "estado", "acoes"].map((c) => (
                    <th key={c} scope="col" className={`px-4 py-2 ${c === "acoes" ? "text-right" : ""}`}>{t(`rhFluxosC.he.coluna.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((h) => (
                  <LinhaHoraExtra key={h.id} hora={h} nome={nome(h.pessoaId)} aoDecidir={decidir} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <DecidirHoraExtraDialog pedido={pedido} aoFechar={() => setPedido(null)} />
    </section>
  );
}

interface LinhaProps {
  hora: HoraExtra;
  nome: string;
  aoDecidir: (hora: HoraExtra, decisao: "confirmar" | "rejeitar") => void;
}

function LinhaHoraExtra({ hora, nome, aoDecidir }: LinhaProps) {
  const { t } = useTranslation();
  const pendente = hora.estado === "pendente";
  return (
    <tr className="border-b align-top last:border-b-0">
      <th scope="row" className="px-4 py-3 text-left font-medium">{nome}</th>
      <td className="px-4 py-3 tabular-nums">{dataCurta(hora.data)}</td>
      <td className="px-4 py-3 tabular-nums">
        {minutosEmHoras(hora.minutos)}
        {hora.nocturnoMin > 0 && (
          <span className="block text-xs text-muted-foreground">{t("rhFluxosC.he.nocturnoDe").replace("{t}", minutosEmHoras(hora.nocturnoMin))}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span>{t(`rhFluxosC.he.origem.${hora.origem}`)}</span>
        {hora.motivoOrigem && <span className="block text-xs text-muted-foreground">{hora.motivoOrigem}</span>}
        {hora.motivoDecisao && (
          <span className="block text-xs text-muted-foreground">{t("rhFluxosC.he.motivoDecisao").replace("{m}", hora.motivoDecisao)}</span>
        )}
      </td>
      <td className="px-4 py-3"><EstadoHoraExtraBadge estado={estadoVisivel(hora)} /></td>
      <td className="px-4 py-3 text-right">
        {pendente && (
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" className="min-h-11" onClick={() => aoDecidir(hora, "confirmar")}
              aria-label={`${t("rhFluxosC.he.acao.confirmar")}: ${nome}, ${dataCurta(hora.data)}`}>
              {t("rhFluxosC.he.acao.confirmar")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => aoDecidir(hora, "rejeitar")}
              aria-label={`${t("rhFluxosC.he.acao.rejeitar")}: ${nome}, ${dataCurta(hora.data)}`}>
              {t("rhFluxosC.he.acao.rejeitar")}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
