import { useEffect, useMemo, useState } from "react";
import { cx } from "./ui";
import { areasDaVisitaDoOrcamento, fichaLocalDaObra, type FichaLocal as Ficha } from "../lib/obras";
import { fichaTemDados, linhasExterior, linhasInterior, type LinhaFicha } from "../domain/fichaLocal";
import {
  diasUteisEntre,
  fichaDaSugestao,
  sugerirProtecoesELogistica,
  type AreaParaSugestao,
  type LinhaSugestao,
} from "../domain/sugestaoFichaLocal";

// Uma leitura por obra, partilhada pelas tarefas da mesma obra na lista.
const cache = new Map<string, Promise<Ficha>>();
function lerFicha(obraId: string): Promise<Ficha> {
  let p = cache.get(obraId);
  if (!p) {
    // Num .then: um erro síncrono também vira rejeição (e a ficha fica por mostrar).
    p = Promise.resolve()
      .then(() => fichaLocalDaObra(obraId))
      .catch((e) => {
        cache.delete(obraId);
        throw e;
      });
    cache.set(obraId, p);
  }
  return p;
}

/** O plano da obra, para a sugestão de proteções e logística (só na ficha da obra). */
export interface PlanoParaSugestao {
  inicio: string | null;
  fim: string | null;
  orcamentoId: string | null;
}

const qtd = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });

/**
 * A ficha do local da obra (do CRM): acesso, andar e elevador,
 * estacionamento, e a casa (habitada, animais, amianto…). Na ficha da obra e
 * no cartão da tarefa do técnico. Não mostra nada se a ficha estiver vazia.
 * Com `plano` (ficha da obra), mostra também o que preparar: proteções e
 * logística calculadas da ficha e das medidas da visita (só quantidades).
 */
export default function FichaLocal({
  obraId,
  compacta = false,
  plano,
}: {
  obraId: string;
  compacta?: boolean;
  plano?: PlanoParaSugestao;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [areas, setAreas] = useState<AreaParaSugestao[]>([]);
  const orcamentoId = plano?.orcamentoId ?? null;

  useEffect(() => {
    let vivo = true;
    setAreas([]);
    if (!orcamentoId) return;
    Promise.resolve()
      .then(() => areasDaVisitaDoOrcamento(orcamentoId))
      .then((a) => vivo && setAreas(a))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [orcamentoId]);

  const sugestao = useMemo(() => {
    if (!plano || !ficha || !fichaDaSugestao(ficha, areas)) return null;
    return sugerirProtecoesELogistica(ficha, areas, { diasObra: diasUteisEntre(plano.inicio, plano.fim) });
  }, [plano, ficha, areas]);

  useEffect(() => {
    let vivo = true;
    lerFicha(obraId)
      .then((f) => vivo && setFicha(f))
      .catch(() => vivo && setFicha(null));
    return () => {
      vivo = false;
    };
  }, [obraId]);

  if (!ficha || (!fichaTemDados(ficha) && !sugestao)) return null;
  const ext = linhasExterior(ficha);
  const int = linhasInterior(ficha);

  const chips = (linhas: LinhaFicha[]) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {linhas.map((l) => (
        <span
          key={l.texto}
          className={cx(
            "rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset",
            l.atencao ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-slate-600 ring-slate-200"
          )}
        >
          {l.texto}
        </span>
      ))}
    </div>
  );

  return (
    <div className={cx(compacta ? "" : "rounded-lg border border-slate-200 p-3")} data-testid="ficha-local">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ficha do local</p>
      {ext.length > 0 && chips(ext)}
      {int.length > 0 && chips(int)}
      {ficha.notas_interior?.trim() && (
        <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{ficha.notas_interior.trim()}</p>
      )}
      {sugestao && <APreparar linhas={[...sugestao.protecoes, ...sugestao.logistica]} avisos={sugestao.avisos} dias={sugestao.dias} doPlano={sugestao.diasOrigem === "plano"} falta={sugestao.faltaSaber} />}
    </div>
  );
}

/** O que preparar para a obra, a partir da ficha: quantidades, sem preços. */
function APreparar({
  linhas,
  avisos,
  dias,
  doPlano,
  falta,
}: {
  linhas: LinhaSugestao[];
  avisos: string[];
  dias: number;
  doPlano: boolean;
  falta: string[];
}) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-2" data-testid="ficha-local-preparar">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        A preparar · sugerido pela ficha
      </p>
      <ul className="mt-1 divide-y divide-slate-100 text-xs">
        {linhas.map((l) => (
          <li key={l.chave} className="flex items-baseline justify-between gap-3 py-1" data-chave={l.chave}>
            <span className="min-w-0">
              <span className="text-slate-800">{l.descricao}</span>
              <span className="block text-[11px] text-slate-500">{l.razao}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-slate-700">
              {l.estimado ? "≈ " : ""}
              {qtd.format(l.quantidade)} {l.unidade}
            </span>
          </li>
        ))}
      </ul>
      {avisos.map((a) => (
        <p key={a} className="mt-1 text-[11px] text-amber-800">
          ⚠ {a}
        </p>
      ))}
      <p className="mt-1 text-[11px] text-slate-400">
        {dias} dias úteis {doPlano ? "do plano" : "estimados"}.{falta.length > 0 ? ` Falta saber: ${falta.join("; ")}.` : ""}
      </p>
    </div>
  );
}
