import { useEffect, useMemo, useState } from "react";
import {
  ErroDeDados,
  leiturasParaExportar,
  listarClientes,
  type Cliente,
  type LeituraExportavel,
} from "../lib/dados";
import { listarMedicoes, type MedicaoDef } from "../lib/config";
import { nomeDeFicheiro, paraCSV, type Celula } from "../domain/csv";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  cx,
} from "./ui";
import { AlertTriangle, Layers } from "./icons";
import { data as fmtData } from "../lib/formatar";

/**
 * As leituras em folha de cálculo, para quem tem de as entregar a alguém de
 * fora — uma seguradora, uma entidade reguladora, o próprio cliente.
 *
 * Os dados estão todos gravados desde o primeiro dia, com data e autor. Só
 * faltava a porta de saída.
 *
 * A contagem aparece ANTES de descarregar, de propósito: um ficheiro que vem
 * vazio depois de se carregar num botão parece avaria, e quase sempre é só um
 * filtro apertado a mais.
 */

/** Uma data no formato que um `<input type="date">` quer, no fuso local. */
function isoCurto(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function PainelExportar({ orgId }: { orgId: string | null }) {
  const [medicoes, setMedicoes] = useState<MedicaoDef[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [def, setDef] = useState("");
  const [cliente, setCliente] = useState("");
  const [desde, setDesde] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return isoCurto(d);
  });
  const [ate, setAte] = useState(() => isoCurto(new Date()));

  const [linhas, setLinhas] = useState<LeituraExportavel[] | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [aProcurar, setAProcurar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let vivo = true;
    Promise.all([listarMedicoes(orgId), listarClientes(orgId)])
      .then(([m, c]) => {
        if (!vivo) return;
        setMedicoes(m);
        setClientes(c);
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar.");
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [orgId]);

  // Mexer num filtro invalida a contagem anterior. Sem isto ficava um
  // "1 240 leituras" no ecrã que já não correspondia ao que se ia levar.
  useEffect(() => {
    setLinhas(null);
    setTruncado(false);
  }, [def, cliente, desde, ate]);

  const nomeCliente = useMemo(() => {
    const m = new Map(clientes.map((c) => [c.id, c.nome]));
    return (id: string) => m.get(id) ?? "";
  }, [clientes]);

  const procurar = async () => {
    if (!orgId) return;
    setAProcurar(true);
    setErro(null);
    try {
      const r = await leiturasParaExportar(orgId, {
        defId: def || null,
        clienteId: cliente || null,
        desde: new Date(`${desde}T00:00:00`).toISOString(),
        // Um dia inclui o que se leu às 18h. Sem o fim do dia, escolher
        // "até 31 de janeiro" deixava o próprio dia 31 de fora.
        ate: new Date(`${ate}T23:59:59.999`).toISOString(),
      });
      setLinhas(r.linhas);
      setTruncado(r.truncado);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar as leituras.");
    } finally {
      setAProcurar(false);
    }
  };

  const descarregar = () => {
    if (!linhas || linhas.length === 0) return;

    const cabecalho = [
      "Data",
      "Hora",
      "Cliente",
      "Local",
      "Código do local",
      "Equipamento",
      "Código do equipamento",
      "Ordem",
      "Tarefa",
      "Medição",
      "Unidade",
      "Mínimo",
      "Máximo",
      "Valor",
      "Texto",
      "Conforme",
    ];

    const corpo: Celula[][] = linhas.map((l) => {
      const d = new Date(l.lida_em);
      return [
        d.toLocaleDateString("pt-PT"),
        d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
        nomeCliente(l.cliente_id),
        l.local,
        l.local_codigo,
        l.ativo,
        l.ativo_codigo,
        l.ordem,
        l.tarefa,
        l.nome,
        l.unidade,
        l.limite_min,
        l.limite_max,
        l.valor_num,
        l.valor_texto,
        l.conforme,
      ];
    });

    const nome = def ? medicoes.find((m) => m.id === def)?.nome : "todas";
    const blob = new Blob([paraCSV(cabecalho, corpo)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeDeFicheiro("medicoes", nome, desde, "a", ate);
    a.click();
    // Sem isto o blob fica em memória até se fechar o separador. Numa
    // exportação grande são vários MB por cada clique.
    URL.revokeObjectURL(url);
  };

  if (aCarregar) return <Skeleton className="h-64" />;
  // Falhou a carregar as listas: sem elas não há ecrã nenhum. Um erro a
  // procurar é outra coisa, e aparece lá em baixo sem levar o ecrã à frente.
  if (erro && medicoes.length === 0) return <ErrorState message={erro} />;

  if (medicoes.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6" />}
        title="Ainda não há medições definidas"
        description="Uma medição é o que se lê ao fazer o trabalho — a pressão de um extintor, as horas de um gerador. Definem-se em Definições › Procedimentos."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-medium text-slate-700">O que levar</h2>
        <p className="mt-1 text-xs text-slate-500">
          Sai um ficheiro <strong>.csv</strong> que abre no Excel — uma linha por leitura, com o
          local, o equipamento e a ordem onde foi feita.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Medição">
            <Select value={def} onChange={(e) => setDef(e.target.value)}>
              <option value="">Todas</option>
              {medicoes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                  {m.unidade ? ` (${m.unidade})` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Cliente">
            <Select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="De">
            <Input type="date" value={desde} max={ate} onChange={(e) => setDesde(e.target.value)} />
          </Field>

          <Field label="Até">
            <Input type="date" value={ate} min={desde} onChange={(e) => setAte(e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void procurar()} disabled={aProcurar}>
            {aProcurar ? "A procurar…" : "Ver quantas são"}
          </Button>

          {linhas !== null && (
            <>
              <span className="text-sm text-slate-600">
                {linhas.length === 0
                  ? "Nenhuma leitura neste período."
                  : linhas.length === 1
                    ? "1 leitura."
                    : `${linhas.length.toLocaleString("pt-PT")} leituras.`}
              </span>
              {linhas.length > 0 && (
                <Button variant="secondary" onClick={descarregar}>
                  Descarregar
                </Button>
              )}
            </>
          )}
        </div>

        {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        {truncado && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            São mais de 50 000 leituras, e o ficheiro ficaria cortado aí. Aperta o período, ou
            escolhe uma medição só.
          </p>
        )}
      </Card>

      {linhas !== null && linhas.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-medium text-slate-700">As primeiras cinco</h2>
          <p className="mt-1 text-xs text-slate-500">
            Para conferires que é isto que queres, antes de descarregar.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Onde</th>
                  <th className="pb-2 font-medium">Medição</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.slice(0, 5).map((l) => (
                  <tr key={l.leitura_id}>
                    <td className="py-2 pr-3 text-slate-600">{fmtData(l.lida_em)}</td>
                    <td className="py-2 pr-3 text-slate-800">{l.ativo ?? l.local ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{l.nome}</td>
                    <td
                      className={cx(
                        "py-2 text-right font-medium tabular-nums",
                        l.conforme === false ? "text-red-600" : "text-slate-900"
                      )}
                    >
                      {l.valor_num ?? l.valor_texto ?? "—"}
                      {l.unidade ? ` ${l.unidade}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
