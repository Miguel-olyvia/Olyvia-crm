import { useEffect, useState } from "react";
import { Button, Field, Input, Modal, Textarea, Toggle, cx } from "./ui";
import { AlertTriangle } from "./icons";
import { ErroDeEscrita } from "../lib/dados";
import {
  marcarClienteAvisado,
  registarAtraso,
  simularAtraso,
  type RespostaAtraso,
  type TarefaObra,
} from "../lib/obras";
import {
  MOTIVOS_ATRASO,
  ROTULO_MOTIVO_ATRASO,
  diasDeDesvio,
  formatarDesvio,
  minutosExtra,
  validarAtraso,
  type MotivoAtraso,
  type UnidadeExtra,
} from "../domain/atrasos";
import { MINUTOS_POR_DIA, formatarMinutos } from "../domain/obras";
import { data as formatarData } from "../lib/formatar";

/** O que a folha precisa da tarefa (a linha de ops_v_obra_tarefa serve). */
export type TarefaParaAtraso = Pick<
  TarefaObra,
  "id" | "nome" | "inicio_planeado" | "fim_planeado" | "minutos_previstos" | "pessoas"
> &
  Partial<Pick<TarefaObra, "minutos_estimativa" | "pessoas_previstas" | "minutos_por_dia" | "obra_codigo">>;

/**
 * "Vai atrasar": a folha para registar um atraso ANTES de ele acontecer.
 *
 * Rápida no telemóvel (motivos em botões grandes, como a justificação), mas
 * com o que o supervisor precisa para avisar o cliente: o contexto
 * (obrigatório), mais quanto tempo — em horas/dias ou uma nova data de fim —
 * e, antes de gravar, o impacto: o novo fim da tarefa e da obra, e as tarefas
 * que vão ser empurradas. O impacto é a própria base a fazer as contas e a
 * desfazê-las (`p_simular`), para não haver duas regras.
 */
export default function ObraAtraso({
  tarefa,
  podeEmpurrar = true,
  atrasoPreviewMs = 400,
  aoFechar,
  aoGravar,
}: {
  tarefa: TarefaParaAtraso;
  /** Mostrar a escolha "empurrar as que dependem desta". Sem ela, empurra sempre. */
  podeEmpurrar?: boolean;
  /** Espera antes de pedir a pré-visualização (0 nos testes). */
  atrasoPreviewMs?: number;
  aoFechar: () => void;
  aoGravar: (r: RespostaAtraso) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoAtraso | "">("");
  const [contexto, setContexto] = useState("");
  const [modo, setModo] = useState<"tempo" | "data">("tempo");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState<UnidadeExtra>("horas");
  const [novoFim, setNovoFim] = useState("");
  const [empurrar, setEmpurrar] = useState(true);
  const [impacto, setImpacto] = useState<RespostaAtraso | null>(null);
  const [erroImpacto, setErroImpacto] = useState<string | null>(null);
  const [aCalcular, setACalcular] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pessoas = tarefa.pessoas_previstas ?? Math.max(1, tarefa.pessoas.length);
  const minutosPorDia = tarefa.minutos_por_dia ?? MINUTOS_POR_DIA;
  const extra = modo === "tempo" ? minutosExtra(Number(quantidade.replace(",", ".")), unidade, pessoas, minutosPorDia) : null;
  const dataFim = modo === "data" ? novoFim : "";
  const fimAtual = tarefa.fim_planeado ?? tarefa.inicio_planeado;
  const problema = validarAtraso({ motivo, contexto, minutosExtra: extra, novoFim: dataFim, fimAtual });

  // A pré-visualização, sempre que o "quanto" muda.
  useEffect(() => {
    if (!extra && !dataFim) {
      setImpacto(null);
      setErroImpacto(null);
      return;
    }
    let vivo = true;
    const id = window.setTimeout(() => {
      setACalcular(true);
      simularAtraso({ tarefaId: tarefa.id, motivo: null, contexto: "", minutosExtra: extra, novoFim: dataFim || null, empurrar })
        .then((r) => {
          if (!vivo) return;
          setImpacto(r);
          setErroImpacto(null);
        })
        .catch((e) => {
          if (!vivo) return;
          setImpacto(null);
          setErroImpacto(e instanceof ErroDeEscrita ? e.message : "Não foi possível calcular o impacto.");
        })
        .finally(() => vivo && setACalcular(false));
    }, atrasoPreviewMs);
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
  }, [tarefa.id, extra, dataFim, empurrar, atrasoPreviewMs]);

  const gravar = async () => {
    setTentou(true);
    if (problema) return;
    setAGravar(true);
    setErro(null);
    try {
      const r = await registarAtraso({
        tarefaId: tarefa.id,
        motivo: motivo || null,
        contexto: contexto.trim(),
        minutosExtra: extra,
        novoFim: dataFim || null,
        empurrar,
      });
      aoGravar(r);
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Sem ligação. Tenta outra vez.");
    } finally {
      setAGravar(false);
    }
  };

  const desvioObra = impacto ? diasDeDesvio(impacto.fim_obra_anterior, impacto.fim_obra_novo) : 0;

  return (
    <Modal
      title={`Vai atrasar — ${tarefa.nome}`}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Voltar
          </Button>
          <Button onClick={() => void gravar()} disabled={aGravar} className="min-w-[8rem]">
            {aGravar ? "A gravar…" : "Registar atraso"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Fim previsto: <b>{formatarData(fimAtual)}</b> · previsto{" "}
          <b className="font-mono tabular">{formatarMinutos(tarefa.minutos_estimativa ?? tarefa.minutos_previstos)}</b>
          {tarefa.minutos_estimativa ? " (já revisto)" : ""}
        </p>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Porquê?</p>
          <div className="grid grid-cols-2 gap-2">
            {MOTIVOS_ATRASO.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(motivo === m ? "" : m)}
                aria-pressed={motivo === m}
                className={cx(
                  "min-h-[48px] rounded-xl px-3 py-2 text-left text-sm font-medium ring-1 ring-inset transition-colors",
                  motivo === m ? "bg-brand text-white ring-brand" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {ROTULO_MOTIVO_ATRASO[m]}
              </button>
            ))}
          </div>
        </div>

        <Field label="O que se passa (obrigatório)" hint="É o que o supervisor lê — e o que se diz ao cliente.">
          <Textarea
            rows={3}
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Ex.: a betonilha ainda está húmida, só dá para assentar na quarta"
            className="w-full"
          />
        </Field>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Mais quanto tempo?</p>
          <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(
              [
                ["tempo", "Horas / dias a mais"],
                ["data", "Nova data de fim"],
              ] as const
            ).map(([m, r]) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                aria-pressed={modo === m}
                className={cx(
                  "flex-1 rounded-md px-3 py-1.5 transition-colors",
                  modo === m ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {modo === "tempo" ? (
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                aria-label="Quanto tempo a mais"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-28"
              />
              {(["horas", "dias"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidade(u)}
                  aria-pressed={unidade === u}
                  className={cx(
                    "rounded-lg px-4 text-sm ring-1 ring-inset",
                    unidade === u ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          ) : (
            <Input
              type="date"
              aria-label="Nova data de fim"
              value={novoFim}
              min={fimAtual ?? undefined}
              onChange={(e) => setNovoFim(e.target.value)}
              className="w-full"
            />
          )}
          {modo === "tempo" && extra != null && pessoas > 1 && (
            <p className="mt-1 text-[11px] text-slate-400">
              {pessoas} pessoas na tarefa: {formatarMinutos(extra)} de mão de obra.
            </p>
          )}
        </div>

        {podeEmpurrar && (
          <Toggle
            checked={empurrar}
            onChange={setEmpurrar}
            label="Empurrar as tarefas que dependem desta"
            hint="Só as que ainda não começaram, e só o necessário."
          />
        )}

        {(impacto || aCalcular || erroImpacto) && (
          <div
            className={cx(
              "rounded-lg border px-3 py-2.5 text-sm",
              erroImpacto ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
            )}
            aria-live="polite"
            data-testid="impacto-atraso"
          >
            {erroImpacto ? (
              <p>{erroImpacto}</p>
            ) : !impacto ? (
              <p className="text-amber-700">A calcular o impacto…</p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle width={14} height={14} /> Impacto
                </p>
                <p className="mt-1">
                  Esta tarefa passa a acabar a <b>{formatarData(impacto.novo_fim)}</b>
                  {impacto.fim_anterior && <> (era {formatarData(impacto.fim_anterior)})</>}.
                </p>
                <p>
                  A obra acaba a <b>{formatarData(impacto.fim_obra_novo)}</b>
                  {desvioObra > 0 ? (
                    <>
                      {" "}
                      — era {formatarData(impacto.fim_obra_anterior)} ({formatarDesvio(desvioObra)}).{" "}
                      <b>Avisar o cliente.</b>
                    </>
                  ) : (
                    <> — o fim da obra não muda.</>
                  )}
                </p>
                {impacto.empurradas.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {impacto.empurradas.map((e) => (
                      <li key={e.tarefa_id}>
                        ↳ {e.nome}: {formatarData(e.inicio_anterior)} → {formatarData(e.novo_inicio)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {((tentou && problema) || erro) && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {erro ?? problema}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * "Cliente avisado": o supervisor diz que já falou com o cliente, e o quê.
 * Some o alerta "cliente por avisar" desse atraso.
 */
export function ClienteAvisado({
  atrasoId,
  titulo,
  detalhe,
  aoFechar,
  aoGravar,
}: {
  atrasoId: string;
  titulo: string;
  detalhe?: string | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [nota, setNota] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      await marcarClienteAvisado(atrasoId, nota);
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Sem ligação. Tenta outra vez.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <Modal
      title={`Cliente avisado — ${titulo}`}
      size="sm"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Voltar
          </Button>
          <Button onClick={() => void gravar()} disabled={aGravar}>
            {aGravar ? "A gravar…" : "Marcar como avisado"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {detalhe && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{detalhe}</p>}
        <Field label="O que se disse ao cliente (opcional)" hint="Fica no histórico do atraso.">
          <Textarea
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex.: liguei à D. Maria; a entrega passa para sexta"
            className="w-full"
          />
        </Field>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}
