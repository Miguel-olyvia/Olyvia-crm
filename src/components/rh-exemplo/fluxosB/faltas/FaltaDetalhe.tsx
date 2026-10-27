/**
 * O detalhe de uma falta ja marcada (fluxo 7), lido e escrito na base REAL: o periodo, o estado da justificacao, o
 * prazo da organizacao, o documento (dado de saude: so aparece ao clique, e o acesso fica registado), as decisoes
 * do RH, a anulacao e o calculo de exemplo do desconto de vencimento.
 *
 * A falta chega da lista da organizacao (vista em vigor, so algumas colunas). Aqui pede-se a assiduidade DESSA pessoa
 * nesse dia, que traz a linha completa e as accoes por RPC; o painel desmonta-se ao fechar e os dados vao com ele.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { MotivoDialog } from "@/components/rh-exemplo/ausencias/MotivoDialog";
import { JustificacaoFalta } from "@/components/rh-exemplo/assiduidade/JustificacaoFalta";
import { DescontoDaFaltaCard } from "@/components/rh-exemplo/fluxosB/faltas/DescontoDaFaltaCard";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { diasUteisEntre } from "@/components/rh-exemplo/lib/diasUteis";
import { foraDoPrazoDeJustificar, prazoParaJustificar, rotuloDaJustificacao } from "@/components/rh-exemplo/lib/faltasB";
import { MOTIVO_MINIMO_CARACTERES, motivoValido } from "@/components/rh-exemplo/lib/horarioTipos";
import type { AssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import type { Falta, PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

interface FaltaDetalheProps {
  /** A linha da lista (pode vir com menos colunas do que a da tabela). */
  falta: Falta;
  nome: string;
  permissoes: PermissoesAssiduidade;
  onFechar: () => void;
  /** Depois de gravar, para a lista de tras se actualizar. */
  onAlterado?: () => void;
}

function RegistarJustificacao({ falta, assiduidade, onAlterado }: { falta: Falta; assiduidade: AssiduidadeDaPessoa; onAlterado?: () => void }) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const registar = async () => {
    if (!motivoValido(texto)) return setErro(t("rhExemplo.fal.erro.semTexto"));
    const falhou = await assiduidade.registarJustificacao({ faltaId: falta.id, texto: texto.trim() });
    if (falhou) return setErro(t(falhou));
    setErro(null);
    toast.success(t("rhExemplo.fal.registada"));
    onAlterado?.();
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={`rhb-just-falta-${falta.id}`}>{t("rhExemplo.fal.textoJustificacao", { minimo: String(MOTIVO_MINIMO_CARACTERES) })}</Label>
      <Textarea id={`rhb-just-falta-${falta.id}`} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <Button type="button" className="min-h-11" disabled={assiduidade.saving} onClick={() => void registar()}>
        {t("rhExemplo.fal.registarJustificacao")}
      </Button>
      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

type PedidoDeMotivo = "recusar" | "anular";

export function FaltaDetalhe({ falta: daLista, nome, permissoes, onFechar, onAlterado }: FaltaDetalheProps) {
  const { t } = useTranslation();
  const janela = useMemo(() => ({ de: daLista.data, ate: daLista.data }), [daLista.data]);
  const assiduidade = useAssiduidadeDaPessoa(daLista.pessoa_id, janela);
  const prazoDias = useFluxosB((e) => e.prazoFaltaDias);
  const [pedido, setPedido] = useState<PedidoDeMotivo | null>(null);

  // A linha completa (com a decisao e o motivo) quando ja chegou; ate la, a da lista.
  const falta = assiduidade.faltas.find((f) => f.id === daLista.id) ?? daLista;
  const hoje = hojeIso();
  const prazo = prazoParaJustificar(falta.data, prazoDias);
  const fora = foraDoPrazoDeJustificar(falta.data, hoje, prazoDias);
  const ativa = falta.estado === "activa";

  const depoisDeGravar = (erro: string | null, sucesso: string) => {
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(sucesso);
    onAlterado?.();
  };

  const decidir = async (resultado: "justificada" | "recusada", motivo?: string) =>
    depoisDeGravar(await assiduidade.decidirJustificacao({ faltaId: falta.id, resultado, motivo }), t("hr.sucesso.guardado"));

  const confirmarMotivo = async (motivo: string) => {
    const quando = pedido;
    setPedido(null);
    if (quando === "recusar") return decidir("recusada", motivo);
    return depoisDeGravar(await assiduidade.anularFalta(falta.id, motivo), t("hr.sucesso.guardado"));
  };

  return (
    <Sheet open onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent className="w-full space-y-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("rhExemplo.fal.detalheTitulo", { nome })}</SheetTitle>
          <SheetDescription>
            {`${formatarData(falta.data)} · ${falta.hora_inicio.slice(0, 5)}–${falta.hora_fim.slice(0, 5)} · ${formatarHorasMinutos(falta.minutos)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {ativa ? t(`rhExemplo.fal.estado.${rotuloDaJustificacao(falta)}`) : t(`rhExemplo.fal.estadoFalta.${falta.estado}`)}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {t(`hr.assiduidade.motivoFalta.${falta.motivo_codigo}`)}
          </Badge>
        </div>

        <section aria-label={t("rhExemplo.fal.prazo")} className="space-y-1 text-sm">
          <h3 className="font-semibold">{t("rhExemplo.fal.prazo")}</h3>
          <p>{t("rhExemplo.fal.prazoDaOrganizacao", { dias: String(prazoDias), ate: formatarData(prazo) })}</p>
          <p className="text-muted-foreground">
            {fora ? t("rhExemplo.fal.prazoAcabou") : t("rhExemplo.fal.prazoRestam", { dias: String(diasUteisEntre(hoje, prazo)) })}
          </p>
        </section>

        <section aria-label={t("rhExemplo.fal.justificacao")} className="space-y-2">
          <h3 className="text-sm font-semibold">{t("rhExemplo.fal.justificacao")}</h3>
          <JustificacaoFalta
            faltaId={falta.id}
            estado={falta.justificacao_estado}
            decididaEm={falta.justificacao_decidida_em ?? null}
            decididaPorNome={null}
            motivoDaDecisao={falta.justificacao_motivo ?? null}
            podeVerDocumento={permissoes.justificacaoView}
            podeDecidir={permissoes.justificacaoEdit && ativa}
            aGravar={assiduidade.saving}
            onRevelar={assiduidade.revelarJustificacao}
            onDecidir={(resultado) => (resultado === "justificada" ? void decidir("justificada") : setPedido("recusar"))}
          />
          {ativa && permissoes.faltasEdit && falta.justificacao_estado === "sem_justificacao" && (
            <RegistarJustificacao falta={falta} assiduidade={assiduidade} onAlterado={onAlterado} />
          )}
        </section>

        {ativa && permissoes.faltasEdit && (
          <Button type="button" variant="outline" className="min-h-11" disabled={assiduidade.saving} onClick={() => setPedido("anular")}>
            {t("hr.assiduidade.accao.anular")}
          </Button>
        )}

        <DescontoDaFaltaCard falta={falta} faltasDaPessoa={assiduidade.faltas} />
      </SheetContent>

      <MotivoDialog
        aberto={pedido !== null}
        titulo={t(`hr.assiduidade.motivo.${pedido === "recusar" ? "recusarJustificacao" : "anularFalta"}.titulo`)}
        descricao={t(`hr.assiduidade.motivo.${pedido === "recusar" ? "recusarJustificacao" : "anularFalta"}.descricao`)}
        rotuloConfirmar={t("hr.assiduidade.accao.confirmar")}
        destrutivo
        aGravar={assiduidade.saving}
        onFechar={() => setPedido(null)}
        onConfirmar={({ motivo }) => void confirmarMotivo(motivo)}
        idPrefixo="rhb-falta-motivo"
      />
    </Sheet>
  );
}
