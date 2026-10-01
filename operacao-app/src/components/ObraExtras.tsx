import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea } from "./ui";
import { ObraExtra } from "./ObraIcones";
import { ErroDeEscrita } from "../lib/dados";
import { decidirExtra, registarExtra, type ExtraObra, type TarefaObra } from "../lib/obras";
import { ROTULO_ESTADO_EXTRA, type EstadoExtra } from "../domain/obras";
import { dataHora, euros } from "../lib/formatar";

/**
 * Trabalhos extra: o que se descobre em obra (tubagem podre, parede oca).
 *
 * registado → aprovado (gestor) → enviado ao comercial · ou recusado.
 * "Enviado" é um estado em Operações. O orçamento adicional faz-se no CRM,
 * pelo comercial — esta app não escreve no CRM.
 */

const COR: Record<EstadoExtra, string> = {
  registado: "bg-amber-50 text-amber-800 ring-amber-200",
  aprovado: "bg-sky-50 text-sky-700 ring-sky-200",
  enviado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  recusado: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function RegistarExtra({
  obraId,
  tarefas,
  tarefaId,
  aoFechar,
  aoGravar,
}: {
  obraId: string;
  tarefas?: readonly TarefaObra[];
  tarefaId?: string | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [tarefa, setTarefa] = useState(tarefaId ?? "");
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      const v = valor.trim() ? Number(valor.replace(",", ".")) : null;
      if (v != null && (!Number.isFinite(v) || v < 0)) throw new ErroDeEscrita("O valor estimado não é um número válido.");
      await registarExtra({ obraId, descricao, valor: v, tarefaId: tarefa || null });
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível registar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <Modal
      title="Registar trabalho extra"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()} disabled={aGravar || !descricao.trim()}>
            {aGravar ? "A registar…" : "Registar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          O que encontraste que não estava no orçamento. O gestor aprova e passa ao comercial, que faz o orçamento
          adicional.
        </p>
        <Field label="O que se encontrou">
          <Textarea
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: tubagem de ferro podre atrás do lavatório, cerca de 3 m"
            className="w-full"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor estimado (€)" hint="Opcional — uma ordem de grandeza chega.">
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="w-full" />
          </Field>
          {tarefas && tarefas.length > 0 && (
            <Field label="Onde (tarefa)">
              <select
                value={tarefa}
                onChange={(e) => setTarefa(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {tarefas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fase_ordem}. {t.nome}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

export default function ObraExtras({
  obraId,
  extras,
  tarefas,
  podeDecidir,
  nomes,
  aoMudar,
}: {
  obraId: string;
  extras: readonly ExtraObra[];
  tarefas: readonly TarefaObra[];
  podeDecidir: boolean;
  nomes: ReadonlyMap<string, string>;
  aoMudar: () => void;
}) {
  const [novo, setNovo] = useState(false);
  const [aRecusar, setARecusar] = useState<ExtraObra | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const decidir = async (e: ExtraObra, acao: "aprovar" | "recusar" | "enviar", m?: string) => {
    setErro(null);
    try {
      await decidirExtra(e.id, acao, m);
      setARecusar(null);
      aoMudar();
    } catch (x) {
      setErro(x instanceof ErroDeEscrita ? x.message : "Não foi possível decidir.");
    }
  };

  const nomeTarefa = new Map(tarefas.map((t) => [t.id, t.nome]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Imprevistos encontrados em obra, para orçamento adicional.</p>
        <Button size="sm" onClick={() => setNovo(true)}>
          <ObraExtra width={14} height={14} /> Registar extra
        </Button>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {extras.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ObraExtra width={22} height={22} />}
            title="Sem trabalhos extra"
            description="Quando a equipa encontrar alguma coisa fora do orçamento, aparece aqui."
          />
        </Card>
      ) : (
        extras.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={COR[e.estado]}>{ROTULO_ESTADO_EXTRA[e.estado]}</Badge>
                  {e.tarefa_id && <span className="text-xs text-slate-400">em {nomeTarefa.get(e.tarefa_id) ?? "tarefa"}</span>}
                </div>
                <p className="mt-1.5 text-sm text-slate-800">{e.descricao}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {e.registado_por ? nomes.get(e.registado_por) ?? "—" : "—"} · {dataHora(e.registado_em)}
                  {e.motivo_recusa && <> · recusado: {e.motivo_recusa}</>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-semibold tabular text-slate-800">{euros(e.valor_estimado)}</p>
                {podeDecidir && (
                  <div className="mt-2 flex justify-end gap-1.5">
                    {e.estado === "registado" && (
                      <Button size="sm" onClick={() => void decidir(e, "aprovar")}>
                        Aprovar
                      </Button>
                    )}
                    {e.estado === "aprovado" && (
                      <Button size="sm" onClick={() => void decidir(e, "enviar")}>
                        Enviar ao comercial
                      </Button>
                    )}
                    {(e.estado === "registado" || e.estado === "aprovado") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setARecusar(e);
                          setMotivo("");
                        }}
                      >
                        Recusar
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))
      )}

      {novo && <RegistarExtra obraId={obraId} tarefas={tarefas} aoFechar={() => setNovo(false)} aoGravar={aoMudar} />}

      {aRecusar && (
        <Modal
          title="Recusar trabalho extra"
          size="sm"
          onClose={() => setARecusar(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setARecusar(null)}>
                Cancelar
              </Button>
              <Button variant="danger" disabled={!motivo.trim()} onClick={() => void decidir(aRecusar, "recusar", motivo)}>
                Recusar
              </Button>
            </>
          }
        >
          <Field label="Motivo">
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
