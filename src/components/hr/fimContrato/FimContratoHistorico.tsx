/**
 * O que ja aconteceu no fim deste contrato: as indicacoes do responsavel
 * directo, as renovacoes (automaticas, manuais e conversoes em sem termo) e os
 * avisos enviados. So leitura; os dados vem de `usePessoaContratoFim`.
 *
 * A indicacao do responsavel e uma OPINIAO: "pretendo continuar" nao renova
 * nada. Quem renova ou termina e o RH, no cartao.
 */
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/hooks/useTranslation";
import type { AvisoContrato, IndicacaoContrato, RenovacaoContrato } from "@/lib/hr/fimContrato";

interface FimContratoHistoricoProps {
  indicacoes: IndicacaoContrato[];
  renovacoes: RenovacaoContrato[];
  avisos: AvisoContrato[];
  /** O fim actual do contrato: a indicacao deste ciclo destaca-se. */
  dataFimActual: string | null;
}

function dia(iso: string): string {
  return iso.slice(0, 10);
}

function quando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString();
}

export function FimContratoHistorico({
  indicacoes,
  renovacoes,
  avisos,
  dataFimActual,
}: FimContratoHistoricoProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="text-sm font-medium">{t("hr.fimContrato.indicacao.titulo")}</h4>
        {indicacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.fimContrato.indicacao.vazia")}</p>
        ) : (
          <ul className="space-y-1.5">
            {indicacoes.map((indicacao) => (
              <li key={indicacao.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge
                  variant={indicacao.ciclo_fim === dataFimActual ? "default" : "outline"}
                  className="font-normal"
                >
                  {t(`hr.fimContrato.resposta.${indicacao.resposta}`)}
                </Badge>
                <span className="text-muted-foreground">
                  {t("hr.fimContrato.indicacao.detalhe", {
                    fim: dia(indicacao.ciclo_fim),
                    quando: quando(indicacao.indicada_em),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">{t("hr.fimContrato.historico.renovacoesTitulo")}</h4>
        {renovacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.fimContrato.historico.renovacoesVazio")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.fimContrato.historico.numero")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.tipo")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.fimAnterior")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.fimNovo")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.quando")}</TableHead>
                  <TableHead>{t("hr.fimContrato.motivo")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renovacoes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{r.numero}</TableCell>
                    <TableCell>{t(`hr.fimContrato.renovacaoTipo.${r.tipo}`)}</TableCell>
                    <TableCell className="tabular-nums">{r.data_fim_anterior}</TableCell>
                    <TableCell className="tabular-nums">{r.data_fim_nova ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{quando(r.feita_em)}</TableCell>
                    <TableCell>{r.motivo ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">{t("hr.fimContrato.historico.avisosTitulo")}</h4>
        {avisos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.fimContrato.historico.avisosVazio")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.fimContrato.historico.cicloFim")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.marco")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.destino")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.estado")}</TableHead>
                  <TableHead>{t("hr.fimContrato.historico.quando")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avisos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="tabular-nums">{a.ciclo_fim}</TableCell>
                    <TableCell>{t(`hr.fimContrato.marco.${a.marco}`)}</TableCell>
                    <TableCell>{t(`hr.fimContrato.destino.${a.destino}`)}</TableCell>
                    <TableCell>{t(`hr.fimContrato.avisoEstado.${a.estado}`)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{quando(a.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
