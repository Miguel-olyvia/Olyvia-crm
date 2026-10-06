import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import { iniciarTarefa, meuRegistoAberto, minhasTarefas, type RegistoObra, type TarefaObra } from "../lib/obras";
import { obterPosicao, registarChegada } from "../lib/chegadas";
import { Button, Card, ErrorState, Skeleton, Toggle } from "../components/ui";
import { CheckCircle, MapPin } from "../components/icons";
import { ObraTarefaEstadoBadge } from "../components/ObraEstadoBadge";
import NomeTarefa from "../components/NomeTarefa";
import { hojeIso, podeValidar } from "../domain/obras";
import { primeiraTarefaDoDia, tarefasDeHoje } from "../domain/chegada";
import { data as formatarData } from "../lib/formatar";

/**
 * Chegada à obra — o que o QR da porta abre (/obras/<código>?chegada=1).
 *
 * Um toque: "Registar chegada" guarda a hora (e a localização, só se a
 * pessoa a ligar) e começa o relógio da primeira tarefa do dia, pelas RPCs de
 * sempre. Sem sessão, o login devolve a pessoa a este mesmo link.
 */
export default function ChegadaObra({ codigo }: { codigo: string }) {
  const { activeOrgId, businessUserId, funcao, orgs } = useAuth();
  const [tarefas, setTarefas] = useState<TarefaObra[]>([]);
  const [aberto, setAberto] = useState<RegistoObra | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [comLocal, setComLocal] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ hora: string; tarefa: string | null; nota: string | null } | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId || !businessUserId) return;
    setErro(null);
    try {
      const [ts, ab] = await Promise.all([minhasTarefas(activeOrgId, businessUserId), meuRegistoAberto(businessUserId)]);
      setTarefas(ts.filter((t) => t.obra_codigo === codigo));
      setAberto(ab);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar as tuas tarefas.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, businessUserId, codigo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const hoje = hojeIso();
  const deHoje = useMemo(() => tarefasDeHoje(tarefas, hoje), [tarefas, hoje]);
  const primeira = useMemo(() => primeiraTarefaDoDia(tarefas, hoje), [tarefas, hoje]);
  const obra = tarefas[0] ?? null;

  const chegar = async () => {
    if (!obra) return;
    setAGravar(true);
    setErroAcao(null);
    try {
      const posicao = comLocal ? await obterPosicao() : null;
      const r = await registarChegada({ obraId: obra.obra_id, tarefaId: primeira?.id ?? null, posicao });
      const hora = new Date(r?.chegou_em ?? Date.now()).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

      let nota: string | null = comLocal && !posicao ? "A localização não ficou guardada (o telemóvel não a deu)." : null;
      let tarefa: string | null = null;
      if (primeira) {
        if (aberto?.tarefa_id === primeira.id) {
          tarefa = primeira.nome;
        } else if (aberto) {
          nota = "Tens o relógio a correr noutra tarefa — termina-a ou pausa-a nas tuas tarefas.";
        } else {
          try {
            await iniciarTarefa(primeira.id);
            tarefa = primeira.nome;
          } catch (e) {
            nota = `Não deu para começar "${primeira.nome}": ${e instanceof ErroDeEscrita ? e.message : "sem ligação"}`;
          }
        }
      }
      setFeito({ hora, tarefa, nota });
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Sem ligação. Tenta outra vez.");
    } finally {
      setAGravar(false);
    }
  };

  if (aCarregar) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => void carregar()} />;

  if (!obra) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="space-y-3 p-5 text-center">
          <p className="font-mono text-sm text-slate-500">{codigo}</p>
          <h1 className="text-lg font-semibold text-slate-900">Não tens tarefas nesta obra</h1>
          <p className="text-sm text-slate-500">
            {orgs.length > 1
              ? "Pode ser de outra empresa: troca de empresa no menu do topo e lê o código outra vez. "
              : ""}
            Se devias estar aqui, pede ao gestor para te atribuir.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/minhas-tarefas">
              <Button variant="secondary">As minhas tarefas</Button>
            </Link>
            {podeValidar(funcao) && (
              <Link to={`/obras/${encodeURIComponent(codigo)}`}>
                <Button>Abrir a ficha da obra</Button>
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <p className="font-mono text-xs font-medium text-slate-500">{obra.obra_codigo}</p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{obra.obra_titulo}</h1>
        {obra.obra_morada && (
          <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-500">
            <MapPin width={13} height={13} className="mt-0.5 shrink-0" /> {obra.obra_morada}
          </p>
        )}
      </div>

      {feito ? (
        <Card className="space-y-3 p-5 text-center">
          <div role="status" className="space-y-3">
          <CheckCircle width={36} height={36} className="mx-auto text-emerald-600" />
          <p className="text-lg font-semibold text-slate-900">Chegada registada às {feito.hora}</p>
          {feito.tarefa && (
            <p className="text-sm text-slate-600">
              Relógio a correr em <b>{feito.tarefa}</b>.
            </p>
          )}
          {feito.nota && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{feito.nota}</p>}
          </div>
          <Link to="/minhas-tarefas">
            <Button className="h-12 w-full text-base">Ir para as minhas tarefas</Button>
          </Link>
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Hoje aqui ({deHoje.length})
            </p>
            {deHoje.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Nada planeado para hoje nesta obra.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {deHoje.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <NomeTarefa nome={t.nome} className="truncate font-medium text-slate-800" />
                      {t.inicio_planeado && <p className="text-xs text-slate-400">{formatarData(t.inicio_planeado)}</p>}
                    </div>
                    <ObraTarefaEstadoBadge estado={t.estado} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Toggle
            checked={comLocal}
            onChange={setComLocal}
            label="Guardar a minha localização"
            hint="Opcional. A equipa só vê que houve localização, não onde."
          />

          {erroAcao && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {erroAcao}
            </p>
          )}

          <Button className="h-14 w-full text-base" disabled={aGravar} onClick={() => void chegar()}>
            {aGravar ? "A registar…" : "Registar chegada"}
          </Button>
          <p className="text-center text-xs text-slate-500">
            {primeira
              ? aberto && aberto.tarefa_id !== primeira.id
                ? "Tens outra tarefa a correr: regista a chegada e trata dela nas tuas tarefas."
                : `O relógio começa em "${primeira.nome}".`
              : "Não há tarefa para começar já — fica só a hora de chegada."}
          </p>
        </Card>
      )}
    </div>
  );
}
