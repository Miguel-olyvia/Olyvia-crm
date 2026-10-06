/**
 * Os periodos do salario de UM cargo (`hr_cargos_periodos`, fluxo 2), do mais
 * recente para o mais antigo: vigente, agendado e historico. So leitura -- o
 * salario muda-se por "Alterar salario" (`CargoSalarioDialog`).
 */
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/hooks/useTranslation";
import {
  estadoDoPeriodo,
  formatarSalario,
  type EstadoDoPeriodo,
  type HrCargoPeriodo,
} from "@/lib/hr/cargosPeriodos";

interface CargoPeriodosListaProps {
  /** So os periodos deste cargo. */
  periodos: HrCargoPeriodo[];
  hoje: string;
}

const CHAVE_POR_ESTADO: Record<EstadoDoPeriodo, string> = {
  vigente: "hr.cargos.periodos.vigente",
  agendado: "hr.cargos.periodos.agendado",
  passado: "hr.cargos.periodos.historico",
};

export function CargoPeriodosLista({ periodos, hoje }: CargoPeriodosListaProps) {
  const { t } = useTranslation();

  if (periodos.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("hr.cargos.periodos.semPeriodos")}</p>;
  }

  const ordenados = [...periodos].sort((a, b) => b.valido_de.localeCompare(a.valido_de));

  return (
    <Table>
      <TableCaption className="sr-only">{t("hr.cargos.periodos.titulo")}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28" />
          <TableHead>{t("hr.cargos.coluna.salario")}</TableHead>
          <TableHead>{t("hr.cargos.periodos.desde")}</TableHead>
          <TableHead>{t("hr.cargos.periodos.ate")}</TableHead>
          <TableHead>{t("hr.cargos.periodos.motivo")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordenados.map((p) => {
          const estado = estadoDoPeriodo(p, hoje);
          return (
            <TableRow key={p.id}>
              <TableCell>
                <Badge variant={estado === "passado" ? "secondary" : "default"} className="text-[10px]">
                  {t(CHAVE_POR_ESTADO[estado])}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {formatarSalario(
                  { salarioBase: p.salario_base, periodicidade: p.periodicidade },
                  (chave) => t(chave),
                )}
              </TableCell>
              <TableCell className="tabular-nums">{p.valido_de}</TableCell>
              <TableCell className="tabular-nums">{p.valido_ate ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{p.motivo ?? "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
