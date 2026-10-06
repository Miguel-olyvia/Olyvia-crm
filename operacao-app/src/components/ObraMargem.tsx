import { useEffect, useState } from "react";
import { Button, Card, Input, cx } from "./ui";
import { ErroDeEscrita } from "../lib/dados";
import {
  gravarLimiarMargem,
  margemDaObra,
  type MargemObra,
  type MargemResumo,
  type RespostaMargem,
  type Semaforo,
} from "../lib/margem";
import { euros } from "../lib/formatar";
import { formatarMinutos } from "../domain/obras";
import { rotuloRitmo } from "../domain/previsao";

/**
 * Margem da obra em tempo real — só para quem vê custos (a base decide:
 * sem `operations.costs.view` este bloco nem aparece).
 *
 * Três números, do mais certo ao mais útil: a margem com que se vendeu, a
 * margem sobre o que já está feito, e a margem a que se chega se a obra
 * continuar a este ritmo. O semáforo é o da projetada contra o limiar.
 */

const COR_SEMAFORO: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-500",
  vermelho: "bg-red-500",
  sem_dados: "bg-slate-300",
};

const ROTULO_SEMAFORO: Record<Semaforo, string> = {
  verde: "Margem saudável",
  amarelo: "Margem abaixo do limiar",
  vermelho: "Margem em risco",
  sem_dados: "Sem valor vendido",
};

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} %`;

export function PontoSemaforo({ semaforo, titulo, className }: { semaforo: Semaforo; titulo?: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={titulo ?? ROTULO_SEMAFORO[semaforo]}
      title={titulo ?? ROTULO_SEMAFORO[semaforo]}
      className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", COR_SEMAFORO[semaforo], className)}
    />
  );
}

const FONTE_RITMO: Record<MargemObra["ritmo_fonte"], string> = {
  obra: "pelas tarefas já feitas nesta obra",
  historico: "pelo histórico das obras terminadas",
  sem_dados: "ainda sem tarefas feitas — conta-se o previsto",
};

const FONTE_CUSTO_HORA: Record<MargemObra["custo_hora_fonte"], string> = {
  orcamento: "o que o orçamento implica (mão de obra orçada ÷ horas previstas)",
  equipa: "a média do custo/hora da equipa",
  padrao: "o custo/hora padrão da organização",
};

export default function ObraMargem({
  obraId,
  orgId,
  recarga,
}: {
  obraId: string;
  orgId: string;
  recarga: number;
}) {
  const [m, setM] = useState<RespostaMargem | null>(null);
  const [aberto, setAberto] = useState(false);
  const [limiar, setLimiar] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recargaLocal, setRecargaLocal] = useState(0);

  useEffect(() => {
    let vivo = true;
    margemDaObra(obraId)
      .then((r) => {
        if (!vivo) return;
        setM(r);
        if (r && r.ve_custos) setLimiar(String(r.limiar));
      })
      // A margem é um extra: se falhar, a ficha da obra abre na mesma.
      .catch(() => vivo && setM(null));
    return () => {
      vivo = false;
    };
  }, [obraId, recarga, recargaLocal]);

  if (!m || !m.ve_custos) return null;

  if (m.semaforo === "sem_dados") {
    return (
      <div data-testid="obra-margem">
        <Card className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
          <PontoSemaforo semaforo="sem_dados" />
          Margem: esta obra não tem orçamento ligado com valor vendido — não há com que comparar o custo.
        </Card>
      </div>
    );
  }

  const gravar = async () => {
    const n = Number(limiar.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 90) {
      setErro("O limiar tem de estar entre 0 e 90 %.");
      return;
    }
    setAGravar(true);
    setErro(null);
    try {
      await gravarLimiarMargem(orgId, n);
      setRecargaLocal((r) => r + 1);
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar o limiar.");
    } finally {
      setAGravar(false);
    }
  };

  const desvio =
    m.margem_projetada_pct != null && m.margem_prevista_pct != null
      ? m.margem_projetada_pct - m.margem_prevista_pct
      : null;

  return (
    <div data-testid="obra-margem">
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PontoSemaforo semaforo={m.semaforo} className="h-3.5 w-3.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Margem projetada</p>
            <p className="text-xl font-semibold tabular text-slate-900">
              {pct(m.margem_projetada_pct)}{" "}
              <span className="text-sm font-normal text-slate-500">{euros(m.margem_projetada)}</span>
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-xs">
          <div>
            <dt className="text-slate-400">Na venda</dt>
            <dd className="font-mono tabular text-slate-700">{pct(m.margem_prevista_pct)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">A esta data</dt>
            <dd className="font-mono tabular text-slate-700">{pct(m.margem_a_data_pct)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Limiar</dt>
            <dd className="font-mono tabular text-slate-700">{pct(m.limiar)}</dd>
          </div>
        </dl>
        <Button size="sm" variant="ghost" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
          {aberto ? "Esconder as contas" : "Ver as contas"}
        </Button>
      </div>

      <p className={cx("mt-2 text-xs", m.semaforo === "verde" ? "text-slate-500" : "font-medium text-amber-800")}>
        {ROTULO_SEMAFORO[m.semaforo]}
        {desvio != null && Math.abs(desvio) >= 0.5 && (
          <>
            {" · "}
            {desvio < 0 ? "perdeu" : "ganhou"} {pct(Math.abs(desvio))} face à venda
          </>
        )}
        {m.ritmo_fonte !== "sem_dados" && <> · a obra está a {rotuloRitmo(m.ritmo)}</>}
      </p>

      {aberto && (
        <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 lg:grid-cols-[3fr_2fr]">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <Linha rotulo="Vendido (sem IVA)" valor={euros(m.receita)} />
              {m.extras > 0 && <Linha rotulo="Extras aprovados" valor={euros(m.extras)} />}
              <Linha rotulo="Materiais (custo do orçamento)" valor={euros(-m.custo_materiais)} />
              <Linha
                rotulo={`Mão de obra prevista (${formatarMinutos(m.minutos_previstos)})`}
                valor={euros(-m.mo_prevista)}
                nota="na venda"
              />
              <Linha
                rotulo={`Mão de obra real até hoje (${formatarMinutos(m.minutos_reais)})`}
                valor={euros(-m.mo_real)}
              />
              <Linha
                rotulo="Mão de obra que falta, a este ritmo"
                valor={euros(-(m.mo_projetada - m.mo_real))}
              />
              <Linha rotulo="Custo projetado" valor={euros(-m.custo_projetado)} forte />
              <Linha rotulo="Margem projetada" valor={`${euros(m.margem_projetada)} · ${pct(m.margem_projetada_pct)}`} forte />
            </tbody>
          </table>
          <div className="space-y-2 text-xs text-slate-500">
            <p>
              <b className="text-slate-700">Ritmo:</b> {rotuloRitmo(m.ritmo)}, {FONTE_RITMO[m.ritmo_fonte]}. O que falta
              conta-se a este ritmo.
            </p>
            <p>
              <b className="text-slate-700">Custo/hora:</b> {euros(m.custo_hora)}/h — {FONTE_CUSTO_HORA[m.custo_hora_fonte]}.
              {m.sem_tarifa > 0 && (
                <>
                  {" "}
                  {m.sem_tarifa} pessoa{m.sem_tarifa === 1 ? "" : "s"} sem custo/hora no perfil conta
                  {m.sem_tarifa === 1 ? "" : "m"} a este valor.
                </>
              )}
            </p>
            <p>
              <b className="text-slate-700">Feito:</b> {pct(m.progresso * 100)} do trabalho previsto. Os materiais contam
              pelo custo do orçamento.
            </p>
            {m.receita_fonte === "total_com_iva" && (
              <p className="text-amber-700">O orçamento não tem subtotal: usou-se o total, que pode trazer IVA.</p>
            )}
            {m.pode_configurar && (
              <div className="flex items-end gap-2 pt-1">
                <label className="text-xs text-slate-600">
                  Limiar da organização (%)
                  <Input
                    className="mt-1 w-24"
                    inputMode="decimal"
                    value={limiar}
                    onChange={(e) => setLimiar(e.target.value)}
                    aria-label="Limiar da margem em percentagem"
                  />
                </label>
                <Button size="sm" variant="secondary" onClick={() => void gravar()} disabled={aGravar}>
                  {aGravar ? "A gravar…" : "Gravar"}
                </Button>
              </div>
            )}
            {erro && <p className="text-red-700">{erro}</p>}
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}

function Linha({ rotulo, valor, nota, forte }: { rotulo: string; valor: string; nota?: string; forte?: boolean }) {
  return (
    <tr>
      <td className={cx("py-1.5 pr-3", forte ? "font-medium text-slate-800" : "text-slate-600")}>
        {rotulo}
        {nota && <span className="ml-1 text-xs text-slate-400">({nota})</span>}
      </td>
      <td className={cx("py-1.5 text-right font-mono tabular", forte ? "font-semibold text-slate-900" : "text-slate-700")}>
        {valor}
      </td>
    </tr>
  );
}

/** O ponto do semáforo num cartão da lista das Obras (nada se não houver dados). */
export function MargemNaLista({ m }: { m: MargemResumo | undefined }) {
  if (!m || m.semaforo === "sem_dados") return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium tabular text-slate-500"
      title={`Margem projetada ${pct(m.margem_projetada_pct)} (na venda ${pct(m.margem_prevista_pct)}; limiar ${pct(m.limiar)})`}
      data-testid="margem-na-lista"
    >
      <PontoSemaforo semaforo={m.semaforo} titulo={`Margem: ${ROTULO_SEMAFORO[m.semaforo].toLowerCase()}`} />
      {pct(m.margem_projetada_pct)}
    </span>
  );
}
