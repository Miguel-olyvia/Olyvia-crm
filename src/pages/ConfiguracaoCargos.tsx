/**
 * Cargos de RH -- lista, cria, edita e activa/desactiva `hr_cargos`
 * (20261202070000). Segue o padrao de `ConfiguracaoModelosDocumentos.tsx`.
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
 * tudo". Cada pessoa listada tem de ser resolvida na propria ficha, escolhendo
 * um cargo do catalogo (ou nao), caso a caso.
 *
 * NUNCA SE APAGA -- SO SE (DES)ACTIVA
 * -------------------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE; este ecra nem mostra a
 * opcao. "Desactivar" e "Reactivar" sao o UPDATE de `activo`.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
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
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCargos, type NovoCargoRH } from "@/hooks/useCargos";
import { useCargosSalariosDivergentes } from "@/hooks/useCargosSalariosDivergentes";
import type { Periodicidade } from "@/types/hr";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { Briefcase, Loader2, Plus, Pencil, Ban, RotateCcw, AlertTriangle } from "lucide-react";

const FORM_VAZIO: NovoCargoRH = {
  nome: "",
  salario_base: 0,
  periodicidade: "mensal",
  horas_referencia: null,
};

export default function ConfiguracaoCargos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeVer = hasPermission("hr.pessoas.laborais.view");
  const podeEditar = hasPermission("hr.pessoas.laborais.edit");

  const { cargos, isLoading, isSaving, criar, editar, definirActivo } = useCargos();
  const { divergencias, isLoading: divergenciasALoad } = useCargosSalariosDivergentes();

  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [cargoAEditar, setCargoAEditar] = useState<string | null>(null);
  const [form, setForm] = useState<NovoCargoRH>(FORM_VAZIO);

  const cargosVisiveis = mostrarInactivos ? cargos : cargos.filter((c) => c.activo);

  const abrirNovo = () => {
    setCargoAEditar(null);
    setForm(FORM_VAZIO);
    setDialogoAberto(true);
  };

  const abrirEdicao = (cargo: (typeof cargos)[number]) => {
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

  const alternarActivo = async (cargo: (typeof cargos)[number]) => {
    try {
      await definirActivo(cargo.id, !cargo.activo);
      toast.success(cargo.activo ? t("hr.cargos.desactivarSucesso") : t("hr.cargos.reactivarSucesso"));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeVer) return <SemAcessoCard className="m-6" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("hr.cargos.tituloPagina")}</h1>
          <p className="text-muted-foreground">{t("hr.cargos.subtitulo")}</p>
        </div>
        {podeEditar && (
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4 mr-2" /> {t("hr.cargos.novoCargo")}
          </Button>
        )}
      </div>

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
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("hr.cargos.tituloPagina")}</CardTitle>
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
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <OlyviaLoader size={32} />
            </div>
          ) : cargosVisiveis.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("hr.cargos.semCargos")}</p>
            </div>
          ) : (
            cargosVisiveis.map((cargo) => (
              <div
                key={cargo.id}
                className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{cargo.nome}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {cargo.salario_base} {t(`hr.periodicidade.${cargo.periodicidade}`)}
                      </Badge>
                      <Badge variant={cargo.activo ? "default" : "secondary"} className="text-[10px]">
                        {cargo.activo ? t("hr.cargos.activo") : t("hr.cargos.inactivo")}
                      </Badge>
                    </div>
                  </div>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1 shrink-0">
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
                )}
              </div>
            ))
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
