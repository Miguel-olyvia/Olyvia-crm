import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info, ShieldCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FichaTecnicaEdificio } from "@/lib/addresses/fichaTecnicaEdificio";
import {
  fichaDaSugestao,
  sugerirProtecoesELogistica,
  type AreaParaSugestao,
  type LinhaSugestao,
} from "@/lib/addresses/sugestaoFichaLocal";
import { lerAreasDaVisita } from "@/lib/addresses/sugestaoAreas";

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const qtd = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });

interface Props {
  ficha: Partial<FichaTecnicaEdificio> | null | undefined;
  piso?: string | null;
  /** deal_needs.id das áreas do orçamento (linhas importadas do negócio). */
  needIds?: string[];
  className?: string;
  /** Aberto ao carregar (por defeito, fechado — só o resumo). */
  abertoInicial?: boolean;
}

/**
 * "Sugestão a partir da ficha do local": proteções (cartão, plástico, fita,
 * portas, elevador/escadas) e logística (parquímetro, escada sem elevador,
 * deslocações, entulho), calculadas sozinhas da ficha do local e das medidas
 * da visita. Só sugestão — não muda o preço do orçamento.
 */
export const SugestaoFichaLocalPainel = ({ ficha, piso, needIds, className, abertoInicial = false }: Props) => {
  const [areas, setAreas] = useState<AreaParaSugestao[]>([]);
  const [aberto, setAberto] = useState(abertoInicial);
  const chaveNeeds = (needIds ?? []).slice().sort().join(",");

  useEffect(() => {
    let vivo = true;
    lerAreasDaVisita(chaveNeeds ? chaveNeeds.split(",") : []).then((a) => vivo && setAreas(a));
    return () => { vivo = false; };
  }, [chaveNeeds]);

  const fichaComPiso = useMemo(() => ({ ...(ficha ?? {}), piso: piso ?? null }), [ficha, piso]);
  const s = useMemo(() => sugerirProtecoesELogistica(fichaComPiso, areas), [fichaComPiso, areas]);

  if (!fichaDaSugestao(fichaComPiso, areas)) return null;

  const tabela = (titulo: string, icone: React.ReactNode, linhas: LinhaSugestao[], total: number) =>
    linhas.length > 0 && (
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
          {icone} {titulo} <span className="ml-auto tabular-nums">{eur.format(total)}</span>
        </p>
        <table className="w-full text-xs">
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-t align-top" data-chave={l.chave}>
                <td className="py-1 pr-2">
                  <span className="text-foreground">{l.descricao}</span>
                  <span className="block text-muted-foreground">{l.razao}</span>
                </td>
                <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">
                  {l.estimado && <span title="Estimado — falta um dado">≈ </span>}
                  {qtd.format(l.quantidade)} {l.unidade}
                </td>
                <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums text-muted-foreground">
                  {eur.format(l.precoUnitario)}
                </td>
                <td className="whitespace-nowrap py-1 text-right tabular-nums font-medium">{eur.format(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className={cn("rounded-md border border-dashed bg-muted/30 p-2.5", className)} data-testid="sugestao-ficha-local">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-xs"
        aria-expanded={aberto}
      >
        {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">Sugestão a partir da ficha do local</span>
        <span className="text-muted-foreground">
          · proteções {eur.format(s.totalProtecoes)} · logística {eur.format(s.totalLogistica)}
        </span>
        <span className="ml-auto font-semibold tabular-nums">{eur.format(s.total)}</span>
      </button>

      {aberto && (
        <div className="mt-2 space-y-3">
          {tabela("Proteções", <ShieldCheck className="h-3.5 w-3.5" />, s.protecoes, s.totalProtecoes)}
          {tabela("Logística", <Truck className="h-3.5 w-3.5" />, s.logistica, s.totalLogistica)}
          {s.avisos.length > 0 && (
            <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
              {s.avisos.map((a) => <li key={a}>⚠ {a}</li>)}
            </ul>
          )}
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>
              Só sugestão: não entra no preço. {s.dias} dias de obra{" "}
              {s.diasOrigem === "estimado" ? "estimados pelas áreas" : "do plano"}.
              {s.faltaSaber.length > 0 && <> Falta saber: {s.faltaSaber.join("; ")}.</>}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};
