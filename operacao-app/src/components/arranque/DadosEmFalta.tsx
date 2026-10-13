import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ErrorState, Spinner } from "../ui";
import { AlertTriangle, CheckCircle } from "../icons";
import {
  EncomendasPorInstalar,
  lerDadosEmFalta,
  ligarMarcaFornecedor,
  mensagemDeErro,
  problemasProduto,
  type DadosEmFalta as Dados,
} from "../../lib/encomendas";

/**
 * "Dados em falta" — o que falta na base para as encomendas andarem
 * sozinhas, olhando só para o que foi vendido (contratos assinados):
 * fornecedor e preço de compra nos produtos, gestão de stock, fichas de
 * materiais nos serviços, marcas por ligar a fornecedores e encomendas
 * paradas. "Ligar marca → fornecedor" põe esse fornecedor como preferido nos
 * produtos da marca que ainda não têm nenhum (ação explícita).
 */
export function DadosEmFalta({ orgId }: { orgId: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [porInstalar, setPorInstalar] = useState(false);
  const [aLigar, setALigar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await lerDadosEmFalta(orgId));
    } catch (e) {
      if (e instanceof EncomendasPorInstalar) setPorInstalar(true);
      else setErro(mensagemDeErro(e));
    }
  }, [orgId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (porInstalar) {
    return <Card className="p-4 text-sm text-slate-500">Por instalar: falta colar o SQL das encomendas pós-contrato no CRM.</Card>;
  }
  if (erro && !dados) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (!dados) return <Spinner label="A ler os dados em falta…" />;

  const r = dados.resumo;
  const ligar = async (m: Dados["marcas"][number]) => {
    setALigar(m.brand_id);
    setAviso(null);
    setErro(null);
    try {
      const res = await ligarMarcaFornecedor(orgId, m.brand_id, m.supplier_id);
      setAviso(
        res.total === 0
          ? `Nada a ligar: os produtos ${m.marca} já têm fornecedor preferido.`
          : `${res.total} ${res.total === 1 ? "produto" : "produtos"} ${m.marca} com ${m.fornecedor} como fornecedor preferido.`
      );
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setALigar(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="dados-em-falta">
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-slate-800">Dados em falta para as encomendas</h2>
        <p className="text-xs text-slate-500">Só o que foi vendido em contratos assinados.</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Numero rotulo="Produtos vendidos" valor={r.produtos_vendidos} />
          <Numero rotulo="Sem fornecedor preferido" valor={r.sem_fornecedor_preferido} mau />
          <Numero rotulo="Sem preço de compra" valor={r.sem_preco_compra} mau />
          <Numero rotulo="Não gerem stock" valor={r.sem_gestao_stock} mau />
          <Numero rotulo="Serviços sem ficha de materiais" valor={r.servicos_sem_ficha} mau />
          <Numero rotulo="Marcas por ligar" valor={r.marcas_por_ligar} mau />
          <Numero rotulo="Encomendas paradas (+7 dias)" valor={r.encomendas_paradas} mau />
        </dl>
      </Card>

      {aviso && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle width={14} height={14} /> {aviso}
        </p>
      )}
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {dados.marcas.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-800">Marcas com o nome de um fornecedor</h3>
          <p className="text-xs text-slate-500">Ligar põe o fornecedor como preferido nos produtos da marca que ainda não têm.</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {dados.marcas.map((m) => (
              <li key={`${m.brand_id}-${m.supplier_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm text-slate-700">
                  <strong>{m.marca.trim()}</strong> → {m.fornecedor}
                  <span className="block text-xs text-slate-500">
                    {m.produtos} {m.produtos === 1 ? "produto" : "produtos"} sem preferido
                    {m.vendidos > 0 && ` (${m.vendidos} vendidos)`}
                  </span>
                </span>
                {dados.pode_ligar && (
                  <Button size="sm" variant="subtle" disabled={!!aLigar} onClick={() => void ligar(m)}>
                    {aLigar === m.brand_id ? "A ligar…" : "Ligar marca → fornecedor"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dados.produtos.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-800">Produtos vendidos com dados em falta</h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {dados.produtos.map((p) => (
              <li key={p.product_id} className="py-1.5 text-xs">
                <span className="font-medium text-slate-800">{p.nome}</span>
                {p.sku && <span className="ml-1 font-mono text-slate-400">{p.sku}</span>}
                {p.marca && <span className="ml-1 text-slate-500">· {p.marca.trim()}</span>}
                <span className="ml-1 text-slate-400">· {p.contratos} {p.contratos === 1 ? "contrato" : "contratos"}</span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {problemasProduto(p).map((x) => (
                    <Badge key={x} className={x === "sem fornecedor" ? "bg-red-50 text-red-700 ring-red-200" : undefined}>
                      {x}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dados.servicos_sem_ficha.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-800">Serviços vendidos sem ficha de materiais</h3>
          <p className="text-xs text-slate-500">Sem ficha, os consumíveis destes serviços não entram na Encomenda Cliente.</p>
          <ul className="mt-2 text-xs text-slate-700">
            {dados.servicos_sem_ficha.map((s) => (
              <li key={s.service_id} className="py-0.5">
                {s.nome} <span className="text-slate-400">· {s.contratos} {s.contratos === 1 ? "contrato" : "contratos"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dados.encomendas_paradas.length > 0 && (
        <Card className="p-4">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-800">
            <AlertTriangle width={14} height={14} className="text-amber-600" /> Encomendas a fornecedor paradas
          </h3>
          <ul className="mt-2 text-xs text-slate-700">
            {dados.encomendas_paradas.map((e) => (
              <li key={e.purchase_order_id} className="py-0.5">
                <span className="font-mono">{e.numero ?? "—"}</span> · {e.fornecedor ?? "sem fornecedor"} · pendente há {e.dias} dias
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, mau }: { rotulo: string; valor: number; mau?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className={mau && valor > 0 ? "text-lg font-semibold text-amber-700" : "text-lg font-semibold text-slate-800"}>
        {valor}
      </dd>
    </div>
  );
}
