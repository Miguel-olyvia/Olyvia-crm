import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BotoesAcoesNegocio, type AcoesNegocio } from "./AcoesNegocio";
import { BARRA_FASE, FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { proximoPasso, temValor } from "./logicaQuadro";
import { valorDoNegocio, type FaseNegocio, type NegocioMes } from "./negocioMetas";
import { ResumoNegocio } from "./ResumoNegocio";
import type { Traduzir } from "./saudeTexto";
import { rotuloPrazo, saudeDoNegocio } from "./saudeNegocio";
import { textoCadeia, textoDias, textoSaude } from "./saudeTexto";
import { CARTAO, ID_NEGOCIO } from "./useAtalhosQuadro";

/** Os botões de ação só aparecem com o foco ou o rato no cartão; num ecrã de toque ficam sempre visíveis. */
const ACOES_VISIVEIS =
  "justify-end px-2 pb-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150";

interface CartaoNegocioProps {
  negocio: NegocioMes;
  hoje: string;
  fase: FaseNegocio;
  coluna: number;
  pos: number;
  ocultarComercial: boolean;
  selecionado: boolean;
  acoes: AcoesNegocio;
  aoAbrir: (n: NegocioMes) => void;
  aoAlternarSelecao: (id: string) => void;
}

/** O nome do botão do cartão: tudo o que o cartão mostra, com "dias" por extenso. */
function nomeDoCartao(n: NegocioMes, hoje: string, ocultarComercial: boolean, t: Traduzir): string {
  const valor = temValor(n) ? formatarMeta("euro", valorDoNegocio(n)) : t("businessGoals.card.noValue");
  const passo = t(`businessGoals.step.${proximoPasso(n)}`);
  const prazo = rotuloPrazo(n.proximoPrazo, hoje, t, true);
  return [
    n.pessoa, n.servico, ocultarComercial ? null : n.comercial, textoDias(t, n.dias, true), valor,
    ...textoCadeia(n, t), textoSaude(saudeDoNegocio(n, hoje), n, hoje, t, true), prazo ? `${passo}, ${prazo}` : passo,
  ].filter(Boolean).join(" · ");
}

/**
 * Um cartão em quatro linhas (ver `ResumoNegocio`). O botão principal abre o painel;
 * a caixa de seleção e os botões de ação são irmãos dele, nunca filhos (sem botão dentro de botão).
 */
export function CartaoNegocio(p: CartaoNegocioProps) {
  const { t } = useTranslation();
  const { negocio } = p;
  return (
    <li {...{ [ID_NEGOCIO]: negocio.id }}>
      <Card className={cn("group relative overflow-hidden border-l-4", BARRA_FASE[p.fase], p.selecionado && "ring-2 ring-primary")}>
        <button
          type="button"
          {...{ [CARTAO]: "", "data-coluna": p.coluna, "data-pos": p.pos }}
          onClick={() => p.aoAbrir(negocio)}
          aria-label={nomeDoCartao(negocio, p.hoje, p.ocultarComercial, t)}
          className={cn("block min-h-11 w-full scroll-mb-32 cursor-pointer p-3 text-left hover:bg-muted/50", FOCO, "focus-visible:ring-inset focus-visible:ring-offset-0")}
        >
          <ResumoNegocio negocio={negocio} hoje={p.hoje} ocultarComercial={p.ocultarComercial} className="[&>span:first-child]:pr-9" />
        </button>
        <label className="absolute right-0 top-0 flex h-11 w-11 cursor-pointer items-center justify-center">
          <Checkbox
            checked={p.selecionado}
            onCheckedChange={() => p.aoAlternarSelecao(negocio.id)}
            aria-label={t("businessGoals.card.select", { name: negocio.pessoa })}
          />
        </label>
        <BotoesAcoesNegocio negocio={negocio} acoes={p.acoes} className={ACOES_VISIVEIS} />
      </Card>
    </li>
  );
}
