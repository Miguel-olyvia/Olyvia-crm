/**
 * Configuracao do dominio "Vencimento" (20261201180000..20261201200000): os
 * codigos de processamento salarial e a regra do subsidio de alimentacao da
 * organizacao activa. SO CATALOGO/CONFIGURACAO -- sem calculo nenhum ligado
 * a assiduidade ainda (confirmado com o utilizador, fica para depois).
 *
 * Segue o padrao de gating de `ConfiguracaoAdmissao.tsx` e o padrao de lista
 * activar/desactivar de `ConfiguracaoModelosDocumentos.tsx`. Duas seccoes
 * (Tabs) em vez de dois ecras: os dois assuntos sao pequenos e do mesmo
 * dominio ("o que entra no processamento salarial desta empresa").
 *
 * DOIS SEPARADORES, DUAS PERMISSOES DIFERENTES
 * -------------------------------------------------
 * "Codigos" pede hr.vencimento.codigos.view/.gerir; "Subsidio de
 * alimentacao" pede hr.vencimento.subsidio.view/.gerir. Uma pessoa pode ter
 * so uma das duas -- por isso cada separador esconde-se por si, e o ecra so
 * mostra "sem acesso" se NENHUMA das duas permissoes de leitura existir.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCodigosProcessamento } from "@/hooks/useCodigosProcessamento";
import { useRegrasSubsidioAlimentacao } from "@/hooks/useRegrasSubsidioAlimentacao";
import type { HrCodigoProcessamento } from "@/types/hr";
import type { SubsidioAlimentacaoModo } from "@/types/hr";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { Ban, Loader2, Plus, RotateCcw, Tag } from "lucide-react";

const FORM_VAZIO = { codigo: "", nome: "", descricao: "" };

function SeccaoCodigosProcessamento({ podeGerir }: { podeGerir: boolean }) {
  const { t } = useTranslation();
  const { codigos, isLoading, isSaving, criar, definirActivo } = useCodigosProcessamento();

  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const { transversais, proprios } = useMemo(() => {
    const t: HrCodigoProcessamento[] = [];
    const p: HrCodigoProcessamento[] = [];
    for (const codigo of codigos) {
      (codigo.organization_id === null ? t : p).push(codigo);
    }
    return { transversais: t, proprios: p };
  }, [codigos]);

  const abrirNovo = () => {
    setForm(FORM_VAZIO);
    setDialogoAberto(true);
  };

  const fecharDialogo = () => {
    setDialogoAberto(false);
    setForm(FORM_VAZIO);
  };

  const submeter = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) return;
    try {
      await criar({
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
      });
      toast.success(t("hr.vencimento.codigos.criarSucesso"));
      fecharDialogo();
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  const alternarActivo = async (codigo: HrCodigoProcessamento) => {
    try {
      await definirActivo(codigo.id, !codigo.activo);
      toast.success(
        codigo.activo
          ? t("hr.vencimento.codigos.desactivarSucesso")
          : t("hr.vencimento.codigos.reactivarSucesso"),
      );
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  const linha = (codigo: HrCodigoProcessamento, transversal: boolean) => (
    <div
      key={codigo.id}
      className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-mono">
              {codigo.codigo}
            </Badge>
            <span className="font-medium">{codigo.nome}</span>
            {transversal && (
              <Badge variant="secondary" className="text-[10px]">
                {t("hr.vencimento.codigos.transversal")}
              </Badge>
            )}
            <Badge variant={codigo.activo ? "default" : "secondary"} className="text-[10px]">
              {codigo.activo ? t("hr.vencimento.codigos.activo") : t("hr.vencimento.codigos.inactivo")}
            </Badge>
          </div>
          {codigo.descricao && (
            <p className="text-xs text-muted-foreground mt-0.5">{codigo.descricao}</p>
          )}
        </div>
      </div>
      {!transversal && podeGerir && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => alternarActivo(codigo)}
          title={
            codigo.activo
              ? t("hr.vencimento.codigos.desactivar")
              : t("hr.vencimento.codigos.reactivar")
          }
        >
          {codigo.activo ? (
            <Ban className="h-4 w-4 text-destructive" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.vencimento.codigos.tituloTransversais")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("hr.vencimento.codigos.subtituloTransversais")}</p>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <OlyviaLoader size={28} />
            </div>
          ) : (
            transversais.map((codigo) => linha(codigo, true))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("hr.vencimento.codigos.tituloProprios")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("hr.vencimento.codigos.subtituloProprios")}</p>
          </div>
          {podeGerir && (
            <Button onClick={abrirNovo}>
              <Plus className="h-4 w-4 mr-2" /> {t("hr.vencimento.codigos.novoCodigo")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          {!isLoading && proprios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("hr.vencimento.codigos.semCodigosProprios")}</p>
            </div>
          ) : (
            proprios.map((codigo) => linha(codigo, false))
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={(open) => !open && fecharDialogo()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("hr.vencimento.codigos.novoCodigo")}</DialogTitle>
            <DialogDescription>{t("hr.vencimento.codigos.subtituloProprios")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigo-processamento-codigo">{t("hr.vencimento.codigos.campoCodigo")}</Label>
              <Input
                id="codigo-processamento-codigo"
                value={form.codigo}
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                placeholder="300"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigo-processamento-nome">{t("hr.vencimento.codigos.campoNome")}</Label>
              <Input
                id="codigo-processamento-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigo-processamento-descricao">{t("hr.vencimento.codigos.campoDescricao")}</Label>
              <Textarea
                id="codigo-processamento-descricao"
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={fecharDialogo}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={submeter}
              disabled={isSaving || !form.codigo.trim() || !form.nome.trim()}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("hr.vencimento.codigos.novoCodigo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MODOS_SUBSIDIO: readonly SubsidioAlimentacaoModo[] = ["dinheiro", "cartao"];

type UnidadeMinutosMinimos = "minutos" | "horas";
const UNIDADES_MINUTOS_MINIMOS: readonly UnidadeMinutosMinimos[] = ["minutos", "horas"];

/**
 * Converte o texto do campo (na unidade em que a pessoa esta a escrever)
 * para minutos inteiros -- a unica unidade que a base guarda
 * (`minutos_minimos_dia integer`). Em horas aceita fraccoes (ex. "1.5") e
 * arredonda ao minuto mais proximo; nunca se grava fraccao de minuto.
 */
function paraMinutos(valorTexto: string, unidade: UnidadeMinutosMinimos): number {
  const valor = Number(valorTexto);
  if (!Number.isFinite(valor)) return NaN;
  return unidade === "horas" ? Math.round(valor * 60) : valor;
}

/**
 * Converte minutos (o valor real, sempre guardado) para o texto a mostrar
 * na unidade escolhida. Horas ficam com no maximo 2 casas decimais, sem
 * zeros a mais (90 minutos -> "1.5", nao "1.50").
 */
function deMinutosParaTexto(minutos: number, unidade: UnidadeMinutosMinimos): string {
  if (!Number.isFinite(minutos)) return "";
  if (unidade === "minutos") return String(minutos);
  const horas = Math.round((minutos / 60) * 100) / 100;
  return String(horas);
}

function SeccaoSubsidioAlimentacao({ podeGerir }: { podeGerir: boolean }) {
  const { t } = useTranslation();
  const { regra, isLoading, isSaving, gravar } = useRegrasSubsidioAlimentacao();

  const [valorDiario, setValorDiario] = useState<string>("");
  const [modo, setModo] = useState<SubsidioAlimentacaoModo>("dinheiro");
  const [minutosMinimosDia, setMinutosMinimosDia] = useState<string>("");
  const [unidadeMinutosMinimos, setUnidadeMinutosMinimos] = useState<UnidadeMinutosMinimos>("minutos");

  // Sincroniza os campos com a regra carregada (gravada ou omissao) so
  // quando o carregamento termina -- o formulario continua editavel a
  // partir dai sem se sobrepor ao que o utilizador esta a escrever. A
  // unidade volta sempre a "minutos" (a omissao pedida): o valor gravado na
  // base e sempre em minutos, a unidade e so uma conveniencia de escrita.
  useEffect(() => {
    if (isLoading) return;
    setValorDiario(String(regra.valorDiario));
    setModo(regra.modo);
    setUnidadeMinutosMinimos("minutos");
    setMinutosMinimosDia(String(regra.minutosMinimosDia));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  /** Ao trocar de unidade, converte o numero mostrado sem perder o valor
   *  real (que continua a ser sempre minutos, arredondados ao inteiro). */
  const mudarUnidadeMinutosMinimos = (novaUnidade: UnidadeMinutosMinimos) => {
    if (novaUnidade === unidadeMinutosMinimos) return;
    const minutosActuais = paraMinutos(minutosMinimosDia, unidadeMinutosMinimos);
    if (Number.isFinite(minutosActuais)) {
      setMinutosMinimosDia(deMinutosParaTexto(minutosActuais, novaUnidade));
    }
    setUnidadeMinutosMinimos(novaUnidade);
  };

  const submeter = async () => {
    const valor = Number(valorDiario);
    const minutos = paraMinutos(minutosMinimosDia, unidadeMinutosMinimos);
    if (!Number.isFinite(valor) || valor < 0) return;
    if (!Number.isInteger(minutos) || minutos <= 0) return;
    try {
      await gravar({ valorDiario: valor, modo, minutosMinimosDia: minutos });
      toast.success(t("hr.vencimento.subsidio.guardarSucesso"));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.vencimento.subsidio.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("hr.vencimento.subsidio.subtitulo")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <OlyviaLoader size={28} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subsidio-valor-diario">{t("hr.vencimento.subsidio.campoValorDiario")}</Label>
                <Input
                  id="subsidio-valor-diario"
                  type="number"
                  min={0}
                  step="0.01"
                  value={valorDiario}
                  disabled={!podeGerir}
                  onChange={(e) => setValorDiario(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subsidio-modo">{t("hr.vencimento.subsidio.campoModo")}</Label>
                <Select
                  value={modo}
                  onValueChange={(v) => setModo(v as SubsidioAlimentacaoModo)}
                  disabled={!podeGerir}
                >
                  <SelectTrigger id="subsidio-modo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODOS_SUBSIDIO.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`hr.vencimento.subsidio.modo.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subsidio-minutos-minimos">
                  {t(
                    unidadeMinutosMinimos === "horas"
                      ? "hr.vencimento.subsidio.campoMinimoDiaHoras"
                      : "hr.vencimento.subsidio.campoMinutosMinimos",
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="subsidio-minutos-minimos"
                    type="number"
                    min={unidadeMinutosMinimos === "horas" ? 0.01 : 1}
                    step={unidadeMinutosMinimos === "horas" ? "0.01" : "1"}
                    value={minutosMinimosDia}
                    disabled={!podeGerir}
                    onChange={(e) => setMinutosMinimosDia(e.target.value)}
                    className="flex-1"
                  />
                  <Select
                    value={unidadeMinutosMinimos}
                    onValueChange={(v) => mudarUnidadeMinutosMinimos(v as UnidadeMinutosMinimos)}
                    disabled={!podeGerir}
                  >
                    <SelectTrigger id="subsidio-minutos-minimos-unidade" className="w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES_MINUTOS_MINIMOS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {t(`hr.vencimento.subsidio.unidade.${u}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                unidadeMinutosMinimos === "horas"
                  ? "hr.vencimento.subsidio.minutosMinimosAjudaHoras"
                  : "hr.vencimento.subsidio.minutosMinimosAjuda",
              )}
            </p>

            {podeGerir && (
              <div className="flex justify-end">
                <Button onClick={submeter} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("common.save")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConfiguracaoVencimento() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const podeVerCodigos = hasPermission("hr.vencimento.codigos.view");
  const podeGerirCodigos = hasPermission("hr.vencimento.codigos.gerir");
  const podeVerSubsidio = hasPermission("hr.vencimento.subsidio.view");
  const podeGerirSubsidio = hasPermission("hr.vencimento.subsidio.gerir");

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeVerCodigos && !podeVerSubsidio) return <SemAcessoCard className="m-6" />;

  const abaOmissao = podeVerCodigos ? "codigos" : "subsidio";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.vencimento.tituloPagina")}</h1>
        <p className="text-muted-foreground">{t("hr.vencimento.subtituloPagina")}</p>
      </div>

      <Tabs defaultValue={abaOmissao}>
        <TabsList>
          {podeVerCodigos && (
            <TabsTrigger value="codigos">{t("hr.vencimento.abaCodigos")}</TabsTrigger>
          )}
          {podeVerSubsidio && (
            <TabsTrigger value="subsidio">{t("hr.vencimento.abaSubsidio")}</TabsTrigger>
          )}
        </TabsList>

        {podeVerCodigos && (
          <TabsContent value="codigos" className="mt-4">
            <SeccaoCodigosProcessamento podeGerir={podeGerirCodigos} />
          </TabsContent>
        )}
        {podeVerSubsidio && (
          <TabsContent value="subsidio" className="mt-4">
            <SeccaoSubsidioAlimentacao podeGerir={podeGerirSubsidio} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
