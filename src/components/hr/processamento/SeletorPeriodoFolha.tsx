/**
 * Escolher o PERIODO DA FOLHA (e nao o mes de calendario): mostra o nome pelo mes do fecho e o intervalo,
 * «Novembro de 2026 -- 22 out a 21 nov», com anterior/seguinte. Alvos de 44 px. O texto curto e o que se ve; o leitor de ecra
 * ouve o intervalo por extenso («22 de outubro a 21 de novembro»). Os botoes dizem para que periodo vao.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarIntervaloPeriodo, localeDaLingua, nomeDaFolha, somarMeses } from "@/lib/hr/periodoFolha";

interface SeletorPeriodoFolhaProps {
  /** O mes do FECHO, 1 a 12. */
  ano: number;
  mes: number;
  de: string;
  ate: string;
  onMudar: (ano: number, mes: number) => void;
}

const comMaiuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

export function SeletorPeriodoFolha({ ano, mes, de, ate, onMudar }: SeletorPeriodoFolhaProps) {
  const { t, language } = useTranslation();
  const locale = localeDaLingua(language);
  const palavraA = t("hr.periodoFolha.intervaloA");
  const mover = (n: number) => {
    const novo = somarMeses(ano, mes, n);
    onMudar(novo.ano, novo.mes);
  };
  const nomeDe = (n: number): string => {
    const alvo = somarMeses(ano, mes, n);
    return nomeDaFolha(alvo.ano, alvo.mes, locale);
  };

  return (
    <div role="group" aria-label={t("hr.vencimento.visaoGeral.periodoSelector")} className="flex w-full max-w-md items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 shrink-0"
        onClick={() => mover(-1)}
        aria-label={t("hr.vencimento.visaoGeral.irParaPeriodo", { mes: nomeDe(-1) })}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div
        role="status"
        aria-atomic="true"
        className="min-w-0 flex-1 text-center"
        data-testid="seletor-periodo-folha"
      >
        <span className="sr-only">{`${comMaiuscula(nomeDe(0))}: ${formatarIntervaloPeriodo(de, ate, locale, palavraA, "long")}`}</span>
        <div className="text-sm font-medium" aria-hidden="true">{comMaiuscula(nomeDe(0))}</div>
        <div className="text-xs text-muted-foreground" aria-hidden="true">{formatarIntervaloPeriodo(de, ate, locale, palavraA)}</div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 shrink-0"
        onClick={() => mover(1)}
        aria-label={t("hr.vencimento.visaoGeral.irParaPeriodo", { mes: nomeDe(1) })}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
