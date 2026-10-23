/**
 * O indicador de texto de um dia com justificação (célula do calendário e painel do dia): ícone + texto, a cor nunca é
 * o único sinal.
 */
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoDoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { aspectoDoIndicador } from "./aspectoDoIndicador";

/** `completo` usa o texto inteiro do estado («Justificação enviada · a aguardar o RH»), próprio do painel; a célula usa o curto. */
export function IndicadorJustificacao({ estado, souAPessoa, completo = false }: { estado: EstadoDoDia; souAPessoa: boolean; completo?: boolean }) {
  const { t } = useTranslation();
  const aspecto = aspectoDoIndicador(estado, souAPessoa);
  if (!aspecto) return null;
  const { Icone, classes, chave } = aspecto;
  return (
    <span
      data-testid="rhjd-indicador"
      className={`inline-flex max-w-full items-start gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-snug ${classes}`}
    >
      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t(completo ? `rhJust.estado.${estado}` : chave)}</span>
    </span>
  );
}
