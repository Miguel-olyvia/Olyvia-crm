/**
 * Estado vazio dos separadores que ainda nao existem.
 *
 * Nove dos doze separadores da ficha (Contratos, Documentos, Planeamento de
 * tempo, Ausencias, Desempenho, Tarefas, Competencias, Cursos, Outros) ficam
 * VISIVEIS nesta ronda mas sem conteudo: a moldura fica de pe para os modulos
 * seguintes e quem usa a aplicacao ve para onde o produto vai, em vez de
 * separadores a aparecer do nada mais tarde.
 *
 * Um ficheiro, nove usos.
 */
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { Hammer, type LucideIcon } from "lucide-react";

interface PessoaEmConstrucaoTabProps {
  /** Titulo do separador, ja traduzido por quem o declara na lista de tabs. */
  titulo: string;
  icon?: LucideIcon;
}

export function PessoaEmConstrucaoTab({ titulo, icon }: PessoaEmConstrucaoTabProps) {
  const { t } = useTranslation();
  const Icon = icon ?? Hammer;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="rounded-full bg-muted p-3">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">{titulo}</p>
          <p className="text-sm text-muted-foreground">{t("hr.emConstrucao.title")}</p>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{t("hr.emConstrucao.description")}</p>
      </CardContent>
    </Card>
  );
}
