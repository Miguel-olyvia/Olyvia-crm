import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ordenarPorRegisto } from "@/lib/idiomaDocumento/registo";
import { ALVO_DO_SELETOR as ALVO, nomeNativoDoIdioma as nomeNativo } from "./apoioDoSeletor";
import { SegmentadoDeIdiomas } from "./SegmentadoDeIdiomas";

/**
 * Escolha do(s) idioma(s) com que um documento é gerado.
 *
 * - 1 idioma disponível: não mostra nada (não há o que escolher).
 * - 2 idiomas: controlo segmentado [A][B][A + B] (radiogroup, setas, Home/End).
 * - 3 ou mais: uma caixa de seleção por idioma; o último marcado não se desmarca.
 *
 * Devolve SEMPRE um array ordenado pelo registo e nunca vazio. Só usa `onChange` quando a escolha muda.
 */
export interface SeletorIdiomaDocumentoProps {
  /** Idiomas em que o template existe (qualquer ordem; são ordenados pelo registo). */
  disponiveis: readonly string[];
  /** A escolha atual. Fora do disponível ou vazia = primeiro idioma disponível. */
  valor: readonly string[];
  onChange: (escolha: string[]) => void;
  /** Nome acessível do grupo; por omissão «Idioma do documento». */
  rotulo?: string;
  className?: string;
}

/** A escolha efetiva: o que está em `valor` e existe em `disponiveis`; vazio cai no primeiro disponível. */
function escolhaEfetiva(disponiveis: string[], valor: readonly string[]): string[] {
  const pedida = ordenarPorRegisto(valor).filter((c) => disponiveis.includes(c));
  return pedida.length > 0 ? pedida : disponiveis.slice(0, 1);
}

function Caixas({ disponiveis, escolha, rotulo, className, onChange }: {
  disponiveis: string[];
  escolha: string[];
  rotulo: string;
  className?: string;
  onChange: (escolha: string[]) => void;
}) {
  const { t } = useTranslation();
  const base = useId();
  const idAjuda = `${base}-ajuda`;
  const alternar = (codigo: string, marcado: boolean) => {
    const proxima = marcado ? [...escolha, codigo] : escolha.filter((c) => c !== codigo);
    if (proxima.length === 0) return;
    onChange(ordenarPorRegisto(proxima));
  };

  return (
    <div role="group" aria-label={rotulo} className={cn("flex flex-wrap items-center gap-2", className)}>
      {disponiveis.map((codigo) => {
        const marcado = escolha.includes(codigo);
        const id = `${base}-${codigo}`;
        const ultimo = marcado && escolha.length === 1;
        return (
          <label key={codigo} htmlFor={id} className={cn(ALVO, "flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm", ultimo && "cursor-not-allowed opacity-70")}>
            {/* aria-disabled (e não disabled): a caixa continua focável e a ajuda explica porque não desmarca. */}
            <Checkbox
              id={id}
              aria-label={nomeNativo(codigo)}
              checked={marcado}
              aria-disabled={ultimo ? true : undefined}
              aria-describedby={ultimo ? idAjuda : undefined}
              onCheckedChange={(v) => alternar(codigo, v === true)}
            />
            <span>{nomeNativo(codigo)}</span>
          </label>
        );
      })}
      {escolha.length === 1 && <p id={idAjuda} className="w-full text-xs text-muted-foreground">{t("contractTemplates.versoes.seletor.ultimo")}</p>}
    </div>
  );
}

export function SeletorIdiomaDocumento({ disponiveis, valor, onChange, rotulo, className }: SeletorIdiomaDocumentoProps) {
  const { t } = useTranslation();
  const lista = ordenarPorRegisto(disponiveis);
  if (lista.length < 2) return null;

  const escolha = escolhaEfetiva(lista, valor);
  const nome = rotulo ?? t("contractTemplates.versoes.seletor.rotulo");

  if (lista.length === 2) {
    const opcoes = [[lista[0]], [lista[1]], [lista[0], lista[1]]];
    return <SegmentadoDeIdiomas opcoes={opcoes} escolha={escolha} rotulo={nome} className={className} onChange={onChange} />;
  }
  return <Caixas disponiveis={lista} escolha={escolha} rotulo={nome} className={className} onChange={onChange} />;
}
