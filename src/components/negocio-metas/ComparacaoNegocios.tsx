import { useId, type ReactNode } from "react";
import { AlertTriangle, Star, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compararNegocios, type ComparacaoNegocios as Resultado } from "./compararNegocios";
import { COR_FASE, FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { temValor } from "./logicaQuadro";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { rotuloPrazo } from "./saudeNegocio";
import { textoDias, type Traduzir } from "./saudeTexto";
import { TextoDual } from "./TextoDual";
import { SaudeTag } from "./SaudeTag";

interface LinhaComparacao {
  chave: string;
  celula: (n: NegocioMes) => ReactNode;
  /** Ids com a melhor célula da linha e o texto que a marca. */
  melhor?: { ids: string[]; texto: string; Icone: LucideIcon };
}

function resumoOrcamentos(n: NegocioMes, t: Traduzir): string {
  const valores = n.orcamentos.map((o) => o.valor);
  if (valores.length === 0) return t("businessGoals.dash");
  return t("businessGoals.compare.quotesRange", {
    count: n.orcamentos.length,
    min: formatarMeta("euro", Math.min(...valores)),
    max: formatarMeta("euro", Math.max(...valores)),
  });
}

function posicaoEscolhido(n: NegocioMes, t: Traduzir): string {
  const i = n.orcamentos.findIndex((o) => o.escolhido);
  return i < 0 ? t("businessGoals.compare.none") : t("businessGoals.compare.chosenPos", { pos: i + 1, count: n.orcamentos.length });
}

/** As linhas da tabela, pela ordem pedida; só Valor e Parado têm "melhor célula". */
function montarLinhas(c: Resultado, hoje: string, t: Traduzir): LinhaComparacao[] {
  const traco = t("businessGoals.dash");
  const dias = (d: number) => <TextoDual curto={textoDias(t, d)} longo={textoDias(t, d, true)} />;
  return [
    {
      chave: "value", celula: (n) => (temValor(n) ? formatarMeta("euro", valorDoNegocio(n)) : traco),
      melhor: { ids: c.melhorValor, texto: t("businessGoals.compare.best.value"), Icone: Star },
    },
    { chave: "quotes", celula: (n) => resumoOrcamentos(n, t) },
    { chave: "chosen", celula: (n) => posicaoEscolhido(n, t) },
    {
      chave: "phase",
      celula: (n) => (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", COR_FASE[faseDoNegocio(n)])} />
          {t(`businessGoals.phase.${faseDoNegocio(n)}`)}
        </span>
      ),
    },
    { chave: "health", celula: (n) => <SaudeTag negocio={n} hoje={hoje} /> },
    {
      chave: "due",
      celula: (n) => {
        const curto = rotuloPrazo(n.proximoPrazo, hoje, t);
        return curto ? <TextoDual curto={curto} longo={rotuloPrazo(n.proximoPrazo, hoje, t, true) ?? curto} /> : traco;
      },
    },
    {
      chave: "stalled", celula: (n) => (n.parado === null ? traco : dias(n.parado)),
      melhor: { ids: c.maisParado, texto: t("businessGoals.compare.best.stalled"), Icone: AlertTriangle },
    },
    { chave: "age", celula: (n) => dias(n.dias) },
    { chave: "proposal", celula: (n) => (n.proposta ? t(`businessGoals.proposal.${n.proposta.estado}`) : traco) },
    { chave: "contract", celula: (n) => (n.contrato ? t(`businessGoals.contract.${n.contrato.estado}`) : traco) },
    { chave: "rep", celula: (n) => n.comercial },
  ];
}

/** Uma linha: o nome do campo (cabeçalho de linha) e uma célula por negócio; a melhor leva texto e estrela. */
function LinhaTabela({ linha, negocios }: { linha: LinhaComparacao; negocios: NegocioMes[] }) {
  const { t } = useTranslation();
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead scope="row" className="h-auto px-3 py-2 font-medium text-foreground">
        {t(`businessGoals.compare.row.${linha.chave}`)}
      </TableHead>
      {negocios.map((n) => {
        const destaque = linha.melhor?.ids.includes(n.id) ? linha.melhor : null;
        return (
          <TableCell key={n.id} className={cn("px-3 py-2 align-top", destaque && "bg-primary/10")}>
            {linha.celula(n)}
            {destaque && (
              <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-foreground">
                <destaque.Icone className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                {destaque.texto}
              </span>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

interface ComparacaoNegociosProps {
  negocios: NegocioMes[];
  hoje: string;
  aberta: boolean;
  aoFechar: () => void;
}

/** Os negócios escolhidos lado a lado numa tabela real; a melhor célula de Valor e de Parado leva texto e estrela, não só cor. */
export function ComparacaoNegocios({ negocios, hoje, aberta, aoFechar }: ComparacaoNegociosProps) {
  const { t } = useTranslation();
  const idTitulo = useId();
  const comparacao = compararNegocios(negocios, hoje);
  const linhas = montarLinhas(comparacao, hoje, t);
  return (
    <Dialog open={aberta} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="max-w-3xl motion-reduce:!animate-none">
        <DialogHeader>
          <DialogTitle id={idTitulo}>{t("businessGoals.compare.title")}</DialogTitle>
          <DialogDescription>{t("businessGoals.compare.description")}</DialogDescription>
        </DialogHeader>
        <div role="region" tabIndex={0} aria-labelledby={idTitulo} className={`overflow-auto rounded-md ${FOCO}`}>
        <Table className="min-w-[480px] text-sm" containerClassName="overflow-visible">
          <TableCaption className="sr-only">{t("businessGoals.compare.caption")}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="px-3">{t("businessGoals.compare.field")}</TableHead>
              {comparacao.negocios.map((n) => (
                <TableHead key={n.id} scope="col" className="px-3 font-semibold text-foreground">
                  {n.pessoa}
                  {n.servico && <span className="block text-xs font-normal text-muted-foreground">{n.servico}</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => <LinhaTabela key={l.chave} linha={l} negocios={comparacao.negocios} />)}
          </TableBody>
        </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
