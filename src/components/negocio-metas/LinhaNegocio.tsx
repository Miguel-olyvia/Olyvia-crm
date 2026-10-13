import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { BotoesAcoesNegocio, type AcoesNegocio } from "./AcoesNegocio";
import { CadeiaNegocio } from "./CadeiaNegocio";
import { COR_FASE, FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { proximoPasso, temValor } from "./logicaQuadro";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { SaudeTag } from "./SaudeTag";
import { rotuloPrazo } from "./saudeNegocio";
import { TextoDual } from "./TextoDual";
import { CARTAO, ID_NEGOCIO } from "./useAtalhosQuadro";

const idDetalhe = (id: string): string => `detalhe-${id}`;

interface LinhaNegocioProps {
  negocio: NegocioMes;
  hoje: string;
  pos: number;
  colunas: number;
  ocultarComercial: boolean;
  selecionado: boolean;
  expandido: boolean;
  acoes: AcoesNegocio;
  aoAbrir: (n: NegocioMes) => void;
  aoAlternarSelecao: (id: string) => void;
  aoAlternarExpandir: (id: string) => void;
}

/** O que o clique numa célula de controlo não deve fazer: abrir o painel (a linha inteira abre-o). */
const parar = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };

/** Detalhe da linha expandida: a cadeia em linha, a lista de orçamentos e o contacto. */
function DetalheLinha({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const { telefone, email } = negocio.contacto;
  const contactos = [telefone, email].filter((c): c is string => c !== null);
  return (
    <div className="space-y-3 py-1">
      <CadeiaNegocio negocio={negocio} id={`cadeia-linha-${negocio.id}`} />
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold text-foreground">{t("businessGoals.list.quotesTitle")}</p>
          <ul className="mt-1 space-y-0.5">
            {negocio.orcamentos.map((o) => (
              <li key={o.id} className="flex items-center gap-2">
                <span className="font-mono tabular-nums">{formatarMeta("euro", o.valor)}</span>
                {o.escolhido && <span className="text-xs font-medium text-foreground">{t("businessGoals.list.chosenMark")}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground">{t("businessGoals.list.contact")}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
            {contactos.length > 0 ? contactos.map((c) => <span key={c}>{c}</span>) : t("businessGoals.list.noContact")}
          </p>
        </div>
      </div>
    </div>
  );
}

interface CelulaControloProps {
  negocio: NegocioMes;
  ligado: boolean;
  aoAlternar: (id: string) => void;
}

/** A caixa de seleção da linha, com a área de 44 px. */
function CelulaSelecao({ negocio, ligado, aoAlternar }: CelulaControloProps) {
  const { t } = useTranslation();
  return (
    <TableCell className="w-11 px-1 py-0" {...parar}>
      <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
        <Checkbox
          checked={ligado} onCheckedChange={() => aoAlternar(negocio.id)}
          aria-label={t("businessGoals.card.select", { name: negocio.pessoa })}
        />
      </label>
    </TableCell>
  );
}

/** O chevron que expande a linha: nome fixo ("Detalhe de X"), o estado vai em `aria-expanded`. */
function CelulaExpandir({ negocio, ligado, aoAlternar }: CelulaControloProps) {
  const { t } = useTranslation();
  const Chevron = ligado ? ChevronDown : ChevronRight;
  return (
    <TableCell className="w-11 px-1 py-0" {...parar}>
      <button
        type="button" aria-expanded={ligado} aria-controls={idDetalhe(negocio.id)}
        aria-label={t("businessGoals.list.detail", { name: negocio.pessoa })}
        onClick={() => aoAlternar(negocio.id)}
        className={cn("flex h-11 w-11 cursor-pointer items-center justify-center rounded-md", FOCO)}
      >
        <Chevron className="h-4 w-4 motion-safe:transition-transform motion-safe:duration-150" aria-hidden="true" />
      </button>
    </TableCell>
  );
}

/** Pessoa (cabeçalho da linha, com o serviço por baixo) e as colunas de fase, valor e cadeia. */
function CelulasDados({ n, aoAbrir, pos }: { n: NegocioMes; aoAbrir: (n: NegocioMes) => void; pos: number }) {
  const { t } = useTranslation();
  const fase = faseDoNegocio(n);
  const escolhidos = n.orcamentos.filter((o) => o.escolhido).length;
  const chosen = t(escolhidos > 0 ? "businessGoals.mini.chosenOne" : "businessGoals.mini.chosenNone");
  const dash = t("businessGoals.dash");
  return (
    <>
      <TableHead scope="row" className="h-auto px-3 py-1 text-left align-middle font-medium text-foreground">
        <button
          type="button" {...{ [CARTAO]: "", "data-coluna": 0, "data-pos": pos }}
          onClick={(e) => { e.stopPropagation(); aoAbrir(n); }}
          className={cn("min-h-11 scroll-mb-32 cursor-pointer rounded-sm text-left font-medium", FOCO)}
        >
          {n.pessoa}
          <span className="block text-xs font-normal text-muted-foreground">{n.servico}</span>
        </button>
      </TableHead>
      <TableCell className="px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", COR_FASE[fase])} />
          {t(`businessGoals.phase.${fase}`)}
        </span>
      </TableCell>
      <TableCell className="px-3 py-2 text-right font-mono tabular-nums">
        {temValor(n) ? formatarMeta("euro", valorDoNegocio(n)) : dash}
      </TableCell>
      <TableCell className="px-3 py-2 tabular-nums">
        <TextoDual
          curto={t("businessGoals.list.quotesShort", { count: n.orcamentos.length, chosen: escolhidos })}
          longo={t(n.orcamentos.length === 1 ? "businessGoals.list.quotesCellOne" : "businessGoals.list.quotesCell", { count: n.orcamentos.length, chosen })}
        />
      </TableCell>
      <TableCell className="px-3 py-2">{n.proposta ? t(`businessGoals.proposal.${n.proposta.estado}`) : dash}</TableCell>
      <TableCell className="px-3 py-2">{n.contrato ? t(`businessGoals.contract.${n.contrato.estado}`) : dash}</TableCell>
    </>
  );
}

/** Saúde, próximo passo com prazo, comercial (se aparece) e ações. */
function CelulasEstado({ n, hoje, ocultarComercial, acoes }: Pick<LinhaNegocioProps, "hoje" | "ocultarComercial" | "acoes"> & { n: NegocioMes }) {
  const { t } = useTranslation();
  const prazo = rotuloPrazo(n.proximoPrazo, hoje, t);
  const prazoLongo = rotuloPrazo(n.proximoPrazo, hoje, t, true);
  return (
    <>
      <TableCell className="px-3 py-2"><SaudeTag negocio={n} hoje={hoje} /></TableCell>
      <TableCell className="px-3 py-2">
        {t(`businessGoals.step.${proximoPasso(n)}`)}
        {prazo && prazoLongo && (
          <span className="block text-xs text-muted-foreground"><TextoDual curto={prazo} longo={prazoLongo} /></span>
        )}
      </TableCell>
      {!ocultarComercial && <TableCell className="px-3 py-2">{n.comercial}</TableCell>}
      <TableCell className="px-2 py-0" {...parar}>
        <BotoesAcoesNegocio negocio={n} acoes={acoes} />
      </TableCell>
    </>
  );
}

/** Uma linha da Lista e, logo a seguir, a sua linha de detalhe (escondida até se expandir). */
export function LinhaNegocio(p: LinhaNegocioProps) {
  const { negocio: n } = p;
  return (
    <Fragment>
      <TableRow {...{ [ID_NEGOCIO]: n.id }} className="group cursor-pointer hover:bg-muted focus-within:bg-muted" onClick={() => p.aoAbrir(n)}>
        <CelulaSelecao negocio={n} ligado={p.selecionado} aoAlternar={p.aoAlternarSelecao} />
        <CelulaExpandir negocio={n} ligado={p.expandido} aoAlternar={p.aoAlternarExpandir} />
        <CelulasDados n={n} aoAbrir={p.aoAbrir} pos={p.pos} />
        <CelulasEstado n={n} hoje={p.hoje} ocultarComercial={p.ocultarComercial} acoes={p.acoes} />
      </TableRow>
      <TableRow id={idDetalhe(n.id)} hidden={!p.expandido} className="hover:bg-transparent">
        <TableCell colSpan={p.colunas} className="bg-muted/30 px-4 py-3">
          <DetalheLinha negocio={n} />
        </TableCell>
      </TableRow>
    </Fragment>
  );
}
