// A aba "Negócios" da ficha: duas secções, "Em curso" e "Terminados", com os negócios em linhas separadas por um traço
// (sem cartões). Cada linha é um botão inteiro que abre o negócio dentro da ficha (ver `DetalheNegocioFicha`).
import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { valorDoNegocio } from "@/components/negocio-metas/negocioMetas";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { textoCadeia } from "@/components/negocio-metas/saudeTexto";
import { textoMes } from "./formatoPessoas";
import { estaAberto } from "./juntarPessoas";
import { ehHistorico, type NegocioPessoa } from "./pessoasTipos";

const P = "pessoasPagina.";

/** O atributo que marca o botão de cada linha, para o foco voltar a ele ao regressar do detalhe. */
export const LINHA_NEGOCIO = "data-negocio-id";

/** A última linha de um negócio terminado de meses anteriores ("Ganho em set/2026"); os do quadro mostram a saúde ("Ganho"). */
function Estado({ negocio, hoje }: { negocio: NegocioPessoa; hoje: string }) {
  const { t } = useTranslation();
  if (!ehHistorico(negocio)) return <SaudeTag negocio={negocio} hoje={hoje} />;
  const chave = negocio.resultado === "ganho" ? "dealsList.wonIn" : "dealsList.lostIn";
  return <span className="text-xs font-medium text-foreground">{t(`${P}${chave}`, { month: textoMes(t, negocio.mes) })}</span>;
}

/** Uma linha: serviço e valor; comercial; a cadeia numa só linha; a saúde (ou o resultado) e "Abrir →". */
function LinhaNegocio({ negocio, hoje, aoAbrir }: { negocio: NegocioPessoa; hoje: string; aoAbrir?: (id: string) => void }) {
  const { t } = useTranslation();
  const corpo = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="text-[15px] font-semibold text-foreground">{negocio.servico}</span>
        <span className="text-[15px] font-semibold tabular-nums text-foreground">{formatarMeta("euro", valorDoNegocio(negocio))}</span>
      </span>
      <span className="block text-sm text-muted-foreground">{t(`${P}deals.rep`, { name: negocio.comercial })}</span>
      <span className="block truncate text-sm text-muted-foreground">{textoCadeia(negocio, t).join(" · ")}</span>
      <span className="flex items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <Estado negocio={negocio} hoje={hoje} />
          {/* Só a venda directa leva etiqueta: «Fecha no contrato» é a omissão e encheria a lista. */}
          {negocio.fecho === "proposta" && (
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">{t(`${P}neg.fecho.tag.proposta`)}</span>
          )}
        </span>
        {aoAbrir && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-violet-300">
            {t(`${P}dealsList.open`)}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t(`${P}dealsList.openSr`, { service: negocio.servico })}</span>
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className="border-b border-border last:border-b-0">
      {aoAbrir ? (
        <button
          type="button" {...{ [LINHA_NEGOCIO]: negocio.id }} onClick={() => aoAbrir(negocio.id)}
          className={cn("block w-full min-h-11 space-y-1 rounded-sm py-3 text-left hover:bg-muted/40 motion-reduce:transition-none", FOCO)}
        >
          {corpo}
        </button>
      ) : (
        <div className="block w-full min-h-11 space-y-1 py-3 text-left">{corpo}</div>
      )}
    </li>
  );
}

interface FichaNegociosProps {
  negocios: NegocioPessoa[];
  hoje: string;
  /** Abre o detalhe do negócio; sem isto (a ficha real, até ao P3) a lista só se lê. */
  aoAbrir?: (negocioId: string) => void;
}

/** Sem negócios: diz-o e diz onde se cria (o botão "Novo negócio" da barra da ficha). */
function SemNegocios() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-semibold text-foreground">{t(`${P}deals.emptyTitle`)}</p>
      <p className="text-sm text-muted-foreground">{t(`${P}deals.emptyHint`)}</p>
    </div>
  );
}

/** Os negócios da pessoa: "Em curso (n)" e "Terminados (n)", cada grupo só se tiver negócios. */
export function FichaNegocios({ negocios, hoje, aoAbrir }: FichaNegociosProps) {
  const { t } = useTranslation();
  if (negocios.length === 0) return <SemNegocios />;
  const grupos = [
    { chave: "inProgress", itens: negocios.filter(estaAberto) },
    { chave: "finished", itens: negocios.filter((n) => !estaAberto(n)) },
  ];
  return (
    <div className="space-y-4">
      {grupos.map((g) => g.itens.length > 0 && (
        <Seccao key={g.chave} titulo={`${t(`${P}dealsList.${g.chave}`)} (${g.itens.length})`}>
          <ul>{g.itens.map((n) => <LinhaNegocio key={n.id} negocio={n} hoje={hoje} aoAbrir={aoAbrir} />)}</ul>
        </Seccao>
      ))}
      {grupos[0].itens.length === 0 && <p className="text-sm text-muted-foreground">{t(`${P}dealsList.none`)}</p>}
    </div>
  );
}
