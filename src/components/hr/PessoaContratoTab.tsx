/**
 * O separador Contratos da ficha: o vinculo activo, editavel, e o historico.
 *
 * PORQUE O HISTORICO NAO SE EDITA
 * -------------------------------
 * `pessoas_vinculos` guarda versoes: um vinculo activo por pessoa (indice
 * unico parcial `idx_pessoas_vinculos_um_activo`) e os anteriores em
 * `terminado`. Mudar de 40h para 20h nao e editar o passado -- e fechar o
 * vinculo e abrir outro. Aqui edita-se o ACTIVO; os outros mostram-se em
 * leitura, e o DELETE esta bloqueado por politica na base.
 *
 * O tempo de trabalho (modalidade, frequencia, FTE, dias uteis, feriados,
 * maximos) vive na MESMA linha do contrato, e nao numa tabela ao lado, por
 * isso mesmo: se vivesse noutra tabela, uma alteracao de jornada nao criava
 * versao nova de contrato.
 */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import {
  DIAS_SEMANA,
  HORAS_FREQUENCIAS,
  PERIODICIDADES,
  POLITICAS_FERIADOS,
  REGIMES_TRABALHO,
  TIPOS_CONTRATO,
  TIPOS_TRABALHO,
  type DiaSemana,
  type HorasFrequencia,
  type Periodicidade,
  type PessoaRetribuicao,
  type PessoaVinculo,
  type PoliticaFeriados,
  type RegimeTrabalho,
  type TipoContrato,
  type TipoTrabalho,
} from "@/types/hr";

interface PessoaContratoTabProps {
  vinculos: PessoaVinculo[];
  retribuicao: PessoaRetribuicao | null;
  podeEditar: boolean;
  /** `hr.pessoas.retribuicao.view`: o salario tem permissao propria. */
  podeVerRetribuicao: boolean;
  saving: boolean;
  onGuardarVinculo: (
    vinculoId: string | null,
    patch: Partial<PessoaVinculo>,
  ) => Promise<string | null>;
}

type Rascunho = {
  tipo_contrato: TipoContrato;
  regime: RegimeTrabalho;
  data_inicio: string;
  data_fim: string;
  motivo_termo: string;
  periodo_experimental_dias: string;
  periodo_experimental_ate: string;
  tipo_trabalho: string;
  horas_semanais: string;
  horas_frequencia: HorasFrequencia;
  tempo_trabalho_pct: string;
  politica_feriados: PoliticaFeriados;
  horas_anuais_maximas: string;
  horas_semanais_maximas: string;
  dias_uteis: DiaSemana[];
};

function rascunhoDe(vinculo: PessoaVinculo | null): Rascunho {
  return {
    tipo_contrato: vinculo?.tipo_contrato ?? "sem_termo",
    regime: vinculo?.regime ?? "tempo_inteiro",
    data_inicio: vinculo?.data_inicio ?? "",
    data_fim: vinculo?.data_fim ?? "",
    motivo_termo: vinculo?.motivo_termo ?? "",
    periodo_experimental_dias:
      vinculo?.periodo_experimental_dias == null ? "" : String(vinculo.periodo_experimental_dias),
    periodo_experimental_ate: vinculo?.periodo_experimental_ate ?? "",
    tipo_trabalho: vinculo?.tipo_trabalho ?? "",
    horas_semanais: vinculo?.horas_semanais == null ? "" : String(vinculo.horas_semanais),
    horas_frequencia: vinculo?.horas_frequencia ?? "semanal",
    tempo_trabalho_pct:
      vinculo?.tempo_trabalho_pct == null ? "" : String(vinculo.tempo_trabalho_pct),
    politica_feriados: vinculo?.politica_feriados ?? "nao_laboral",
    horas_anuais_maximas:
      vinculo?.horas_anuais_maximas == null ? "" : String(vinculo.horas_anuais_maximas),
    horas_semanais_maximas:
      vinculo?.horas_semanais_maximas == null ? "" : String(vinculo.horas_semanais_maximas),
    dias_uteis: vinculo?.dias_uteis ?? [],
  };
}

function numeroOuNull(valor: string): number | null {
  const limpo = valor.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function textoOuNull(valor: string): string | null {
  return valor.trim() === "" ? null : valor.trim();
}

export function PessoaContratoTab({
  vinculos,
  retribuicao,
  podeEditar,
  podeVerRetribuicao,
  saving,
  onGuardarVinculo,
}: PessoaContratoTabProps) {
  const { t } = useTranslation();
  const activo = useMemo(
    () => vinculos.find((vinculo) => vinculo.estado === "activo") ?? null,
    [vinculos],
  );
  const historico = useMemo(
    () => vinculos.filter((vinculo) => vinculo.id !== activo?.id),
    [vinculos, activo?.id],
  );

  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoDe(activo));
  useEffect(() => {
    setRascunho(rascunhoDe(activo));
  }, [activo]);

  const definir = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) =>
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));

  const gravar = async () => {
    if (rascunho.data_inicio.trim() === "") {
      toast.error(t("hr.contrato.erroSemDataInicio"));
      return;
    }
    const erro = await onGuardarVinculo(activo?.id ?? null, {
      tipo_contrato: rascunho.tipo_contrato,
      regime: rascunho.regime,
      data_inicio: rascunho.data_inicio,
      data_fim: textoOuNull(rascunho.data_fim),
      motivo_termo: textoOuNull(rascunho.motivo_termo),
      periodo_experimental_dias: numeroOuNull(rascunho.periodo_experimental_dias),
      periodo_experimental_ate: textoOuNull(rascunho.periodo_experimental_ate),
      tipo_trabalho:
        rascunho.tipo_trabalho === "" ? null : (rascunho.tipo_trabalho as TipoTrabalho),
      horas_semanais: numeroOuNull(rascunho.horas_semanais),
      horas_frequencia: rascunho.horas_frequencia,
      tempo_trabalho_pct: numeroOuNull(rascunho.tempo_trabalho_pct),
      politica_feriados: rascunho.politica_feriados,
      horas_anuais_maximas: numeroOuNull(rascunho.horas_anuais_maximas),
      horas_semanais_maximas: numeroOuNull(rascunho.horas_semanais_maximas),
      dias_uteis: rascunho.dias_uteis.length > 0 ? rascunho.dias_uteis : null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t("hr.contrato.activoTitulo")}
          </CardTitle>
          {activo ? (
            <Badge variant="secondary" className="font-normal">
              {t("hr.estadoVinculo.activo")}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              {t("hr.contrato.semContrato")}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CampoSelect
              id="hr-contrato-tipo"
              label={t("hr.contrato.tipoContrato")}
              valor={rascunho.tipo_contrato}
              disabled={!podeEditar}
              opcoes={TIPOS_CONTRATO.map((tipo) => ({
                value: tipo,
                label: t(`hr.tipoContrato.${tipo}`),
              }))}
              onChange={(v) => definir("tipo_contrato", v as TipoContrato)}
            />
            <CampoSelect
              id="hr-contrato-regime"
              label={t("hr.contrato.regime")}
              ajuda={t("hr.contrato.ajudaRegime")}
              valor={rascunho.regime}
              disabled={!podeEditar}
              opcoes={REGIMES_TRABALHO.map((regime) => ({
                value: regime,
                label: t(`hr.regime.${regime}`),
              }))}
              onChange={(v) => definir("regime", v as RegimeTrabalho)}
            />
            <CampoSelect
              id="hr-contrato-tipo-trabalho"
              label={t("hr.contrato.tipoTrabalho")}
              ajuda={t("hr.contrato.ajudaTipoTrabalho")}
              valor={rascunho.tipo_trabalho}
              vazioLabel={t("hr.campos.semValor")}
              disabled={!podeEditar}
              opcoes={TIPOS_TRABALHO.map((tipo) => ({
                value: tipo,
                label: t(`hr.tipoTrabalho.${tipo}`),
              }))}
              onChange={(v) => definir("tipo_trabalho", v)}
            />
            <CampoTexto
              id="hr-contrato-data-inicio"
              label={t("hr.contrato.dataInicio")}
              tipo="date"
              valor={rascunho.data_inicio}
              disabled={!podeEditar}
              onChange={(v) => definir("data_inicio", v)}
            />
            <CampoTexto
              id="hr-contrato-data-fim"
              label={t("hr.contrato.dataFim")}
              tipo="date"
              valor={rascunho.data_fim}
              disabled={!podeEditar}
              onChange={(v) => definir("data_fim", v)}
            />
            <CampoTexto
              id="hr-contrato-motivo-termo"
              label={t("hr.contrato.motivoTermo")}
              valor={rascunho.motivo_termo}
              disabled={!podeEditar}
              onChange={(v) => definir("motivo_termo", v)}
            />
            <CampoTexto
              id="hr-contrato-periodo-experimental-dias"
              label={t("hr.contrato.periodoExperimentalDias")}
              tipo="number"
              min={0}
              max={1095}
              valor={rascunho.periodo_experimental_dias}
              disabled={!podeEditar}
              onChange={(v) => definir("periodo_experimental_dias", v)}
            />
            <CampoTexto
              id="hr-contrato-periodo-experimental-ate"
              label={t("hr.contrato.periodoExperimentalAte")}
              ajuda={t("hr.contrato.ajudaExperimentalDuasColunas")}
              tipo="date"
              valor={rascunho.periodo_experimental_ate}
              disabled={!podeEditar}
              onChange={(v) => definir("periodo_experimental_ate", v)}
            />
            <CampoTexto
              id="hr-contrato-horas-semanais"
              label={t("hr.contrato.horasTrabalho")}
              tipo="number"
              min={0}
              max={80}
              step="0.5"
              valor={rascunho.horas_semanais}
              disabled={!podeEditar}
              onChange={(v) => definir("horas_semanais", v)}
            />
            <CampoSelect
              id="hr-contrato-horas-frequencia"
              label={t("hr.contrato.horasFrequencia")}
              valor={rascunho.horas_frequencia}
              disabled={!podeEditar}
              opcoes={HORAS_FREQUENCIAS.map((f) => ({
                value: f,
                label: t(`hr.horasFrequencia.${f}`),
              }))}
              onChange={(v) => definir("horas_frequencia", v as HorasFrequencia)}
            />
            <CampoTexto
              id="hr-contrato-tempo-trabalho-pct"
              label={t("hr.contrato.tempoTrabalhoPct")}
              tipo="number"
              min={0}
              max={100}
              valor={rascunho.tempo_trabalho_pct}
              disabled={!podeEditar}
              onChange={(v) => definir("tempo_trabalho_pct", v)}
            />
            <CampoSelect
              id="hr-contrato-politica-feriados"
              label={t("hr.contrato.politicaFeriados")}
              valor={rascunho.politica_feriados}
              disabled={!podeEditar}
              opcoes={POLITICAS_FERIADOS.map((p) => ({
                value: p,
                label: t(`hr.politicaFeriados.${p}`),
              }))}
              onChange={(v) => definir("politica_feriados", v as PoliticaFeriados)}
            />
            <CampoTexto
              id="hr-contrato-horas-anuais-maximas"
              label={t("hr.contrato.horasAnuaisMaximas")}
              tipo="number"
              min={0}
              max={4000}
              valor={rascunho.horas_anuais_maximas}
              disabled={!podeEditar}
              onChange={(v) => definir("horas_anuais_maximas", v)}
            />
            <CampoTexto
              id="hr-contrato-horas-semanais-maximas"
              label={t("hr.contrato.horasSemanaisMaximas")}
              tipo="number"
              min={0}
              max={80}
              step="0.5"
              valor={rascunho.horas_semanais_maximas}
              disabled={!podeEditar}
              onChange={(v) => definir("horas_semanais_maximas", v)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("hr.contrato.diasUteis")}</legend>
            <div className="flex flex-wrap gap-3">
              {DIAS_SEMANA.map((dia) => {
                const id = `hr-contrato-dia-util-${dia}`;
                return (
                  <div key={dia} className="flex items-center gap-1.5">
                    <Checkbox
                      id={id}
                      checked={rascunho.dias_uteis.includes(dia)}
                      disabled={!podeEditar}
                      onCheckedChange={(marcado) =>
                        definir(
                          "dias_uteis",
                          marcado === true
                            ? [...rascunho.dias_uteis, dia]
                            : rascunho.dias_uteis.filter((outro) => outro !== dia),
                        )
                      }
                    />
                    <Label htmlFor={id} className="text-sm font-normal">
                      {t(`hr.dias.${dia}`)}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {podeEditar && (
            <Button size="sm" onClick={gravar} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {activo ? t("employees.form.update") : t("employees.form.create")}
            </Button>
          )}
        </CardContent>
      </Card>

      {podeVerRetribuicao && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("hr.contrato.retribuicao")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {retribuicao ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="tabular-nums font-medium">
                  {retribuicao.valor_base} {retribuicao.moeda}
                </span>
                <span className="text-muted-foreground">
                  {t(`hr.periodicidade.${retribuicao.periodicidade}`)}
                </span>
                <span className="text-muted-foreground">
                  {t("hr.contrato.validoDe")}: {retribuicao.valido_de}
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground">{t("hr.contrato.semRetribuicao")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {historico.length > 0 && (
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
                    <TableHead>{t("hr.contrato.dataInicio")}</TableHead>
                    <TableHead>{t("hr.contrato.dataFim")}</TableHead>
                    <TableHead>{t("hr.contrato.estado")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((vinculo) => (
                    <TableRow key={vinculo.id}>
                      <TableCell>{t(`hr.tipoContrato.${vinculo.tipo_contrato}`)}</TableCell>
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
      )}
    </div>
  );
}
