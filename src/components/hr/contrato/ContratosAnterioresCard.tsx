/**
 * Os contratos anteriores da pessoa, em leitura (o historico de VERSOES).
 *
 * O historico nao se edita: mudar de 40h para 20h nao e editar o passado, e
 * fechar o vinculo e abrir outro. O DELETE esta bloqueado por politica na
 * base. Saiu de `PessoaContratoTab.tsx`. Sem contratos anteriores nao mostra
 * nada.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/hooks/useTranslation";
import type { PessoaVinculo } from "@/types/hr";

interface ContratosAnterioresCardProps {
  historico: PessoaVinculo[];
}

export function ContratosAnterioresCard({ historico }: ContratosAnterioresCardProps) {
  const { t } = useTranslation();
  if (historico.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.contrato.historico")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("hr.contrato.tipoContrato")}</TableHead>
                <TableHead>{t("hr.contrato.regimeContratual")}</TableHead>
                <TableHead>{t("hr.contrato.dataInicio")}</TableHead>
                <TableHead>{t("hr.contrato.dataFim")}</TableHead>
                <TableHead>{t("hr.contrato.estado")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((vinculo) => (
                <TableRow key={vinculo.id}>
                  <TableCell>{t(`hr.tipoContrato.${vinculo.tipo_contrato}`)}</TableCell>
                  <TableCell>
                    {t(`hr.regimeContratual.${vinculo.regime_contratual ?? "individual"}`)}
                  </TableCell>
                  <TableCell className="tabular-nums">{vinculo.data_inicio}</TableCell>
                  <TableCell className="tabular-nums">{vinculo.data_fim ?? "—"}</TableCell>
                  <TableCell>{t(`hr.estadoVinculo.${vinculo.estado}`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
