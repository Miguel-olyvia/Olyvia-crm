import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ErroDeDados,
  listarClientes,
  listarLocais,
  ordensParaResumo,
  type Cliente,
  type LocalRow,
} from "../lib/dados";
import { listarPessoas, type Pessoa } from "../lib/config";
import {
  emLinguagem,
  resumoDoPeriodo,
  topoPor,
  type LinhaDeTopo,
  type OrdemDoPeriodo,
} from "../domain/resumo-do-periodo";
import { useRotulos } from "../auth/Rotulos";
import {
  Badge,
  Barra,
  Card,
  ErrorState,
  Field,
  Input,
  Skeleton,
  cx,
} from "./ui";
import { AlertTriangle, CheckCircle, Clock, Inbox, User } from "./icons";

/**
 * Como é que correu o período.
 *
 * As Análises respondiam a duas perguntas — o PMP cumprido e a história de um
 * equipamento — e a nenhuma das que se faz primeiro. Quem abre um ecrã de
 * análises no dia 1 do mês quer saber quanto entrou, quanto saiu, o que ficou
 * por fazer, e quanto tempo demorou.
 *
 * ⚠ **Nada aqui precisou de SQL novo.** As ordens já sabiam quando nasceram,
 * quando foram marcadas, quando começaram e quando fecharam desde o
 * `schema.sql`. O que faltava era somar — e somar faz-se em
 * `domain/resumo-do-periodo.ts`, sem base de dados pelo meio e com testes.
 *
 * Três regras de leitura, e as três são a mesma regra:
 *
 *  · **Um número sozinho não responde à pergunta seguinte.** Cada contagem
 *    leva um link para a lista que a compõe. "12 atrasadas" sem saber quais
 *    obriga a ir procurá-las à mão, e ninguém vai.
 *
 *  · **"Não há dados" não é zero.** Uma pontualidade sem nada com data
 *    marcada mostra um travessão, não 0 %. Zero por cento é uma acusação.
 *
 *  · **Nada aqui prevê nada.** São contagens e médias sobre o que já
 *    aconteceu. Um ecrã de análises que adivinha é um ecrã em que ninguém
 *    acredita à segunda vez.
 */

function inicioDoMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PainelResumo({ orgId }: { orgId: string | null }) {
  const rotulos = useRotulos();
  const [desde, setDesde] = useState(inicioDoMes);
  const [ate, setAte] = useState(hoje);

  const [ordens, setOrdens] = useState<OrdemDoPeriodo[] | null>(null);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [locais, setLocais] = useState<Map<string, string>>(new Map());
  const [pessoas, setPessoas] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setOrdens(null);
    setErro(null);
    try {
      const de = new Date(`${desde}T00:00:00`);
      const a = new Date(`${ate}T23:59:59`);
      const [os, cs, ls, ps] = await Promise.all([
        ordensParaResumo(orgId, de, a),
        listarClientes(orgId).catch(() => [] as Cliente[]),
        listarLocais(orgId).catch(() => [] as LocalRow[]),
        listarPessoas(orgId).catch(() => [] as Pessoa[]),
      ]);
      setOrdens(os);
      setClientes(new Map(cs.map((c) => [c.id, c.nome])));
      setLocais(new Map(ls.map((l) => [l.id, l.nome])));
      setPessoas(new Map(ps.map((p) => [p.utilizador_id, p.nome])));
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar o resumo.");
      setOrdens([]);
    }
  }, [orgId, desde, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const r = useMemo(
    () =>
      ordens
        ? resumoDoPeriodo(ordens, new Date(`${desde}T00:00:00`), new Date(`${ate}T23:59:59`))
        : null,
    [ordens, desde, ate]
  );

  const porCliente = useMemo(
    () => (ordens ? topoPor(ordens, (o) => o.cliente_id) : []),
    [ordens]
  );
  const porLocal = useMemo(
    () => (ordens ? topoPor(ordens, (o) => o.local_id) : []),
    [ordens]
  );
  const porPessoa = useMemo(
    () => (ordens ? topoPor(ordens, (o) => o.responsavel_id) : []),
    [ordens]
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,180px))_1fr]">
          <Field label="Desde">
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label="Até">
            <Input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="w-full"
            />
          </Field>
          <div className="flex items-end pb-1 text-xs text-slate-400">
            As que continuam por fechar contam sempre, tenham nascido quando
            tiverem — um resumo que ignora uma ordem de março ainda aberta em
            setembro esconde o que interessa.
          </div>
        </div>
      </Card>

      {erro && <ErrorState message={erro} onRetry={() => void carregar()} />}
      {!erro && !r && <Skeleton className="h-64 w-full rounded-xl" />}

      {r && !erro && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero
              rotulo="Entraram"
              valor={r.abertas}
              nota="nasceram no período"
              Icone={Inbox}
            />
            <Numero
              rotulo="Saíram"
              valor={r.fechadas}
              nota="fecharam no período"
              Icone={CheckCircle}
              cor="verde"
            />
            <Numero
              rotulo="Por fechar"
              valor={r.emAberto}
              nota="hoje, contando as de antes"
              Icone={Clock}
              para="/ordens?vista=abertas"
            />
            <Numero
              rotulo="Atrasadas"
              valor={r.atrasadas}
              nota="passaram da data marcada"
              Icone={AlertTriangle}
              cor={r.atrasadas > 0 ? "vermelho" : undefined}
              para="/ordens?vista=atrasadas"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-slate-800">Pontualidade</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Das que fecharam e tinham data marcada.
              </p>
              {r.pontualidade === null ? (
                <p className="mt-3 text-sm text-slate-400">
                  Nada com data marcada fechou neste período. Sem isso não há
                  pontualidade para medir — e zero por cento seria uma acusação
                  falsa.
                </p>
              ) : (
                <>
                  <p
                    className={cx(
                      "mt-3 text-3xl font-semibold tabular-nums",
                      r.pontualidade >= 90
                        ? "text-emerald-600"
                        : r.pontualidade >= 70
                          ? "text-amber-600"
                          : "text-red-600"
                    )}
                  >
                    {r.pontualidade}%
                  </p>
                  <Barra percentagem={r.pontualidade} className="mt-2" />
                  <p className="mt-2 text-xs text-slate-500">
                    {r.aHoras} a horas · {r.foraDeHoras} fora de horas
                  </p>
                </>
              )}
            </Card>

            <Card className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-slate-800">Tempos</h3>
              <p className="mt-0.5 text-xs text-slate-500">Médias do período.</p>
              <dl className="mt-3 space-y-2.5">
                <Tempo
                  rotulo="Até começar"
                  valor={emLinguagem(r.horasAteComecar)}
                  nota="do pedido à primeira resposta"
                />
                <Tempo
                  rotulo="Até fechar"
                  valor={emLinguagem(r.horasAteFechar)}
                  nota="do pedido ao trabalho feito"
                />
              </dl>
            </Card>

            <Card className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-slate-800">O que entrou</h3>
              <p className="mt-0.5 text-xs text-slate-500">Por natureza do trabalho.</p>
              {Object.keys(r.porOrigem).length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">Nada entrou neste período.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {Object.entries(r.porOrigem)
                    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt"))
                    .map(([k, n]) => (
                      <li key={k} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-slate-700">
                          {rotulos.nome("origem", k)}
                        </span>
                        <span className="shrink-0 font-mono text-sm tabular-nums text-slate-500">
                          {n}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              {r.semDono > 0 && (
                <Link
                  to="/ordens?vista=abertas"
                  className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  <User width={13} height={13} />
                  {r.semDono === 1
                    ? "1 ordem marcada e sem ninguém"
                    : `${r.semDono} ordens marcadas e sem ninguém`}
                </Link>
              )}
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Topo titulo="Clientes" linhas={porCliente} nome={(k) => clientes.get(k)} />
            <Topo titulo="Locais" linhas={porLocal} nome={(k) => locais.get(k)} />
            <Topo titulo="Pessoas" linhas={porPessoa} nome={(k) => pessoas.get(k)} />
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── Peças ─────────────────────────────────── */

function Numero({
  rotulo,
  valor,
  nota,
  Icone,
  cor,
  para,
}: {
  rotulo: string;
  valor: number;
  nota: string;
  Icone: (p: { width?: number; height?: number; className?: string }) => JSX.Element;
  cor?: "verde" | "vermelho";
  /** Um número sozinho não responde à pergunta seguinte: "quais?". */
  para?: string;
}) {
  const conteudo = (
    <Card
      className={cx(
        "p-4",
        para && "transition-colors hover:border-brand-200 hover:bg-brand-50/30",
        cor === "vermelho" && valor > 0 && "border-red-200 bg-red-50/40"
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icone width={13} height={13} />
        {rotulo}
      </div>
      <p
        className={cx(
          "mt-1.5 text-3xl font-semibold tabular-nums",
          cor === "verde" && "text-emerald-600",
          cor === "vermelho" && valor > 0 ? "text-red-600" : "text-slate-900"
        )}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{nota}</p>
    </Card>
  );

  return para ? (
    <Link to={para} className="block">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

function Tempo({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-sm text-slate-600">{rotulo}</dt>
        <dd className="font-mono text-lg font-semibold tabular-nums text-slate-900">
          {valor}
        </dd>
      </div>
      <p className="text-xs text-slate-400">{nota}</p>
    </div>
  );
}

function Topo({
  titulo,
  linhas,
  nome,
}: {
  titulo: string;
  linhas: readonly LinhaDeTopo[];
  nome: (chave: string) => string | undefined;
}) {
  const maximo = Math.max(1, ...linhas.map((l) => l.quantas));

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-800">Onde se concentrou · {titulo}</h3>
      {linhas.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Sem trabalho suficiente para agrupar.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {linhas.map((l) => (
            <li key={l.chave}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-slate-700">
                  {nome(l.chave) ?? "—"}
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  {l.porFechar > 0 && (
                    <Badge className="bg-slate-100 text-slate-500 ring-slate-200">
                      {l.porFechar} por fechar
                    </Badge>
                  )}
                  <span className="font-mono text-sm tabular-nums text-slate-500">
                    {l.quantas}
                  </span>
                </span>
              </div>
              <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${(l.quantas / maximo) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
