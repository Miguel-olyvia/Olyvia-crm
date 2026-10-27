/**
 * Uma linha da fila de fim de dia: um desvio REAL que a base propoe (`hr_assiduidade_desvios`). Quem, que tipo de
 * diferenca (chip de texto), as horas e, conforme o tipo, as accoes do RH que existem na base: Corrigir (horas
 * realizadas ou picagem), Marcar falta (periodo planeado sem horas) e Anular a falta coberta por ausencia aprovada.
 * Pedir justificacao e Aceitar a diferenca nao tem equivalente na base e por isso nao aparecem.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { horaCurta } from "@/components/rh-exemplo/lib/assiduidade";
import type { AccaoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import type { Desvio } from "@/components/rh-exemplo/tiposAssiduidade";

interface AlertaLinhaProps {
  desvio: Desvio;
  nome: string;
  chave: string;
  /** Ja filtradas pelo tipo do desvio e pelas permissoes de quem esta a ver. */
  accoes: readonly AccaoDesvio[];
  onAccao: (desvio: Desvio, accao: AccaoDesvio) => void;
}

const ROTULO_ACCAO: Record<AccaoDesvio, string> = {
  corrigir: "rhExemplo.pic.accao.corrigir",
  marcar_falta: "rhExemplo.pic.accao.marcar_falta",
  anular_por_ausencia: "hr.assiduidade.accao.anularPorAusencia",
};

export function AlertaLinha({ desvio, nome, chave, accoes, onAccao }: AlertaLinhaProps) {
  const { t } = useTranslation();
  const periodo = desvio.hora_inicio
    ? desvio.hora_fim
      ? `${horaCurta(desvio.hora_inicio)}–${horaCurta(desvio.hora_fim)}`
      : horaCurta(desvio.hora_inicio)
    : "";

  return (
    <li className="space-y-2 py-3 text-sm" data-testid={`rhb-alerta-${chave}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-40 font-medium">{nome}</span>
        <Badge variant="outline" className="font-normal">
          {t(`hr.assiduidade.desvios.tipo.${desvio.tipo}`)}
        </Badge>
        <span className="tabular-nums text-muted-foreground">
          {periodo}
          {desvio.minutos ? ` · ${formatarHorasMinutos(desvio.minutos)}` : ""}
        </span>
      </div>
      {desvio.detalhe && <p className="text-xs text-muted-foreground">{desvio.detalhe}</p>}
      {accoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {accoes.map((accao) => (
            <Button key={accao} type="button" size="sm" variant="outline" className="min-h-11" onClick={() => onAccao(desvio, accao)}>
              {t(ROTULO_ACCAO[accao])}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
