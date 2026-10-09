/**
 * "Contratos a terminar": a lista do RH dos contratos com prazo cuja data de
 * fim vem ai (ou ja passou), de `rpc_hr_contratos_a_terminar`. Mostra, para cada
 * um, quanto falta, a regra que se aplica (e a sua fonte), as renovacoes ja
 * feitas, a resposta do responsavel directo e O QUE VAI ACONTECER -- tudo
 * calculado pela base; o ecra so apresenta.
 *
 * O filtro "dias" estreita o horizonte; sem escolha usa-se o da base. Clicar
 * numa linha abre o separador Contratos da pessoa, onde o RH renova ou termina.
 * Exige `hr.pessoas.vinculos.view` (quem monta este separador ja o verificou).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useContratosATerminar } from "@/hooks/useContratosATerminar";
import { useTranslation } from "@/hooks/useTranslation";
import type { OQueAcontece } from "@/lib/hr/fimContrato";

/** Os horizontes que o filtro oferece (so um filtro de leitura; nao e regra de negocio). */
const FILTROS_DIAS = [15, 30, 60, 90, 180] as const;
const SEM_FILTRO = "__omissao__";

function varianteDoQueAcontece(valor: OQueAcontece): "default" | "secondary" | "outline" | "destructive" {
  if (valor === "decisao_rh" || valor === "termina") return "destructive";
  if (valor === "desligado") return "outline";
  return "secondary";
}

interface ContratosATerminarTabProps {
  organizationId: string;
}

export function ContratosATerminarTab({ organizationId }: ContratosATerminarTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<string>(SEM_FILTRO);
  const dias = filtro === SEM_FILTRO ? null : Number(filtro);
  const { contratos, isLoading, error } = useContratosATerminar(organizationId, dias);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 pb-3">
        <CardTitle className="text-base">{t("hr.fimContrato.lista.titulo")}</CardTitle>
        <div className="space-y-1.5">
          <Label htmlFor="hr-fim-contrato-lista-dias" className="text-xs">
            {t("hr.fimContrato.lista.filtroDias")}
          </Label>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger id="hr-fim-contrato-lista-dias" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>{t("hr.fimContrato.lista.horizonteOmissao")}</SelectItem>
              {FILTROS_DIAS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("hr.fimContrato.lista.proximosDias", { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className={contratos.length > 0 ? "p-0" : undefined}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("common.loading")}
          </p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {t("hr.fimContrato.lista.erro")}
          </p>
        ) : contratos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.fimContrato.lista.vazia")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.fimContrato.lista.pessoa")}</TableHead>
                  <TableHead>{t("hr.fimContrato.lista.responsavel")}</TableHead>
                  <TableHead>{t("hr.contrato.tipoContrato")}</TableHead>
                  <TableHead>{t("hr.fimContrato.card.terminaA")}</TableHead>
                  <TableHead>{t("hr.fimContrato.lista.diasRestantes")}</TableHead>
                  <TableHead>{t("hr.fimContrato.card.renovacoesRealizadas")}</TableHead>
                  <TableHead>{t("hr.fimContrato.lista.regra")}</TableHead>
                  <TableHead>{t("hr.fimContrato.lista.resposta")}</TableHead>
                  <TableHead>{t("hr.fimContrato.lista.oQueAcontece")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratos.map((c) => (
                  <TableRow
                    key={c.vinculo_id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => navigate(`/rh/pessoas/${c.pessoa_id}?tab=contratos`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/rh/pessoas/${c.pessoa_id}?tab=contratos`);
                    }}
                  >
                    <TableCell className="font-medium">{c.pessoa_nome}</TableCell>
                    <TableCell>{c.responsavel_nome ?? "—"}</TableCell>
                    <TableCell>{t(`hr.tipoContrato.${c.tipo_contrato}`)}</TableCell>
                    <TableCell className="tabular-nums">{c.data_fim}</TableCell>
                    <TableCell className="tabular-nums">
                      {c.dias_restantes < 0
                        ? t("hr.fimContrato.lista.haDias", { n: Math.abs(c.dias_restantes) })
                        : c.dias_restantes}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {t("hr.fimContrato.card.renovacoesValor", {
                        realizadas: c.renovacoes_realizadas,
                        max: c.max_renovacoes,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.fonte === "personalizado" ? "default" : "secondary"} className="font-normal">
                        {t(`hr.fimContrato.fonte.${c.fonte}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.resposta ? t(`hr.fimContrato.resposta.${c.resposta}`) : t("hr.fimContrato.lista.semResposta")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={varianteDoQueAcontece(c.o_que_acontece)} className="font-normal">
                        {t(`hr.fimContrato.oQueAcontece.${c.o_que_acontece}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
