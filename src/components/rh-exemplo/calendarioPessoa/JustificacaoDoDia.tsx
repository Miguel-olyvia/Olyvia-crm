/**
 * O que a PRÓPRIA pessoa pode fazer num dia do calendário (fluxo 5): justificar uma picagem em falta, dentro do prazo da
 * organização (5 dias úteis por omissão; motivo e hora real, no formulário que já existe), e ver o estado do que já enviou (pendente, aceite ou recusada,
 * com o motivo). Nunca corrige: quem corrige, pede justificação, marca falta ou aceita a diferença é o RH.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { usePrazoJustificacao } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";
import { FormularioDeJustificacao } from "@/components/rh-exemplo/fluxosB/alertas/JustificarFalhaDeMarcacao";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { diasUteisRestantes, prazoDaJustificacao } from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { justificacoesDoDia } from "@/components/rh-exemplo/lib/vistaDaPessoa";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  pessoaId: string;
  data: string;
}

export function JustificacaoDoDia({ pessoaId, data }: Props) {
  const { t } = useTranslation();
  const alertas = useFluxosB((e) => e.alertas);
  const justificacoes = useFluxosB((e) => e.justificacoesPicagem);
  const [aberto, setAberto] = useState<string | null>(null);
  const hoje = hojeIso();
  const { dias: prazoDias } = usePrazoJustificacao();
  const { porJustificar, enviadas } = useMemo(
    () => justificacoesDoDia(alertas, justificacoes, pessoaId, data, hoje, prazoDias),
    [alertas, justificacoes, pessoaId, data, hoje, prazoDias],
  );
  if (porJustificar.length === 0 && enviadas.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={t("rhCal.detalhe.justificacao")} data-testid="rhcal-justificacao">
      <h4 className="text-sm font-medium text-muted-foreground">{t("rhCal.detalhe.justificacao")}</h4>
      {enviadas.map(({ justificacao: j }) => (
        <div key={j.id} className="space-y-1 rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">{t(`rhExemplo.pic.justEstado.${j.estado}`)}</Badge>
            <span className="tabular-nums">{t("rhExemplo.pic.justificacaoDe", { hora: j.horaReal })}</span>
          </div>
          <p className="text-muted-foreground">{j.motivo}</p>
          {j.estado === "recusada" && j.motivoRecusa && <p className="text-destructive">{t("rhExemplo.pic.motivoRecusa", { motivo: j.motivoRecusa })}</p>}
        </div>
      ))}
      {porJustificar.map((alerta) => (
        <div key={alerta.id} className="space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">
            {t("rhExemplo.pic.diasRestantes", { dias: String(diasUteisRestantes(alerta.data, hoje, prazoDias)), ate: formatarData(prazoDaJustificacao(alerta.data, prazoDias)) })}
          </p>
          {aberto === alerta.id ? (
            <FormularioDeJustificacao alerta={alerta} onFechar={() => setAberto(null)} />
          ) : (
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setAberto(alerta.id)}>
              {t("rhExemplo.pic.justificar")}
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
