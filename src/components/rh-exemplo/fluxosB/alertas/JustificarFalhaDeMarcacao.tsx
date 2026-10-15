/**
 * A pessoa que se esqueceu de picar JUSTIFICA a falha de marcacao (fluxo 5): hora real + motivo (+ anexo, se
 * quiser), ate 5 dias uteis depois. Mostra quantos dias uteis restam; passado o prazo a diferenca fica «sem
 * justificacao» (falta sugerida). A pessoa nao corrige a propria picagem: so o RH aceita (lanca a picagem a mao)
 * ou recusa com motivo.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareWarning } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { enviarJustificacaoDePicagem } from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import {
  diasUteisRestantes,
  prazoDaJustificacao,
  situacaoDoPrazo,
  type AlertaDia,
  type JustificacaoPicagem,
} from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { MOTIVO_MINIMO_CARACTERES } from "@/components/rh-exemplo/lib/horarioTipos";
import { useJustificacoesDeDiaDaPessoa } from "@/components/rh-exemplo/calendarioPessoa/situacaoDoMes";
import { ESTADO_DA_JUSTIFICACAO, type EstadoJustificacaoDia, type JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useJustificacoesDaPessoa } from "./useJustificacoesDaPessoa";

/** O formulário de justificação (hora real, motivo, anexo); usado aqui e no detalhe do dia do calendário. */
export function FormularioDeJustificacao({ alerta, onFechar }: { alerta: AlertaDia; onFechar: () => void }) {
  const { t } = useTranslation();
  const [horaReal, setHoraReal] = useState("18:00");
  const [motivo, setMotivo] = useState("");
  const [anexoNome, setAnexoNome] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const id = `rhb-just-${alerta.id}`;

  const enviar = () => {
    const resultado = enviarJustificacaoDePicagem(alerta.id, { horaReal, motivo, anexoNome });
    setErro(resultado.erro);
    if (!resultado.erro) {
      toast.success(t("rhExemplo.pic.justificacaoEnviada"));
      onFechar();
    }
  };

  return (
    <div className="mt-2 grid gap-3 rounded-md border p-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-hora`}>{t("rhExemplo.pic.horaReal")}</Label>
        <Input id={`${id}-hora`} type="time" className="min-h-11" value={horaReal} onChange={(e) => setHoraReal(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-anexo`}>{t("rhExemplo.hor.anexoOpcional")}</Label>
        <Input id={`${id}-anexo`} type="file" className="min-h-11" onChange={(e) => setAnexoNome(e.target.files?.[0]?.name ?? null)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${id}-motivo`}>{t("rhExemplo.fluxosB.motivoObrigatorio", { minimo: String(MOTIVO_MINIMO_CARACTERES) })}</Label>
        <Textarea id={`${id}-motivo`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">
          {t(erro)}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="button" className="min-h-11" onClick={enviar}>
          {t("rhExemplo.pic.enviarJustificacao")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onFechar}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

function LinhaEnviada({ j }: { j: JustificacaoPicagem }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Badge variant="secondary" className="font-normal">
        {t(`rhExemplo.pic.justEstado.${j.estado}`)}
      </Badge>
      <span className="tabular-nums">{t("rhExemplo.pic.justificacaoDe", { hora: j.horaReal })}</span>
      <span className="text-muted-foreground">{j.motivo}</span>
      {j.estado === "recusada" && j.motivoRecusa && (
        <span className="text-destructive">{t("rhExemplo.pic.motivoRecusa", { motivo: j.motivoRecusa })}</span>
      )}
    </li>
  );
}

/** Uma justificação de falta sugerida ou atraso, com os mesmos estados que as de picagem esquecida. */
function LinhaEnviadaDia({ j }: { j: JustificacaoDia }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`rha-jd-${j.id}`}>
      <Badge variant="secondary" className="font-normal">{t(`rhJust.estado.${ESTADO_DA_JUSTIFICACAO[j.estado]}`)}</Badge>
      <span className="tabular-nums">{t("rhJust.aba.linha", { dia: formatarData(j.data), tipo: t(`rhJust.tipo.${j.tipo}`) })}</span>
      <span className="text-muted-foreground">{j.motivo}</span>
      {j.estado === "recusada" && j.motivoRecusa && <span className="text-destructive">{t("rhJust.motivoRH", { motivo: j.motivoRecusa })}</span>}
    </li>
  );
}

const GRUPO_DO_ESTADO: Record<EstadoJustificacaoDia, "pendentes" | "aceites" | "recusadas"> = {
  pendente: "pendentes", aceite_paga: "aceites", aceite_nao_paga: "aceites", recusada: "recusadas",
};

/** Um grupo das justificações já enviadas (pendentes, aceites ou recusadas), com o número no título. */
function GrupoEnviadas({ chave, itens, doDia }: { chave: "pendentes" | "aceites" | "recusadas"; itens: JustificacaoPicagem[]; doDia: JustificacaoDia[] }) {
  const { t } = useTranslation();
  const dia = doDia.filter((j) => GRUPO_DO_ESTADO[j.estado] === chave);
  if (itens.length + dia.length === 0) return null;
  return (
    <section aria-label={t(`rhAbas.just.${chave}`)} className="space-y-2 border-t pt-3 text-sm" data-testid={`rha-just-${chave}`}>
      <h4 className="font-medium">
        {t(`rhAbas.just.${chave}`)} <span className="tabular-nums text-muted-foreground">({itens.length + dia.length})</span>
      </h4>
      <ul className="space-y-1">
        {itens.map((j) => <LinhaEnviada key={j.id} j={j} />)}
        {dia.map((j) => <LinhaEnviadaDia key={j.id} j={j} />)}
      </ul>
    </section>
  );
}

export function JustificarFalhaDeMarcacao({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const { porJustificar: meus, menorPrazoDias, pendentes, aceites, recusadas } = useJustificacoesDaPessoa(pessoaId);
  const doDia = useJustificacoesDeDiaDaPessoa(pessoaId);
  const [aberto, setAberto] = useState<string | null>(null);
  const hoje = hojeIso();
  const semNada = meus.length === 0 && pendentes.length + aceites.length + recusadas.length + doDia.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareWarning className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhExemplo.pic.justificarTitulo")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhExemplo.pic.justificarAjuda")}</p>
        {menorPrazoDias !== null && (
          <p role="status" className="text-sm font-medium" data-testid="rha-just-prazo">
            {t("rhAbas.just.menorPrazo", { dias: String(menorPrazoDias) })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {semNada && <p className="py-6 text-center text-sm text-muted-foreground">{t("rhAbas.just.vazio")}</p>}
        <ul className="space-y-3">
          {meus.map((alerta) => {
            const dentro = situacaoDoPrazo(alerta, hoje) === "dentro_do_prazo";
            return (
              <li key={alerta.id} className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium tabular-nums">{formatarData(alerta.data)}</span>
                  <Badge variant="outline" className="font-normal">
                    {t(`rhExemplo.pic.alerta.${alerta.tipo}`)}
                  </Badge>
                  {alerta.estado === "justificacao_pedida" && (
                    <Badge variant="secondary" className="font-normal">
                      {t("rhExemplo.pic.estado.justificacao_pedida")}
                    </Badge>
                  )}
                  {dentro ? (
                    <span className="text-xs text-muted-foreground">
                      {t("rhExemplo.pic.diasRestantes", { dias: String(diasUteisRestantes(alerta.data, hoje)), ate: formatarData(prazoDaJustificacao(alerta.data)) })}
                    </span>
                  ) : (
                    <Badge variant="outline" className="border-destructive font-normal text-destructive">
                      {t("rhExemplo.pic.prazoAcabou")}
                    </Badge>
                  )}
                  {dentro && aberto !== alerta.id && (
                    <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setAberto(alerta.id)}>
                      {t("rhExemplo.pic.justificar")}
                    </Button>
                  )}
                </div>
                {aberto === alerta.id && <FormularioDeJustificacao alerta={alerta} onFechar={() => setAberto(null)} />}
              </li>
            );
          })}
        </ul>

        <GrupoEnviadas chave="pendentes" itens={pendentes} doDia={doDia} />
        <GrupoEnviadas chave="aceites" itens={aceites} doDia={doDia} />
        <GrupoEnviadas chave="recusadas" itens={recusadas} doDia={doDia} />
      </CardContent>
    </Card>
  );
}
