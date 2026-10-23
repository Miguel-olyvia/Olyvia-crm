import { useTranslation } from "@/hooks/useTranslation";

interface ErroAcaoProps {
  chave: string | null;
  /** Uma segunda mensagem a seguir à principal (numa falha parcial, a do código que falhou). */
  chaveExtra?: string | null;
  className?: string;
}

/** O erro de uma ação da ficha, traduzido pela chave (nunca o texto cru), numa região de alerta. Sem erro não desenha nada. */
export function ErroAcao({ chave, chaveExtra = null, className = "" }: ErroAcaoProps) {
  const { t } = useTranslation();
  if (chave === null) return null;
  const texto = chaveExtra ? `${t(chave)} ${t(chaveExtra)}` : t(chave);
  return <p role="alert" className={`text-sm font-medium text-destructive ${className}`.trim()}>{texto}</p>;
}
