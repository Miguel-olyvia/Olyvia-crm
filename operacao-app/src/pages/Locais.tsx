import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ativosDoLocal,
  listarClientes,
  listarLocais,
  montarArvore,
  type AtivoRow,
  type Cliente,
  type LocalRow,
  type NoLocal,
} from "../lib/dados";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, cx } from "../components/ui";
import { ChevronDown, ChevronRight, Layers, MapPin, Plus, Search } from "../components/icons";
import { IconeDoLocal } from "../components/IconeDeLinha";
import FormLocal from "../components/FormLocal";

/**
 * Locais e ativos, num só navegador.
 *
 * Substitui `/buildings` + `/assets` do Infraspeak. A árvore é
 * auto-referencial, por isso serve os dois negócios sem código diferente: a
 * obra usa `Cliente › Morada`, a manutenção usa
 * `Cliente › Torre › Piso › Espaço`.
 *
 * O conceito "Edifício" não existe aqui de propósito — na instância observada
 * havia centenas de "edifícios" que eram apartamentos particulares, porque era
 * o único sítio onde cabia uma morada.
 *
 * ⚠ **É aqui que os sítios nascem, e já não em Definições.** Havia lá uma
 * lista plana com uma caixa "Dentro de" opcional, e quem a usou disse o que
 * havia a dizer: "não existe distinção entre locais e espaços". Aqui a
 * distinção é a própria árvore — o **+** de cada linha cria um espaço
 * *dentro* dela, e o botão do topo cria um sítio novo.
 */

export default function Locais() {
  const { activeOrgId } = useAuth();
  const [arvore, setArvore] = useState<NoLocal[] | null>(null);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  // A lista inteira, e não só o mapa de nomes: criar um sítio precisa de
  // escolher o dono, e o mapa não dá para preencher uma caixa de escolha.
  const [listaClientes, setListaClientes] = useState<Cliente[]>([]);
  const [formLocal, setFormLocal] = useState<
    { local?: LocalRow | null; dentroDe?: LocalRow | null } | null
  >(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [pesquisa, setPesquisa] = useState("");
  const [selecionado, setSelecionado] = useState<NoLocal | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setArvore(null);
    setErro(null);

    (async () => {
      try {
        const [locais, cls] = await Promise.all([
          listarLocais(activeOrgId),
          listarClientes(activeOrgId),
        ]);
        if (!vivo) return;
        const a = montarArvore(locais);
        setArvore(a);
        setClientes(new Map(cls.map((c: Cliente) => [c.id, c.nome])));
        setListaClientes(cls);
        // Abre o primeiro nível, para o ecrã não abrir fechado sobre si mesmo.
        setAbertos(new Set(a.map((n) => n.id)));
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar os locais.");
        setArvore([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [activeOrgId, tentativa]);

  const filtrada = useMemo(() => {
    if (!arvore) return null;
    const termo = pesquisa.trim().toLowerCase();
    if (!termo) return arvore;

    // Mantém um nó se ele, ou algum descendente, corresponder à pesquisa.
    const filtrar = (ns: NoLocal[]): NoLocal[] =>
      ns
        .map((n) => ({ ...n, filhos: filtrar(n.filhos) }))
        .filter(
          (n) =>
            n.filhos.length > 0 ||
            n.nome.toLowerCase().includes(termo) ||
            n.codigo.toLowerCase().includes(termo)
        );
    return filtrar(arvore);
  }, [arvore, pesquisa]);

  const alternar = (id: string) =>
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Locais e ativos</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search
              width={15}
              height={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Nome ou código…"
              className="pl-9"
            />
          </div>
          <Button className="shrink-0" onClick={() => setFormLocal({})}>
            <Plus width={14} height={14} /> Local
          </Button>
        </div>
      </div>

      {erro && <ErrorState message={erro} onRetry={() => setTentativa((t) => t + 1)} />}

      {filtrada === null && !erro && <Skeleton className="h-64 w-full rounded-xl" />}

      {filtrada?.length === 0 && !erro && (
        <Card>
          <EmptyState
            icon={<Layers width={22} height={22} />}
            title={pesquisa.trim() ? "Sem resultados" : "Ainda não há locais"}
            description={
              pesquisa.trim()
                ? "Nenhum local corresponde à pesquisa."
                : "Os locais são a árvore onde o trabalho acontece: uma morada, e os espaços dentro dela."
            }
            action={
              pesquisa.trim() ? undefined : (
                <Button onClick={() => setFormLocal({})}>Criar o primeiro local</Button>
              )
            }
          />
        </Card>
      )}

      {filtrada && filtrada.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="overflow-hidden p-2">
            <ul className="max-h-[70vh] overflow-y-auto">
              {filtrada.map((n) => (
                <NoDaArvore
                  key={n.id}
                  no={n}
                  nivel={0}
                  abertos={abertos}
                  alternar={alternar}
                  selecionado={selecionado}
                  selecionar={setSelecionado}
                  clientes={clientes}
                  aoAcrescentar={(pai) => setFormLocal({ dentroDe: pai })}
                />
              ))}
            </ul>
          </Card>

          <PainelLocal
            local={selecionado}
            clientes={clientes}
            aoEditar={(l) => setFormLocal({ local: l })}
            aoAcrescentar={(pai) => setFormLocal({ dentroDe: pai })}
          />
        </div>
      )}

      {formLocal && (
        <FormLocal
          local={formLocal.local}
          dentroDe={formLocal.dentroDe}
          clientes={listaClientes}
          aoFechar={() => setFormLocal(null)}
          aoGravar={() => {
            // O pai fica aberto: quem acabou de criar um espaço quer vê-lo,
            // e não ter de voltar a abrir o ramo onde estava.
            const pai = formLocal.dentroDe;
            if (pai) setAbertos((a) => new Set(a).add(pai.id));
            setFormLocal(null);
            setTentativa((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function NoDaArvore({
  no,
  nivel,
  abertos,
  alternar,
  selecionado,
  selecionar,
  clientes,
  aoAcrescentar,
}: {
  no: NoLocal;
  nivel: number;
  abertos: Set<string>;
  alternar: (id: string) => void;
  selecionado: NoLocal | null;
  selecionar: (n: NoLocal) => void;
  clientes: Map<string, string>;
  aoAcrescentar: (pai: NoLocal) => void;
}) {
  const temFilhos = no.filhos.length > 0;
  const aberto = abertos.has(no.id);
  const ativo = selecionado?.id === no.id;

  return (
    <li>
      <div
        className={cx(
          "flex items-center gap-1 rounded-lg pr-2 transition-colors",
          ativo ? "bg-brand-50" : "hover:bg-slate-50"
        )}
        style={{ paddingLeft: `${nivel * 14 + 4}px` }}
      >
        {temFilhos ? (
          <button
            type="button"
            onClick={() => alternar(no.id)}
            aria-label={aberto ? "Fechar" : "Abrir"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600"
          >
            {aberto ? (
              <ChevronDown width={14} height={14} />
            ) : (
              <ChevronRight width={14} height={14} />
            )}
          </button>
        ) : (
          <span className="h-7 w-7 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => selecionar(no)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          <IconeDoLocal tipo={no.tipo} />
          <span
            className={cx(
              "min-w-0 truncate text-sm",
              ativo ? "font-medium text-brand-900" : "text-slate-700"
            )}
          >
            {no.nome}
          </span>
          {nivel === 0 && clientes.get(no.cliente_id) && (
            <span className="shrink-0 truncate text-xs text-slate-400">
              {clientes.get(no.cliente_id)}
            </span>
          )}
        </button>

        {/*
          O + está na linha e não num menu porque a pergunta que se faz em
          frente a um sítio é sempre a mesma: "e o que é que há lá dentro?".
          Fica sempre visível — num telemóvel não há rato para passar por cima.
        */}
        <button
          type="button"
          onClick={() => aoAcrescentar(no)}
          title={`Novo espaço em ${no.nome}`}
          aria-label={`Novo espaço em ${no.nome}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white hover:text-brand"
        >
          <Plus width={14} height={14} />
        </button>
      </div>

      {temFilhos && aberto && (
        <ul>
          {no.filhos.map((f) => (
            <NoDaArvore
              key={f.id}
              no={f}
              nivel={nivel + 1}
              abertos={abertos}
              alternar={alternar}
              selecionado={selecionado}
              selecionar={selecionar}
              clientes={clientes}
              aoAcrescentar={aoAcrescentar}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function PainelLocal({
  local,
  clientes,
  aoEditar,
  aoAcrescentar,
}: {
  local: NoLocal | null;
  clientes: Map<string, string>;
  aoEditar: (l: NoLocal) => void;
  aoAcrescentar: (pai: NoLocal) => void;
}) {
  const [ativos, setAtivos] = useState<AtivoRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!local) {
      setAtivos(null);
      return;
    }
    let vivo = true;
    setAtivos(null);
    setErro(null);
    (async () => {
      try {
        const as = await ativosDoLocal(local.id);
        if (vivo) setAtivos(as);
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar os ativos.");
        setAtivos([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [local]);

  if (!local) {
    return (
      <Card className="hidden lg:block">
        <EmptyState
          icon={<MapPin width={22} height={22} />}
          title="Escolhe um local"
          description="Os equipamentos e o contexto desse local aparecem aqui."
        />
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-wider text-slate-400">
        {clientes.get(local.cliente_id) ?? "—"}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">{local.nome}</h2>
        {/* Este painel é para consultar de relance. Quem quiser trabalhar no
            sítio — acrescentar equipamentos, ver o histórico — abre a ficha. */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => aoEditar(local)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => aoAcrescentar(local)}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
          >
            <Plus width={12} height={12} /> Espaço
          </button>
          <Link
            to={`/locais/${local.codigo}`}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
          >
            {/* Um espaço não tem ficha própria: o link abre a da morada dele,
                com a árvore aberta até aqui. Dizer "abrir ficha" prometia uma
                página que não existe. */}
            {local.parent_id ? "Abrir o local" : "Abrir ficha"}{" "}
            <ChevronRight width={12} height={12} />
          </Link>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs tabular text-slate-500">{local.codigo}</span>
        <Badge>{local.tipo}</Badge>
        {local.zona && <Badge>{local.zona}</Badge>}
        {local.cidade && <span className="text-xs text-slate-400">{local.cidade}</span>}
      </div>

      <h3 className="mt-5 text-sm font-semibold text-slate-800">
        Ativos {ativos && ativos.length > 0 && <span className="text-slate-400">({ativos.length})</span>}
      </h3>

      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      {ativos === null && !erro && <Skeleton className="mt-2 h-20 w-full" />}
      {ativos?.length === 0 && !erro && (
        <p className="mt-2 text-sm text-slate-400">
          Sem ativos neste local. O trabalho pode aplicar-se ao próprio local — nem tudo o
          que se mantém é um equipamento.
        </p>
      )}

      {ativos && ativos.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {ativos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-700">{a.nome}</p>
                <p className="truncate font-mono text-xs tabular text-slate-400">
                  {a.codigo}
                  {(a.marca || a.modelo) && (
                    <span className="ml-2 font-sans">
                      {[a.marca, a.modelo].filter(Boolean).join(" ")}
                    </span>
                  )}
                </p>
              </div>
              {a.criticidade !== "normal" && (
                <Badge
                  className={
                    a.criticidade === "critica"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : a.criticidade === "alta"
                        ? "bg-amber-50 text-amber-800 ring-amber-200"
                        : undefined
                  }
                >
                  {a.criticidade}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
