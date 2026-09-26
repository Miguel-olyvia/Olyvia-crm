import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Badge, Button, Card, ErrorState, Input, Skeleton, Toggle, cx } from "./ui";
import { AlertTriangle, ChevronDown, ChevronRight, Pause, Layers, Plus, X } from "./icons";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import {
  gravarArea,
  gravarMotivoDePausa,
  gravarTipoDeArea,
  listarAreas,
  listarTodosOsMotivos,
  type Area,
  type MotivoDePausaCompleto,
} from "../lib/config";

/**
 * As listas que classificam o trabalho: motivos de pausa, áreas e tipos.
 *
 * Eram texto livre, e o resultado era sempre o mesmo — oito maneiras de
 * escrever "à espera de material", e nenhum relatório as consegue somar.
 *
 * Os motivos de pausa têm **funções**: quem gere escolhe quais é que o técnico
 * pode usar. Pausar uma ordem com "a aguardar aprovação superior" não é uma
 * decisão de quem está no local, e deixá-la à mão de todos é como não ter
 * motivo nenhum. Quem filtra é a base, e não este ecrã.
 */

const FUNCOES: { v: string; t: string }[] = [
  { v: "admin", t: "Administrador" },
  { v: "gestor", t: "Gestor" },
  { v: "operador", t: "Operador" },
  { v: "tecnico", t: "Técnico" },
];

export default function PainelListas() {
  const { activeOrgId, funcao } = useAuth();
  const [motivos, setMotivos] = useState<MotivoDePausaCompleto[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const podeMudar = funcao === "admin" || funcao === "gestor";

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const [m, a] = await Promise.all([
        listarTodosOsMotivos(activeOrgId),
        listarAreas(activeOrgId),
      ]);
      setMotivos(m);
      setAreas(a);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar as listas.");
      setMotivos([]);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && motivos === null) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (motivos === null) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <MotivosDePausa
        motivos={motivos}
        podeMudar={podeMudar}
        orgId={activeOrgId ?? ""}
        aoGravar={() => void carregar()}
      />
      <Areas
        areas={areas}
        podeMudar={podeMudar}
        orgId={activeOrgId ?? ""}
        aoGravar={() => void carregar()}
      />
    </div>
  );
}

/* ─────────────────────── Motivos de pausa ──────────────────────────────── */

function MotivosDePausa({
  motivos,
  podeMudar,
  orgId,
  aoGravar,
}: {
  motivos: readonly MotivoDePausaCompleto[];
  podeMudar: boolean;
  orgId: string;
  aoGravar: () => void;
}) {
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Pause width={15} height={15} className="text-slate-400" />
            Motivos de pausa
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Porque é que um trabalho parou. Cada motivo diz quem o pode escolher.
          </p>
        </div>
        {podeMudar && !novo && (
          <Button size="sm" onClick={() => { setNovo(true); setAEditar(null); }}>
            <Plus width={14} height={14} /> Motivo
          </Button>
        )}
      </div>

      {novo && (
        <FormMotivo
          orgId={orgId}
          aoFechar={() => setNovo(false)}
          aoGravar={() => { setNovo(false); aoGravar(); }}
        />
      )}

      <ul className="mt-3 divide-y divide-slate-100">
        {motivos.map((m) =>
          aEditar === m.id ? (
            <li key={m.id} className="py-1">
              <FormMotivo
                orgId={orgId}
                motivo={m}
                aoFechar={() => setAEditar(null)}
                aoGravar={() => { setAEditar(null); aoGravar(); }}
              />
            </li>
          ) : (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span
                className={cx(
                  "min-w-0 flex-1 text-sm",
                  m.ativo ? "text-slate-800" : "text-slate-400 line-through"
                )}
              >
                {m.nome}
              </span>
              {/* Quem NÃO o pode usar é o que interessa ver de relance. */}
              {m.funcoes.length < 4 && (
                <Badge className="bg-brand-50 text-brand-800 ring-brand-200">
                  {m.funcoes.includes("operador") ? "sem o técnico" : "só quem gere"}
                </Badge>
              )}
              {podeMudar && (
                <button
                  type="button"
                  onClick={() => { setAEditar(m.id); setNovo(false); }}
                  className="text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  editar
                </button>
              )}
            </li>
          )
        )}
      </ul>

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
        Uma pausa exige sempre a data de retoma prevista — é o que permite avisar quando ela
        passa. Sem isso, uma ordem fica parada meses sem ninguém dar por ela.
      </p>
    </Card>
  );
}

function FormMotivo({
  orgId,
  motivo,
  aoFechar,
  aoGravar,
}: {
  orgId: string;
  motivo?: MotivoDePausaCompleto;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [nome, setNome] = useState(motivo?.nome ?? "");
  const [funcoes, setFuncoes] = useState<string[]>(
    motivo?.funcoes ?? ["admin", "gestor", "operador", "tecnico"]
  );
  const [ativo, setAtivo] = useState(motivo?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const alternar = (v: string) =>
    setFuncoes((f) => (f.includes(v) ? f.filter((x) => x !== v) : [...f, v]));

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      await gravarMotivoDePausa({ orgId, id: motivo?.id ?? null, nome, funcoes, ativo });
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: A aguardar material"
        className="w-full"
        autoFocus
      />

      <div>
        <span className="text-[13px] font-medium text-slate-700">Quem o pode escolher</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {FUNCOES.map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => alternar(f.v)}
              className={cx(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                funcoes.includes(f.v)
                  ? "bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-200"
                  : "bg-white text-slate-400 ring-1 ring-inset ring-slate-200 hover:text-slate-600"
              )}
            >
              {f.t}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Nenhuma escolhida quer dizer que ninguém o pode usar — o motivo fica escondido.
        </p>
      </div>

      {motivo && (
        <Toggle
          checked={ativo}
          onChange={setAtivo}
          label="Em uso"
          hint="Desligar esconde-o. As pausas antigas ficam como estão."
        />
      )}

      {erro && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={() => void gravar()} disabled={aGravar || !nome.trim()}>
          {aGravar ? "A gravar…" : "Gravar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={aoFechar} disabled={aGravar}>
          <X width={13} height={13} /> Cancelar
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────── Áreas e tipos ────────────────────────────── */

function Areas({
  areas,
  podeMudar,
  orgId,
  aoGravar,
}: {
  areas: readonly Area[];
  podeMudar: boolean;
  orgId: string;
  aoGravar: () => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const criar = async () => {
    if (!nova.trim()) return;
    setErro(null);
    try {
      await gravarArea({ orgId, nome: nova });
      setNova("");
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Layers width={15} height={15} className="text-slate-400" />
        Áreas e tipos
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
        A área é o domínio — Eletricidade, Elevadores. O tipo é o que aconteceu lá dentro.
      </p>

      <ul className="mt-3 divide-y divide-slate-100">
        {areas.map((a) => (
          <li key={a.id} className="py-1.5">
            <button
              type="button"
              onClick={() => setAberta(aberta === a.id ? null : a.id)}
              className="flex w-full items-center gap-2 py-1 text-left"
            >
              {aberta === a.id ? (
                <ChevronDown width={14} height={14} className="shrink-0 text-slate-400" />
              ) : (
                <ChevronRight width={14} height={14} className="shrink-0 text-slate-400" />
              )}
              <span
                className={cx(
                  "min-w-0 flex-1 text-sm",
                  a.ativo ? "text-slate-800" : "text-slate-400 line-through"
                )}
              >
                {a.nome}
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {a.tipos.length === 0
                  ? "sem tipos"
                  : a.tipos.length === 1
                    ? "1 tipo"
                    : `${a.tipos.length} tipos`}
              </span>
            </button>

            {aberta === a.id && (
              <TiposDaArea area={a} podeMudar={podeMudar} aoGravar={aoGravar} />
            )}
          </li>
        ))}
      </ul>

      {podeMudar && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void criar();
            }}
            placeholder="Área nova — ex.: Serralharia"
            className="w-full sm:w-64"
          />
          <Button size="sm" onClick={() => void criar()} disabled={!nova.trim()}>
            <Plus width={14} height={14} /> Área
          </Button>
        </div>
      )}

      {erro && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}

      {/* Não se finge que a lista está completa: veio de uma página do
          Infraspeak, e pode haver mais numa que não se abriu. */}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        As áreas vieram das que já se usavam. Se faltar alguma, acrescenta-a aqui.
      </p>
    </Card>
  );
}

function TiposDaArea({
  area,
  podeMudar,
  aoGravar,
}: {
  area: Area;
  podeMudar: boolean;
  aoGravar: () => void;
}) {
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const criar = async () => {
    if (!novo.trim()) return;
    setErro(null);
    try {
      await gravarTipoDeArea({ areaId: area.id, nome: novo });
      setNovo("");
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    }
  };

  return (
    <div className="ml-6 mt-1 rounded-lg bg-slate-50/70 p-3">
      {area.tipos.length === 0 ? (
        <p className="text-xs text-slate-500">
          Sem tipos. Uma área sem tipos ainda serve para classificar — o tipo é o detalhe.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {area.tipos.map((t) => (
            <li key={t.id}>
              <Badge className={t.ativo ? undefined : "opacity-50 line-through"}>{t.nome}</Badge>
            </li>
          ))}
        </ul>
      )}

      {podeMudar && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void criar();
            }}
            placeholder="Tipo novo"
            className="w-full text-xs sm:w-52"
          />
          <Button size="sm" variant="secondary" onClick={() => void criar()} disabled={!novo.trim()}>
            <Plus width={13} height={13} /> Tipo
          </Button>
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-red-700">{erro}</p>}
    </div>
  );
}
