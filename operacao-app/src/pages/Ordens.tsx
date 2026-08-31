import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  listarClientes,
  listarOrdens,
  type Cliente,
  type LinhaOrdem,
} from "../lib/dados";
import {
  Badge,
  Barra,
  Card,
  EmptyState,
  ErrorState,
  EstadoOrdem,
  Input,
  OrigemOrdem,
  PrioridadeOrdem,
  Skeleton,
  cx,
} from "../components/ui";
import { AlertTriangle, Inbox, Plus, Search } from "../components/icons";
import { IconeDaOrdem, IconeDoEstado } from "../components/IconeDeLinha";
import { alertasDaOrdem, severidadeMaxima } from "../domain/alertas";
import type { Estado } from "../domain/tipos";

/**
 * UMA lista para as três origens.
 *
 * Substitui `/works` + `/scheduled-works` + `/failures` do Infraspeak — três
 * ecrãs para o mesmo objeto, cada um com o seu conjunto de separadores e o seu
 * vocabulário. Aqui as vistas guardadas são filtros da mesma lista, não
 * páginas diferentes.
 */

interface Vista {
  chave: string;
  rotulo: string;
  estados?: readonly Estado[];
  /** Filtro que não se exprime em SQL simples — aplicado depois. */
  soAtrasadas?: boolean;
}

const VISTAS: Vista[] = [
  { chave: "abertas", rotulo: "Abertas", estados: ["por_aprovar", "agendada", "em_curso", "pausada"] },
  { chave: "por-aprovar", rotulo: "Por aprovar", estados: ["por_aprovar"] },
  { chave: "atrasadas", rotulo: "Atrasadas", estados: ["agendada", "em_curso"], soAtrasadas: true },
  { chave: "em-curso", rotulo: "Em curso", estados: ["em_curso", "pausada"] },
  { chave: "por-confirmar", rotulo: "Por confirmar", estados: ["fechada"] },
  { chave: "historico", rotulo: "Histórico", estados: ["confirmada", "cancelada"] },
];

function paraData(v: string | null): Date | null {
  return v ? new Date(v) : null;
}

/** "hoje 09h", "amanhã", "30/08", ou "—" quando não há data. */
function quando(iso: string | null, agora: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diff = Math.round((dia.getTime() - hoje.getTime()) / 86_400_000);
  const horas = `${String(d.getHours()).padStart(2, "0")}h${
    d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""
  }`;
  if (diff === 0) return `hoje ${horas}`;
  if (diff === 1) return `amanhã ${horas}`;
  if (diff === -1) return `ontem ${horas}`;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export default function Ordens() {
  const { activeOrgId } = useAuth();
  const [params, setParams] = useSearchParams();
  const vistaAtual = params.get("vista") ?? "abertas";
  const vista = VISTAS.find((v) => v.chave === vistaAtual) ?? VISTAS[0];

  const [pesquisa, setPesquisa] = useState(params.get("q") ?? "");
  const [ordens, setOrdens] = useState<LinhaOrdem[] | null>(null);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const agora = useMemo(() => new Date(), [ordens]);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setOrdens(null);
    setErro(null);

    (async () => {
      try {
        const [linhas, cls] = await Promise.all([
          listarOrdens(activeOrgId, {
            estados: vista.estados,
            pesquisa: pesquisa.trim() || undefined,
          }),
          listarClientes(activeOrgId),
        ]);
        if (!vivo) return;
        setOrdens(linhas);
        setClientes(new Map(cls.map((c: Cliente) => [c.id, c.nome])));
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar as ordens.");
        setOrdens([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [activeOrgId, vista.chave, vista.estados, pesquisa, tentativa]);

  // "Atrasada" é um badge derivado, não um estado guardado — por isso este
  // filtro vive aqui e não na consulta.
  const visiveis = useMemo(() => {
    if (!ordens) return null;
    if (!vista.soAtrasadas) return ordens;
    return ordens.filter((o) => {
      const alertas = alertasDaOrdem(
        {
          estado: o.estado,
          agendadaPara: paraData(o.agendada_para),
          iniciadaEm: paraData(o.iniciada_em),
          ultimaAtividadeEm: paraData(o.atualizada_em),
          pausaRetomaPrevista: paraData(o.pausa_retoma_prevista),
          criadaEm: paraData(o.criada_em),
        },
        agora
      );
      return alertas.some((a) => a.chave === "atrasada");
    });
  }, [ordens, vista.soAtrasadas, agora]);

  const mudarVista = (chave: string) => {
    const p = new URLSearchParams(params);
    p.set("vista", chave);
    setParams(p, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Ordens</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Link
            to="/ordens/nova"
            className={cx(
              "inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm",
              "font-medium text-white shadow-sm transition-all hover:bg-brand-dark active:scale-[0.98]"
            )}
          >
            <Plus width={15} height={15} /> Nova ordem
          </Link>
        <div className="relative w-full sm:w-72">
          <Search
            width={15}
            height={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder="Código ou título…"
            className="pl-9"
          />
        </div>
        </div>
      </div>

      {/* Vistas guardadas — filtros da mesma lista, não ecrãs diferentes */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {VISTAS.map((v) => (
          <button
            key={v.chave}
            type="button"
            onClick={() => mudarVista(v.chave)}
            className={cx(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors",
              v.chave === vista.chave
                ? "bg-brand-50 font-medium text-brand-800"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            {v.rotulo}
          </button>
        ))}
      </div>

      {erro && <ErrorState message={erro} onRetry={() => setTentativa((t) => t + 1)} />}

      {visiveis === null && !erro && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {visiveis?.length === 0 && !erro && (
        <Card>
          <EmptyState
            icon={<Inbox width={22} height={22} />}
            title="Nada nesta vista"
            description={
              pesquisa.trim()
                ? "Nenhuma ordem corresponde à pesquisa."
                : "Quando houver trabalho aqui, aparece nesta lista."
            }
          />
        </Card>
      )}

      {visiveis && visiveis.length > 0 && (
        <div className="space-y-2">
          {visiveis.map((o) => (
            <LinhaDeOrdem
              key={o.id}
              ordem={o}
              cliente={clientes.get(o.cliente_id) ?? null}
              agora={agora}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaDeOrdem({
  ordem,
  cliente,
  agora,
}: {
  ordem: LinhaOrdem;
  cliente: string | null;
  agora: Date;
}) {
  const alertas = alertasDaOrdem(
    {
      estado: ordem.estado,
      agendadaPara: paraData(ordem.agendada_para),
      iniciadaEm: paraData(ordem.iniciada_em),
      ultimaAtividadeEm: paraData(ordem.atualizada_em),
      pausaRetomaPrevista: paraData(ordem.pausa_retoma_prevista),
      criadaEm: paraData(ordem.criada_em),
    },
    agora
  );
  const severidade = severidadeMaxima(alertas);

  return (
    <Link to={`/ordens/${ordem.codigo}`} className="block">
      <Card
        className={cx(
          "px-4 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/30",
          severidade === "critico" && "border-l-[3px] border-l-red-400",
          severidade === "aviso" && "border-l-[3px] border-l-amber-400"
        )}
      >
        <div className="flex items-start gap-3">
          {/* Os dois ícones que abrem a linha: que espécie de trabalho é, e em
              que estado está. É o que faz uma lista de setenta linhas ser
              percorrida com os olhos em vez de lida. */}
          <div className="mt-0.5 flex shrink-0 items-center gap-1">
            <IconeDaOrdem origem={ordem.origem} />
            <IconeDoEstado estado={ordem.estado} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs font-medium tabular text-slate-500">
                {ordem.codigo}
              </span>
              <OrigemOrdem origem={ordem.origem} />
              <EstadoOrdem estado={ordem.estado} />
              <PrioridadeOrdem prioridade={ordem.prioridade} />
            </div>

            <p className="mt-1 truncate text-sm font-medium text-slate-800">{ordem.titulo}</p>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
              {cliente && <span className="truncate">{cliente}</span>}
              {alertas.map((a) => (
                <Badge
                  key={a.chave}
                  className={
                    a.severidade === "critico"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : "bg-amber-50 text-amber-800 ring-amber-200"
                  }
                >
                  <AlertTriangle width={11} height={11} />
                  {a.texto}
                </Badge>
              ))}
            </div>
          </div>

          <span className="shrink-0 font-mono text-xs tabular text-slate-500">
            {quando(ordem.agendada_para, agora)}
          </span>
        </div>
      </Card>
    </Link>
  );
}

export { quando };
