/**
 * «Quem paga cada mês» na ficha de um ativo: as vezes que esteve entregue a uma pessoa e quanto cada uma pagou (a quota do comprado ou
 * a renda do alugado), mais a parte da estrutura (os meses em que ninguém o tinha no dia de referência), até ao mês de hoje. A regra é
 * a do custo da pessoa no RH, de `amortizacaoAtivo.ts`: o mês é de quem tem o equipamento no último dia (o dia da devolução conta),
 * mês inteiro de uma só pessoa. Por cima, a faixa pela ordem do tempo; por baixo, uma linha por pessoa com a cor dela. Sem tabela: no
 * telemóvel não há scroll horizontal. Sem a permissão do RH não há nomes («Reservado ao RH»), mas os valores e a estrutura mostram-se
 * na mesma.
 */
import type { CSSProperties } from "react";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AvisoAtivo } from "./AvisoAtivo";
import { TITULO_SECCAO } from "./DetalheBlocos";
import { FaixaPosse } from "./FaixaPosse";
import { ocupacaoParaConta, repartoDoAtivo, type ParteDoReparto } from "./lib/amortizacaoAtivo";
import { RISCAS_ESTRUTURA, corDaPessoa, segmentosDePosse } from "./lib/ativosUi";
import type { AtivoParaConta } from "./lib/contaAtivo";
import type { GrupoAtivo, OcupacaoDoAtivo } from "./lib/tipos";

interface Props {
  conta: AtivoParaConta;
  grupo: GrupoAtivo;
  ocupacoes: readonly OcupacaoDoAtivo[];
  /** O mês de hoje («AAAA-MM»): as contas vão até aqui. */
  mes: string;
  hoje: string;
  /** Sem `hr.pessoas.retribuicao.view` os nomes não se mostram. */
  rhOculto: boolean;
  /** Os nomes vêm de `rpc_ativo_ler`: a carregar, ou falhou por um defeito (uma recusa não conta: fica «Pessoa», como na lista). */
  nomes?: "ok" | "aCarregar" | "falhou";
  /** Está livre e ativo, e o utilizador vê o RH: a ficha diz onde se entrega a uma pessoa. */
  podeEntregar?: boolean;
}

function Linha({ nome, detalhe, parte, id, cor, riscas }: { nome: string; detalhe?: string; parte: ParteDoReparto; id: string; cor?: string; riscas?: CSSProperties }) {
  const { t } = useTranslation();
  return (
    <li data-testid={id} className="grid grid-cols-[0.75rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 border-b py-2.5 last:border-b-0 sm:grid-cols-[0.75rem_minmax(0,1fr)_auto]">
      <span aria-hidden="true" className={cn("h-3 w-3 translate-y-0.5 rounded", cor)} style={riscas} />
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold">{nome}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </div>
      <p className="col-start-2 text-sm font-semibold tabular-nums sm:col-start-3 sm:text-right">
        {t(parte.meses === 1 ? "ativos.quem.valorUm" : "ativos.quem.valor", { valor: euros(parte.valor, "—"), n: parte.meses })}
      </p>
    </li>
  );
}

export function QuemPagaAtivo({ conta, grupo, ocupacoes, mes, hoje, rhOculto, nomes = "ok", podeEntregar = false }: Props) {
  const { t } = useTranslation();
  const paraConta = ocupacoes.map(ocupacaoParaConta);
  const reparto = repartoDoAtivo(conta, paraConta, mes, hoje);
  const soEstrutura = grupo !== "pessoa";
  // Todas as entregas se listam, mesmo uma sem nenhum mês seu (entregue e devolvida entre dois fins de mês): é história, com 0 meses.
  const nomeDe = (o: OcupacaoDoAtivo): string => {
    if (rhOculto) return t("ativos.quem.reservado");
    if (o.pessoaNome) return o.pessoaNome;
    return t(nomes === "aCarregar" ? "ativos.quem.aCarregarNome" : "ativos.quem.pessoa");
  };
  const periodo = (o: OcupacaoDoAtivo): string =>
    o.devolucao ? t("ativos.quem.periodo", { de: dataPt(o.entrega), ate: dataPt(o.devolucao) }) : t("ativos.quem.periodoAberto", { de: dataPt(o.entrega) });
  const semNada = reparto.total.meses === 0;
  const segmentos = semNada ? [] : segmentosDePosse(conta, paraConta, mes, hoje);
  const nomeDoSegmento = (dono: number): string => (dono < 0 ? t("ativos.grupo.estrutura") : nomeDe(ocupacoes[dono]));
  return (
    <section aria-labelledby="ativo-quem-paga" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5" data-testid="detalhe-quem-paga">
      <h3 id="ativo-quem-paga" className={TITULO_SECCAO}>{t("ativos.detalhe.seccaoQuemPaga")}</h3>
      <p className="text-xs text-muted-foreground">{t(soEstrutura ? "ativos.quem.regraEstrutura" : "ativos.quem.regra")}</p>
      {nomes === "falhou" && !rhOculto && ocupacoes.some((o) => !o.pessoaNome) && (
        <AvisoAtivo tom="aviso" role="status" data-testid="quem-nomes-falhou" className="text-xs leading-5">{t("ativos.quem.nomesFalhou")}</AvisoAtivo>
      )}
      {semNada ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">{t("ativos.quem.semCusto")}</p>
      ) : (
        <>
          <FaixaPosse segmentos={segmentos} nomeDe={nomeDoSegmento} />
          <ul>
            {!soEstrutura && ocupacoes.map((o, i) => (
              <Linha key={o.pessoaEquipamentoId} id={`quem-pessoa-${i}`} nome={nomeDe(o)} detalhe={periodo(o)} parte={reparto.pessoas[i]} cor={corDaPessoa(i)} />
            ))}
            {reparto.estrutura.meses > 0 && <Linha id="quem-estrutura" nome={t("ativos.quem.estrutura")} parte={reparto.estrutura} riscas={RISCAS_ESTRUTURA} />}
            <li data-testid="quem-total" className="flex flex-wrap items-baseline justify-between gap-x-4 pt-3 text-sm font-bold">
              <span>{t("ativos.quem.total")}</span>
              <span className="tabular-nums">{t(reparto.total.meses === 1 ? "ativos.quem.valorUm" : "ativos.quem.valor", { valor: euros(reparto.total.valor, "—"), n: reparto.total.meses })}</span>
            </li>
          </ul>
        </>
      )}
      {!soEstrutura && ocupacoes.length === 0 && <p className="text-sm text-muted-foreground">{t("ativos.quem.semEntregas")}</p>}
      {podeEntregar && !soEstrutura && <p data-testid="quem-como-entregar" className="text-sm text-muted-foreground">{t("ativos.quem.comoEntregar")}</p>}
    </section>
  );
}
