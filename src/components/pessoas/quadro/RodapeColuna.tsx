import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";

const R = "pessoasPagina.real.board.";

interface RodapeColunaProps {
  /** O nome da coluna, para o leitor de ecrã distinguir os botões das várias colunas. */
  coluna: string;
  carregados: number;
  /** O total da coluna inteira, segundo a base. */
  total: number;
  aCarregar: boolean;
  comErro: boolean;
  /** Os cartões mostrados são de um filtro anterior (o novo ainda carrega): não há de onde continuar, o botão espera. */
  desativado?: boolean;
  aoCarregarMais: () => void;
}

/** O rodapé de uma coluna do Quadro real: quantos se mostram de quantos há, e «Carregar mais» (ou «Repetir», se a última tentativa falhou). */
export function RodapeColuna({ coluna, carregados, total, aCarregar, comErro, desativado = false, aoCarregarMais }: RodapeColunaProps) {
  const { t } = useTranslation();
  const emFalta = Math.max(0, total - carregados);
  if (emFalta === 0 && !comErro) return null;
  const rotulo = t(comErro ? `${R}retry` : `${R}loadMore`, { n: emFalta });
  return (
    <div className="space-y-2 border-t border-border p-2">
      <p className="text-xs text-muted-foreground">{t(`${R}showing`, { shown: carregados, total })}</p>
      {comErro && <p className="text-xs font-medium text-foreground">{t(`${R}loadMoreError`)}</p>}
      <Button
        type="button" variant="outline" className={`min-h-11 w-full ${FOCO}`} aria-busy={aCarregar} aria-disabled={aCarregar || desativado}
        // O nome acessível começa pelo texto visível (WCAG 2.5.3) e diz a coluna.
        aria-label={comErro ? `${rotulo}, ${coluna}` : t(`${R}loadMoreLabel`, { n: emFalta, column: coluna })}
        onClick={() => { if (!aCarregar && !desativado) aoCarregarMais(); }}
      >
        {rotulo}
      </Button>
    </div>
  );
}
