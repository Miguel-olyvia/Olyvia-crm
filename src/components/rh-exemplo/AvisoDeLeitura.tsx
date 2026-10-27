/**
 * O aviso de que UMA leitura nao chegou -- recusada pela base ou falhada -- no lugar do estado vazio.
 *
 * Uma lista vazia por falha de rede ou por recusa nao pode passar por "nao ha nada": mostra-se isto, com
 * "Tentar de novo" quando a causa pode ser passageira (erro). Uma recusa de permissao nao se repete.
 */
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

/** O estado de uma leitura: o que o hook de assiduidade da organizacao devolve por satelite. */
export interface EstadoDeLeitura {
  recusado: boolean;
  erro: boolean;
}

interface AvisoDeLeituraProps {
  estado: EstadoDeLeitura;
  onTentarDeNovo?: () => void;
}

/** `true` quando a leitura nao pode ser dada por boa (recusada ou falhada). */
export function leituraFalhou(estado: EstadoDeLeitura | undefined): boolean {
  return !!estado && (estado.recusado || estado.erro);
}

export function AvisoDeLeitura({ estado, onTentarDeNovo }: AvisoDeLeituraProps) {
  const { t } = useTranslation();
  if (!leituraFalhou(estado)) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{estado.recusado ? t("rhExemplo.leitura.recusada") : t("rhExemplo.leitura.erro")}</span>
      {!estado.recusado && onTentarDeNovo && (
        <Button type="button" variant="outline" className="min-h-11" onClick={onTentarDeNovo}>
          {t("rhExemplo.leitura.tentarDeNovo")}
        </Button>
      )}
    </div>
  );
}
