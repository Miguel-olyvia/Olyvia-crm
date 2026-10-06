/**
 * O cargo de UMA pessoa (fluxo 2): o que tem hoje, o historico, e o unico sitio
 * onde se muda -- "Atribuir cargo" (ficha antiga sem cargo) ou "Mudar cargo".
 *
 * Toda a pessoa tem cargo, e e do cargo que vem o salario base. Mudar o cargo
 * muda o salario de quem ja tem retribuicao, por isso o dialogo AVISA antes de
 * confirmar, a partir dos periodos do salario dos cargos (`hr_cargos_periodos`):
 *   - "de X para Y" quando o salario muda (ou muda de periodicidade);
 *   - "igual" quando o cargo novo paga o mesmo;
 *   - "primeiro salario" quando a pessoa ainda nao tinha;
 *   - "o cargo novo tem uma subida agendada para D" quando houver.
 * A base e quem decide (`rpc_hr_pessoa_mudar_cargo`); o aviso so evita surpresas.
 *
 * NAO HA "RETIRAR CARGO": so se muda para outro. Um cargo desactivado nao se
 * oferece, e o actual tambem nao.
 *
 * DATAS (D3): a mudanca de cargo de uma pessoa e de HOJE PARA TRAS -- nunca
 * futura. A unica excepcao e corrigir o cargo de uma admissao futura (o cargo
 * ainda nao entrou em vigor): a data fica fixa no inicio dessa linha.
 *
 * PERMISSOES: `hr.pessoas.laborais.edit` para mudar o cargo. Se a pessoa JA tem
 * retribuicao, mudar-lhe o cargo muda-lhe o salario, e exige tambem
 * `hr.pessoas.retribuicao.edit` (D2): sem ela o botao fica desactivado, com a
 * explicacao. A coluna do salario do historico so se mostra com
 * `hr.pessoas.retribuicao.view`.
 */
import { useMemo, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { usePessoaCargo } from "@/hooks/usePessoaCargo";
import { toast } from "@/lib/toast";
import { dataDeHojeISO } from "@/lib/hr/afectacoes";
import {
  compararSalario,
  diaSeguinte,
  formatarSalario,
  periodoDoCargoEm,
  proximoPeriodoAgendado,
  segmentosHistoricoCargo,
  type HrCargoPeriodo,
  type ValorDoSalario,
} from "@/lib/hr/cargosPeriodos";
import type { HrCargo } from "@/hooks/useCargos";

interface PessoaCargoCardProps {
  pessoaId: string;
  organizationId: string;
  cargos: HrCargo[];
  /** Os periodos do salario dos cargos: de onde vem o aviso "de X para Y". */
  periodos: HrCargoPeriodo[];
  /** `hr.pessoas.laborais.edit`. */
  podeEditar: boolean;
  /** `hr.pessoas.retribuicao.view`: a coluna do salario do historico. */
  podeVerRetribuicao: boolean;
  /** `hr.pessoas.retribuicao.edit`: exigida para mudar o cargo de quem ja tem retribuicao. */
  podeEditarRetribuicao: boolean;
  /** A pessoa ja tem alguma versao de retribuicao. */
  temRetribuicao: boolean;
  /** O salario base que a pessoa tem hoje, quando nao ha cargo anterior (ficha antiga com retribuicao). */
  salarioActual: ValorDoSalario | null;
  /** `hr.pessoas.retribuicao.corrigir`: mudar o cargo com data passada pode reescrever uma versao em vigor. */
  podeCorrigirRetribuicao?: boolean;
  /** Os cargos ou os seus periodos ainda a carregar: nao se diz "sem salario". */
  periodosLoading?: boolean;
  /** Falhou a leitura dos cargos ou dos periodos: nao se diz "sem salario". */
  periodosError?: boolean;
  /** Depois de mudar o cargo: o pai recarrega a ficha, a retribuicao e as pendencias. */
  onMudou: () => void;
}

export function PessoaCargoCard({
  pessoaId,
  organizationId,
  cargos,
  periodos,
  podeEditar,
  podeVerRetribuicao,
  podeEditarRetribuicao,
  temRetribuicao,
  salarioActual,
  podeCorrigirRetribuicao = false,
  periodosLoading = false,
  periodosError = false,
  onMudou,
}: PessoaCargoCardProps) {
  const { t } = useTranslation();
  const { linhas, aberta, loading, erroLeitura, saving, mudarCargo } = usePessoaCargo(pessoaId, organizationId);

  const hoje = dataDeHojeISO();
  const traduzir = (chave: string) => t(chave);

  // Um cargo que comeca hoje ou mais tarde (admissao de hoje ou futura) corrige-se
  // na propria data de inicio: a base aceita p_desde = valido_de >= hoje.
  const emModoSubstituir = aberta !== null && aberta.valido_de >= hoje;
  const dataMaxima = emModoSubstituir ? aberta.valido_de : hoje;
  const dataMinima = aberta ? (emModoSubstituir ? aberta.valido_de : diaSeguinte(aberta.valido_de)) : undefined;

  const [aberto, setAberto] = useState(false);
  const [cargoId, setCargoId] = useState("");
  const [desde, setDesde] = useState(hoje);
  const [motivo, setMotivo] = useState("");

  const cargoActual = aberta ? cargos.find((c) => c.id === aberta.cargo_id) : undefined;
  const opcoes = cargos
    .filter((c) => c.activo && c.id !== aberta?.cargo_id)
    .map((c) => ({ value: c.id, label: c.nome }));

  const abrirDialogo = () => {
    setCargoId("");
    setDesde(emModoSubstituir && aberta ? aberta.valido_de : hoje);
    setMotivo("");
    setAberto(true);
  };

  // Sem retribuicao.view nao se sabe se a pessoa tem retribuicao: trata-se como "pode ter".
  const podeTerRetribuicao = temRetribuicao || !podeVerRetribuicao;
  const semPermissaoRetribuicao = podeTerRetribuicao && !podeEditarRetribuicao;
  const precisaCorrigir =
    podeTerRetribuicao && !podeCorrigirRetribuicao && desde !== "" && desde < hoje;
  const leituraOk = !loading && !erroLeitura;

  /** A comparacao antes de confirmar: o que acontece ao salario base nesta data. */
  const aviso = useMemo(() => {
    if (cargoId === "" || desde === "") return null;
    const novo = periodoDoCargoEm(periodos, cargoId, desde);
    if (!novo) return null;
    const antigo = aberta ? periodoDoCargoEm(periodos, aberta.cargo_id, desde) : null;
    const antes: ValorDoSalario | null = antigo
      ? { salarioBase: antigo.salario_base, periodicidade: antigo.periodicidade }
      : aberta
        ? null
        : salarioActual;
    const depois: ValorDoSalario = { salarioBase: novo.salario_base, periodicidade: novo.periodicidade };
    return compararSalario(antes, depois);
  }, [cargoId, desde, periodos, aberta, salarioActual]);

  const agendado = cargoId === "" ? null : proximoPeriodoAgendado(periodos, cargoId, hoje);

  const textoDoAviso = (): string | null => {
    if (cargoId === "") return null;
    if (periodosError) return t("hr.laborais.cargoPeriodosErro");
    if (periodosLoading) return t("common.loading");
    if (!podeVerRetribuicao) return t("hr.laborais.cargoAvisoSalarioOculto");
    if (!aviso) return t("hr.laborais.cargoAvisoSemSalario");
    const depois = formatarSalario(aviso.depois, traduzir);
    if (aviso.tipo === "primeiro") {
      // A base nao cria a primeira retribuicao de quem nao tem nenhuma.
      return t(
        temRetribuicao ? "hr.laborais.cargoAvisoPrimeiro" : "hr.laborais.cargoAvisoSemRetribuicao",
        { valor: depois },
      );
    }
    if (aviso.tipo === "igual") return t("hr.laborais.cargoAvisoIgual", { valor: depois });
    const antes = aviso.antes ? formatarSalario(aviso.antes, traduzir) : "";
    return t("hr.laborais.cargoAvisoDePara", { antes, depois });
  };

  const confirmar = async () => {
    if (cargoId === "") return;
    if (desde === "" || desde > dataMaxima || (dataMinima !== undefined && desde < dataMinima)) {
      toast.error(
        dataMinima === undefined
          ? t("hr.laborais.cargoDataAteHoje", { ate: dataMaxima })
          : t("hr.laborais.cargoDataForaIntervalo", { de: dataMinima, ate: dataMaxima }),
      );
      return;
    }
    const { erro } = await mudarCargo(cargoId, desde, motivo);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.laborais.cargoMudado"));
    setAberto(false);
    onMudou();
  };

  const segmentos = segmentosHistoricoCargo(linhas, periodos, cargos);
  const textoAviso = textoDoAviso();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            {t("hr.laborais.cargoCatalogo")}
          </CardTitle>
          <p
            className={erroLeitura ? "text-sm font-medium text-destructive" : "text-sm font-medium"}
            data-testid="cargo-actual"
            role={erroLeitura ? "alert" : undefined}
          >
            {loading
              ? t("common.loading")
              : erroLeitura
                ? t("hr.laborais.cargoErroLeitura")
                : aberta
                  ? `${cargoActual?.nome ?? t("hr.campos.semValor")} · ${t("hr.contrato.validoDe")}: ${aberta.valido_de}`
                  : t("hr.campos.semValor")}
          </p>
          <p className="text-xs text-muted-foreground">{t("hr.laborais.cargoCatalogoAjuda")}</p>
        </div>
        {podeEditar && leituraOk && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={abrirDialogo}
              disabled={saving || semPermissaoRetribuicao}
              aria-describedby={semPermissaoRetribuicao ? "hr-cargo-mudar-bloqueado" : undefined}
            >
              {t(aberta ? "hr.laborais.cargoMudar" : "hr.laborais.cargoAtribuir")}
            </Button>
            {semPermissaoRetribuicao && (
              <p
                id="hr-cargo-mudar-bloqueado"
                className="max-w-xs text-right text-xs text-muted-foreground"
              >
                {t(
                  temRetribuicao
                    ? "hr.laborais.cargoSemPermissaoRetribuicao"
                    : "hr.laborais.cargoSemPermissaoRetribuicaoIncerta",
                )}
              </p>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        <p className="text-sm font-medium">{t("hr.laborais.cargoHistoricoTitulo")}</p>
        {periodosError && podeVerRetribuicao && (
          <p className="text-xs text-destructive" role="alert">
            {t("hr.laborais.cargoPeriodosErro")}
          </p>
        )}
        {!leituraOk ? null : segmentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.laborais.cargoHistoricoVazio")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableCaption className="sr-only">{t("hr.laborais.cargoHistoricoTitulo")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.columns.cargo")}</TableHead>
                  <TableHead>{t("hr.cargos.periodos.desde")}</TableHead>
                  <TableHead>{t("hr.cargos.periodos.ate")}</TableHead>
                  {podeVerRetribuicao && <TableHead>{t("hr.cargos.coluna.salario")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {segmentos.map((s) => (
                  <TableRow key={`${s.cargoId}-${s.desde}`}>
                    <TableCell>{s.cargoNome ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{s.desde}</TableCell>
                    <TableCell className="tabular-nums">{s.ate ?? "—"}</TableCell>
                    {podeVerRetribuicao && (
                      <TableCell className="tabular-nums">
                        {s.salarioBase !== null && s.periodicidade !== null
                          ? formatarSalario(
                              { salarioBase: s.salarioBase, periodicidade: s.periodicidade },
                              traduzir,
                            )
                          : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.laborais.cargoMudarTitulo")}</DialogTitle>
            <DialogDescription>{t("hr.laborais.cargoMudarAjuda")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <CampoSelect
              id="hr-cargo-mudar-cargo"
              label={t("hr.laborais.cargoCatalogo")}
              valor={cargoId}
              opcoes={opcoes}
              onChange={setCargoId}
            />
            <CampoTexto
              id="hr-cargo-mudar-desde"
              label={t("hr.laborais.cargoDesde")}
              tipo="date"
              valor={desde}
              min={dataMinima}
              max={dataMaxima}
              onChange={setDesde}
            />
            <CampoTexto
              id="hr-cargo-mudar-motivo"
              label={t("hr.laborais.cargoMotivo")}
              valor={motivo}
              onChange={setMotivo}
            />
            {textoAviso && (
              <p className="rounded-md bg-muted/50 p-3 text-sm font-medium" role="status">
                {textoAviso}
              </p>
            )}
            {precisaCorrigir && (
              <p className="text-sm text-amber-700 dark:text-amber-500" role="status">
                {t("hr.laborais.cargoAvisoPrecisaCorrigir")}
              </p>
            )}
            {agendado && (
              <p className="text-sm text-amber-700 dark:text-amber-500" role="status">
                {t("hr.laborais.cargoAvisoAgendado", { data: agendado.valido_de })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmar}
              disabled={saving || cargoId === ""}
              aria-describedby={cargoId === "" ? "hr-cargo-mudar-confirmar-motivo" : undefined}
            >
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("employees.form.update")}
            </Button>
          </DialogFooter>
          {cargoId === "" && (
            <p
              id="hr-cargo-mudar-confirmar-motivo"
              className="text-right text-xs text-muted-foreground"
            >
              {t("hr.laborais.cargoConfirmarFaltaCargo")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
