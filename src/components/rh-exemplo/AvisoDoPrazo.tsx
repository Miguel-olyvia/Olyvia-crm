/**
 * O aviso de que o prazo para justificar da organizacao NAO se leu e que os dias mostrados sao so a omissao (5).
 *
 * Sem isto, um ecra a calcular «dentro do prazo» com um 5 que nao e o da organizacao pareceria certo. Mostra-se onde o
 * prazo e usado (faltas, detalhe da falta, marcacoes por justificar), com «Tentar de novo» quando a causa pode ser
 * passageira (erro de rede). Uma recusa de permissao ou a migration por aplicar nao se repetem.
 */
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { LeituraDasRegras } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";

interface AvisoDoPrazoProps {
  leitura: LeituraDasRegras;
  /** Os dias com que o ecra esta a CALCULAR (a omissao, porque a leitura falhou). */
  dias: number;
  onTentarDeNovo?: () => void;
}

export function AvisoDoPrazo({ leitura, dias, onTentarDeNovo }: AvisoDoPrazoProps) {
  const { t } = useTranslation();
  if (!leitura.falhou) return null;
  const chave = leitura.erro
    ? "rhExemplo.fal.prazoAvisoErro"
    : leitura.recusado
      ? "rhExemplo.fal.prazoAvisoRecusado"
      : "rhExemplo.fal.prazoAvisoIndisponivel";

  return (
    <div
      role="alert"
      data-testid="rhb-prazo-aviso"
      className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t(chave, { dias: String(dias) })}</span>
      {leitura.erro && onTentarDeNovo && (
        <Button type="button" variant="outline" className="min-h-11" onClick={onTentarDeNovo}>
          {t("rhExemplo.leitura.tentarDeNovo")}
        </Button>
      )}
    </div>
  );
}
