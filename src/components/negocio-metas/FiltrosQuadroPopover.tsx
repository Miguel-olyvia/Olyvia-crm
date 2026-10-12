import { useId } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { NativeSelect, type NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FOCO } from "./estilos";
import {
  FASES, filtrosNoPopover, type FaixaValor, type FiltrosQuadro, type NumOrcamentos,
} from "./logicaQuadro";

interface CampoProps {
  rotulo: string;
  valor: string;
  opcoes: NativeSelectOption[];
  aoMudar: (valor: string) => void;
}

/** Um select nativo com a etiqueta visível por cima (a primeira opção, vazia, é "sem este filtro"). */
function Campo({ rotulo, valor, opcoes, aoMudar }: CampoProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">{rotulo}</label>
      <NativeSelect id={id} value={valor} onValueChange={aoMudar} options={opcoes} className={`h-11 ${FOCO}`} />
    </div>
  );
}

interface FiltrosQuadroPopoverProps {
  filtros: FiltrosQuadro;
  comerciais: string[];
  servicos: string[];
  aoMudarFiltros: (parcial: Partial<FiltrosQuadro>) => void;
}

const FAIXAS: readonly { valor: Exclude<FaixaValor, "">; chave: string }[] = [
  { valor: "ate10", chave: "valueLow" }, { valor: "10a20", chave: "valueMid" }, { valor: "20mais", chave: "valueHigh" },
];
const ORCAMENTOS: readonly { valor: Exclude<NumOrcamentos, "">; chave: string }[] = [
  { valor: "1", chave: "quotesOne" }, { valor: "2+", chave: "quotesMany" },
];

/** O botão Filtros e o painel com os filtros avançados: comercial, fase, serviço, orçamentos e valor. */
export function FiltrosQuadroPopover({ filtros, comerciais, servicos, aoMudarFiltros }: FiltrosQuadroPopoverProps) {
  const { t } = useTranslation();
  const ativos = filtrosNoPopover(filtros);
  const k = (chave: string) => t(`businessGoals.filters.${chave}`);
  const opcoes = (todas: string, itens: NativeSelectOption[]): NativeSelectOption[] => [{ value: "", label: todas }, ...itens];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={`min-h-11 gap-2 ${FOCO}`}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="tabular-nums">{ativos > 0 ? `${k("button")} (${ativos})` : k("button")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(30rem,calc(100vh-8rem))] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto motion-reduce:animate-none"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo={t("businessGoals.filter.rep")} valor={filtros.comercial}
            opcoes={opcoes(t("businessGoals.filter.allReps"), comerciais.map((c) => ({ value: c, label: c })))}
            aoMudar={(comercial) => aoMudarFiltros({ comercial })}
          />
          <Campo
            rotulo={k("phase")} valor={filtros.fase}
            opcoes={opcoes(k("allPhases"), FASES.map((f) => ({ value: f, label: t(`businessGoals.phase.${f}`) })))}
            aoMudar={(fase) => aoMudarFiltros({ fase: fase as FiltrosQuadro["fase"] })}
          />
          <Campo
            rotulo={k("service")} valor={filtros.servico}
            opcoes={opcoes(k("allServices"), servicos.map((s) => ({ value: s, label: s })))}
            aoMudar={(servico) => aoMudarFiltros({ servico })}
          />
          <Campo
            rotulo={k("quotes")} valor={filtros.orcamentos}
            opcoes={opcoes(k("anyQuotes"), ORCAMENTOS.map((o) => ({ value: o.valor, label: k(o.chave) })))}
            aoMudar={(orcamentos) => aoMudarFiltros({ orcamentos: orcamentos as NumOrcamentos })}
          />
          <Campo
            rotulo={k("value")} valor={filtros.faixa}
            opcoes={opcoes(k("anyValue"), FAIXAS.map((f) => ({ value: f.valor, label: k(f.chave) })))}
            aoMudar={(faixa) => aoMudarFiltros({ faixa: faixa as FaixaValor })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
