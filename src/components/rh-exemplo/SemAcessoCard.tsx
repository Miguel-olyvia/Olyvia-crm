/**
 * "Nao tem permissao para ver isto" -- o segundo estado vazio da ficha.
 *
 * PORQUE E QUE E UM COMPONENTE
 * ----------------------------
 * Este bloco estava copiado em cinco sitios (`PessoaDetail` duas vezes,
 * `PessoaHorarioTab` tres variantes) e o modulo de ausencias precisa dele mais
 * de dez. Copiado, a undecima copia fica com outro espacamento e ninguem
 * repara.
 *
 * E DIFERENTE DE "NAO HA NADA"
 * ----------------------------
 * Nao se troca um por outro. Escrever "0 dias disponiveis" a quem nao tem
 * permissao de leitura e mentir-lhe -- as vistas de saldo sao
 * `security_invoker` e devolvem zeros, nao um erro. Quando nao ha permissao,
 * mostra-se isto; quando ha permissao e nao ha linhas, mostra-se o vazio
 * proprio daquele ecra.
 */
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface SemAcessoCardProps {
  /** Sem moldura, para dentro de um cartao que ja existe. */
  simples?: boolean;
  className?: string;
}

export function SemAcessoCard({ simples, className }: SemAcessoCardProps) {
  const { t } = useTranslation();

  if (simples) {
    return (
      <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
        {t("hr.semAcesso")}
      </p>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="py-12 text-center text-muted-foreground">
        {t("hr.semAcesso")}
      </CardContent>
    </Card>
  );
}
