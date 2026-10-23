/** Um erro de campo do formulário de justificação: texto traduzido, anunciado pelo leitor de ecrã e ligado ao campo por `id`. */
import { useTranslation } from "@/hooks/useTranslation";

export function MensagemDeErro({ id, erro, params }: { id: string; erro?: string; params: Record<string, string> }) {
  const { t } = useTranslation();
  return erro ? <p id={id} role="alert" className="text-sm font-medium text-destructive">{t(erro, params)}</p> : null;
}
