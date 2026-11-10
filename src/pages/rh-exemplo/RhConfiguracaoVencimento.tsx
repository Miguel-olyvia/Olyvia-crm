/**
 * Configuracao do dominio "Processamento Salarial" (nome de apresentacao;
 * dominio interno continua "vencimento" -- ficheiro, permissoes
 * hr.vencimento.* e hooks nao mudam de nome, 20261201180000..20261201200000):
 * os codigos de processamento salarial, as regras salariais e as horas extra
 * da organizacao activa.
 *
 * O SUBSIDIO DE ALIMENTACAO JA NAO TEM SEPARADOR PROPRIO: o valor por dia e o
 * limite de minutos vêm da regra salarial em vigor (separador «Regras salariais»).
 * O separador «Codigos» pede hr.vencimento.codigos.view/.gerir; o ecra so mostra
 * "sem acesso" se faltarem a leitura dos codigos E a do subsidio.
 *
 * Segue o padrao de gating de `ConfiguracaoAdmissao.tsx` e o padrao de lista
 * activar/desactivar de `ConfiguracaoModelosDocumentos.tsx`.
 */
import { useState } from "react";
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
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCodigosProcessamento } from "@/components/rh-exemplo/hooks/useCodigosProcessamento";
import type { CamposCodigoProcessamento } from "@/components/rh-exemplo/hooks/useCodigosProcessamento";
import { resumoCodigoProcessamento } from "@/components/rh-exemplo/lib/resumoCodigoProcessamento";
import type {
  HrCodigoProcessamento,
  HrCodigoProcessamentoModoCalculo,
  HrCodigoProcessamentoOrigemAutomatica,
} from "@/components/rh-exemplo/tipos";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { ConfiguracaoHorasExtra } from "@/components/rh-exemplo/fluxosC/ConfiguracaoHorasExtra";
import { ConfiguracaoMargemTempo } from "@/components/rh-exemplo/fluxosC/ConfiguracaoMargemTempo";
import { ConfiguracaoSubsidios } from "@/components/rh-exemplo/fluxosC/ConfiguracaoSubsidios";
import { ConfiguracaoPeriodoFolha } from "@/components/rh-exemplo/fluxosC/ConfiguracaoPeriodoFolha";
import { SeccaoRegrasSalariais } from "@/components/rh-exemplo/hooks/regrasSalariaisReal";
import { Ban, Loader2, Pencil, Plus, RotateCcw, Tag } from "lucide-react";

/** Os 4 modos, na ordem em que aparecem no Select. */
const MODOS_CALCULO: readonly HrCodigoProcessamentoModoCalculo[] = [
  "manual",
  "percentagem_hora_normal",
  "valor_fixo_ocorrencia",
  "valor_fixo_mensal",
];

/**
 * As origens escolhiveis em `percentagem_hora_normal` (que agora paga ao valor da regra salarial da origem).
 * `horas_extra_noturnas` ja nao se oferece; so continua visivel num codigo que ja a tinha (ver `origensDisponiveisParaModo`).
 */
const TODAS_ORIGENS: readonly HrCodigoProcessamentoOrigemAutomatica[] = [
  "horas_extra",
  "feriado_trabalhado",
  "descanso_trabalhado",
];

/**
 * A base (CHECK `modo_parametro_coerente`) exige uma percentagem NAO nula em `percentagem_hora_normal`, embora o calculo
 * ja a ignore. Ao criar, envia-se este valor neutro (100 = hora normal); ao editar, mantem-se o que o codigo ja tinha.
 */
const PERCENTAGEM_NEUTRA = 100;

/**
 * So `feriado_trabalhado`/`descanso_trabalhado` tem uma "ocorrencia" com
 * unidade natural (um dia) -- `horas_extra`/`horas_extra_noturnas` contam-se
 * em minutos, sem unidade de ocorrencia nenhuma (confirmado em
 * `src/lib/hr/processamentoTotais.ts`, `OCORRENCIAS_POR_ORIGEM`: so estas
 * duas tem entrada nesse mapa). Por isso `valor_fixo_ocorrencia` so oferece
 * estas duas -- a base tambem so aceita isto para os outros dois modos que
 * tem origem automatica (`percentagem_hora_normal` aceita as 4).
 */
const ORIGENS_VALOR_FIXO_OCORRENCIA: readonly HrCodigoProcessamentoOrigemAutomatica[] = [
  "feriado_trabalhado",
  "descanso_trabalhado",
];

function origensDisponiveisParaModo(
  modo: HrCodigoProcessamentoModoCalculo,
  origemActual: HrCodigoProcessamentoOrigemAutomatica | "" = "",
): readonly HrCodigoProcessamentoOrigemAutomatica[] {
  if (modo === "percentagem_hora_normal") {
    return origemActual === "horas_extra_noturnas" ? [...TODAS_ORIGENS, "horas_extra_noturnas"] : TODAS_ORIGENS;
  }
  if (modo === "valor_fixo_ocorrencia") return ORIGENS_VALOR_FIXO_OCORRENCIA;
  return [];
}

interface FormCodigoProcessamento {
  codigo: string;
  nome: string;
  descricao: string;
  modo_calculo: HrCodigoProcessamentoModoCalculo;
  percentagem: string;
  valor_fixo: string;
  /** "" == nenhuma origem automatica (aplicado a mao). */
  origem_automatica: HrCodigoProcessamentoOrigemAutomatica | "";
}

const FORM_VAZIO: FormCodigoProcessamento = {
  codigo: "",
  nome: "",
  descricao: "",
  modo_calculo: "manual",
  percentagem: "",
  valor_fixo: "",
  origem_automatica: "",
};

/** `null` == valido. Confirma no formulario o que a base tambem exige, para
 *  nao depender so do erro em bruto da constraint. */
function erroDeValidacao(form: FormCodigoProcessamento): string | null {
  // `percentagem_hora_normal` ja nao pede percentagem (ver `PERCENTAGEM_NEUTRA`).
  if (form.modo_calculo === "valor_fixo_ocorrencia" || form.modo_calculo === "valor_fixo_mensal") {
    if (form.valor_fixo.trim() === "") {
      return "hr.vencimento.codigos.erroValorFixo";
    }
    const valorFixo = Number(form.valor_fixo);
    if (!Number.isFinite(valorFixo) || valorFixo < 0 || valorFixo > 100000) {
      return "hr.vencimento.codigos.erroValorFixo";
    }
  }
  return null;
}

/** Constroi so os campos que a base espera -- nunca os dois parametros
 *  preenchidos ao mesmo tempo, origem so nos dois modos que a suportam. */
function construirCampos(form: FormCodigoProcessamento): CamposCodigoProcessamento {
  const origensValidas = origensDisponiveisParaModo(form.modo_calculo, form.origem_automatica);
  const percentagemExistente = form.percentagem.trim() === "" ? NaN : Number(form.percentagem);
  return {
    nome: form.nome.trim(),
    descricao: form.descricao.trim() || null,
    modo_calculo: form.modo_calculo,
    percentagem:
      form.modo_calculo === "percentagem_hora_normal"
        ? Number.isFinite(percentagemExistente)
          ? percentagemExistente
          : PERCENTAGEM_NEUTRA
        : null,
    valor_fixo:
      form.modo_calculo === "valor_fixo_ocorrencia" || form.modo_calculo === "valor_fixo_mensal"
        ? Number(form.valor_fixo)
        : null,
    origem_automatica:
      form.origem_automatica && origensValidas.includes(form.origem_automatica)
        ? form.origem_automatica
        : null,
  };
}

function SeccaoCodigosProcessamento({ podeGerir }: { podeGerir: boolean }) {
  const { t } = useTranslation();
  const { codigos, isLoading, isSaving, criar, actualizar, definirActivo } = useCodigosProcessamento();

  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [form, setForm] = useState<FormCodigoProcessamento>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  /** Origem -> nome do codigo ACTIVO que ja a reclama, EXCLUINDO o proprio
   *  codigo em edicao (senao editar um codigo mostraria a sua propria origem
   *  como "ja usada"). O indice unico parcial da base so bloqueia por
   *  organizacao+origem entre codigos ACTIVOS -- aqui so se antecipa isso. */
  const origensReclamadas = new Map<HrCodigoProcessamentoOrigemAutomatica, string>();
  for (const c of codigos) {
    if (c.activo && c.origem_automatica && c.id !== editandoId) {
      origensReclamadas.set(c.origem_automatica, c.nome);
    }
  }

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setDialogoAberto(true);
  };

  const abrirEditar = (codigo: HrCodigoProcessamento) => {
    setEditandoId(codigo.id);
    setForm({
      codigo: codigo.codigo,
      nome: codigo.nome,
      descricao: codigo.descricao ?? "",
      modo_calculo: codigo.modo_calculo,
      percentagem: codigo.percentagem !== null ? String(codigo.percentagem) : "",
      valor_fixo: codigo.valor_fixo !== null ? String(codigo.valor_fixo) : "",
      origem_automatica: codigo.origem_automatica ?? "",
    });
    setDialogoAberto(true);
  };

  const fecharDialogo = () => {
    setDialogoAberto(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
  };

  /** Trocar de modo limpa sempre o parametro do modo anterior -- nunca deixa
   *  o valor antigo la escondido a espera de ser enviado por engano -- e
   *  limpa a origem se deixar de ser uma opcao valida no modo novo. */
  const mudarModo = (novoModo: HrCodigoProcessamentoModoCalculo) => {
    setForm((f) => {
      const origensValidas = origensDisponiveisParaModo(novoModo, f.origem_automatica);
      return {
        ...f,
        modo_calculo: novoModo,
        percentagem: novoModo === "percentagem_hora_normal" ? f.percentagem : "",
        valor_fixo:
          novoModo === "valor_fixo_ocorrencia" || novoModo === "valor_fixo_mensal" ? f.valor_fixo : "",
        origem_automatica:
          f.origem_automatica && origensValidas.includes(f.origem_automatica) ? f.origem_automatica : "",
      };
    });
  };

  const submeter = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) return;
    const erro = erroDeValidacao(form);
    if (erro) {
      toast.error(t(erro));
      return;
    }
    const campos = construirCampos(form);
    try {
      if (editandoId) {
        await actualizar(editandoId, campos);
        toast.success(t("hr.vencimento.codigos.actualizarSucesso"));
      } else {
        await criar({ codigo: form.codigo.trim(), ...campos });
        toast.success(t("hr.vencimento.codigos.criarSucesso"));
      }
      fecharDialogo();
    } catch (erroSubmissao) {
      toast.error(await getFriendlyErrorMessage(erroSubmissao));
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

  const origensParaOModoActual = origensDisponiveisParaModo(form.modo_calculo, form.origem_automatica);

  const linha = (codigo: HrCodigoProcessamento) => (
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
            <Badge variant={codigo.activo ? "default" : "secondary"} className="text-[10px]">
              {codigo.activo ? t("hr.vencimento.codigos.activo") : t("hr.vencimento.codigos.inactivo")}
            </Badge>
            <span className="text-xs text-muted-foreground">{resumoCodigoProcessamento(codigo, t)}</span>
          </div>
          {codigo.descricao && (
            <p className="text-xs text-muted-foreground mt-0.5">{codigo.descricao}</p>
          )}
        </div>
      </div>
      {podeGerir && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => abrirEditar(codigo)}
            title={t("hr.vencimento.codigos.editar")}
            aria-label={t("hr.vencimento.codigos.editar")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => alternarActivo(codigo)}
            title={
              codigo.activo
                ? t("hr.vencimento.codigos.desactivar")
                : t("hr.vencimento.codigos.reactivar")
            }
            aria-label={
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
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("hr.vencimento.codigos.titulo")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("hr.vencimento.codigos.subtitulo")}</p>
          </div>
          {podeGerir && (
            <Button onClick={abrirNovo}>
              <Plus className="h-4 w-4 mr-2" /> {t("hr.vencimento.codigos.novoCodigo")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <OlyviaLoader size={28} />
            </div>
          ) : codigos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("hr.vencimento.codigos.semCodigos")}</p>
            </div>
          ) : (
            codigos.map((codigo) => linha(codigo))
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={(open) => !open && fecharDialogo()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editandoId ? t("hr.vencimento.codigos.editarCodigo") : t("hr.vencimento.codigos.novoCodigo")}
            </DialogTitle>
            <DialogDescription>{t("hr.vencimento.codigos.subtitulo")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigo-processamento-codigo">{t("hr.vencimento.codigos.campoCodigo")}</Label>
              <Input
                id="codigo-processamento-codigo"
                value={form.codigo}
                disabled={!!editandoId}
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

            <div className="space-y-2">
              <Label htmlFor="codigo-processamento-modo-calculo">
                {t("hr.vencimento.codigos.campoModoCalculo")}
              </Label>
              <Select value={form.modo_calculo} onValueChange={(v) => mudarModo(v as HrCodigoProcessamentoModoCalculo)}>
                <SelectTrigger id="codigo-processamento-modo-calculo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODOS_CALCULO.map((modo) => (
                    <SelectItem key={modo} value={modo}>
                      {t(`hr.vencimento.codigos.modoCalculo.${modo}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.modo_calculo === "manual" && (
              <p className="text-xs text-muted-foreground">{t("hr.vencimento.codigos.manualAjuda")}</p>
            )}

            {form.modo_calculo === "percentagem_hora_normal" && (
              <p className="text-xs text-muted-foreground">{t("hr.vencimento.codigos.regraOrigemAjuda")}</p>
            )}

            {(form.modo_calculo === "valor_fixo_ocorrencia" || form.modo_calculo === "valor_fixo_mensal") && (
              <div className="space-y-2">
                <Label htmlFor="codigo-processamento-valor-fixo">
                  {t("hr.vencimento.codigos.campoValorFixo")}
                </Label>
                <Input
                  id="codigo-processamento-valor-fixo"
                  type="number"
                  min={0}
                  max={100000}
                  step="0.01"
                  value={form.valor_fixo}
                  onChange={(e) => setForm((f) => ({ ...f, valor_fixo: e.target.value }))}
                />
              </div>
            )}

            {origensParaOModoActual.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="codigo-processamento-origem-automatica">
                  {t("hr.vencimento.codigos.campoOrigemAutomatica")}
                </Label>
                <Select
                  value={form.origem_automatica || "nenhuma"}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      origem_automatica: v === "nenhuma" ? "" : (v as HrCodigoProcessamentoOrigemAutomatica),
                    }))
                  }
                >
                  <SelectTrigger id="codigo-processamento-origem-automatica">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">{t("hr.vencimento.codigos.origemNenhuma")}</SelectItem>
                    {origensParaOModoActual.map((origem) => {
                      const codigoQueJaUsa = origensReclamadas.get(origem);
                      return (
                        <SelectItem key={origem} value={origem} disabled={!!codigoQueJaUsa}>
                          {t(`hr.vencimento.codigos.origem.${origem}`)}
                          {codigoQueJaUsa
                            ? ` — ${t("hr.vencimento.codigos.origemJaUsada", { nome: codigoQueJaUsa })}`
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              {editandoId ? t("hr.vencimento.codigos.guardarAlteracoes") : t("hr.vencimento.codigos.novoCodigo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


export default function RhConfiguracaoVencimento() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // A aba escolhida: `null` = a de omissão. Controlada para a ligação das horas extra poder levar às regras salariais.
  const [aba, setAba] = useState<string | null>(null);

  const podeVerCodigos = hasPermission("hr.vencimento.codigos.view");
  const podeGerirCodigos = hasPermission("hr.vencimento.codigos.gerir");
  // A permissao de ver o subsidio continua a dar acesso ao ecra (o separador antigo do subsidio ja nao existe:
  // o valor e o limite vêm da regra salarial).
  const podeVerSubsidio = hasPermission("hr.vencimento.subsidio.view");
  // As regras, as horas extra e os subsídios entram com uma das duas permissões acima (como o ecrã antigo); o período da folha tem as suas:
  // ver dá entrada na página e o separador, gravar pede periodo.gerir.
  const podeVerRegras = podeVerCodigos || podeVerSubsidio;
  const podeVerPeriodo = hasPermission("hr.processamento.periodo.view");
  const podeGerirPeriodo = hasPermission("hr.processamento.periodo.gerir");

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeVerCodigos && !podeVerSubsidio && !podeVerPeriodo) return <SemAcessoCard className="m-6" />;

  const abaOmissao = podeVerCodigos ? "codigos" : podeVerRegras ? "regras" : "periodo";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.vencimento.tituloPagina")}</h1>
        <p className="text-muted-foreground">{t("hr.vencimento.subtituloPagina")}</p>
      </div>

      <Tabs value={aba ?? abaOmissao} onValueChange={setAba}>
        <TabsList>
          {podeVerCodigos && (
            <TabsTrigger value="codigos">{t("hr.vencimento.abaCodigos")}</TabsTrigger>
          )}
          {podeVerRegras && (
            <>
              <TabsTrigger value="regras">{t("hr.vencimento.abaRegrasSalariais")}</TabsTrigger>
              <TabsTrigger value="horas-extra">{t("rhFluxosD.cfg.aba")}</TabsTrigger>
              <TabsTrigger value="subsidios">{t("rhSubs.cfg.aba")}</TabsTrigger>
            </>
          )}
          {podeVerPeriodo && <TabsTrigger value="periodo">{t("hr.vencimento.abaPeriodoFolha")}</TabsTrigger>}
        </TabsList>

        {podeVerCodigos && (
          <TabsContent value="codigos" className="mt-4">
            <SeccaoCodigosProcessamento podeGerir={podeGerirCodigos} />
          </TabsContent>
        )}
        {podeVerRegras && (
          <>
            <TabsContent value="regras" className="mt-4">
              <SeccaoRegrasSalariais podeGerir={podeGerirCodigos} />
            </TabsContent>

            <TabsContent value="horas-extra" className="mt-4 space-y-4">
              <ConfiguracaoHorasExtra aoIrParaRegrasSalariais={() => setAba("regras")} />
              <ConfiguracaoMargemTempo />
            </TabsContent>

            <TabsContent value="subsidios" className="mt-4">
              <ConfiguracaoSubsidios podeGerir={podeGerirCodigos} />
            </TabsContent>
          </>
        )}

        {podeVerPeriodo && (
          <TabsContent value="periodo" className="mt-4">
            <ConfiguracaoPeriodoFolha podeGerir={podeGerirPeriodo} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
