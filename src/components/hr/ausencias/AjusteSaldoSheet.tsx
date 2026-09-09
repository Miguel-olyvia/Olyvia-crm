/**
 * O ajuste manual do contador -- funcionalidade de primeira classe.
 *
 * A REGRA QUE SE VAI ESQUECER, E POR ISSO ESTA ESCRITA NO ECRA
 * ------------------------------------------------------------
 * Para corrigir um contador NAO se edita `dias_direito`. O direito e o que o
 * contrato ou a lei dizem; tudo o resto e ajuste, com autor, motivo e rasto.
 * Editar o direito para acertar um numero apaga a razao de ele ter mudado.
 *
 * DUAS GUARDAS ANTES DE SUBMETER
 * ------------------------------
 * 1. "Troca por dinheiro" fixa o sentido em RETIRAR: a base tem um CHECK que
 *    exige valor negativo, e descobri-lo pelo toast e mau.
 * 2. Com um tipo que conta para o minimo legal, o gozavel resultante e
 *    calculado em tempo real e o botao BLOQUEIA abaixo de 20 dias. Aqui o
 *    bloqueio no cliente e legitimo -- ao contrario do saldo de um pedido --
 *    porque a base bloqueia mesmo, com `ferias_minimo_legal`. A mensagem do
 *    servidor continua a ser a rede de seguranca, nao a primeira linha.
 *
 * O sinal nunca se escreve: sao dois botoes, "acrescentar" e "retirar", e um
 * numero positivo. Um campo que aceita "-2,5" e um convite ao engano.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { CampoSelect, CampoTexto, CamposTocadosProvider } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import {
  MINIMO_LEGAL_DIAS,
  avaliarAjuste,
  formatarDias,
  nomeTipoAusencia,
  sentidoObrigatorio,
} from "@/lib/hr/ausencias";
import type {
  AusenciaDireito,
  AusenciaSaldo,
  AusenciaTipo,
  MotivoAjuste,
} from "@/types/hrAusencias";

const MOTIVOS: MotivoAjuste[] = [
  "correccao",
  "transporte_periodo_anterior",
  "troca_por_dinheiro",
  "premio",
  "acerto_admissao",
  "acerto_cessacao",
  "outro",
];

interface AjusteSaldoSheetProps {
  aberto: boolean;
  onFechar: () => void;
  tipos: AusenciaTipo[];
  saldos: AusenciaSaldo[];
  direitos: AusenciaDireito[];
  pessoaNome: string;
  saving: boolean;
  tipoInicial?: string | null;
  onAjustar: (args: {
    tipoId: string;
    periodoInicio: string;
    periodoFim: string;
    dias: number;
    motivoCodigo: MotivoAjuste;
    motivo: string;
    documentoRef?: string | null;
  }) => Promise<string | null>;
  idPrefixo?: string;
}

export function AjusteSaldoSheet({
  aberto,
  onFechar,
  tipos,
  saldos,
  direitos,
  pessoaNome,
  saving,
  tipoInicial,
  onAjustar,
  idPrefixo = "hr-ajuste",
}: AjusteSaldoSheetProps) {
  const { t } = useTranslation();

  const [tipoId, setTipoId] = useState(tipoInicial ?? "");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [sentido, setSentido] = useState<"acrescentar" | "retirar">("acrescentar");
  const [dias, setDias] = useState("");
  const [motivoCodigo, setMotivoCodigo] = useState<MotivoAjuste>("correccao");
  const [motivo, setMotivo] = useState("");
  const [documentoRef, setDocumentoRef] = useState("");
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const direitoDoTipo = useMemo(
    () => direitos.find((direito) => direito.tipo_id === tipoId) ?? null,
    [direitos, tipoId],
  );

  useEffect(() => {
    if (!aberto) return;
    setTipoId(tipoInicial ?? "");
    setSentido("acrescentar");
    setDias("");
    setMotivoCodigo("correccao");
    setMotivo("");
    setDocumentoRef("");
    setTocados(new Set());
    setMostrarTodos(false);
  }, [aberto, tipoInicial]);

  useEffect(() => {
    if (direitoDoTipo) {
      setPeriodoInicio(direitoDoTipo.periodo_inicio);
      setPeriodoFim(direitoDoTipo.periodo_fim);
    } else {
      const ano = new Date().getFullYear();
      setPeriodoInicio(`${ano}-01-01`);
      setPeriodoFim(`${ano}-12-31`);
    }
  }, [direitoDoTipo]);

  // A base tem um CHECK: troca por dinheiro e sempre negativa.
  const sentidoFixo = sentidoObrigatorio(motivoCodigo);
  useEffect(() => {
    if (sentidoFixo) setSentido(sentidoFixo);
  }, [sentidoFixo]);

  const tipo = useMemo(() => tipos.find((opcao) => opcao.id === tipoId) ?? null, [tipos, tipoId]);
  const saldo = useMemo(
    () =>
      saldos.find(
        (linha) => linha.tipo_id === tipoId && linha.periodo_inicio === periodoInicio,
      ) ?? null,
    [saldos, tipoId, periodoInicio],
  );

  const avaliacao = useMemo(
    () =>
      avaliarAjuste({
        sentido,
        diasAbsolutos: Number(dias.replace(",", ".")),
        saldo,
        contaMinimoLegal: Boolean(tipo?.conta_minimo_legal),
      }),
    [sentido, dias, saldo, tipo],
  );

  const tocar = (campoId: string) =>
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      const proximos = new Set(anteriores);
      proximos.add(campoId);
      return proximos;
    });

  const idTipo = `${idPrefixo}-tipo`;
  const idDias = `${idPrefixo}-dias`;
  const idMotivoCodigo = `${idPrefixo}-motivo-codigo`;
  const idMotivo = `${idPrefixo}-motivo`;
  const idDocumento = `${idPrefixo}-documento`;
  const idInicio = `${idPrefixo}-periodo-inicio`;
  const idFim = `${idPrefixo}-periodo-fim`;

  const erroDias =
    (mostrarTodos || tocados.has(idDias)) && avaliacao.eZero
      ? t("hr.ausencias.ajuste.erroZero")
      : null;
  const erroMotivo =
    (mostrarTodos || tocados.has(idMotivo)) && motivo.trim() === ""
      ? t("hr.ausencias.ajuste.erroSemMotivo")
      : null;
  const erroTipo = (mostrarTodos || tocados.has(idTipo)) && !tipo ? t("hr.ausencias.erro.semTipo") : null;

  const bloqueado = avaliacao.violaMinimoLegal;

  const submeter = async () => {
    setMostrarTodos(true);
    if (!tipo) {
      toast.error(t("hr.ausencias.erro.semTipo"));
      return;
    }
    if (avaliacao.eZero) {
      toast.error(t("hr.ausencias.ajuste.erroZero"));
      return;
    }
    if (motivo.trim() === "") {
      toast.error(t("hr.ausencias.ajuste.erroSemMotivo"));
      return;
    }
    if (bloqueado) {
      toast.error(t("hr.ausencias.ajuste.erroMinimoLegal", { minimo: MINIMO_LEGAL_DIAS }));
      return;
    }
    const erro = await onAjustar({
      tipoId: tipo.id,
      periodoInicio,
      periodoFim,
      dias: avaliacao.dias,
      motivoCodigo,
      motivo: motivo.trim(),
      documentoRef: documentoRef.trim() === "" ? null : documentoRef.trim(),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.ausencias.ajuste.aplicado"));
    onFechar();
  };

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("hr.ausencias.ajuste.titulo")}</SheetTitle>
          <SheetDescription>
            {t("hr.ausencias.ajuste.descricao", { nome: pessoaNome })}
          </SheetDescription>
        </SheetHeader>

        <CamposTocadosProvider onTocar={tocar}>
          <div className="space-y-4 py-4">
            <CampoSelect
              id={idTipo}
              label={t("hr.ausencias.campo.tipo")}
              valor={tipoId}
              onChange={setTipoId}
              erro={erroTipo}
              placeholder={t("hr.ausencias.campo.tipoPlaceholder")}
              opcoes={tipos.map((opcao) => ({ value: opcao.id, label: nomeTipoAusencia(opcao, t) }))}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <CampoTexto
                id={idInicio}
                label={t("hr.ausencias.ajuste.periodoInicio")}
                tipo="date"
                valor={periodoInicio}
                onChange={setPeriodoInicio}
              />
              <CampoTexto
                id={idFim}
                label={t("hr.ausencias.ajuste.periodoFim")}
                tipo="date"
                valor={periodoFim}
                onChange={setPeriodoFim}
              />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t("hr.ausencias.ajuste.sentido")}</legend>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={sentido === "acrescentar" ? "default" : "outline"}
                  disabled={sentidoFixo === "retirar"}
                  aria-pressed={sentido === "acrescentar"}
                  onClick={() => setSentido("acrescentar")}
                >
                  {t("hr.ausencias.ajuste.acrescentar")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sentido === "retirar" ? "default" : "outline"}
                  aria-pressed={sentido === "retirar"}
                  onClick={() => setSentido("retirar")}
                >
                  {t("hr.ausencias.ajuste.retirar")}
                </Button>
              </div>
              {sentidoFixo === "retirar" && (
                <p className="text-xs text-muted-foreground">
                  {t("hr.ausencias.ajuste.trocaEsempreRetirar")}
                </p>
              )}
            </fieldset>

            <CampoTexto
              id={idDias}
              label={t("hr.ausencias.ajuste.dias")}
              tipo="number"
              min={0}
              step="0.5"
              valor={dias}
              onChange={setDias}
              erro={erroDias}
            />

            <CampoSelect
              id={idMotivoCodigo}
              label={t("hr.ausencias.ajuste.motivoCodigo")}
              valor={motivoCodigo}
              onChange={(valor) => setMotivoCodigo(valor as MotivoAjuste)}
              opcoes={MOTIVOS.map((codigo) => ({
                value: codigo,
                label: t(`hr.ausencias.motivoAjuste.${codigo}`),
              }))}
            />

            <CampoTexto
              id={idMotivo}
              label={t("hr.ausencias.campo.motivoObrigatorio")}
              valor={motivo}
              onChange={setMotivo}
              erro={erroMotivo}
            />

            <CampoTexto
              id={idDocumento}
              label={t("hr.ausencias.ajuste.documentoRef")}
              valor={documentoRef}
              onChange={setDocumentoRef}
            />

            {tipo && (
              <div className="rounded-md border p-3 text-sm">
                <p>
                  {t("hr.ausencias.ajuste.gozavelDepois", {
                    valor: formatarDias(avaliacao.gozavelDepois),
                  })}
                </p>
                <p aria-live="polite" className="sr-only">
                  {bloqueado
                    ? t("hr.ausencias.ajuste.avisoMinimoLegal", {
                        valor: formatarDias(avaliacao.gozavelDepois),
                        minimo: MINIMO_LEGAL_DIAS,
                      })
                    : ""}
                </p>
              </div>
            )}

            {bloqueado && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("hr.ausencias.ajuste.avisoMinimoLegal", {
                    valor: formatarDias(avaliacao.gozavelDepois),
                    minimo: MINIMO_LEGAL_DIAS,
                  })}
                </AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground">{t("hr.ausencias.ajuste.naoEDireito")}</p>

            <div className="flex gap-2">
              <Button onClick={submeter} disabled={saving || bloqueado}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t("hr.ausencias.ajuste.aplicar")}
              </Button>
              <Button variant="ghost" onClick={onFechar} disabled={saving}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </CamposTocadosProvider>
      </SheetContent>
    </Sheet>
  );
}
