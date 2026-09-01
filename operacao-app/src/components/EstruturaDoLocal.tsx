import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  removerAtivo,
  removerLocal,
  type CategoriaAtivo,
  type CentroCusto,
} from "../lib/config";
import { ErroDeEscrita, type AtivoRow, type Cliente, type LocalRow } from "../lib/dados";
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  cx,
} from "./ui";
import { Building, ChevronRight, Layers, MapPin, Plus, Search, X } from "./icons";
import { IconeDoAtivo } from "./IconeDeLinha";
import FormAtivoDoLocal from "./FormAtivoDoLocal";
import FormLocal from "./FormLocal";
import EtiquetasQR from "./EtiquetasQR";
import HistoricoDoAtivo from "./Historico";

/**
 * O que está dentro de um sítio, com os degraus à vista.
 *
 * Antes eram dois cartões que não se falavam: uma grelha de "sítios lá
 * dentro" e, por baixo, uma lista de equipamentos só do próprio sítio. Para
 * saber o que havia na garagem era preciso ir à ficha da garagem — e para
 * comparar dois pisos, duas viagens.
 *
 * Agora é uma árvore de dois degraus, que é a forma como as pessoas falam do
 * assunto:
 *
 *     Torre A
 *       ├── os equipamentos da própria Torre A
 *       ├── Garagem −1
 *       │     └── os equipamentos da garagem
 *       └── Piso 3
 *             └── os equipamentos do piso 3
 *
 * Mais fundo do que isto não se desenha aqui: abre-se a ficha do espaço, e
 * ele mostra os dele. Um ecrã que tenta mostrar sete níveis não mostra
 * nenhum.
 *
 * ⚠ **Remover nunca apaga.** Põe `ativo = false` e o item sai das listas. As
 * ordens que apontam para ele ficam intactas — e há uma gaveta "removidos"
 * em baixo para o trazer de volta. Ver `removerAtivo` em `lib/config.ts`.
 */

const COR_CRITICIDADE: Record<string, string> = {
  critica: "bg-red-50 text-red-700 ring-red-200",
  alta: "bg-amber-50 text-amber-800 ring-amber-200",
  normal: "bg-slate-100 text-slate-600 ring-slate-200",
  baixa: "bg-slate-50 text-slate-400 ring-slate-200",
};

type APedirConfirmacao =
  | { tipo: "ativo"; id: string; nome: string }
  | { tipo: "espaco"; id: string; nome: string; quantos: number };

export default function EstruturaDoLocal({
  local,
  filhos,
  ativos,
  removidos,
  espacosRemovidos,
  categorias,
  centros,
  clientes,
  podeEditar,
  orgId,
  aoGravar,
}: {
  local: LocalRow;
  /** Os espaços diretamente lá dentro. */
  filhos: readonly LocalRow[];
  /** Os equipamentos do sítio **e** dos espaços, todos juntos. */
  ativos: readonly AtivoRow[];
  removidos: readonly AtivoRow[];
  espacosRemovidos: readonly LocalRow[];
  categorias: readonly CategoriaAtivo[];
  centros: readonly CentroCusto[];
  clientes: readonly Cliente[];
  podeEditar: boolean;
  orgId: string;
  aoGravar: () => void;
}) {
  const [novoEm, setNovoEm] = useState<string | null>(null);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [comHistorico, setComHistorico] = useState<string | null>(null);
  const [comEtiquetas, setComEtiquetas] = useState(false);
  const [novoEspaco, setNovoEspaco] = useState(false);
  const [procura, setProcura] = useState("");
  const [aConfirmar, setAConfirmar] = useState<APedirConfirmacao | null>(null);
  const [verRemovidos, setVerRemovidos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const porCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias]
  );

  // Uma torre tem dezenas de equipamentos por piso. A caixa de procura só
  // aparece quando começa a fazer falta, e procura na árvore toda.
  const filtrados = useMemo(() => {
    const q = procura.trim().toLowerCase();
    if (!q) return ativos;
    return ativos.filter((a) =>
      [a.codigo, a.nome, a.marca, a.modelo, a.num_serie, porCategoria.get(a.categoria_id ?? "")]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [ativos, procura, porCategoria]);

  const daqui = (id: string) => filtrados.filter((a) => a.local_id === id);
  const quantosNoEspaco = (id: string) => ativos.filter((a) => a.local_id === id).length;

  const remover = async (o: APedirConfirmacao) => {
    setErro(null);
    try {
      if (o.tipo === "ativo") await removerAtivo(o.id, true);
      else await removerLocal(o.id, true);
      setAConfirmar(null);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível remover.");
      setAConfirmar(null);
    }
  };

  const repor = async (tipo: "ativo" | "espaco", id: string) => {
    setErro(null);
    try {
      if (tipo === "ativo") await removerAtivo(id, false);
      else await removerLocal(id, false);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível repor.");
    }
  };

  const linhaDeAtivo = (a: AtivoRow, dono: LocalRow) =>
    aEditar === a.id ? (
      <li key={a.id} className="py-1">
        <FormAtivoDoLocal
          orgId={orgId}
          localId={dono.id}
          ativo={a}
          categorias={categorias}
          centros={centros}
          aoFechar={() => setAEditar(null)}
          aoGravar={() => {
            setAEditar(null);
            aoGravar();
          }}
        />
      </li>
    ) : (
      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
        <IconeDoAtivo criticidade={a.criticidade} />
        <span className="w-24 shrink-0 truncate font-mono text-[11px] text-slate-400">
          {a.codigo}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-800">{a.nome}</p>
          <p className="truncate text-xs text-slate-500">
            {[
              porCategoria.get(a.categoria_id ?? ""),
              [a.marca, a.modelo].filter(Boolean).join(" "),
              a.num_serie ? `nº ${a.num_serie}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        {a.criticidade !== "normal" && (
          <span
            className={cx(
              "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              COR_CRITICIDADE[a.criticidade] ?? COR_CRITICIDADE.normal
            )}
          >
            {a.criticidade}
          </span>
        )}
        <button
          type="button"
          onClick={() => setComHistorico(comHistorico === a.id ? null : a.id)}
          className="shrink-0 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          histórico
        </button>
        {podeEditar && (
          <>
            <button
              type="button"
              onClick={() => {
                setAEditar(a.id);
                setNovoEm(null);
              }}
              className="shrink-0 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              editar
            </button>
            <button
              type="button"
              onClick={() => setAConfirmar({ tipo: "ativo", id: a.id, nome: a.nome })}
              aria-label={`Remover ${a.nome}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <X width={13} height={13} />
            </button>
          </>
        )}
        {comHistorico === a.id && (
          <div className="w-full rounded-lg bg-slate-50 p-3">
            <HistoricoDoAtivo entidade="ativo" entidadeId={a.id} />
          </div>
        )}
      </li>
    );

  /** Um degrau: o cabeçalho do sítio ou do espaço, e o que está lá dentro. */
  const bloco = (dono: LocalRow, eOProprio: boolean) => {
    const seus = daqui(dono.id);
    return (
      <div
        key={dono.id}
        className={cx(
          "rounded-lg",
          eOProprio ? "bg-white" : "border border-slate-200 bg-slate-50/50 p-3"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {eOProprio ? (
              <MapPin width={14} height={14} className="shrink-0 text-slate-400" />
            ) : (
              <Building width={14} height={14} className="shrink-0 text-slate-400" />
            )}
            {eOProprio ? (
              <span className="text-sm font-medium text-slate-800">Neste sítio</span>
            ) : (
              <Link
                to={`/locais/${dono.codigo}`}
                className="group flex min-w-0 items-center gap-1 text-sm font-medium text-slate-800 hover:text-brand-800"
              >
                <span className="truncate">{dono.nome}</span>
                <ChevronRight
                  width={12}
                  height={12}
                  className="shrink-0 text-slate-300 group-hover:text-brand-700"
                />
              </Link>
            )}
            <span className="shrink-0 text-xs text-slate-400">
              {seus.length === 0
                ? "vazio"
                : seus.length === 1
                  ? "1 equipamento"
                  : `${seus.length} equipamentos`}
            </span>
          </div>

          {podeEditar && (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setNovoEm(novoEm === dono.id ? null : dono.id);
                  setAEditar(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
              >
                <Plus width={12} height={12} /> Equipamento
              </button>
              {!eOProprio && (
                <button
                  type="button"
                  onClick={() =>
                    setAConfirmar({
                      tipo: "espaco",
                      id: dono.id,
                      nome: dono.nome,
                      quantos: quantosNoEspaco(dono.id),
                    })
                  }
                  aria-label={`Remover ${dono.nome}`}
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X width={13} height={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {novoEm === dono.id && (
          <div className="mt-2">
            <FormAtivoDoLocal
              orgId={orgId}
              localId={dono.id}
              categorias={categorias}
              centros={centros}
              aoFechar={() => setNovoEm(null)}
              aoGravar={() => {
                setNovoEm(null);
                aoGravar();
              }}
            />
          </div>
        )}

        {seus.length > 0 ? (
          <ul className="mt-1 divide-y divide-slate-100">
            {seus.map((a) => linhaDeAtivo(a, dono))}
          </ul>
        ) : (
          novoEm !== dono.id && (
            <p className="mt-1.5 text-xs text-slate-400">
              {procura.trim()
                ? "Nada com esse nome aqui."
                : eOProprio
                  ? "Nada registado diretamente neste sítio. Nem tudo o que se mantém é um equipamento — o trabalho pode aplicar-se ao próprio sítio."
                  : "Sem equipamentos."}
            </p>
          )
        )}
      </div>
    );
  };

  // Um espaço com equipamentos lá dentro não se remove: ficariam sem casa.
  const naoDaParaRemover =
    aConfirmar?.tipo === "espaco" && aConfirmar.quantos > 0;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Layers width={15} height={15} className="text-slate-400" />
          O que está aqui dentro
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {ativos.length > 6 && (
            <div className="relative">
              <Search
                width={14}
                height={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder="Procurar…"
                className="w-40 pl-8 sm:w-52"
              />
            </div>
          )}
          {ativos.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setComEtiquetas(true)}>
              Etiquetas QR
            </Button>
          )}
          {podeEditar && (
            <Button size="sm" onClick={() => setNovoEspaco(true)}>
              <Plus width={14} height={14} /> Espaço
            </Button>
          )}
        </div>
      </div>

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      <div className="mt-3 space-y-2">
        {bloco(local, true)}
        {filhos.map((f) => bloco(f, false))}
      </div>

      {/* A gaveta. Fechada, porque o que foi removido não é para estar à
          frente de quem trabalha — mas tem de existir, senão remover é uma
          decisão sem volta tomada com um clique. */}
      {(removidos.length > 0 || espacosRemovidos.length > 0) && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setVerRemovidos((v) => !v)}
            className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            {verRemovidos ? "Esconder" : "Ver"} o que foi removido (
            {removidos.length + espacosRemovidos.length})
          </button>

          {verRemovidos && (
            <ul className="mt-2 space-y-1.5">
              {espacosRemovidos.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <Building width={13} height={13} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
                    {l.nome}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">espaço</span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => void repor("espaco", l.id)}
                      className="shrink-0 text-xs font-medium text-brand hover:underline"
                    >
                      repor
                    </button>
                  )}
                </li>
              ))}
              {removidos.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="w-24 shrink-0 truncate font-mono text-[11px] text-slate-400">
                    {a.codigo}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
                    {a.nome}
                  </span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => void repor("ativo", a.id)}
                      className="shrink-0 text-xs font-medium text-brand hover:underline"
                    >
                      repor
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {comEtiquetas && (
        <EtiquetasQR local={local} ativos={ativos} aoFechar={() => setComEtiquetas(false)} />
      )}

      {novoEspaco && (
        <FormLocal
          dentroDe={local}
          clientes={clientes}
          aoFechar={() => setNovoEspaco(false)}
          aoGravar={() => {
            setNovoEspaco(false);
            aoGravar();
          }}
        />
      )}

      {aConfirmar && (
        <ConfirmDialog
          title={
            aConfirmar.tipo === "ativo"
              ? `Remover ${aConfirmar.nome}?`
              : `Remover o espaço ${aConfirmar.nome}?`
          }
          // Um espaço cheio não se remove. Em vez de um botão vermelho que não
          // faz nada, o diálogo passa a ser um aviso e diz o que fazer.
          tone={naoDaParaRemover ? "brand" : "danger"}
          confirmLabel={naoDaParaRemover ? "Entendido" : "Remover"}
          message={
            aConfirmar.tipo === "espaco" && aConfirmar.quantos > 0 ? (
              <>
                Este espaço ainda tem{" "}
                <strong>
                  {aConfirmar.quantos}{" "}
                  {aConfirmar.quantos === 1 ? "equipamento" : "equipamentos"}
                </strong>{" "}
                lá dentro. Tira-os primeiro, ou muda-os de sítio — assim
                ficariam sem casa e ninguém os encontrava.
              </>
            ) : (
              <>
                Sai das listas, mas <strong>não se apaga</strong>: as ordens que
                já passaram por aqui ficam como estão, e podes repô-lo a
                qualquer momento na gaveta &ldquo;o que foi removido&rdquo;.
              </>
            )
          }
          onCancel={() => setAConfirmar(null)}
          onConfirm={() => {
            // Um espaço com coisas lá dentro não se remove: o botão fica só a
            // explicar porquê, e fecha.
            if (aConfirmar.tipo === "espaco" && aConfirmar.quantos > 0) {
              setAConfirmar(null);
              return;
            }
            void remover(aConfirmar);
          }}
        />
      )}
    </Card>
  );
}
