/**
 * Os ajustes do periodo, incluindo os anulados.
 *
 * UM AJUSTE ANULADO NAO DESAPARECE
 * --------------------------------
 * Fica riscado, com quem anulou, quando e porque. Anular e um lancamento e nao
 * um apagamento -- e a linha que some e a que faz um contador mudar sem
 * ninguem saber porque.
 *
 * QUEM LE ISTO
 * ------------
 * So `hr.ausencias.direitos.view` e a propria pessoa. A CHEFIA NAO LE: a RLS
 * de `pessoas_ausencias_ajustes` tem so dois ramos. Por isso quem chama passa
 * `recusado` e o bloco nao se desenha -- nunca se desenha vazio, que a chefia
 * leria como "nao ha ajustes".
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TipoEtiqueta } from "@/components/hr/ausencias/TipoEtiqueta";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarDias } from "@/lib/hr/ausencias";
import { cn } from "@/lib/utils";
import type { AusenciaAjuste, AusenciaTipo } from "@/types/hrAusencias";

interface AjustesTabelaProps {
  ajustes: AusenciaAjuste[];
  tiposPorId: Map<string, AusenciaTipo>;
  podeAnular: boolean;
  onAnular?: (ajusteId: string) => void;
}

export function AjustesTabela({
  ajustes,
  tiposPorId,
  podeAnular,
  onAnular,
}: AjustesTabelaProps) {
  const { t } = useTranslation();

  if (ajustes.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("hr.ausencias.ajuste.semAjustes")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("hr.ausencias.ajuste.data")}</TableHead>
            <TableHead>{t("hr.ausencias.lista.tipo")}</TableHead>
            <TableHead className="text-right">{t("hr.ausencias.ajuste.dias")}</TableHead>
            <TableHead>{t("hr.ausencias.ajuste.motivoCodigo")}</TableHead>
            <TableHead>{t("hr.ausencias.campo.motivo")}</TableHead>
            {podeAnular && <TableHead className="w-0" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ajustes.map((ajuste) => {
            const anulado = ajuste.anulado_em !== null;
            const positivo = Number(ajuste.dias) > 0;
            return (
              <TableRow key={ajuste.id} className={anulado ? "opacity-60" : undefined}>
                <TableCell className={cn("whitespace-nowrap", anulado && "line-through")}>
                  {ajuste.aplicado_em.slice(0, 10)}
                </TableCell>
                <TableCell>
                  <TipoEtiqueta
                    tipo={tiposPorId.get(ajuste.tipo_id) ?? null}
                    nomeAlternativo={t("hr.ausencias.tipoDesconhecido")}
                  />
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    anulado && "line-through",
                    !anulado && (positivo ? "text-emerald-600" : "text-amber-600"),
                  )}
                >
                  {positivo ? "+" : "−"}
                  {formatarDias(Math.abs(Number(ajuste.dias)))}
                </TableCell>
                <TableCell>{t(`hr.ausencias.motivoAjuste.${ajuste.motivo_codigo}`)}</TableCell>
                <TableCell className="max-w-[20rem]">
                  <span className={anulado ? "line-through" : undefined}>{ajuste.motivo}</span>
                  {anulado && (
                    <p className="text-xs text-muted-foreground">
                      {t("hr.ausencias.ajuste.anuladoEm", {
                        data: (ajuste.anulado_em ?? "").slice(0, 10),
                        motivo: ajuste.anulacao_motivo ?? "—",
                      })}
                    </p>
                  )}
                </TableCell>
                {podeAnular && (
                  <TableCell>
                    {!anulado && onAnular && (
                      <Button size="sm" variant="ghost" onClick={() => onAnular(ajuste.id)}>
                        {t("hr.ausencias.ajuste.anular")}
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
