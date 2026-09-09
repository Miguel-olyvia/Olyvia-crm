/**
 * O contador do periodo: adquiridos, utilizados, PENDENTES e disponiveis.
 *
 * O QUARTO NUMERO
 * ---------------
 * O Factorial mostra tres (adquiridos, disponiveis, utilizados). Aqui sao
 * quatro, e o quarto e indispensavel: com aprovacao em dois passos ha sempre
 * dias pedidos e ainda por decidir. Quem visse "disponiveis: 12,5" sem saber
 * que 5 ja estao pedidos pedia a dobrar.
 *
 * ADQUIRIDOS NAO E O DIREITO
 * --------------------------
 * E direito + ajustes positivos. Quando ha ajustes no periodo, o numero ganha
 * um botao que abre a lista deles -- e assim que um ajuste manual deixa de ser
 * uma alteracao silenciosa do contador. Sem ajustes, nenhum botao.
 *
 * O ZERO QUE MENTE
 * ----------------
 * `v_hr_ausencias_saldos` e `security_invoker`: sem permissao de leitura vem
 * zeros e nao um erro. Por isso quem chama passa `recusado` e este componente
 * mostra o bloco de sem acesso -- nunca um zero.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { TipoEtiqueta, corDoTipo } from "@/components/hr/ausencias/TipoEtiqueta";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarDias } from "@/lib/hr/ausencias";
import { SlidersHorizontal } from "lucide-react";
import type { AusenciaSaldo, AusenciaTipo } from "@/types/hrAusencias";

interface AusenciasContadorProps {
  saldos: AusenciaSaldo[];
  tiposPorId: Map<string, AusenciaTipo>;
  periodoInicio: string | null;
  recusado: boolean;
  /** Presente = ha ajustes para mostrar naquele tipo e periodo. */
  onVerAjustes?: (tipoId: string) => void;
  compacto?: boolean;
}

function Medida({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium tabular-nums">{formatarDias(valor)}</dd>
    </div>
  );
}

/** A proporcao entre utilizados, pendentes e disponiveis, sem eixo nem numeros. */
function Barra({ saldo, cor }: { saldo: AusenciaSaldo; cor: string }) {
  const utilizados = Math.max(Number(saldo.utilizados), 0);
  const pendentes = Math.max(Number(saldo.pendentes), 0);
  const disponiveis = Math.max(Number(saldo.disponiveis), 0);
  const total = utilizados + pendentes + disponiveis;
  if (total <= 0) return null;
  const parte = (valor: number) => `${(valor / total) * 100}%`;

  return (
    <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-muted">
      <div style={{ width: parte(utilizados), backgroundColor: cor }} />
      <div
        style={{
          width: parte(pendentes),
          backgroundImage: `repeating-linear-gradient(45deg, ${cor}, ${cor} 3px, transparent 3px, transparent 6px)`,
        }}
      />
    </div>
  );
}

export function AusenciasContador({
  saldos,
  tiposPorId,
  periodoInicio,
  recusado,
  onVerAjustes,
  compacto,
}: AusenciasContadorProps) {
  const { t } = useTranslation();

  if (recusado) return <SemAcessoCard />;

  const doPeriodo = periodoInicio
    ? saldos.filter((saldo) => saldo.periodo_inicio === periodoInicio)
    : saldos;

  // Primeiro os que descontam saldo: sao os que interessam a quem olha.
  const ordenados = [...doPeriodo].sort((a, b) => {
    const tipoA = tiposPorId.get(a.tipo_id);
    const tipoB = tiposPorId.get(b.tipo_id);
    const pesoA = tipoA?.desconta_saldo ? 0 : 1;
    const pesoB = tipoB?.desconta_saldo ? 0 : 1;
    if (pesoA !== pesoB) return pesoA - pesoB;
    return (tipoA?.nome ?? "").localeCompare(tipoB?.nome ?? "");
  });

  if (ordenados.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("hr.ausencias.contador.semDireito")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className={
        compacto
          ? "grid gap-3 sm:grid-cols-2"
          : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {ordenados.map((saldo) => {
        const tipo = tiposPorId.get(saldo.tipo_id) ?? null;
        const temAjustes = Number(saldo.ajustes) !== 0;
        return (
          <Card key={`${saldo.tipo_id}-${saldo.periodo_inicio}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
                <TipoEtiqueta tipo={tipo} nomeAlternativo={t("hr.ausencias.tipoDesconhecido")} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {t("hr.ausencias.contador.diasValor", {
                    valor: formatarDias(Number(saldo.disponiveis)),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("hr.ausencias.contador.disponiveis")}
                </p>
              </div>

              <Barra saldo={saldo} cor={corDoTipo(tipo)} />

              <dl className="grid grid-cols-4 gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t("hr.ausencias.contador.adquiridos")}
                  </dt>
                  <dd className="flex items-center gap-1 text-sm font-medium tabular-nums">
                    {formatarDias(Number(saldo.adquiridos))}
                    {temAjustes && onVerAjustes && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        aria-label={t("hr.ausencias.contador.verAjustes")}
                        title={t("hr.ausencias.contador.verAjustes")}
                        onClick={() => onVerAjustes(saldo.tipo_id)}
                      >
                        <SlidersHorizontal className="h-3 w-3" />
                      </Button>
                    )}
                  </dd>
                </div>
                <Medida
                  rotulo={t("hr.ausencias.contador.utilizados")}
                  valor={Number(saldo.utilizados)}
                />
                <Medida
                  rotulo={t("hr.ausencias.contador.pendentes")}
                  valor={Number(saldo.pendentes)}
                />
                <Medida
                  rotulo={t("hr.ausencias.contador.disponiveis")}
                  valor={Number(saldo.disponiveis)}
                />
              </dl>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
