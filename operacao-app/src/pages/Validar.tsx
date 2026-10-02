import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita, listarEquipa } from "../lib/dados";
import {
  EVENTO_ALERTAS,
  alertasDeSupervisao,
  registosDasTarefas,
  tarefasPorValidar,
  validarTarefa,
  type AlertaSupervisao,
  type RegistoObra,
  type TarefaObra,
} from "../lib/obras";
import AlertasSupervisao from "../components/AlertasSupervisao";
import { Button, Card, EmptyState, ErrorState, Field, Modal, Skeleton, Textarea, cx } from "../components/ui";
import { AlertTriangle, Check, X } from "../components/icons";
import { ObraValidar } from "../components/ObraIcones";
import { FichaLeitura } from "../components/ObraTarefaPainel";
import FotosTarefa from "../components/FotosTarefa";
import {
  ROTULO_MOTIVO,
  formatarMinutos,
  nivelDeAlerta,
  percentagemGasta,
  podeValidar,
} from "../domain/obras";
import { dataHora } from "../lib/formatar";

/**
 * A fila do supervisor: o que a equipa deu por feito e espera o segundo par
 * de olhos. Validar é um toque; rejeitar exige motivo — é o que a equipa vai
 * ler no telemóvel para corrigir.
 *
 * Quem fez a tarefa não a valida (a base recusa); o ecrã avisa antes.
 */
export default function Validar() {
  const { activeOrgId, funcao, businessUserId } = useAuth();
  const [tarefas, setTarefas] = useState<TarefaObra[]>([]);
  const [registos, setRegistos] = useState<RegistoObra[]>([]);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [aRejeitar, setARejeitar] = useState<TarefaObra | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<AlertaSupervisao[]>([]);
  const [erroAlertas, setErroAlertas] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const [ts, eq] = await Promise.all([tarefasPorValidar(activeOrgId), listarEquipa(activeOrgId)]);
      setTarefas(ts);
      setRegistos(await registosDasTarefas(ts.map((t) => t.id)));
      setNomes(new Map(eq.map((m) => [m.utilizador_id, m.nome])));
      // Os alertas não travam a fila: se falharem, diz-se e a fila aparece.
      try {
        setAlertas(await alertasDeSupervisao(activeOrgId));
        setErroAlertas(null);
      } catch (e) {
        setAlertas([]);
        setErroAlertas(e instanceof ErroDeDados ? e.message : "Não foi possível carregar os alertas.");
      }
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar a fila.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Um atraso registado noutro sítio (ex.: na ficha da tarefa) atualiza os alertas.
  useEffect(() => {
    const f = () => setRecarga((r) => r + 1);
    window.addEventListener(EVENTO_ALERTAS, f);
    return () => window.removeEventListener(EVENTO_ALERTAS, f);
  }, []);

  const porObra = useMemo(() => {
    const m = new Map<string, TarefaObra[]>();
    for (const t of tarefas) m.set(t.obra_codigo, [...(m.get(t.obra_codigo) ?? []), t]);
    return [...m];
  }, [tarefas]);

  const decidir = async (t: TarefaObra, aprovar: boolean, m?: string) => {
    setAGravar(t.id);
    setErroAcao(null);
    try {
      await validarTarefa(t.id, aprovar, m);
      setARejeitar(null);
      setTarefas((ts) => ts.filter((x) => x.id !== t.id));
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Sem ligação. Tenta outra vez.");
    } finally {
      setAGravar(null);
    }
  };

  if (!podeValidar(funcao)) {
    return <ErrorState message="Validar tarefas é para o supervisor de obra ou o gestor." />;
  }
  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Validar</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {tarefas.length === 0
            ? "Nada por validar."
            : `${tarefas.length} tarefa(s) feitas à espera do segundo par de olhos.`}
        </p>
      </div>

      {erroAcao && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>}

      {erroAlertas && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{erroAlertas}</p>}
      <AlertasSupervisao alertas={alertas} aoMudar={() => setRecarga((r) => r + 1)} />
      {alertas.length > 0 && (
        <h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Por validar</h2>
      )}

      {tarefas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ObraValidar width={22} height={22} />}
            title="Fila vazia"
            description="Quando a equipa der uma tarefa por feita, aparece aqui."
          />
        </Card>
      ) : (
        porObra.map(([codigo, lista]) => (
          <section key={codigo} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Link to={`/obras/${codigo}`} className="hover:text-brand">
                {codigo} · {lista[0].obra_titulo}
              </Link>
            </h2>
            {lista.map((t) => {
              const rs = registos.filter((r) => r.tarefa_id === t.id);
              const quem = [...new Set(rs.map((r) => r.utilizador_id))];
              const fizEu = !!businessUserId && quem.includes(businessUserId);
              const nivel = nivelDeAlerta(t.minutos_reais, t.minutos_previstos);
              return (
                <Card key={t.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setAberta(aberta === t.id ? null : t.id)}
                    >
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        {t.fase_ordem}. {t.fase_nome}
                      </p>
                      <p className="text-sm font-semibold text-slate-800">{t.nome}</p>
                      {t.obra_morada && <p className="mt-0.5 truncate text-xs text-slate-400">{t.obra_morada}</p>}
                      <p className="mt-0.5 text-xs text-slate-500">
                        {quem.map((u) => nomes.get(u) ?? "—").join(", ") || "—"} · feita {dataHora(t.terminada_em)}
                      </p>
                      <p
                        className={cx(
                          "mt-1 font-mono text-xs tabular",
                          nivel === "excedido" ? "text-red-700" : "text-slate-600"
                        )}
                      >
                        {formatarMinutos(t.minutos_reais)} reais / {formatarMinutos(t.minutos_previstos)} previstos (
                        {percentagemGasta(t.minutos_reais, t.minutos_previstos)} %)
                      </p>
                      {t.motivo_desvio && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                          <AlertTriangle width={11} height={11} /> {ROTULO_MOTIVO[t.motivo_desvio]}
                          {t.nota_desvio && <> — {t.nota_desvio}</>}
                        </p>
                      )}
                    </button>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button
                        variant="secondary"
                        className="h-11 flex-1 sm:flex-none"
                        disabled={aGravar === t.id}
                        onClick={() => {
                          setARejeitar(t);
                          setMotivo("");
                        }}
                      >
                        <X width={16} height={16} /> Rejeitar
                      </Button>
                      <Button
                        className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700 sm:flex-none"
                        disabled={aGravar === t.id || fizEu}
                        title={fizEu ? "Trabalhaste nesta tarefa: outra pessoa tem de a validar." : undefined}
                        onClick={() => void decidir(t, true)}
                      >
                        <Check width={16} height={16} /> Validar
                      </Button>
                    </div>
                  </div>
                  {fizEu && (
                    <p className="mt-2 text-xs text-slate-500">
                      Trabalhaste nesta tarefa — a validação tem de ser de outra pessoa.
                    </p>
                  )}
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <FotosTarefa tarefa={t} podeEnviar={false} euId={businessUserId} nomes={nomes} />
                  </div>
                  {aberta === t.id && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <FichaLeitura tarefa={t} nomes={nomes} />
                    </div>
                  )}
                </Card>
              );
            })}
          </section>
        ))
      )}

      {aRejeitar && (
        <Modal
          title={`Rejeitar — ${aRejeitar.nome}`}
          size="sm"
          onClose={() => setARejeitar(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setARejeitar(null)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                disabled={!motivo.trim() || aGravar === aRejeitar.id}
                onClick={() => void decidir(aRejeitar, false, motivo)}
              >
                Rejeitar
              </Button>
            </>
          }
        >
          <Field label="O que tem de ser corrigido" hint="A equipa lê isto no telemóvel, na tarefa.">
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
