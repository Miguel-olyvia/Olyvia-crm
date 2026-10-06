import { useEffect, useRef, useState } from "react";
import {
  agregarMateriais,
  arred,
  disponibilidadeStock,
  emFalta,
  formatarQtd,
  paraMaterial,
  pesquisarStock,
  sugerirMateriais,
  type MaterialLigado,
  type ProdutoStock,
} from "../lib/stock";
import { cx } from "./ui";
import { AlertTriangle, Search, X } from "./icons";

/**
 * Materiais de uma tarefa, a partir do stock do CRM (só leitura — não
 * reserva nada).
 *
 *   · na primeira montagem, sem materiais e com serviço, pré-preenche com a
 *     ficha técnica do serviço × quantidade;
 *   · cada linha diz se o disponível chega, quanto falta, e se há encomendas
 *     a fornecedor a caminho;
 *   · pesquisa no stock (com debounce) para acrescentar produtos.
 *
 * O disponível de cada linha compara só com ESTA tarefa. A soma de todas as
 * tarefas contra o stock está no `ResumoMateriais`.
 */

const DEBOUNCE_MS = 300;
const MIN_TEXTO = 2;

const un = (u: string | null) => (u ? ` ${u}` : "");

export function MateriaisStock({
  orgId,
  servicoId,
  quantidadeServico,
  valor,
  onChange,
}: {
  orgId: string;
  servicoId: string | null;
  quantidadeServico: number;
  valor: MaterialLigado[];
  onChange: (m: MaterialLigado[]) => void;
}) {
  // O que o stock disse de cada produto (a_chegar não vive no MaterialLigado).
  const [info, setInfo] = useState<Map<string, ProdutoStock>>(new Map());
  const [aSugerir, setASugerir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valorRef = useRef(valor);
  valorRef.current = valor;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const montado = useRef(false);
  const arrancou = useRef(false);

  const guardarInfo = (lista: ProdutoStock[]) =>
    setInfo((antes) => {
      const m = new Map(antes);
      for (const p of lista) m.set(p.produto_id, p);
      return m;
    });

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Primeira montagem: sugerir da ficha técnica, ou refrescar o que já vem.
  useEffect(() => {
    if (arrancou.current) return;
    arrancou.current = true;

    if (valor.length === 0 && servicoId) {
      setASugerir(true);
      sugerirMateriais(orgId, servicoId, quantidadeServico)
        .then((sug) => {
          if (!montado.current) return;
          guardarInfo(sug);
          const atual = valorRef.current;
          const ja = new Set(atual.map((m) => m.produto_id));
          const novos = sug.filter((s) => !ja.has(s.produto_id)).map((s) => paraMaterial(s, s.quantidade));
          if (novos.length) onChangeRef.current([...atual, ...novos]);
        })
        .catch((e: unknown) => montado.current && setErro(mensagem(e)))
        .finally(() => montado.current && setASugerir(false));
    } else if (valor.length > 0) {
      disponibilidadeStock(orgId, valor.map((m) => m.produto_id))
        .then((lista) => {
          if (!montado.current) return;
          guardarInfo(lista);
          const por = new Map(lista.map((p) => [p.produto_id, p]));
          const atual = valorRef.current;
          const mudou = atual.some((m) => por.has(m.produto_id) && por.get(m.produto_id)!.disponivel !== m.disponivel);
          if (mudou) {
            onChangeRef.current(
              atual.map((m) => (por.has(m.produto_id) ? { ...m, disponivel: por.get(m.produto_id)!.disponivel } : m))
            );
          }
        })
        .catch((e: unknown) => montado.current && setErro(mensagem(e)));
    }
    // Só na primeira montagem, de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mudarQuantidade = (id: string, q: number) =>
    onChange(valor.map((m) => (m.produto_id === id ? { ...m, quantidade: q } : m)));
  const remover = (id: string) => onChange(valor.filter((m) => m.produto_id !== id));
  const acrescentar = (p: ProdutoStock) => {
    guardarInfo([p]);
    if (valor.some((m) => m.produto_id === p.produto_id)) return;
    onChange([...valor, paraMaterial(p, 1)]);
  };

  return (
    <div className="space-y-1.5 text-xs" data-testid="materiais-stock">
      {aSugerir && <p className="text-slate-500">A ler os materiais da ficha técnica…</p>}
      {erro && <p className="rounded bg-red-50 px-2 py-1 text-red-700">{erro}</p>}

      {valor.length === 0 && !aSugerir ? (
        <p className="text-slate-400">Sem materiais.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {valor.map((m) => (
            <LinhaMaterial
              key={m.produto_id}
              m={m}
              aChegar={info.get(m.produto_id)?.a_chegar ?? 0}
              aoMudar={(q) => mudarQuantidade(m.produto_id, q)}
              aoRemover={() => remover(m.produto_id)}
            />
          ))}
        </ul>
      )}

      <PesquisaStock orgId={orgId} jaTem={new Set(valor.map((m) => m.produto_id))} aoEscolher={acrescentar} />
    </div>
  );
}

function LinhaMaterial({
  m,
  aChegar,
  aoMudar,
  aoRemover,
}: {
  m: MaterialLigado;
  aChegar: number;
  aoMudar: (q: number) => void;
  aoRemover: () => void;
}) {
  const [texto, setTexto] = useState(formatarQtd(m.quantidade));
  // Sincroniza quando a quantidade muda por fora (sem estragar o que se escreve).
  useEffect(() => {
    setTexto((t) => (lerNumero(t) === m.quantidade ? t : formatarQtd(m.quantidade)));
  }, [m.quantidade]);

  const falta = emFalta(m.quantidade, m.disponivel);
  const u = un(m.unidade);

  let estado: { cor: string; texto: string };
  if (m.disponivel == null) {
    estado = { cor: "text-slate-400", texto: "sem stock gerido" };
  } else if (falta === 0) {
    estado = {
      cor: "text-emerald-700",
      texto: `disponível ${formatarQtd(m.disponivel)}${u}` + (aChegar > 0 ? ` · a chegar ${formatarQtd(aChegar)}` : ""),
    };
  } else if (aChegar >= falta) {
    estado = {
      cor: "text-amber-700",
      texto: `faltam ${formatarQtd(falta)}${u} — a chegar ${formatarQtd(aChegar)}`,
    };
  } else {
    estado = {
      cor: "text-red-700",
      texto: `faltam ${formatarQtd(falta)}${u} — encomendar` + (aChegar > 0 ? ` (a chegar ${formatarQtd(aChegar)})` : ""),
    };
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate font-medium text-slate-800" title={m.nome}>
        {m.nome}
      </span>
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Quantidade de ${m.nome}`}
          className={cx(
            "w-16 rounded border px-1.5 py-1 text-right text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand/30",
            lerNumero(texto) == null ? "border-red-300" : "border-slate-200"
          )}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            const q = lerNumero(e.target.value);
            if (q != null) aoMudar(q);
          }}
        />
        <span className="w-8 truncate text-slate-500">{m.unidade ?? ""}</span>
        <button
          type="button"
          onClick={aoRemover}
          aria-label={`Remover ${m.nome}`}
          title="Remover"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
      <span className={cx("flex w-full items-center gap-1", estado.cor)}>
        {falta > 0 && <AlertTriangle className="h-3 w-3 shrink-0" />}
        {estado.texto}
      </span>
    </li>
  );
}

function PesquisaStock({
  orgId,
  jaTem,
  aoEscolher,
}: {
  orgId: string;
  jaTem: Set<string>;
  aoEscolher: (p: ProdutoStock) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ProdutoStock[]>([]);
  const [aProcurar, setAProcurar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    const t = texto.trim();
    if (t.length < MIN_TEXTO) {
      setResultados([]);
      setAProcurar(false);
      return;
    }
    const meu = ++pedido.current;
    setAProcurar(true);
    const id = setTimeout(() => {
      pesquisarStock(orgId, t, 8)
        .then((r) => {
          if (meu !== pedido.current) return;
          setResultados(r);
          setErro(null);
        })
        .catch((e: unknown) => meu === pedido.current && setErro(mensagem(e)))
        .finally(() => meu === pedido.current && setAProcurar(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [texto, orgId]);

  return (
    <div className="relative">
      <label className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-slate-500 focus-within:border-brand">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input
          type="search"
          className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
          placeholder="Acrescentar material do stock (nome ou SKU)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      {texto.trim().length >= MIN_TEXTO && (
        <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm" role="listbox" aria-label="Produtos do stock">
          {aProcurar && resultados.length === 0 && <p className="px-2 py-1.5 text-slate-400">A procurar…</p>}
          {erro && <p className="px-2 py-1.5 text-red-700">{erro}</p>}
          {!aProcurar && !erro && resultados.length === 0 && (
            <p className="px-2 py-1.5 text-slate-400">Nenhum produto encontrado.</p>
          )}
          {resultados.map((p) => {
            const tem = jaTem.has(p.produto_id);
            return (
              <button
                key={p.produto_id}
                type="button"
                role="option"
                aria-selected={false}
                disabled={tem}
                onClick={() => {
                  aoEscolher(p);
                  setTexto("");
                  setResultados([]);
                }}
                className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-slate-800">{p.nome}</span>
                  {p.sku && <span className="ml-1 text-slate-400">{p.sku}</span>}
                </span>
                <span
                  className={cx(
                    "shrink-0",
                    p.disponivel == null ? "text-slate-400" : p.disponivel > 0 ? "text-emerald-700" : "text-red-700"
                  )}
                >
                  {tem
                    ? "já está"
                    : p.disponivel == null
                      ? "sem stock gerido"
                      : `disp. ${formatarQtd(p.disponivel)}${un(p.unidade)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * O fim do passo: os materiais de todas as tarefas somados por produto,
 * contra o disponível. Se duas tarefas pedem 30 de cimento e há 50, cada uma
 * sozinha chega, mas as duas juntas não — é aqui que isso se vê.
 */
export function ResumoMateriais({ materiais }: { materiais: MaterialLigado[] }) {
  const totais = agregarMateriais(materiais);
  if (totais.length === 0) return null;
  const emFaltaN = totais.filter((t) => t.falta > 0).length;

  return (
    <section
      aria-label="Resumo dos materiais"
      className={cx(
        "rounded-lg border p-3 text-sm",
        emFaltaN ? "border-red-200 bg-red-50/40" : "border-emerald-200 bg-emerald-50/40"
      )}
    >
      <h3 className={cx("mb-2 flex items-center gap-1.5 font-semibold", emFaltaN ? "text-red-800" : "text-emerald-800")}>
        {emFaltaN > 0 && <AlertTriangle className="h-4 w-4" />}
        {emFaltaN === 0
          ? "Materiais: há stock para tudo"
          : `Materiais: ${emFaltaN} ${emFaltaN === 1 ? "produto em falta" : "produtos em falta"}`}
      </h3>
      <ul className="divide-y divide-slate-200/70 text-xs">
        {totais.map((t) => (
          <li key={t.produto_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.nome}</span>
            <span className="text-slate-600">
              precisa {formatarQtd(t.necessario)}
              {un(t.unidade)}
            </span>
            <span className="text-slate-600">
              {t.disponivel == null ? "sem stock gerido" : `disponível ${formatarQtd(arred(t.disponivel))}`}
            </span>
            {t.falta > 0 && (
              <span className="font-semibold text-red-700">
                faltam {formatarQtd(t.falta)}
                {un(t.unidade)} — encomendar
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function lerNumero(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

function mensagem(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Não foi possível ler o stock.";
}
