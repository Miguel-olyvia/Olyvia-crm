/**
 * Marcar a falta SOBRE O HORARIO PLANEADO, ao periodo e nao ao dia.
 *
 * O PEDIDO, NAS PALAVRAS DE QUEM O FEZ
 * ------------------------------------
 * "trabalhas das 9 as 18, mas so faltaste de manha, e se tens justificacao ou
 * nao". Por isso este formulario abre JA PREENCHIDO com as horas do intervalo
 * onde se carregou -- 09:00 e 13:00, e nao 09:00 e 18:00 -- e as horas ficam
 * editaveis, porque quem chegou as 10:30 falta das 09:00 as 10:30.
 *
 * Nao ha caminho especial para "o dia todo": o dia todo e o periodo do
 * primeiro ao ultimo minuto planeado, e a base conta os minutos na coluna
 * gerada. Uma falta que atravesse a meia-noite sao DUAS faltas, em duas datas.
 *
 * A JUSTIFICACAO E UM INTERRUPTOR, NAO UM SEGUNDO ECRA
 * ----------------------------------------------------
 * Desligado, a falta nasce `sem_justificacao`. Ligado, sao duas chamadas em
 * sequencia: marcar a falta e registar o documento, que a deixa
 * `pendente_documento`. REGISTAR NAO E DECIDIR -- justificar ou recusar e
 * outro gesto, com outra permissao, e o formulario di-lo.
 *
 * NAO HA SELECTOR DE FICHEIRO, e nao e esquecimento: o bucket
 * `hr-justificacoes` tem INSERT fechado a `authenticated` por politica
 * RESTRICTIVE ate existir a Edge Function de upload. Um `<input type="file">`
 * aqui era um controlo que ia falhar sempre.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import {
  CampoInterruptor,
  CampoSelect,
  CampoTexto,
  CamposTocadosProvider,
} from "@/components/hr/form/Campos";
import {
  avisoDeAusenciaParcial,
  formatarDuracao,
  justificacaoUtil,
  minutosEntre,
  problemasDaFalta,
} from "@/lib/hr/assiduidade";
import { MOTIVOS_FALTA, TIPOS_DOCUMENTO_FALTA } from "@/types/hrAssiduidade";
import type { MotivoFalta, TipoDocumentoFalta } from "@/types/hrAssiduidade";

export interface FaltaInicial {
  data: string;
  horaInicio: string;
  horaFim: string;
  planeadoId: string | null;
}

interface MarcarFaltaSheetProps {
  aberto: boolean;
  inicial: FaltaInicial;
  /** A fraccao de ausencia APROVADA nesse dia, se houver. Ver o aviso abaixo. */
  fraccaoAusenciaAprovada: number | null;
  podeRegistarJustificacao: boolean;
  aGravar: boolean;
  onFechar: () => void;
  /**
   * Uma so chamada, com a justificacao dentro quando o interruptor esta
   * ligado: o registo do documento precisa do id que a marcacao devolve, e
   * esse id nunca chega ao componente.
   */
  onMarcar: (args: {
    data: string;
    horaInicio: string;
    horaFim: string;
    motivoCodigo: MotivoFalta;
    planeadoId: string | null;
    remunerada: boolean;
    descontaSaldo: boolean;
    justificacao: {
      tipoDocumento: TipoDocumentoFalta | null;
      documentoRef: string | null;
      texto: string | null;
      entidadeEmissora: string | null;
      dataDocumento: string | null;
      diasAtestados: number | null;
    } | null;
  }) => Promise<string | null>;
  idPrefixo?: string;
}

export function MarcarFaltaSheet({
  aberto,
  inicial,
  fraccaoAusenciaAprovada,
  podeRegistarJustificacao,
  aGravar,
  onFechar,
  onMarcar,
  idPrefixo = "hr-falta",
}: MarcarFaltaSheetProps) {
  const { t } = useTranslation();

  const [horaInicio, setHoraInicio] = useState(inicial.horaInicio);
  const [horaFim, setHoraFim] = useState(inicial.horaFim);
  const [motivoCodigo, setMotivoCodigo] = useState<MotivoFalta | "">("");
  const [remunerada, setRemunerada] = useState(false);
  const [descontaSaldo, setDescontaSaldo] = useState(false);

  const [comJustificacao, setComJustificacao] = useState(false);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoFalta | "">("");
  const [documentoRef, setDocumentoRef] = useState("");
  const [entidade, setEntidade] = useState("");
  const [dataDocumento, setDataDocumento] = useState("");
  const [diasAtestados, setDiasAtestados] = useState("");
  const [texto, setTexto] = useState("");

  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setHoraInicio(inicial.horaInicio);
    setHoraFim(inicial.horaFim);
    setMotivoCodigo("");
    setRemunerada(false);
    setDescontaSaldo(false);
    setComJustificacao(false);
    setTipoDocumento("");
    setDocumentoRef("");
    setEntidade("");
    setDataDocumento("");
    setDiasAtestados("");
    setTexto("");
    setTocados(new Set());
    setMostrarTodos(false);
  }, [aberto, inicial.horaInicio, inicial.horaFim, inicial.data]);

  const tocar = (campoId: string) =>
    setTocados((anteriores) =>
      anteriores.has(campoId) ? anteriores : new Set(anteriores).add(campoId),
    );

  const problemas = useMemo(
    () =>
      problemasDaFalta({
        data: inicial.data,
        horaInicio,
        horaFim,
        motivoCodigo,
      }),
    [inicial.data, horaInicio, horaFim, motivoCodigo],
  );

  const minutos = minutosEntre(horaInicio, horaFim);
  const avisaAusenciaParcial = avisoDeAusenciaParcial(fraccaoAusenciaAprovada);

  const idInicio = `${idPrefixo}-inicio`;
  const idFim = `${idPrefixo}-fim`;
  const idMotivo = `${idPrefixo}-motivo`;
  const idRemunerada = `${idPrefixo}-remunerada`;
  const idDesconta = `${idPrefixo}-desconta`;
  const idTemJustificacao = `${idPrefixo}-tem-justificacao`;
  const idTipoDoc = `${idPrefixo}-tipo-documento`;
  const idRef = `${idPrefixo}-referencia`;
  const idEntidade = `${idPrefixo}-entidade`;
  const idDataDoc = `${idPrefixo}-data-documento`;
  const idDias = `${idPrefixo}-dias-atestados`;
  const idTexto = `${idPrefixo}-texto`;

  const erroDe = (campo: string, id: string) => {
    const problema = problemas.find((p) => p.campo === campo);
    if (!problema) return null;
    if (!mostrarTodos && !tocados.has(id)) return null;
    return t(problema.mensagemKey);
  };

  const gravar = async () => {
    if (problemas.length > 0) {
      setMostrarTodos(true);
      toast.error(t(problemas[0].mensagemKey));
      return;
    }
    if (comJustificacao && !justificacaoUtil(documentoRef, texto)) {
      setMostrarTodos(true);
      toast.error(t("hr.assiduidade.erro.justificacaoVazia"));
      return;
    }

    const erro = await onMarcar({
      data: inicial.data,
      horaInicio,
      horaFim,
      motivoCodigo: motivoCodigo as MotivoFalta,
      planeadoId: inicial.planeadoId,
      remunerada,
      descontaSaldo,
      justificacao: comJustificacao
        ? {
            tipoDocumento: tipoDocumento === "" ? null : tipoDocumento,
            documentoRef: documentoRef.trim() || null,
            texto: texto.trim() || null,
            entidadeEmissora: entidade.trim() || null,
            dataDocumento: dataDocumento || null,
            diasAtestados: diasAtestados ? Number(diasAtestados) : null,
          }
        : null,
    });
    if (erro) {
      toast.error(t(erro));
      return;
    }

    toast.success(t("hr.assiduidade.falta.marcada"));
    onFechar();
  };

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("hr.assiduidade.falta.titulo")}</SheetTitle>
          <SheetDescription>
            {t("hr.assiduidade.falta.explicacao", { data: inicial.data })}
          </SheetDescription>
        </SheetHeader>

        {avisaAusenciaParcial && (
          <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            {t("hr.assiduidade.falta.avisoMeiaAusencia")}
          </p>
        )}

        <CamposTocadosProvider onTocar={tocar}>
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                id={idInicio}
                label={t("hr.assiduidade.campo.horaInicio")}
                tipo="time"
                valor={horaInicio}
                erro={erroDe("horaInicio", idInicio)}
                onChange={setHoraInicio}
              />
              <CampoTexto
                id={idFim}
                label={t("hr.assiduidade.campo.horaFim")}
                tipo="time"
                valor={horaFim}
                erro={erroDe("horaFim", idFim)}
                onChange={setHoraFim}
              />
            </div>

            {/* O contador vive: e a coluna `minutos` que a base vai calcular. */}
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {minutos !== null && minutos > 0
                ? t("hr.assiduidade.falta.duracao", { duracao: formatarDuracao(minutos) })
                : t("hr.assiduidade.falta.semDuracao")}
            </p>

            <CampoSelect
              id={idMotivo}
              label={t("hr.assiduidade.campo.motivoFalta")}
              valor={motivoCodigo}
              erro={erroDe("motivoCodigo", idMotivo)}
              placeholder={t("hr.assiduidade.campo.escolher")}
              onChange={(valor) => setMotivoCodigo(valor as MotivoFalta)}
              opcoes={MOTIVOS_FALTA.map((codigo) => ({
                value: codigo,
                label: t(`hr.assiduidade.motivoFalta.${codigo}`),
              }))}
            />

            <CampoInterruptor
              id={idRemunerada}
              label={t("hr.assiduidade.campo.remunerada")}
              checked={remunerada}
              onChange={setRemunerada}
            />
            <CampoInterruptor
              id={idDesconta}
              label={t("hr.assiduidade.campo.descontaSaldo")}
              checked={descontaSaldo}
              onChange={setDescontaSaldo}
            />

            {podeRegistarJustificacao && (
              <>
                <CampoInterruptor
                  id={idTemJustificacao}
                  label={t("hr.assiduidade.falta.temJustificacao")}
                  descricao={t("hr.assiduidade.falta.registarNaoEDecidir")}
                  checked={comJustificacao}
                  onChange={setComJustificacao}
                />

                {comJustificacao && (
                  <div className="space-y-4 rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      {t("hr.assiduidade.justificacao.semFicheiro")}
                    </p>

                    <CampoSelect
                      id={idTipoDoc}
                      label={t("hr.assiduidade.campo.tipoDocumento")}
                      valor={tipoDocumento}
                      vazioLabel={t("hr.assiduidade.campo.semTipoDocumento")}
                      onChange={(valor) => setTipoDocumento(valor as TipoDocumentoFalta)}
                      opcoes={TIPOS_DOCUMENTO_FALTA.map((codigo) => ({
                        value: codigo,
                        label: t(`hr.assiduidade.tipoDocumento.${codigo}`),
                      }))}
                    />

                    <CampoTexto
                      id={idRef}
                      label={t("hr.assiduidade.campo.documentoRef")}
                      ajuda={t("hr.assiduidade.campo.documentoRefAjuda")}
                      valor={documentoRef}
                      onChange={setDocumentoRef}
                    />

                    <CampoTexto
                      id={idEntidade}
                      label={t("hr.assiduidade.campo.entidadeEmissora")}
                      valor={entidade}
                      onChange={setEntidade}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <CampoTexto
                        id={idDataDoc}
                        label={t("hr.assiduidade.campo.dataDocumento")}
                        tipo="date"
                        valor={dataDocumento}
                        onChange={setDataDocumento}
                      />
                      <CampoTexto
                        id={idDias}
                        label={t("hr.assiduidade.campo.diasAtestados")}
                        tipo="number"
                        min={0}
                        valor={diasAtestados}
                        onChange={setDiasAtestados}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={idTexto}>{t("hr.assiduidade.campo.textoJustificacao")}</Label>
                      <Textarea
                        id={idTexto}
                        rows={3}
                        value={texto}
                        onBlur={() => tocar(idTexto)}
                        onChange={(evento) => setTexto(evento.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CamposTocadosProvider>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="ghost" disabled={aGravar} onClick={onFechar}>
            {t("common.cancel")}
          </Button>
          <Button disabled={aGravar} onClick={() => void gravar()}>
            {aGravar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("hr.assiduidade.falta.marcarAccao")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
