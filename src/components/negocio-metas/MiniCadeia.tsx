import { useTranslation } from "@/hooks/useTranslation";
import type { NegocioMes } from "./negocioMetas";
import { textoCadeia } from "./saudeTexto";

/** A cadeia em três frases curtas: "2 orç. (1 escolhido)", "Proposta: enviada", "Contrato: pendente". Só texto. */
export function MiniCadeia({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col text-xs text-muted-foreground">
      {textoCadeia(negocio, t).map((p) => <span key={p}>{p}</span>)}
    </span>
  );
}
