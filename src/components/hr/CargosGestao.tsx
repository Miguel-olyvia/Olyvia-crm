/**
 * Cargos de RH -- lista, cria, edita e activa/desactiva `hr_cargos`
 * (20261202070000), e diz quantas pessoas tem cada um. Vive no separador
 * Funcoes de Pessoas: e o UNICO sitio onde os cargos se gerem.
 *
 * AS CONTAGENS SAO POR `pessoas.cargo_id`
 * ---------------------------------------
 * "Pessoas" e "Em curso" contam as pessoas da lista recebida por `cargo_id`.
 * O texto livre antigo (`pessoas.cargo`) NAO conta: uma pessoa sem `cargo_id`
 * cai na linha "Sem cargo", ao fim, mesmo que o texto livre diga "Comercial".
 * A coluna "Em curso" so se mostra a quem tem `hr.pessoas.vinculos.view`.
 *
 * O SALARIO AQUI E OBRIGATORIO POR LEI, NAO SO CONFIGURACAO
 * -------------------------------------------------------------------
 * Uma pessoa com `cargo_id` a apontar para um cargo daqui fica com o salario
 * base BLOQUEADO ao valor definido aqui -- toda a gente com o mesmo cargo
 * ganha o mesmo, sem excepcao manual (ver `hr_retribuicao_valor_conforme_cargo`).
 * Mudar o salario aqui nao reescreve retribuicoes ja gravadas -- so vale para
 * a proxima vez que alguem desse cargo tiver uma nova versao de retribuicao.
 *
 * O RELATORIO DE DIVERGENCIAS NAO MUDA NADA SOZINHO
 * -----------------------------------------------------
 * A lista de cargos (texto legado, `pessoas.cargo`) com mais do que um
 * salario activo hoje e so leitura -- nao ha nenhum botao aqui para "corrigir
 * tudo". Cada pessoa listada tem de ser resolvida na propria ficha.
 *
 * NUNCA SE APAGA -- SO SE (DES)ACTIVA
 * -------------------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE; este componente nem mostra
 * a opcao. "Desactivar" e "Reactivar" sao o UPDATE de `activo`.
 *
 * Permissoes: ver = `hr.pessoas.laborais.view`; criar/editar/activar =
 * `hr.pessoas.laborais.edit`.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCargos, type HrCargo, type NovoCargoRH } from "@/hooks/useCargos";
import { useCargosSalariosDivergentes } from "@/hooks/useCargosSalariosDivergentes";
import type { PessoaListItem, Periodicidade } from "@/types/hr";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { Briefcase, Loader2, Plus, Pencil, Ban, RotateCcw, AlertTriangle } from "lucide-react";

const FORM_VAZIO: NovoCargoRH = {
  nome: "",
  salario_base: 0,
  periodicidade: "mensal",
  horas_referencia: null,
};

interface Contagem {
  total: number;
  emCurso: number;
}

interface CargosGestaoProps {
  pessoas: PessoaListItem[];
  loading: boolean;
}

export function CargosGestao({ pessoas, loading }: CargosGestaoProps) {
  const { t } = useTranslation();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeVer = hasPermission("hr.pessoas.laborais.view");
  const podeEditar = hasPermission("hr.pessoas.laborais.edit");
  const podeVerVinculos = hasPermission("hr.pessoas.vinculos.view");

  const { cargos, isLoading, isSaving, criar, editar, definirActivo } = useCargos();
  const { divergencias, isLoading: divergenciasALoad } = useCargosSalariosDivergentes();

  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [cargoAEditar, setCargoAEditar] = useState<string | null>(null);
  const [form, setForm] = useState<NovoCargoRH>(FORM_VAZIO);

  const { porCargo, semCargo } = useMemo(() => {
    const mapa = new Map<string, Contagem>();
    const sem: Contagem = { total: 0, emCurso: 0 };
    for (const pessoa of pessoas) {
      const alvo = pessoa.cargo_id
        ? (mapa.get(pessoa.cargo_id) ?? { total: 0, emCurso: 0 })
        : sem;
      alvo.total += 1;
      if (pessoa.estado_contrato_derivado === "em_curso") alvo.emCurso += 1;
      if (pessoa.cargo_id) mapa.set(pessoa.cargo_id, alvo);
    }
    return { porCargo: mapa, semCargo: sem };
  }, [pessoas]);

  const cargosVisiveis = mostrarInactivos ? cargos : cargos.filter((c) => c.activo);
  const mostrarSemCargo = !loading && semCargo.total > 0;
  const vazio = cargosVisiveis.length === 0 && !mostrarSemCargo;

  const abrirNovo = () => {
    setCargoAEditar(null);
    setForm(FORM_VAZIO);
    setDialogoAberto(true);
  };

  const abrirEdicao = (cargo: HrCargo) => {
    setCargoAEditar(cargo.id);
    setForm({
      nome: cargo.nome,
      salario_base: cargo.salario_base,
      periodicidade: cargo.periodicidade,
      horas_referencia: cargo.horas_referencia,
    });
    setDialogoAberto(true);
  };

  const fecharDialogo = () => {
    setDialogoAberto(false);
    setCargoAEditar(null);
    setForm(FORM_VAZIO);
  };

  const submeter = async () => {
    if (!form.nome.trim() || form.salario_base < 0) return;
    try {
      if (cargoAEditar) {
        await editar({ ...form, id: cargoAEditar });
        toast.success(t("hr.cargos.actualizarSucesso"));
      } else {
        await criar(form);
        toast.success(t("hr.cargos.criarSucesso"));
      }
      fecharDialogo();
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  const alternarActivo = async (cargo: HrCargo) => {
    try {
      await definirActivo(cargo.id, !cargo.activo);
      toast.success(cargo.activo ? t("hr.cargos.desactivarSucesso") : t("hr.cargos.reactivarSucesso"));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  if (permissionsLoading) return <OlyviaLoader />;
  if (!podeVer) return <SemAcessoCard />;

  return (
    <div className="space-y-4">
      {!divergenciasALoad && divergencias.length > 0 && (
        <Card className="border-amber-400/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              {t("hr.cargos.divergenciasTitulo")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("hr.cargos.divergenciasAjuda")}</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.cargos.coluna.cargo")}</TableHead>
                  <TableHead>{t("hr.cargos.coluna.pessoa")}</TableHead>
                  <TableHead>{t("hr.cargos.coluna.salario")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divergencias.map((d) => (
                  <TableRow key={`${d.cargo}-${d.pessoa_id}`}>
                    <TableCell className="font-medium">{d.cargo}</TableCell>
                    <TableCell>{d.pessoa_nome}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {d.valor_base} ({t(`hr.periodicidade.${d.periodicidade}`)})
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              {t("hr.cargos.tituloPagina")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("hr.cargos.subtitulo")}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Label htmlFor="mostrar-inactivos" className="text-sm font-normal">
                {t("hr.cargos.mostrarInactivos")}
              </Label>
              <input
                id="mostrar-inactivos"
                type="checkbox"
                checked={mostrarInactivos}
                onChange={(e) => setMostrarInactivos(e.target.checked)}
                className="h-4 w-4"
              />
            </div>
            {podeEditar && (
              <Button size="sm" onClick={abrirNovo}>
                <Plus className="h-4 w-4 mr-2" /> {t("hr.cargos.novoCargo")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || loading ? (
            <div className="flex justify-center py-12">
              <OlyviaLoader size={32} />
            </div>
          ) : vazio ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("hr.cargos.semCargos")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("hr.columns.cargo")}</TableHead>
                    <TableHead>{t("hr.cargos.coluna.salario")}</TableHead>
                    <TableHead className="w-28">{t("hr.funcoes.pessoas")}</TableHead>
                    {podeVerVinculos && (
                      <TableHead className="w-28">{t("hr.estadoContrato.em_curso")}</TableHead>
                    )}
                    {podeEditar && <TableHead className="w-24" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargosVisiveis.map((cargo) => {
                    const contagem = porCargo.get(cargo.id) ?? { total: 0, emCurso: 0 };
                    return (
                      <TableRow key={cargo.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{cargo.nome}</span>
                            <Badge
                              variant={cargo.activo ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {cargo.activo ? t("hr.cargos.activo") : t("hr.cargos.inactivo")}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {cargo.salario_base} {t(`hr.periodicidade.${cargo.periodicidade}`)}
                        </TableCell>
                        <TableCell className="tabular-nums">{contagem.total}</TableCell>
                        {podeVerVinculos && (
                          <TableCell className="tabular-nums">{contagem.emCurso}</TableCell>
                        )}
                        {podeEditar && (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => abrirEdicao(cargo)}
                                title={t("hr.cargos.editarCargo")}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => alternarActivo(cargo)}
                                title={cargo.activo ? t("hr.cargos.desactivar") : t("hr.cargos.reactivar")}
                              >
                                {cargo.activo ? (
                                  <Ban className="h-4 w-4 text-destructive" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {mostrarSemCargo && (
                    <TableRow>
                      <TableCell>
                        <span className="text-muted-foreground">{t("hr.funcoes.semCargo")}</span>
                      </TableCell>
                      <TableCell />
                      <TableCell className="tabular-nums">{semCargo.total}</TableCell>
                      {podeVerVinculos && (
                        <TableCell className="tabular-nums">{semCargo.emCurso}</TableCell>
                      )}
                      {podeEditar && <TableCell />}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={(open) => !open && fecharDialogo()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {cargoAEditar ? t("hr.cargos.editarCargo") : t("hr.cargos.novoCargo")}
            </DialogTitle>
            <DialogDescription>{t("hr.cargos.subtitulo")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cargo-nome">{t("hr.cargos.coluna.cargo")}</Label>
              <Input
                id="cargo-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cargo-salario">{t("hr.cargos.salarioBase")}</Label>
                <Input
                  id="cargo-salario"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.salario_base}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, salario_base: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cargo-periodicidade">{t("hr.contrato.periodicidade")}</Label>
                <Select
                  value={form.periodicidade}
                  onValueChange={(v) => setForm((f) => ({ ...f, periodicidade: v as Periodicidade }))}
                >
                  <SelectTrigger id="cargo-periodicidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">{t("hr.periodicidade.mensal")}</SelectItem>
                    <SelectItem value="anual">{t("hr.periodicidade.anual")}</SelectItem>
                    <SelectItem value="hora">{t("hr.periodicidade.hora")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cargo-horas">{t("hr.cargos.horasReferencia")}</Label>
              <Input
                id="cargo-horas"
                type="number"
                min={0}
                step="0.5"
                value={form.horas_referencia ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    horas_referencia: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{t("hr.cargos.horasReferenciaAjuda")}</p>
            </div>

            <p className="text-xs text-muted-foreground">{t("hr.cargos.avisoSalarioObrigatorio")}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={fecharDialogo}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={submeter}
              disabled={isSaving || !form.nome.trim() || form.salario_base < 0}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {cargoAEditar ? t("common.save") : t("hr.cargos.novoCargo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
