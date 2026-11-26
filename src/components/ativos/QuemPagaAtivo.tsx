/**
 * «Quem paga cada mês» na ficha de um ativo: as vezes que esteve entregue a uma pessoa e quanto cada uma pagou (a quota do comprado ou
 * a renda do alugado), mais a parte da estrutura (os meses em que ninguém o tinha no dia de referência), até ao mês de hoje. A regra é
 * a do custo da pessoa no RH, de `amortizacaoAtivo.ts`: o mês é de quem tem o equipamento no último dia (o dia da devolução conta),
 * mês inteiro de uma só pessoa. Cartões empilhados, sem tabela: no telemóvel não há scroll horizontal. Sem a permissão do RH não há
 * nomes («Reservado ao RH»), mas os valores e a estrutura mostram-se na mesma.
 */
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { AvisoAtivo } from "./AvisoAtivo";
import { ocupacaoParaConta, repartoDoAtivo, type ParteDoReparto } from "./lib/amortizacaoAtivo";
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

function Cartao({ nome, detalhe, parte, id }: { nome: string; detalhe?: string; parte: ParteDoReparto; id: string }) {
  const { t } = useTranslation();
  return (
    <li data-testid={id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-md border bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{nome}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </div>
      <p className="text-sm font-medium tabular-nums">
        {t(parte.meses === 1 ? "ativos.quem.valorUm" : "ativos.quem.valor", { valor: euros(parte.valor, "—"), n: parte.meses })}
      </p>
    </li>
  );
}

export function QuemPagaAtivo({ conta, grupo, ocupacoes, mes, hoje, rhOculto, nomes = "ok", podeEntregar = false }: Props) {
  const { t } = useTranslation();
  const reparto = repartoDoAtivo(conta, ocupacoes.map(ocupacaoParaConta), mes, hoje);
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
  return (
    <section aria-labelledby="ativo-quem-paga" className="space-y-2" data-testid="detalhe-quem-paga">
      <h3 id="ativo-quem-paga" className="text-sm font-semibold">{t("ativos.detalhe.seccaoQuemPaga")}</h3>
      <p className="text-xs text-muted-foreground">{t(soEstrutura ? "ativos.quem.regraEstrutura" : "ativos.quem.regra")}</p>
      {nomes === "falhou" && !rhOculto && ocupacoes.some((o) => !o.pessoaNome) && (
        <AvisoAtivo tom="aviso" role="status" data-testid="quem-nomes-falhou" className="text-xs leading-5">{t("ativos.quem.nomesFalhou")}</AvisoAtivo>
      )}
      {semNada ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("ativos.quem.semCusto")}</p>
      ) : (
        <ul className="space-y-2">
          {!soEstrutura && ocupacoes.map((o, i) => (
            <Cartao key={o.pessoaEquipamentoId} id={`quem-pessoa-${i}`} nome={nomeDe(o)} detalhe={periodo(o)} parte={reparto.pessoas[i]} />
          ))}
          {reparto.estrutura.meses > 0 && <Cartao id="quem-estrutura" nome={t("ativos.quem.estrutura")} parte={reparto.estrutura} />}
          <li data-testid="quem-total" className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-1 text-sm font-semibold">
            <span>{t("ativos.quem.total")}</span>
            <span className="tabular-nums">{t(reparto.total.meses === 1 ? "ativos.quem.valorUm" : "ativos.quem.valor", { valor: euros(reparto.total.valor, "—"), n: reparto.total.meses })}</span>
          </li>
        </ul>
      )}
      {!soEstrutura && ocupacoes.length === 0 && <p className="text-sm text-muted-foreground">{t("ativos.quem.semEntregas")}</p>}
      {podeEntregar && !soEstrutura && <p data-testid="quem-como-entregar" className="text-sm text-muted-foreground">{t("ativos.quem.comoEntregar")}</p>}
    </section>
  );
}
