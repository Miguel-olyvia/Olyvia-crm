import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Button, Card, EmptyState, ErrorState, Input, Skeleton, Toggle, cx } from "./ui";
import { AlertTriangle, Check, Euro, Layers, Plus, X } from "./icons";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import {
  gravarCentroCusto,
  gravarTipoTrabalho,
  listarCentrosCusto,
  listarTiposTrabalho,
  type CentroCusto,
  type TipoTrabalho,
} from "../lib/config";

/**
 * Como a casa classifica o trabalho, e a que conta ele vai.
 *
 * Duas listas pequenas, e as duas por organização — quem tem várias empresas
 * tem listas diferentes, e o ecrã di-lo em vez de deixar a pessoa descobrir
 * sozinha depois de as escrever no sítio errado.
 *
 * Os tipos de trabalho semeiam-se sozinhos ao abrir isto pela primeira vez,
 * com os nove que a operação já usava. Uma lista em branco no primeiro dia é a
 * maneira mais rápida de ninguém preencher o campo.
 */
export default function PainelTiposECustos() {
  const { activeOrgId, funcao, orgs } = useAuth();
  const [tipos, setTipos] = useState<TipoTrabalho[] | null>(null);
  const [centros, setCentros] = useState<CentroCusto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const podeMudar = funcao === "admin" || funcao === "gestor";
  const nomeDaOrg = orgs.find((o) => o.id === activeOrgId)?.name ?? null;

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const [t, c] = await Promise.all([
        listarTiposTrabalho(activeOrgId),
        listarCentrosCusto(activeOrgId),
      ]);
      setTipos(t);
      setCentros(c);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar as listas.");
      setTipos([]);
      setCentros([]);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && tipos === null) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (tipos === null || centros === null) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      {nomeDaOrg && (
        <p className="text-xs text-slate-500">
          Estas listas são de <strong className="font-semibold text-slate-700">{nomeDaOrg}</strong>.
          Cada empresa tem as suas.
        </p>
      )}

      <TiposDeTrabalho
        tipos={tipos}
        podeMudar={podeMudar}
        orgId={activeOrgId ?? ""}
        aoGravar={() => void carregar()}
      />
      <CentrosDeCusto
        centros={centros}
        podeMudar={podeMudar}
        orgId={activeOrgId ?? ""}
        aoGravar={() => void carregar()}
      />
    </div>
  );
}

/* ───────────────────────── Tipos de trabalho ───────────────────────────── */

function TiposDeTrabalho({
  tipos,
  podeMudar,
  orgId,
  aoGravar,
}: {
  tipos: readonly TipoTrabalho[];
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
            <Layers width={15} height={15} className="text-slate-400" />
            Tipos de trabalho
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            O que a casa chama a cada trabalho. É diferente da origem da ordem, que é o sistema
            que decide.
          </p>
        </div>
        {podeMudar && !novo && (
          <Button size="sm" onClick={() => { setNovo(true); setAEditar(null); }}>
            <Plus width={14} height={14} /> Tipo
          </Button>
        )}
      </div>

      {novo && (
        <FormTipo
          orgId={orgId}
          aoFechar={() => setNovo(false)}
          aoGravar={() => { setNovo(false); aoGravar(); }}
        />
      )}

      {tipos.length === 0 && !novo ? (
        <p className="mt-4 text-sm text-slate-500">Ainda não há tipos de trabalho.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {tipos.map((t) =>
            aEditar === t.id ? (
              <li key={t.id} className="py-1">
                <FormTipo
                  orgId={orgId}
                  tipo={t}
                  aoFechar={() => setAEditar(null)}
                  aoGravar={() => { setAEditar(null); aoGravar(); }}
                />
              </li>
            ) : (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-24 shrink-0 font-mono text-[11px] uppercase text-slate-400">
                  {t.codigo || "—"}
                </span>
                <span
                  className={cx(
                    "min-w-0 flex-1 text-sm",
                    t.ativo ? "text-slate-800" : "text-slate-400 line-through"
                  )}
                >
                  {t.nome}
                </span>
                {t.fecha_automatico && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    <Check width={11} height={11} /> fecha sozinha
                  </span>
                )}
                {podeMudar && (
                  <button
                    type="button"
                    onClick={() => { setAEditar(t.id); setNovo(false); }}
                    className="text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
                  >
                    editar
                  </button>
                )}
              </li>
            )
          )}
        </ul>
      )}

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
        &ldquo;Fecha sozinha&rdquo; quer dizer que a ordem se fecha assim que todas as tarefas
        obrigatórias estiverem respondidas. Continua a precisar de ser confirmada por quem
        coordena — é isso que manda o relatório ao cliente.
      </p>
    </Card>
  );
}

function FormTipo({
  orgId,
  tipo,
  aoFechar,
  aoGravar,
}: {
  orgId: string;
  tipo?: TipoTrabalho;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [nome, setNome] = useState(tipo?.nome ?? "");
  const [codigo, setCodigo] = useState(tipo?.codigo ?? "");
  const [fecha, setFecha] = useState(tipo?.fecha_automatico ?? false);
  const [ativo, setAtivo] = useState(tipo?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      await gravarTipoTrabalho({
        orgId,
        id: tipo?.id ?? null,
        nome,
        codigo,
        fechaAutomatico: fecha,
        ativo,
      });
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome — ex.: Rotina"
          className="w-full"
          autoFocus
        />
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Código (opcional)"
          className="w-full"
        />
      </div>

      <Toggle
        checked={fecha}
        onChange={setFecha}
        label="Fecha-se sozinha"
        hint="Quando todas as tarefas obrigatórias estiverem respondidas."
      />

      {tipo && (
        <Toggle
          checked={ativo}
          onChange={setAtivo}
          label="Em uso"
          hint="Desligar esconde-o das ordens novas. As antigas ficam como estão."
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

/* ───────────────────────── Centros de custo ────────────────────────────── */

function CentrosDeCusto({
  centros,
  podeMudar,
  orgId,
  aoGravar,
}: {
  centros: readonly CentroCusto[];
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
            <Euro width={15} height={15} className="text-slate-400" />
            Centros de custo
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            A que conta vai o trabalho. Pode ficar no equipamento — e então a ordem herda-o
            sozinha.
          </p>
        </div>
        {podeMudar && !novo && (
          <Button size="sm" onClick={() => { setNovo(true); setAEditar(null); }}>
            <Plus width={14} height={14} /> Centro
          </Button>
        )}
      </div>

      {novo && (
        <FormCentro
          orgId={orgId}
          aoFechar={() => setNovo(false)}
          aoGravar={() => { setNovo(false); aoGravar(); }}
        />
      )}

      {centros.length === 0 && !novo ? (
        <div className="mt-3">
          <EmptyState
            icon={<Euro className="h-5 w-5" />}
            title="Ainda não há centros de custo"
            description="Sem eles, o gasto de uma ordem não se consegue somar por conta. Bastam os que a contabilidade já usa."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {centros.map((c) =>
            aEditar === c.id ? (
              <li key={c.id} className="py-1">
                <FormCentro
                  orgId={orgId}
                  centro={c}
                  aoFechar={() => setAEditar(null)}
                  aoGravar={() => { setAEditar(null); aoGravar(); }}
                />
              </li>
            ) : (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-24 shrink-0 font-mono text-[11px] uppercase text-slate-500">
                  {c.codigo}
                </span>
                <span
                  className={cx(
                    "min-w-0 flex-1 text-sm",
                    c.ativo ? "text-slate-800" : "text-slate-400 line-through"
                  )}
                >
                  {c.nome}
                </span>
                {podeMudar && (
                  <button
                    type="button"
                    onClick={() => { setAEditar(c.id); setNovo(false); }}
                    className="text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
                  >
                    editar
                  </button>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </Card>
  );
}

function FormCentro({
  orgId,
  centro,
  aoFechar,
  aoGravar,
}: {
  orgId: string;
  centro?: CentroCusto;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [codigo, setCodigo] = useState(centro?.codigo ?? "");
  const [nome, setNome] = useState(centro?.nome ?? "");
  const [ativo, setAtivo] = useState(centro?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      await gravarCentroCusto({ orgId, id: centro?.id ?? null, codigo, nome, ativo });
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70">
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Código"
          className="w-full"
          autoFocus
        />
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome — ex.: Torre S. Gabriel"
          className="w-full"
        />
      </div>

      {centro && (
        <Toggle
          checked={ativo}
          onChange={setAtivo}
          label="Em uso"
          hint="Desligar esconde-o das ordens novas. As antigas ficam como estão."
        />
      )}

      {erro && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void gravar()}
          disabled={aGravar || !codigo.trim() || !nome.trim()}
        >
          {aGravar ? "A gravar…" : "Gravar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={aoFechar} disabled={aGravar}>
          <X width={13} height={13} /> Cancelar
        </Button>
      </div>
    </div>
  );
}
