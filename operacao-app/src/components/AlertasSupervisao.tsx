import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, cx } from "./ui";
import { AlertTriangle } from "./icons";
import ObraAtraso, { ClienteAvisado } from "./ObraAtraso";
import { ErroDeDados } from "../lib/dados";
import { avisarAlertasMudaram, obterTarefa, type AlertaSupervisao, type TarefaObra } from "../lib/obras";
import { ROTULO_TIPO_ALERTA, rotuloContagemAlerta, type TipoAlerta } from "../domain/atrasos";

const ORDEM: TipoAlerta[] = ["fim_ultrapassado", "nao_iniciada", "cliente_por_avisar"];

/** "há 2 h", "há 3 dias" — a idade do alerta. */
export function haQuanto(minutos: number | null | undefined): string {
  if (minutos == null || minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const h = Math.floor(minutos / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

/**
 * Os alertas do supervisor, por tipo (o pior primeiro), com as ações
 * rápidas: abrir a tarefa na obra, registar o atraso, marcar o cliente como
 * avisado. A base decide quem vê o quê (rpc_ops_obra_alertas).
 */
export default function AlertasSupervisao({
  alertas,
  aoMudar,
}: {
  alertas: readonly AlertaSupervisao[];
  aoMudar: () => void;
}) {
  const [atrasar, setAtrasar] = useState<TarefaObra | null>(null);
  const [avisar, setAvisar] = useState<AlertaSupervisao | null>(null);
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (alertas.length === 0) return null;

  const abrirAtraso = async (a: AlertaSupervisao) => {
    setAAbrir(a.tarefa_id);
    setErro(null);
    try {
      const t = await obterTarefa(a.tarefa_id);
      if (!t) setErro("A tarefa já não existe, ou deixaste de a ver.");
      else setAtrasar(t);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Sem ligação. Tenta outra vez.");
    } finally {
      setAAbrir(null);
    }
  };

  const mudou = () => {
    avisarAlertasMudaram();
    aoMudar();
  };

  return (
    <section className="space-y-2" aria-label="Alertas">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-600">
        <AlertTriangle width={13} height={13} /> Alertas <span className="text-slate-400">({alertas.length})</span>
      </h2>
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {ORDEM.map((tipo) => {
        const lista = alertas.filter((a) => a.tipo === tipo);
        if (!lista.length) return null;
        return (
          <Card key={tipo} className="divide-y divide-slate-100">
            <p
              className={cx(
                "px-4 py-2 text-xs font-semibold",
                tipo === "cliente_por_avisar" ? "text-amber-700" : "text-red-700"
              )}
            >
              {rotuloContagemAlerta(tipo, lista.length)}
            </p>
            {lista.map((a) => (
              <div
                key={`${a.tipo}-${a.atraso_id ?? a.tarefa_id}`}
                className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                data-alerta={a.tipo}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    {a.obra_codigo} · {a.obra_titulo} · {ROTULO_TIPO_ALERTA[a.tipo]}
                  </p>
                  <p className="text-sm font-semibold text-slate-800">{a.tarefa_nome}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{a.detalhe}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {a.pessoas_nomes.length ? a.pessoas_nomes.join(", ") : "ninguém atribuído"} · {haQuanto(a.minutos_atraso)}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                  <Link
                    to={`/obras/${encodeURIComponent(a.obra_codigo)}?tarefa=${a.tarefa_id}`}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Abrir tarefa
                  </Link>
                  {a.tipo !== "cliente_por_avisar" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={aAbrir === a.tarefa_id}
                      onClick={() => void abrirAtraso(a)}
                    >
                      Registar atraso
                    </Button>
                  )}
                  {a.tipo === "cliente_por_avisar" && a.atraso_id && (
                    <Button size="sm" onClick={() => setAvisar(a)}>
                      Cliente avisado
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        );
      })}

      {atrasar && (
        <ObraAtraso
          tarefa={atrasar}
          aoFechar={() => setAtrasar(null)}
          aoGravar={() => {
            setAtrasar(null);
            mudou();
          }}
        />
      )}
      {avisar?.atraso_id && (
        <ClienteAvisado
          atrasoId={avisar.atraso_id}
          titulo={avisar.tarefa_nome}
          detalhe={avisar.detalhe}
          aoFechar={() => setAvisar(null)}
          aoGravar={mudou}
        />
      )}
    </section>
  );
}
