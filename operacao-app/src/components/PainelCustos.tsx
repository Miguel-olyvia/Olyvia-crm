import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeEscrita } from "../lib/dados";
import {
  lancarCusto,
  listarCatalogo,
  listarComprasPorAtribuir,
  removerCusto,
  type ItemDeCatalogo,
  type LinhaDeCompra,
  type LinhaDeCusto,
} from "../lib/custos";
import { Badge, Button, Card, Combobox, Field, Input, Modal, Select, cx } from "./ui";
import { Euro, Plus, X } from "./icons";
import { euros } from "../lib/formatar";

/**
 * O que se gastou nesta ordem.
 *
 * Três maneiras de lançar um custo, e a ordem delas importa — está por ordem
 * de quanto se sabe sobre o número:
 *
 *  1. de uma COMPRA — o preço que o fornecedor cobrou mesmo;
 *  2. do CATÁLOGO — o preço de tabela, que emparelha com o orçamento;
 *  3. à MÃO — o que a pessoa escrever.
 *
 * A mão de obra não aparece aqui para ser lançada: sai das sessões de
 * trabalho. Aparece na lista, marcada como calculada, e não se apaga — apagá-la
 * daria a sensação de se ter resolvido alguma coisa, e ela voltaria no
 * recálculo seguinte.
 */

const ROTULO_TIPO: Record<string, string> = {
  mao_obra: "Mão de obra",
  material: "Material",
  servico: "Serviço",
  outro: "Outro",
};

export default function PainelCustos({
  ordemId,
  estado,
  custos,
  podeVer,
  aoMudar,
}: {
  ordemId: string;
  estado: string;
  custos: readonly LinhaDeCusto[];
  /** Falso sem `operations.costs.view`. Aí o painel nem aparece. */
  podeVer: boolean;
  aoMudar: () => void;
}) {
  const [aLancar, setALancar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aApagar, setAApagar] = useState<string | null>(null);

  const encerrada = ["confirmada", "cancelada"].includes(estado);

  const totais = useMemo(() => {
    const por = new Map<string, number>();
    for (const c of custos) {
      por.set(c.tipo, (por.get(c.tipo) ?? 0) + Number(c.total));
    }
    return {
      por,
      total: custos.reduce((s, c) => s + Number(c.total), 0),
    };
  }, [custos]);

  if (!podeVer) return null;

  const apagar = async (id: string) => {
    setAApagar(id);
    setErro(null);
    try {
      await removerCusto(id);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível apagar o custo.");
    } finally {
      setAApagar(null);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Euro width={14} height={14} className="text-slate-400" />
          O que se gastou
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold tabular text-slate-800">
            {euros(totais.total)}
          </span>
          {!encerrada && (
            <Button size="sm" onClick={() => setALancar(true)}>
              <Plus width={14} height={14} /> Lançar
            </Button>
          )}
        </div>
      </div>

      {custos.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Nada lançado. A mão de obra aparece sozinha quando alguém trabalhar na ordem.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {[...totais.por].map(([tipo, v]) => (
              <span key={tipo} className="text-xs text-slate-500">
                {ROTULO_TIPO[tipo] ?? tipo}{" "}
                <span className="font-mono tabular text-slate-700">{euros(v)}</span>
              </span>
            ))}
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5 font-medium">Descrição</th>
                  <th className="pb-1.5 text-right font-medium">Qt.</th>
                  <th className="pb-1.5 text-right font-medium">Unit.</th>
                  <th className="pb-1.5 text-right font-medium">Total</th>
                  <th className="pb-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {custos.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="text-slate-700">{c.descricao}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                        <span>{ROTULO_TIPO[c.tipo] ?? c.tipo}</span>
                        <OrigemDoCusto origem={c.origem} />
                      </p>
                    </td>
                    <td className="py-2 text-right font-mono tabular text-slate-500">
                      {Number(c.quantidade).toLocaleString("pt-PT", { maximumFractionDigits: 2 })}
                      {c.unidade ? ` ${c.unidade}` : ""}
                    </td>
                    <td className="py-2 text-right font-mono tabular text-slate-500">
                      {euros(c.valor_unit)}
                    </td>
                    <td className="py-2 text-right font-mono tabular font-medium text-slate-800">
                      {euros(c.total)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {c.origem !== "calculado" && !encerrada && (
                        <button
                          type="button"
                          disabled={aApagar === c.id}
                          onClick={() => void apagar(c.id)}
                          className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-red-600 disabled:opacity-40"
                          aria-label={`Apagar ${c.descricao}`}
                        >
                          <X width={14} height={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {aLancar && (
        <FormCusto
          ordemId={ordemId}
          aoFechar={() => setALancar(false)}
          aoGravar={() => {
            setALancar(false);
            aoMudar();
          }}
        />
      )}
    </Card>
  );
}

function OrigemDoCusto({ origem }: { origem: string }) {
  if (origem === "calculado") {
    return (
      <Badge className="bg-slate-100 text-slate-500 ring-slate-200">das sessões de trabalho</Badge>
    );
  }
  if (origem === "compra") {
    return <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">de uma compra</Badge>;
  }
  if (origem === "catalogo") {
    return <Badge className="bg-brand-50 text-brand-800 ring-brand-200">do catálogo</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-500 ring-slate-200">à mão</Badge>;
}

/* ──────────────────────────── Lançar um custo ──────────────────────────── */

type Origem = "compra" | "catalogo" | "mao";

function FormCusto({
  ordemId,
  aoFechar,
  aoGravar,
}: {
  ordemId: string;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();

  const [origem, setOrigem] = useState<Origem>("catalogo");
  const [catalogo, setCatalogo] = useState<ItemDeCatalogo[]>([]);
  const [compras, setCompras] = useState<LinhaDeCompra[]>([]);
  const [aCarregar, setACarregar] = useState(true);

  const [itemId, setItemId] = useState("");
  const [compraId, setCompraId] = useState("");
  const [tipo, setTipo] = useState("material");
  const [descricao, setDescricao] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [unit, setUnit] = useState("");
  const [unidade, setUnidade] = useState("");

  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    (async () => {
      try {
        const [cat, cmp] = await Promise.all([
          listarCatalogo(activeOrgId),
          listarComprasPorAtribuir(activeOrgId),
        ]);
        if (!vivo) return;
        setCatalogo(cat);
        setCompras(cmp);
        // Se não houver compras por atribuir, não vale a pena oferecer a opção.
        if (cmp.length === 0 && cat.length === 0) setOrigem("mao");
      } catch {
        if (vivo) setOrigem("mao");
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [activeOrgId]);

  const item = catalogo.find((c) => c.id === itemId);
  const compra = compras.find((c) => c.id === compraId);

  // Escolher preenche o resto. Quem lança material raramente sabe o preço de
  // cor, e tê-lo já lá é a diferença entre lançar e adiar.
  useEffect(() => {
    if (!item) return;
    setDescricao(item.descricao);
    setUnit(String(item.custo_total));
  }, [item]);

  useEffect(() => {
    if (!compra) return;
    setDescricao(compra.descricao);
    setUnit(String(compra.preco_unit));
    setQuantidade(String(Number(compra.quantidade) - Number(compra.ja_atribuido)));
  }, [compra]);

  const qt = Number(quantidade.replace(",", ".")) || 0;
  const vu = Number(unit.replace(",", ".")) || 0;
  const sobra = compra ? Number(compra.quantidade) - Number(compra.ja_atribuido) : null;

  const falta =
    origem === "catalogo" && !itemId
      ? "Escolhe o item do catálogo."
      : origem === "compra" && !compraId
        ? "Escolhe a linha de compra."
        : origem === "mao" && !descricao.trim()
          ? "Escreve o que é."
          : qt <= 0
            ? "A quantidade tem de ser maior do que zero."
            : sobra != null && qt > sobra
              ? `Dessa compra só sobram ${sobra} por atribuir.`
              : null;

  const gravar = async () => {
    if (falta) return;
    setAGravar(true);
    setErro(null);
    try {
      await lancarCusto({
        ordemId,
        tipo,
        descricao: descricao.trim() || null,
        quantidade: qt,
        valorUnit: vu,
        unidade: unidade.trim() || null,
        catalogItemId: origem === "catalogo" ? itemId : null,
        compraLinhaId: origem === "compra" ? compraId : null,
      });
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroDeEscrita
          ? e.message
          : "Não foi possível falar com o servidor. Tenta outra vez."
      );
    } finally {
      setAGravar(false);
    }
  };

  return (
    <Modal
      title="Lançar um custo"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button disabled={!!falta || aGravar} onClick={() => void gravar()}>
            {aGravar ? "A lançar…" : `Lançar ${euros(qt * vu)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="text-[13px] font-medium text-slate-700">De onde vem</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Escolha
              ligado={origem === "compra"}
              desativado={compras.length === 0}
              onClick={() => setOrigem("compra")}
            >
              De uma compra
            </Escolha>
            <Escolha
              ligado={origem === "catalogo"}
              desativado={catalogo.length === 0}
              onClick={() => setOrigem("catalogo")}
            >
              Do catálogo
            </Escolha>
            <Escolha ligado={origem === "mao"} onClick={() => setOrigem("mao")}>
              À mão
            </Escolha>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {origem === "compra"
              ? "Traz o preço que o fornecedor cobrou, e não deixa lançar o mesmo material em duas obras."
              : origem === "catalogo"
                ? "Traz o preço de tabela, e permite comparar linha a linha com o orçamento."
                : "Sem catálogo, este custo não emparelha com nenhuma linha do orçamento — só entra no total."}
          </p>
        </div>

        {aCarregar ? (
          <p className="text-sm text-slate-400">a carregar…</p>
        ) : (
          <>
            {origem === "compra" && (
              <Field label="Linha de compra" hint="Só aparecem as que ainda têm quantidade por atribuir.">
                <Combobox
                  value={compraId}
                  onChange={setCompraId}
                  options={compras.map((c) => ({
                    value: c.id,
                    label: `${c.numero} · ${c.descricao} · ${euros(c.preco_unit)} — sobram ${
                      Number(c.quantidade) - Number(c.ja_atribuido)
                    }`,
                  }))}
                  placeholder="Escolher"
                  className="w-full"
                />
              </Field>
            )}

            {origem === "catalogo" && (
              <Field label="Item do catálogo">
                <Combobox
                  value={itemId}
                  onChange={setItemId}
                  options={catalogo.map((c) => ({
                    value: c.id,
                    label: `${c.descricao} · ${euros(c.custo_total)}`,
                  }))}
                  placeholder="Escolher"
                  className="w-full"
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full">
                  <option value="material">Material</option>
                  <option value="servico">Serviço</option>
                  <option value="outro">Outro</option>
                </Select>
              </Field>
              <Field label="Descrição" hint={origem !== "mao" ? "Vem preenchida. Podes mudar." : undefined}>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: Aluguer de andaime"
                  className="w-full"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Quantidade">
                <Input
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="w-full font-mono"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Preço unitário">
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full font-mono"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Unidade" hint="Opcional.">
                <Input
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="un, m², h"
                  className="w-full"
                />
              </Field>
            </div>

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Total:{" "}
              <span className="font-mono font-medium tabular text-slate-800">
                {euros(qt * vu)}
              </span>
              {falta && <span className="ml-2 text-xs text-slate-400">{falta}</span>}
            </p>
          </>
        )}

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <p className="text-xs text-slate-400">
          A mão de obra não se lança aqui: sai das sessões de trabalho e do custo/hora de cada
          pessoa.
        </p>
      </div>
    </Modal>
  );
}

function Escolha({
  ligado,
  desativado,
  onClick,
  children,
}: {
  ligado: boolean;
  desativado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={desativado}
      onClick={onClick}
      className={cx(
        "rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-all",
        "active:scale-[0.98] disabled:opacity-40",
        ligado
          ? "bg-brand text-white ring-brand"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
      )}
    >
      {children}
    </button>
  );
}
