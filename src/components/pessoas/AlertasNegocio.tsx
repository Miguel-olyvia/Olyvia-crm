// Os avisos do negócio (fecho v4): o alerta em aberto, com o texto do seu código e a ação que o resolve. Um código que o ecrã não conhece (ou um
// alerta sem código) diz-se de forma genérica e só se pode dispensar: nunca se mostra o código em bruto. NÃO há aviso de conflito «proposta aceite com
// contrato recusado»: recusar um contrato por uma cláusula é normal e a base não o cria. Só com a bandeira ligada; sem alerta não desenha nada.
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useFechoV4 } from "@/components/negocio-metas/bandeiraFecho";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { BotaoConverterEmCliente, BotaoDispensarAlerta, BotaoFecharAgora, BotaoReabrirNegocio } from "./BotoesFecho";

const N = "pessoasPagina.neg.close.alerts.";
const CODIGOS_CONHECIDOS: readonly string[] = [
  "positivo_depois_perda", "sem_prova", "prazo_por_configurar", "mudanca_sem_efeito", "recusa_depois_aceite", "reenvio_sem_reabrir", "conversao_falhou",
];

/** A ação de cada código: a que resolve o aviso naquele estado. Os outros só se dispensam. */
function Acao({ negocio, codigo }: { negocio: NegocioMes; codigo: string | null }) {
  switch (codigo) {
    case "positivo_depois_perda":
    case "reenvio_sem_reabrir":
      return <BotaoDispensarAlerta negocio={negocio} variante="keep" />;
    // Só se oferece a ação própria quando o negócio está no estado em que ela existe; senão o aviso, que não tem outra saída, dispensa-se.
    case "sem_prova":
      return negocio.estadoReal === "aberto" && negocio.prontoAGanhar === true
        ? <BotaoFecharAgora negocio={negocio} mostrarResultado={false} />
        : <BotaoDispensarAlerta negocio={negocio} variante="dismiss" />;
    case "recusa_depois_aceite":
      return negocio.estadoReal === "ganho" ? <BotaoReabrirNegocio negocio={negocio} /> : <BotaoDispensarAlerta negocio={negocio} variante="dismiss" />;
    case "conversao_falhou":
      return negocio.estadoReal === "ganho" ? <BotaoConverterEmCliente negocio={negocio} /> : <BotaoDispensarAlerta negocio={negocio} variante="dismiss" />;
    default:
      return <BotaoDispensarAlerta negocio={negocio} variante="dismiss" />;
  }
}

export function AlertasNegocio({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const ligada = useFechoV4();
  if (!ligada || !negocio.alerta) return null;
  const codigo = negocio.alerta.codigo !== null && CODIGOS_CONHECIDOS.includes(negocio.alerta.codigo) ? negocio.alerta.codigo : null;
  return (
    <section aria-label={t(`${N}title`)} className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="flex items-start gap-2 text-[15px] font-medium text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t(codigo ? `${N}${codigo}` : `${N}generic`)}
      </p>
      <Acao negocio={negocio} codigo={codigo} />
    </section>
  );
}
