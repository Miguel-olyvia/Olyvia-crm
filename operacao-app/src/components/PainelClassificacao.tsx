import { useCallback, useEffect, useState } from "react";
import { Card, Field, Select, Skeleton, Toggle, cx } from "./ui";
import { AlertTriangle, Check, ExternalLink } from "./icons";
import { ErroDeEscrita, gravarClassificacao } from "../lib/dados";
import {
  listarCentrosCusto,
  listarFornecedores,
  listarTiposTrabalho,
  type CentroCusto,
  type Fornecedor,
  type TipoTrabalho,
} from "../lib/config";

/**
 * Como esta ordem se classifica: tipo de trabalho, centro de custo,
 * fornecedor, e se se fecha sozinha.
 *
 * Grava a cada escolha, sem botão. São quatro campos independentes, e um
 * "Gravar" no fim obrigaria a lembrar de carregar nele — que é a maneira mais
 * comum de se perder trabalho num formulário pequeno.
 *
 * O centro de custo pode já vir preenchido: a ordem herda-o do equipamento.
 * Quem escolher outro sobrepõe-se, e a herança nunca mais lhe toca.
 */
export default function PainelClassificacao({
  ordemId,
  orgId,
  tipoTrabalhoId,
  centroCustoId,
  fornecedorId,
  fechaAutomatico,
  podeEditar,
  aoGravar,
}: {
  ordemId: string;
  orgId: string;
  tipoTrabalhoId: string | null;
  centroCustoId: string | null;
  fornecedorId: string | null;
  fechaAutomatico: boolean;
  podeEditar: boolean;
  aoGravar: () => void;
}) {
  const [tipos, setTipos] = useState<TipoTrabalho[] | null>(null);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [t, c, f] = await Promise.all([
        listarTiposTrabalho(orgId).catch(() => [] as TipoTrabalho[]),
        listarCentrosCusto(orgId).catch(() => [] as CentroCusto[]),
        listarFornecedores(orgId),
      ]);
      if (!vivo) return;
      setTipos(t);
      setCentros(c);
      setFornecedores(f);
    })();
    return () => {
      vivo = false;
    };
  }, [orgId]);

  const gravar = useCallback(
    async (mudanca: Parameters<typeof gravarClassificacao>[1]) => {
      setErro(null);
      try {
        await gravarClassificacao(ordemId, mudanca);
        setGravado(true);
        window.setTimeout(() => setGravado(false), 2000);
        aoGravar();
      } catch (e) {
        setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
      }
    },
    [ordemId, aoGravar]
  );

  if (tipos === null) return <Skeleton className="h-40 w-full" />;

  /* Um tipo desligado que esteja escolhido nesta ordem continua a aparecer —
     senão o campo mostrava-se vazio e a primeira gravação apagava-o. */
  const tiposVisiveis = tipos.filter((t) => t.ativo || t.id === tipoTrabalhoId);
  const centrosVisiveis = centros.filter((c) => c.ativo || c.id === centroCustoId);
  const tipoEscolhido = tipos.find((t) => t.id === tipoTrabalhoId);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Classificação</h2>
        <span
          className={cx(
            "flex items-center gap-1 text-xs text-emerald-700 transition-opacity",
            gravado ? "opacity-100" : "opacity-0"
          )}
        >
          <Check width={13} height={13} /> gravado
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de trabalho">
          <Select
            value={tipoTrabalhoId ?? ""}
            disabled={!podeEditar}
            onChange={(e) => {
              const id = e.target.value;
              const t = tipos.find((x) => x.id === id);
              // O tipo traz consigo a política de fecho da casa. Quem quiser
              // outra coisa nesta ordem muda o interruptor a seguir.
              void gravar({
                tipoTrabalhoId: id,
                fechaAutomatico: t ? t.fecha_automatico : fechaAutomatico,
              });
            }}
            className="w-full"
          >
            <option value="">— por classificar —</option>
            {tiposVisiveis.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Centro de custo"
          hint={
            centros.length === 0
              ? "Ainda não há nenhum. Criam-se em Definições › Tipos e custos."
              : undefined
          }
        >
          <Select
            value={centroCustoId ?? ""}
            disabled={!podeEditar || centros.length === 0}
            onChange={(e) => void gravar({ centroCustoId: e.target.value })}
            className="w-full"
          >
            <option value="">— nenhum —</option>
            {centrosVisiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nome}
              </option>
            ))}
          </Select>
        </Field>

        {/* Fora do <Field>: ele é um <label>, e um link dentro de um label
            rouba o clique ao campo. */}
        <div className="min-w-0 sm:col-span-2">
        <Field label="Fornecedor">
          <Select
            value={fornecedorId ?? ""}
            disabled={!podeEditar || fornecedores.length === 0}
            onChange={(e) => void gravar({ fornecedorId: e.target.value })}
            className="w-full"
          >
            <option value="">— sem fornecedor —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </Field>
        {/* Criar um fornecedor é no Olyvia. Este módulo lê os dados de negócio
            do CRM e não escreve neles — a regra desde o primeiro dia. */}
        <p className="mt-1 text-[11px] text-slate-400">
          {fornecedores.length === 0
            ? "Não há fornecedores nesta empresa. "
            : "Falta algum? "}
          <a
            href="/suppliers"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-brand-800 underline-offset-2 hover:underline"
          >
            Criar no Olyvia <ExternalLink width={11} height={11} />
          </a>
        </p>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <Toggle
          checked={fechaAutomatico}
          onChange={(v) => void gravar({ fechaAutomatico: v })}
          label="Fecha-se sozinha"
          hint={
            tipoEscolhido
              ? `Vem de "${tipoEscolhido.nome}". Fecha quando as tarefas obrigatórias estiverem todas respondidas — confirmar continua a ser de quem coordena.`
              : "Fecha quando as tarefas obrigatórias estiverem todas respondidas."
          }
        />
      </div>

      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </Card>
  );
}
