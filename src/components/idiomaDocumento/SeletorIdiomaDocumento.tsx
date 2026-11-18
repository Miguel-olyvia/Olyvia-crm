import { useId, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { obterIdioma, ordenarPorRegisto } from "@/lib/idiomaDocumento/registo";

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

function nomeNativo(codigo: string): string {
  return obterIdioma(codigo)?.nomeNativo ?? codigo;
}

/** A escolha efetiva: o que está em `valor` e existe em `disponiveis`; vazio cai no primeiro disponível. */
function escolhaEfetiva(disponiveis: string[], valor: readonly string[]): string[] {
  const pedida = ordenarPorRegisto(valor).filter((c) => disponiveis.includes(c));
  return pedida.length > 0 ? pedida : disponiveis.slice(0, 1);
}

const ALVO = "min-h-11"; // 44px: alvo tátil mínimo

function Segmentado({ opcoes, escolha, rotulo, className, onChange }: {
  opcoes: string[][];
  escolha: string[];
  rotulo: string;
  className?: string;
  onChange: (escolha: string[]) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const chave = escolha.join("+");
  const atual = Math.max(0, opcoes.findIndex((o) => o.join("+") === chave));

  const escolher = (indice: number, mover: boolean) => {
    if (mover) refs.current[indice]?.focus();
    if (indice !== atual) onChange(opcoes[indice]);
  };

  const aoTeclar = (e: React.KeyboardEvent, indice: number) => {
    const n = opcoes.length;
    const destino =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (indice + 1) % n
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (indice + n - 1) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : null;
    if (destino === null) return;
    e.preventDefault();
    escolher(destino, true);
  };

  return (
    <div role="radiogroup" aria-label={rotulo} className={cn("inline-flex flex-wrap gap-1 rounded-lg border bg-muted p-1", className)}>
      {opcoes.map((opcao, i) => {
        const marcada = i === atual;
        return (
          <button
            key={opcao.join("+")}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={marcada}
            tabIndex={marcada ? 0 : -1}
            onClick={() => escolher(i, false)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={cn(
              ALVO,
              "rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              marcada ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {opcao.map(nomeNativo).join(" + ")}
          </button>
        );
      })}
    </div>
  );
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
    return <Segmentado opcoes={opcoes} escolha={escolha} rotulo={nome} className={className} onChange={onChange} />;
  }
  return <Caixas disponiveis={lista} escolha={escolha} rotulo={nome} className={className} onChange={onChange} />;
}
