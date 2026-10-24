/**
 * Uma linha da fila de alertas do fim do dia (fluxo 5): quem, que tipo de diferenca (chip de texto), o detalhe,
 * o estado e, enquanto esta por tratar, as acoes do RH: Corrigir, Pedir justificacao, Marcar falta, Aceitar
 * diferenca. Com a justificacao da pessoa recebida mostra-a e deixa o RH aceitar ou recusar.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import {
  diasUteisRestantes,
  prazoDaJustificacao,
  situacaoDoPrazo,
  type AccaoAlerta,
  type AlertaDia,
  type JustificacaoPicagem,
} from "@/components/rh-exemplo/lib/alertasFimDia";

interface AlertaLinhaProps {
  alerta: AlertaDia;
  nome: string;
  justificacao: JustificacaoPicagem | null;
  hoje: string;
  onAccao: (alerta: AlertaDia, accao: AccaoAlerta) => void;
  onDecidir: (justificacao: JustificacaoPicagem, aceitar: boolean) => void;
}

/** Marcar falta so faz sentido onde ha tempo planeado em falta ou uma entrada por fechar. */
const TIPOS_COM_FALTA = new Set(["planeado_sem_realizado", "parcialmente_realizado", "pendente_par"]);

function Detalhe({ alerta }: { alerta: AlertaDia }) {
  const { t } = useTranslation();
  const periodo =
    alerta.horaInicio && alerta.horaFim ? `${alerta.horaInicio.slice(0, 5)}–${alerta.horaFim.slice(0, 5)}` : (alerta.horaInicio ?? "").slice(0, 5);
  if (alerta.tipo === "fora_do_local") return <span>{t("rhExemplo.pic.detalheFora", { metros: String(alerta.distanciaM ?? 0) })}</span>;
  if (alerta.tipo === "pendente_par") return <span>{t("rhExemplo.pic.detalhePar", { hora: periodo })}</span>;
  if (alerta.tipo === "parcialmente_realizado") {
    return <span>{t("rhExemplo.pic.detalheParcial", { periodo, falta: formatarHorasMinutos(alerta.minutos ?? 0) })}</span>;
  }
  return <span>{`${periodo} · ${formatarHorasMinutos(alerta.minutos ?? 0)}`}</span>;
}

function EstadoEPrazo({ alerta, hoje }: { alerta: AlertaDia; hoje: string }) {
  const { t } = useTranslation();
  const prazo = situacaoDoPrazo(alerta, hoje);
  return (
    <>
      {alerta.estado !== "pendente" && (
        <Badge variant="secondary" className="font-normal">
          {t(`rhExemplo.pic.estado.${alerta.estado}`)}
        </Badge>
      )}
      {prazo === "dentro_do_prazo" && (
        <span className="text-xs text-muted-foreground">
          {t("rhExemplo.pic.diasRestantes", {
            dias: String(diasUteisRestantes(alerta.data, hoje)),
            ate: formatarData(prazoDaJustificacao(alerta.data)),
          })}
        </span>
      )}
      {prazo === "sem_justificacao" && (
        <Badge variant="outline" className="border-destructive font-normal text-destructive">
          {t("rhExemplo.pic.semJustificacaoSugerida")}
        </Badge>
      )}
    </>
  );
}

export function AlertaLinha({ alerta, nome, justificacao, hoje, onAccao, onDecidir }: AlertaLinhaProps) {
  const { t } = useTranslation();
  const porTratar = alerta.estado === "pendente";
  const accoes: AccaoAlerta[] = ["corrigir", "pedir_justificacao", "marcar_falta", "aceitar"];

  return (
    <li className="space-y-2 py-3 text-sm" data-testid={`rhb-alerta-${alerta.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-40 font-medium">{nome}</span>
        <Badge variant="outline" className="font-normal">
          {t(`rhExemplo.pic.alerta.${alerta.tipo}`)}
        </Badge>
        <span className="tabular-nums text-muted-foreground">
          <Detalhe alerta={alerta} />
        </span>
        <EstadoEPrazo alerta={alerta} hoje={hoje} />
      </div>

      {alerta.estado === "justificacao_recebida" && justificacao && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <p>
            <span className="font-medium">{t("rhExemplo.pic.justificacaoDe", { hora: justificacao.horaReal })}</span> {justificacao.motivo}
            {justificacao.anexoNome ? ` · ${t("rhExemplo.hor.anexo")}: ${justificacao.anexoNome}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={() => onDecidir(justificacao, true)}>
              {t("rhExemplo.pic.aceitarJustificacao")}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onDecidir(justificacao, false)}>
              {t("rhExemplo.pic.recusarJustificacao")}
            </Button>
          </div>
        </div>
      )}

      {porTratar && (
        <div className="flex flex-wrap gap-2">
          {accoes
            .filter((accao) => accao !== "marcar_falta" || TIPOS_COM_FALTA.has(alerta.tipo))
            .map((accao) => (
              <Button key={accao} type="button" size="sm" variant="outline" className="min-h-11" onClick={() => onAccao(alerta, accao)}>
                {t(`rhExemplo.pic.accao.${accao}`)}
              </Button>
            ))}
        </div>
      )}

      {!porTratar && alerta.motivo && alerta.estado !== "justificacao_recebida" && (
        <p className="text-xs text-muted-foreground">
          {t("rhExemplo.pic.tratadoPor", { quem: alerta.tratadoPor ?? "", motivo: alerta.motivo })}
        </p>
      )}
    </li>
  );
}
