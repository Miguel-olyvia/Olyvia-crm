/**
 * Uma accao que depende da V3b (gravar rascunho, submeter, documentos, contrato, pedidos):
 * esta desenhada e DESACTIVADA. `aria-disabled` (e nao `disabled`) para o botao continuar
 * focavel e o leitor de ecra poder dizer a razao, que esta ligada por `aria-describedby`.
 * Clicar nao faz nada: nao chama a Edge.
 */
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

export function BotaoProximaFase({ id, rotulo }: { id: string; rotulo: string }) {
  const { t } = useTranslation();
  const razaoId = `${id}-razao`;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        id={id}
        type="button"
        variant="outline"
        className="min-h-11 cursor-not-allowed opacity-60"
        aria-disabled="true"
        aria-describedby={razaoId}
        onClick={(e) => e.preventDefault()}
      >
        {rotulo}
      </Button>
      <span id={razaoId} className="text-xs text-muted-foreground">
        {t("portal.proxima.razao")}
      </span>
    </div>
  );
}
