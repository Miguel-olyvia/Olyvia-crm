/**
 * O detalhe de uma falta (fluxo 7): o periodo, o estado da justificacao (pendente de documento, justificada paga,
 * justificada nao paga, recusada), o prazo da organizacao, o texto de justificacao SENSIVEL (so aparece com «Ver
 * texto», que regista quem leu e quando), as decisoes do RH e o calculo de exemplo do desconto de vencimento.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eye } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import {
  decidirJustificacaoDeFalta,
  registarJustificacaoDeFalta,
  verTextoDaFalta,
} from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { DescontoDaFaltaCard } from "@/components/rh-exemplo/fluxosB/faltas/DescontoDaFaltaCard";
import { MotivoMinimoDialog } from "@/components/rh-exemplo/fluxosB/MotivoMinimoDialog";
import { formatarData, formatarDataHora, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { diasUteisEntre } from "@/components/rh-exemplo/lib/diasUteis";
import {
  foraDoPrazoDeJustificar,
  prazoParaJustificar,
  rotuloDaJustificacao,
  type DecisaoJustificacaoFalta,
} from "@/components/rh-exemplo/lib/faltasB";
import { MOTIVO_MINIMO_CARACTERES } from "@/components/rh-exemplo/lib/horarioTipos";
import type { Falta } from "@/components/rh-exemplo/tiposAssiduidade";

interface FaltaDetalheProps {
  faltaId: string;
  onFechar: () => void;
}

function TextoSensivel({ falta }: { falta: Falta }) {
  const { t } = useTranslation();
  const existe = useFluxosB((e) => falta.id in e.textosFalta);
  const acessos = useFluxosB((e) => e.acessosTexto);
  const [texto, setTexto] = useState<string | null>(null);
  const meusAcessos = acessos.filter((a) => a.faltaId === falta.id);
  if (!existe) return <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.semTexto")}</p>;
  return (
    <div className="space-y-2">
      {texto === null ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setTexto(verTextoDaFalta(falta.id))}>
          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("rhExemplo.fal.verTexto")}
        </Button>
      ) : (
        <p className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="rhb-texto-falta">
          {texto}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("rhExemplo.fal.textoSensivel")}</p>
      {meusAcessos.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label={t("rhExemplo.fal.quemLeu")}>
          {meusAcessos.map((a, i) => (
            <li key={`${a.quando}-${i}`}>{t("rhExemplo.fal.leuEm", { quem: a.quem, quando: formatarDataHora(a.quando) })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RegistarJustificacao({ falta }: { falta: Falta }) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const registar = () => {
    const resultado = registarJustificacaoDeFalta(falta.id, texto);
    if (resultado.erro) return setMensagem({ texto: t(resultado.erro), erro: true });
    setMensagem({ texto: t(resultado.foraDoPrazo ? "rhExemplo.fal.registadaForaDoPrazo" : "rhExemplo.fal.registada"), erro: false });
    toast.success(t("rhExemplo.fal.registada"));
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={`rhb-just-falta-${falta.id}`}>{t("rhExemplo.fal.textoJustificacao", { minimo: String(MOTIVO_MINIMO_CARACTERES) })}</Label>
      <Textarea id={`rhb-just-falta-${falta.id}`} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <Button type="button" className="min-h-11" onClick={registar}>
        {t("rhExemplo.fal.registarJustificacao")}
      </Button>
      {mensagem && (
        <p role={mensagem.erro ? "alert" : "status"} className={`text-sm font-medium ${mensagem.erro ? "text-destructive" : ""}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}

function Decisoes({ falta }: { falta: Falta }) {
  const { t } = useTranslation();
  const [recusar, setRecusar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const decidir = (decisao: DecisaoJustificacaoFalta, motivo: string): string | null => {
    const resultado = decidirJustificacaoDeFalta(falta.id, decisao, motivo);
    setErro(resultado.erro);
    if (!resultado.erro) toast.success(t(`rhExemplo.fal.decidido.${decisao}`));
    return resultado.erro;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" onClick={() => decidir("justificada_paga", "")}>
          {t("rhExemplo.fal.estado.justificada_paga")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => decidir("justificada_nao_paga", "")}>
          {t("rhExemplo.fal.estado.justificada_nao_paga")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setRecusar(true)}>
          {t("rhExemplo.fal.recusarJustificacao")}
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(erro)}
        </p>
      )}
      <MotivoMinimoDialog
        aberto={recusar}
        titulo={t("rhExemplo.fal.recusarJustificacao")}
        descricao={t("rhExemplo.fal.recusarDescricao")}
        rotuloConfirmar={t("rhExemplo.fal.recusarJustificacao")}
        onConfirmar={(motivo) => decidir("recusada", motivo)}
        onFechar={() => setRecusar(false)}
        idPrefixo="rhb-falta-recusa"
      />
    </div>
  );
}

/** Le a falta do store a cada alteracao, para o detalhe refletir a decisao logo que e tomada. */
export function FaltaDetalhe({ faltaId, onFechar }: FaltaDetalheProps) {
  const falta = useGestao((g) => g.faltas.find((f) => f.id === faltaId) ?? null);
  return falta ? <ConteudoDaFalta falta={falta} onFechar={onFechar} /> : null;
}

function ConteudoDaFalta({ falta, onFechar }: { falta: Falta; onFechar: () => void }) {
  const { t } = useTranslation();
  const prazoDias = useFluxosB((e) => e.prazoFaltaDias);
  const nome = useEstadoRh((e) => e.fichas[falta.pessoa_id]?.pessoa.nome_completo ?? falta.pessoa_id);
  const hoje = hojeIso();
  const rotulo = rotuloDaJustificacao(falta);
  const prazo = prazoParaJustificar(falta.data, prazoDias);
  const fora = foraDoPrazoDeJustificar(falta.data, hoje, prazoDias);
  const ativa = falta.estado === "activa";

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
            {ativa ? t(`rhExemplo.fal.estado.${rotulo}`) : t(`rhExemplo.fal.estadoFalta.${falta.estado}`)}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {t(`hr.assiduidade.motivoFalta.${falta.motivo_codigo}`)}
          </Badge>
        </div>

        {falta.justificacao_estado === "recusada" && falta.justificacao_motivo && (
          <p className="text-sm text-destructive">{t("rhExemplo.pic.motivoRecusa", { motivo: falta.justificacao_motivo })}</p>
        )}

        <section aria-label={t("rhExemplo.fal.prazo")} className="space-y-1 text-sm">
          <h3 className="font-semibold">{t("rhExemplo.fal.prazo")}</h3>
          <p>{t("rhExemplo.fal.prazoDaOrganizacao", { dias: String(prazoDias), ate: formatarData(prazo) })}</p>
          <p className="text-muted-foreground">
            {fora ? t("rhExemplo.fal.prazoAcabou") : t("rhExemplo.fal.prazoRestam", { dias: String(diasUteisEntre(hoje, prazo)) })}
          </p>
        </section>

        <section aria-label={t("rhExemplo.fal.justificacao")} className="space-y-2">
          <h3 className="text-sm font-semibold">{t("rhExemplo.fal.justificacao")}</h3>
          <TextoSensivel falta={falta} />
          {ativa && falta.justificacao_estado === "sem_justificacao" && <RegistarJustificacao falta={falta} />}
          {ativa && falta.justificacao_estado === "pendente_documento" && <Decisoes falta={falta} />}
        </section>

        <DescontoDaFaltaCard falta={falta} />
      </SheetContent>
    </Sheet>
  );
}
