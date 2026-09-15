/**
 * O CORPO do relatorio mensal de assiduidade de uma pessoa: cabecalho
 * impresso (empresa/pessoa/cargo), a grelha diaria (planeado, realizado,
 * obra, estado), totais, e a seccao de obras do mes.
 *
 * EXTRAIDO DE `PessoaRelatorioAssiduidadeMensal` DE PROPOSITO
 * -------------------------------------------------------------
 * Este componente NAO tem Dialog, NAO tem selector de mes, e NAO tem o botao
 * de imprimir -- esses controlos ficam em quem o usa, porque tem dois
 * consumidores com controlos diferentes: `PessoaRelatorioAssiduidadeMensal`
 * (uma pessoa, com selector de mes) e `RelatorioAssiduidadeMensalOrganizacao`
 * (muitas pessoas, uma instancia por pessoa, sem selector -- o mes vem de
 * fora). O slot `controlos` deixa `PessoaRelatorioAssiduidadeMensal` colocar o
 * seu selector de mes e botao de imprimir no mesmo lugar do DOM onde estavam
 * antes da extraccao.
 *
 * `aoTerminarCarregamento` avisa quem usa este componente (o relatorio em
 * massa) quando ESTA pessoa terminou de carregar -- para nao chamar
 * `window.print()` a meio do carregamento e imprimir paginas em branco. So
 * dispara uma vez por montagem (uma nova busca a seguir, por exemplo depois
 * de registar uma obra, nao volta a avisar).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatarDuracao, horaCurta } from "@/lib/hr/assiduidade";
import {
  useRelatorioAssiduidadeMensal,
  type DiaRelatorioMensal,
  type IntervaloRelatorio,
} from "@/hooks/useRelatorioAssiduidadeMensal";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";

interface RelatorioAssiduidadeMensalConteudoProps {
  pessoaId: string;
  ano: number;
  mes: number;
  pessoaNome: string;
  /** "Categoria profissional" do cabecalho -- `pessoas.cargo`, ja existente na ficha. */
  cargo?: string | null;
  dataAdmissao?: string | null;
  permissoes: PermissoesAssiduidade;
  /** Controlos do dono do ecra (selector de mes, botao de imprimir), inseridos entre o cabecalho e a grelha. */
  controlos?: ReactNode;
  className?: string;
  /** Avisa, uma so vez por montagem, quando esta pessoa termina de carregar. */
  aoTerminarCarregamento?: () => void;
}

const DIAS_SEMANA_ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

function chaveDoEstado(dia: DiaRelatorioMensal): string {
  if (dia.estado === "ausencia") {
    return dia.categoriaAusencia
      ? `hr.relatorioMensal.estado.ausencia.${dia.categoriaAusencia}`
      : "hr.relatorioMensal.estado.ausencia.outro";
  }
  return `hr.relatorioMensal.estado.${dia.estado}`;
}

/** "09:00-12:00 | 13:00-18:00" -- o formato do Excel do Kairos para o planeado. */
function formatarPlaneado(intervalos: readonly IntervaloRelatorio[]): string {
  if (intervalos.length === 0) return "—";
  return intervalos
    .map((intervalo) => `${horaCurta(intervalo.hora_inicio)}-${horaCurta(intervalo.hora_fim)}`)
    .join(" | ");
}

/** "09:00-13:00 14:00-18:00" -- os intervalos REAIS picados, separados por espaco. */
function formatarRealizado(intervalos: readonly IntervaloRelatorio[]): string {
  if (intervalos.length === 0) return "—";
  return intervalos
    .map((intervalo) => `${horaCurta(intervalo.hora_inicio)}-${horaCurta(intervalo.hora_fim)}`)
    .join(" ");
}

/**
 * A pessoa trabalhou num dia que, por omissao, nao tinha horario nenhum
 * (feriado ou descanso). Uma ausencia aprovada fica de fora de proposito: e
 * um caso raro (picar durante ferias aprovadas) que este relatorio nao trata.
 */
function trabalhouForaDoNormal(dia: DiaRelatorioMensal): boolean {
  return (dia.estado === "feriado" || dia.estado === "descanso") && dia.realizadoMinutos > 0;
}

/** Estilo inline que sobrevive a impressao: uma `background-color` sem isto some no papel. */
const AJUSTE_COR_IMPRESSAO = {
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
} as unknown as CSSProperties;

function classeDeDestaque(dia: DiaRelatorioMensal): string | undefined {
  if (!trabalhouForaDoNormal(dia)) return undefined;
  return dia.estado === "feriado"
    ? "bg-amber-50 dark:bg-amber-950/30"
    : "bg-blue-50 dark:bg-blue-950/30";
}

export function RelatorioAssiduidadeMensalConteudo({
  pessoaId,
  ano,
  mes,
  pessoaNome,
  cargo,
  dataAdmissao,
  permissoes,
  controlos,
  className,
  aoTerminarCarregamento,
}: RelatorioAssiduidadeMensalConteudoProps) {
  const { t, language } = useTranslation();
  const { activeCompany } = useCompany();

  const [formularioAberto, setFormularioAberto] = useState(false);
  const [dataObra, setDataObra] = useState("");
  const [horasObra, setHorasObra] = useState("");
  const [descricaoObra, setDescricaoObra] = useState("");

  const relatorio = useRelatorioAssiduidadeMensal(pessoaId, ano, mes);

  const avisouRef = useRef(false);
  useEffect(() => {
    if (!relatorio.loading && !avisouRef.current) {
      avisouRef.current = true;
      aoTerminarCarregamento?.();
    }
  }, [relatorio.loading, aoTerminarCarregamento]);

  const nomeDoMes = useMemo(
    () =>
      new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
        new Date(ano, mes, 1),
      ),
    [language, ano, mes],
  );

  const submeterObra = async () => {
    const horas = Number(horasObra.replace(",", "."));
    if (!dataObra || !Number.isFinite(horas) || horas <= 0 || !descricaoObra.trim()) {
      toast.error(t("hr.relatorioMensal.obras.formulario.invalido"));
      return;
    }
    const erro = await relatorio.registarObra({ data: dataObra, horas, descricao: descricaoObra.trim() });
    if (erro) {
      toast.error(erro);
      return;
    }
    setFormularioAberto(false);
    setDataObra("");
    setHorasObra("");
    setDescricaoObra("");
    toast.success(t("hr.relatorioMensal.obras.registada"));
  };

  const anularObra = async (obraId: string) => {
    const motivo = window.prompt(t("hr.relatorioMensal.obras.motivoAnulacao"));
    if (!motivo || !motivo.trim()) return;
    const erro = await relatorio.anularObra(obraId, motivo.trim());
    if (erro) toast.error(erro);
    else toast.success(t("hr.relatorioMensal.obras.anulada"));
  };

  return (
    <div className={cn("space-y-4", className)}>
      <header className="space-y-1 border-b pb-3">
        <p className="text-base font-semibold">{activeCompany?.name}</p>
        <p className="text-sm">{pessoaNome}</p>
        <p className="text-xs text-muted-foreground">
          {cargo ?? t("hr.relatorioMensal.semCargo")}
          {dataAdmissao ? ` · ${t("hr.relatorioMensal.admissao", { data: dataAdmissao })}` : ""}
        </p>
      </header>

      {controlos}

      <p className="hidden text-base font-medium capitalize print:block">{nomeDoMes}</p>

      {relatorio.loading ? (
        <OlyviaLoader />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("hr.relatorioMensal.coluna.data")}</TableHead>
                <TableHead>{t("hr.relatorioMensal.coluna.dia")}</TableHead>
                <TableHead>{t("hr.relatorioMensal.coluna.planeado")}</TableHead>
                <TableHead>{t("hr.relatorioMensal.coluna.realizado")}</TableHead>
                <TableHead>{t("hr.relatorioMensal.coluna.horasExtra")}</TableHead>
                <TableHead>{t("hr.relatorioMensal.coluna.obra")}</TableHead>
                <TableHead>{t("hr.relatorioMensal.coluna.estado")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatorio.dias.map((dia) => {
                const trabalhou = trabalhouForaDoNormal(dia);
                // So se esconde o bloco de valores quando o dia foi substituido
                // E nao houve trabalho nenhum -- um feriado ou descanso
                // trabalhado continua a mostrar planeado, realizado e horas
                // extra, so a coluna Estado e que fica.
                const esconderValores = dia.estado !== "normal" && !trabalhou;
                const destaque = classeDeDestaque(dia);
                return (
                  <TableRow
                    key={dia.iso}
                    className={destaque}
                    style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                  >
                    <TableCell
                      className="tabular-nums"
                      style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                    >
                      {dia.iso}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                    >
                      {DIAS_SEMANA_ABREV[dia.diaSemana]}
                    </TableCell>
                    {esconderValores ? (
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground"
                        style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                      >
                        {t(chaveDoEstado(dia))}
                      </TableCell>
                    ) : (
                      <>
                        <TableCell
                          className="tabular-nums whitespace-nowrap"
                          style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                        >
                          {formatarPlaneado(dia.planeadoIntervalos)}
                        </TableCell>
                        <TableCell
                          className="tabular-nums whitespace-nowrap"
                          style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                        >
                          {formatarRealizado(dia.realizadoIntervalos)}
                        </TableCell>
                        <TableCell
                          className="tabular-nums"
                          style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                        >
                          {dia.horasExtraMinutos > 0 ? `+${formatarDuracao(dia.horasExtraMinutos)}` : "—"}
                        </TableCell>
                        <TableCell
                          className="tabular-nums"
                          style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}
                        >
                          {dia.obraHoras > 0 ? `${dia.obraHoras}h` : "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell style={destaque ? AJUSTE_COR_IMPRESSAO : undefined}>
                      <div className="flex flex-col gap-1">
                        {esconderValores ? null : (
                          <span className="text-muted-foreground">{t(chaveDoEstado(dia))}</span>
                        )}
                        {trabalhou && (
                          <Badge variant="outline" className="w-fit font-normal">
                            {t(
                              dia.estado === "feriado"
                                ? "hr.relatorioMensal.feriadoTrabalhado"
                                : "hr.relatorioMensal.descansoTrabalhado",
                            )}
                          </Badge>
                        )}
                        {dia.temFalta && (
                          <Badge variant="outline" className="w-fit font-normal">
                            {t("hr.assiduidade.dia.faltaDe", {
                              duracao: formatarDuracao(dia.minutosEmFalta),
                            })}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-sm font-medium">
            <span>
              {t("hr.relatorioMensal.totais.diasTrabalhados", {
                dias: String(relatorio.totais.diasTrabalhados),
              })}
            </span>
            <span>
              {t("hr.relatorioMensal.totais.planeado", {
                duracao: formatarDuracao(relatorio.totais.planeadoMinutos),
              })}
            </span>
            <span>
              {t("hr.relatorioMensal.totais.realizado", {
                duracao: formatarDuracao(relatorio.totais.realizadoMinutos),
              })}
            </span>
            <span>
              {t("hr.relatorioMensal.totais.obra", {
                horas: String(relatorio.totais.obraHoras),
              })}
            </span>
            <span>
              {t("hr.relatorioMensal.totais.horasExtra", {
                duracao: formatarDuracao(relatorio.totais.horasExtraMinutos),
              })}
            </span>
            <span>
              {t("hr.relatorioMensal.totais.diasFeriadoTrabalhados", {
                dias: String(relatorio.totais.diasFeriadoTrabalhados),
              })}
            </span>
            <span>
              {t("hr.relatorioMensal.totais.faltaCompleta", {
                dias: String(relatorio.totais.diasComFaltaCompleta),
              })}
            </span>
            <span>
              {t("hr.relatorioMensal.totais.faltaIncompleta", {
                dias: String(relatorio.totais.diasComFaltaIncompleta),
              })}
            </span>
          </div>

          <section className="space-y-2 border-t pt-3" aria-labelledby={`hr-relatorio-obras-titulo-${pessoaId}`}>
            <div className="flex items-center justify-between">
              <h3 id={`hr-relatorio-obras-titulo-${pessoaId}`} className="text-sm font-semibold">
                {t("hr.relatorioMensal.obras.titulo")}
              </h3>
              {permissoes.obrasRegistar && (
                <Button
                  size="sm"
                  variant="outline"
                  className="no-print"
                  onClick={() => setFormularioAberto((v) => !v)}
                >
                  {t("hr.relatorioMensal.obras.registar")}
                </Button>
              )}
            </div>

            {permissoes.obrasRegistar && formularioAberto && (
              <div className="grid gap-2 rounded-md border p-3 no-print sm:grid-cols-4">
                <div>
                  <Label htmlFor={`hr-obra-data-${pessoaId}`}>
                    {t("hr.relatorioMensal.obras.campo.data")}
                  </Label>
                  <Input
                    id={`hr-obra-data-${pessoaId}`}
                    type="date"
                    value={dataObra}
                    onChange={(e) => setDataObra(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`hr-obra-horas-${pessoaId}`}>
                    {t("hr.relatorioMensal.obras.campo.horas")}
                  </Label>
                  <Input
                    id={`hr-obra-horas-${pessoaId}`}
                    inputMode="decimal"
                    value={horasObra}
                    onChange={(e) => setHorasObra(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`hr-obra-descricao-${pessoaId}`}>
                    {t("hr.relatorioMensal.obras.campo.descricao")}
                  </Label>
                  <Textarea
                    id={`hr-obra-descricao-${pessoaId}`}
                    value={descricaoObra}
                    onChange={(e) => setDescricaoObra(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-4 flex justify-end">
                  <Button onClick={submeterObra} disabled={relatorio.saving}>
                    {relatorio.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("hr.relatorioMensal.obras.guardar")}
                  </Button>
                </div>
              </div>
            )}

            {relatorio.obras.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("hr.relatorioMensal.obras.vazio")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {relatorio.obras.map((obra) => (
                  <li key={obra.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className={obra.anulado_em ? "text-muted-foreground line-through" : ""}>
                      {obra.data} · {obra.horas}h · {obra.descricao}
                    </span>
                    {obra.anulado_em ? (
                      <Badge variant="outline" className="font-normal">
                        {t("hr.relatorioMensal.obras.anuladaEtiqueta")}
                      </Badge>
                    ) : (
                      permissoes.obrasRegistar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="no-print"
                          onClick={() => anularObra(obra.id)}
                        >
                          {t("hr.relatorioMensal.obras.anular")}
                        </Button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
