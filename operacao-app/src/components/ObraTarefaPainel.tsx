import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Field, Input, Modal, Select, Textarea, cx } from "./ui";
import { AlertTriangle } from "./icons";
import { ErroDeEscrita, type MembroEquipa } from "../lib/dados";
import {
  apagarTarefa,
  atribuirTarefa,
  gravarTarefa,
  pessoasLivres,
  type PessoaLivre,
  type ConflitoObra,
  type ConflitoRpc,
  type FaseObra,
  type TarefaObra,
} from "../lib/obras";
import {
  ROTULO_ESTADO_TAREFA_OBRA,
  ROTULO_MOTIVO,
  formatarMinutos,
  nivelDeAlerta,
} from "../domain/obras";
import { data as formatarData } from "../lib/formatar";
import FotosTarefa from "./FotosTarefa";

/**
 * A ficha de uma tarefa da obra, ao lado do Gantt.
 *
 * Para quem planeia, é editável: nome, tempo previsto, datas, precedência,
 * procedimento/materiais/ferramentas e quem a faz. Para os outros, é a ficha
 * de leitura. Gravar devolve os choques de agenda, e eles mostram-se aqui —
 * avisam, não impedem.
 */
export default function ObraTarefaPainel({
  obraId,
  orgId,
  tarefa,
  fases,
  tarefas,
  equipa,
  conflitos,
  podeEditar,
  faseNova,
  aoFechar,
  aoGravar,
}: {
  obraId: string;
  /** Para saber quem está livre nas datas da tarefa. Sem ele, mostra toda a equipa. */
  orgId?: string;
  /** null = tarefa nova */
  tarefa: TarefaObra | null;
  fases: readonly FaseObra[];
  tarefas: readonly TarefaObra[];
  equipa: readonly MembroEquipa[];
  conflitos: readonly ConflitoObra[];
  podeEditar: boolean;
  faseNova?: string | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [nome, setNome] = useState(tarefa?.nome ?? "");
  const [faseId, setFaseId] = useState(tarefa?.fase_id ?? faseNova ?? fases[0]?.id ?? "");
  const [minutos, setMinutos] = useState(String(tarefa?.minutos_previstos ?? 60));
  const [inicio, setInicio] = useState(tarefa?.inicio_planeado ?? "");
  const [fim, setFim] = useState(tarefa?.fim_planeado ?? "");
  const [dependeDe, setDependeDe] = useState(tarefa?.depende_de ?? "");
  const [procedimento, setProcedimento] = useState(tarefa?.procedimento ?? "");
  const [materiais, setMateriais] = useState(tarefa?.materiais ?? "");
  const [ferramentas, setFerramentas] = useState(tarefa?.ferramentas ?? "");
  const [pessoas, setPessoas] = useState<string[]>(tarefa?.pessoas ?? []);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<ConflitoRpc[] | null>(null);

  useEffect(() => {
    setAvisos(null);
  }, [tarefa?.id]);

  const nomes = useMemo(() => new Map(equipa.map((m) => [m.utilizador_id, m.nome])), [equipa]);

  // Quem está livre nas datas da tarefa (férias, feriados, agenda cheia, ordens).
  // Quem está ocupado não aparece para escolher — a não ser que já esteja na tarefa.
  const [livres, setLivres] = useState<Map<string, PessoaLivre> | null>(null);
  useEffect(() => {
    if (!podeEditar || !orgId || !inicio) {
      setLivres(null);
      return;
    }
    let vivo = true;
    pessoasLivres({ orgId, inicio, fim: fim || inicio, excluirTarefa: tarefa?.id ?? null })
      .then((ps) => vivo && setLivres(new Map(ps.map((p) => [p.utilizador_id, p]))))
      .catch(() => vivo && setLivres(null));
    return () => {
      vivo = false;
    };
  }, [podeEditar, orgId, inicio, fim, tarefa?.id]);

  // Executam: técnicos e operadores (empreiteiros incluídos); o gestor também pode.
  const todosExecutores = equipa.filter((m) => m.funcao !== "admin");
  const executores = livres
    ? todosExecutores.filter((m) => pessoas.includes(m.utilizador_id) || livres.get(m.utilizador_id)?.livre !== false)
    : todosExecutores;
  const ocupados = livres
    ? todosExecutores.filter((m) => !pessoas.includes(m.utilizador_id) && livres.get(m.utilizador_id)?.livre === false)
    : [];
  const meusConflitos = tarefa ? conflitos.filter((c) => c.tarefa_id === tarefa.id) : [];
  const outras = tarefas.filter((t) => t.id !== tarefa?.id);

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      const m = Number(minutos);
      if (!nome.trim()) throw new ErroDeEscrita("A tarefa precisa de nome.");
      if (!Number.isFinite(m) || m <= 0) throw new ErroDeEscrita("O tempo previsto tem de ser maior que zero.");
      const r = await gravarTarefa({
        obraId,
        tarefaId: tarefa?.id ?? null,
        faseId,
        nome: nome.trim(),
        minutos: Math.round(m),
        procedimento,
        materiais,
        ferramentas,
        inicio: inicio || null,
        fim: fim || inicio || null,
        dependeDe: dependeDe || null,
      });
      const mudouPessoas =
        pessoas.length !== (tarefa?.pessoas.length ?? 0) || pessoas.some((p) => !tarefa?.pessoas.includes(p));
      let choques = r.conflitos ?? [];
      if (mudouPessoas) {
        const a = await atribuirTarefa(r.id, pessoas);
        choques = a.conflitos ?? [];
      }
      aoGravar();
      if (choques.length) setAvisos(choques);
      else aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível falar com o servidor.");
    } finally {
      setAGravar(false);
    }
  };

  const apagar = async () => {
    if (!tarefa) return;
    setAGravar(true);
    setErro(null);
    try {
      await apagarTarefa(tarefa.id);
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível apagar.");
    } finally {
      setAGravar(false);
    }
  };

  const nivel = tarefa ? nivelDeAlerta(tarefa.minutos_reais, tarefa.minutos_previstos) : "ok";

  return (
    <Modal
      title={tarefa ? tarefa.nome : "Nova tarefa"}
      size="lg"
      onClose={aoFechar}
      footer={
        podeEditar ? (
          <>
            {tarefa && (
              <Button variant="ghost" className="mr-auto text-red-600" onClick={() => void apagar()} disabled={aGravar}>
                Apagar
              </Button>
            )}
            <Button variant="secondary" onClick={aoFechar}>
              {avisos ? "Fechar" : "Cancelar"}
            </Button>
            <Button onClick={() => void gravar()} disabled={aGravar}>
              {aGravar ? "A gravar…" : "Gravar"}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={aoFechar}>
            Fechar
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {tarefa && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50/80 p-3 text-sm">
            <Badge>{ROTULO_ESTADO_TAREFA_OBRA[tarefa.estado]}</Badge>
            <span
              className={cx(
                "font-mono tabular",
                nivel === "excedido" ? "text-red-700" : nivel === "aviso" ? "text-amber-700" : "text-slate-600"
              )}
            >
              {formatarMinutos(tarefa.minutos_reais)} reais de {formatarMinutos(tarefa.minutos_previstos)}
            </span>
            {tarefa.a_correr > 0 && <Badge className="bg-brand-50 text-brand-800 ring-brand-200">a correr agora</Badge>}
            {tarefa.motivo_desvio && (
              <span className="w-full text-xs text-slate-600">
                Desvio justificado: <b>{ROTULO_MOTIVO[tarefa.motivo_desvio]}</b>
                {tarefa.nota_desvio && <> — {tarefa.nota_desvio}</>}
              </span>
            )}
            {tarefa.motivo_rejeicao && tarefa.estado === "rejeitada" && (
              <span className="w-full text-xs text-red-700">Rejeitada: {tarefa.motivo_rejeicao}</span>
            )}
          </div>
        )}

        {(avisos?.length || meusConflitos.length) ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle width={14} height={14} /> Choque de agenda
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {(avisos ?? []).map((c, i) => (
                <li key={`a${i}`}>
                  {c.nome} já está em <b>{c.obra_codigo}</b> — {c.tarefa} ({formatarData(c.inicio)} → {formatarData(c.fim)})
                </li>
              ))}
              {!avisos &&
                meusConflitos.map((c, i) => (
                  <li key={`c${i}`}>
                    {nomes.get(c.utilizador_id) ?? "Alguém"} já está em <b>{c.outra_obra}</b> — {c.outra_tarefa} (
                    {formatarData(c.outro_inicio)} → {formatarData(c.outro_fim)})
                  </li>
                ))}
            </ul>
            <p className="mt-1 text-xs text-amber-800">Avisa, não impede. Arrasta a tarefa ou troca a pessoa.</p>
          </div>
        ) : null}

        {podeEditar ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Tarefa">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full" />
              </Field>
              <Field label="Previsto (min)">
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={minutos}
                  onChange={(e) => setMinutos(e.target.value)}
                  className="w-full"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Fase">
                <Select value={faseId} onChange={(e) => setFaseId(e.target.value)} className="w-full">
                  {fases.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.ordem}. {f.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Início">
                <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full" />
              </Field>
              <Field label="Fim">
                <Input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className="w-full" />
              </Field>
            </div>
            <Field label="Só depois de" hint="A equipa não consegue iniciar esta tarefa enquanto a outra não estiver feita.">
              <Select value={dependeDe} onChange={(e) => setDependeDe(e.target.value)} className="w-full">
                <option value="">— sem precedência —</option>
                {outras.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fase_ordem}. {t.nome}
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-slate-700">Quem faz</p>
              <div className="flex flex-wrap gap-1.5">
                {executores.map((m) => {
                  const on = pessoas.includes(m.utilizador_id);
                  return (
                    <button
                      key={m.utilizador_id}
                      type="button"
                      onClick={() =>
                        setPessoas((p) => (on ? p.filter((x) => x !== m.utilizador_id) : [...p, m.utilizador_id]))
                      }
                      className={cx(
                        "rounded-full px-3 py-1.5 text-xs ring-1 ring-inset transition-colors",
                        on
                          ? "bg-brand text-white ring-brand"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                      )}
                      aria-pressed={on}
                    >
                      {m.nome}
                      <span className={cx("ml-1 text-[10px]", on ? "text-white/70" : "text-slate-400")}>{m.funcao}</span>
                    </button>
                  );
                })}
                {executores.length === 0 && (
                  <p className="text-xs text-slate-400">
                    {ocupados.length ? "Ninguém livre nestas datas." : "Ninguém com perfil em Operações."}
                  </p>
                )}
              </div>
              {pessoas.some((p) => livres?.get(p)?.livre === false) && (
                <p className="mt-1.5 text-xs text-amber-700">
                  Atenção:{" "}
                  {pessoas
                    .filter((p) => livres?.get(p)?.livre === false)
                    .map((p) => `${nomes.get(p) ?? "—"} (${livres?.get(p)?.motivo ?? "ocupado"})`)
                    .join(", ")}
                  .
                </p>
              )}
              {ocupados.length > 0 && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Indisponíveis nestas datas:{" "}
                  {ocupados.map((m) => `${m.nome} — ${livres?.get(m.utilizador_id)?.motivo ?? "ocupado"}`).join(" · ")}
                </p>
              )}
            </div>

            <Field label="Procedimento" hint="Como se faz, e como se usa a ferramenta.">
              <Textarea rows={3} value={procedimento} onChange={(e) => setProcedimento(e.target.value)} className="w-full" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Materiais">
                <Textarea rows={2} value={materiais} onChange={(e) => setMateriais(e.target.value)} className="w-full" />
              </Field>
              <Field label="Ferramentas">
                <Textarea rows={2} value={ferramentas} onChange={(e) => setFerramentas(e.target.value)} className="w-full" />
              </Field>
            </div>
          </>
        ) : (
          tarefa && <FichaLeitura tarefa={tarefa} nomes={nomes} />
        )}

        {tarefa && (
          <div className="border-t border-slate-100 pt-3">
            <FotosTarefa
              tarefa={tarefa}
              podeEnviar={podeEditar}
              podeApagarTodas={podeEditar}
              euId={null}
              nomes={nomes}
            />
          </div>
        )}

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

export function FichaLeitura({ tarefa, nomes }: { tarefa: TarefaObra; nomes: ReadonlyMap<string, string> }) {
  const bloco = (titulo: string, texto: string | null) =>
    texto ? (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
        <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{texto}</p>
      </div>
    ) : null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {tarefa.fase_ordem}. {tarefa.fase_nome} · {formatarData(tarefa.inicio_planeado)}
        {tarefa.fim_planeado && tarefa.fim_planeado !== tarefa.inicio_planeado && <> → {formatarData(tarefa.fim_planeado)}</>}
      </p>
      {tarefa.pessoas.length > 0 && (
        <p className="text-sm text-slate-600">Quem faz: {tarefa.pessoas.map((p) => nomes.get(p) ?? "—").join(", ")}</p>
      )}
      {bloco("Procedimento", tarefa.procedimento)}
      {bloco("Materiais", tarefa.materiais)}
      {bloco("Ferramentas", tarefa.ferramentas)}
    </div>
  );
}
