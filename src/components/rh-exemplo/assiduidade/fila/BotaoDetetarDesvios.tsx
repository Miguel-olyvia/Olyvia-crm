/**
 * «Detetar desvios do periodo» (so quem gere a assiduidade): compara o horario planeado com o picado dos dias do periodo da folha
 * em curso (ate hoje) e acrescenta a fila os dias fora da margem. Mostra o resultado em texto (regiao `status`), nunca so por cor.
 * Sem margem configurada a base nao cria nada. A fila relê-se no fim (o hook das accoes invalida-a).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { hojeLisboa, useDesviosAcoes } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  /** O periodo da folha em curso; `null` quando as regras do periodo nao se leram (nao se inventa um periodo). */
  periodo: { de: string; ate: string } | null;
  /** Depois de detetar: o mapa do mes relê (os dias mudam de estado). */
  aoDetetar?: () => void;
}

export function BotaoDetetarDesvios({ periodo, aoDetetar }: Props) {
  const { t } = useTranslation();
  const { detetar, aExecutar } = useDesviosAcoes();
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const [aCorrer, setACorrer] = useState(false);
  const idAjuda = "detetar-desvios-ajuda";

  const correr = async (): Promise<void> => {
    if (!periodo || aCorrer) return;
    setACorrer(true);
    setMensagem(null);
    const hoje = hojeLisboa();
    const r = await detetar(periodo.de, periodo.ate > hoje ? hoje : periodo.ate);
    setACorrer(false);
    if (!r.ok) {
      setMensagem({ texto: r.erro, erro: true });
      return;
    }
    const { diasVistos, criados, substituidos } = r.valor;
    setMensagem({
      texto:
        criados + substituidos === 0
          ? t("rhDesvios.detetar.nenhum", { vistos: String(diasVistos) })
          : t("rhDesvios.detetar.resultado", { vistos: String(diasVistos), criados: String(criados), substituidos: String(substituidos) }),
      erro: false,
    });
    aoDetetar?.();
  };

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        // `aria-disabled` e nao `disabled`: o botao continua na ordem do Tab e o motivo (por baixo) chega a quem usa teclado.
        aria-disabled={!periodo || aCorrer || aExecutar ? "true" : undefined}
        aria-busy={aCorrer}
        aria-describedby={idAjuda}
        onClick={() => void correr()}
      >
        {aCorrer ? t("rhDesvios.detetar.aDetetar") : t("rhDesvios.detetar.abrir")}
      </Button>
      <p id={idAjuda} className="max-w-xs text-xs text-muted-foreground">
        {periodo ? t("rhDesvios.detetar.ajuda") : t("rhDesvios.detetar.semPeriodo")}
      </p>
      {/* Duas regioes: a de estado fica sempre montada (so o texto muda, para ser anunciado) e o alerta so existe em erro. */}
      <p role="status" data-testid="detetar-desvios-resultado" className="text-sm">
        {mensagem && !mensagem.erro ? mensagem.texto : ""}
      </p>
      {mensagem?.erro && (
        <p role="alert" data-testid="detetar-desvios-erro" className="text-sm text-destructive">
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
