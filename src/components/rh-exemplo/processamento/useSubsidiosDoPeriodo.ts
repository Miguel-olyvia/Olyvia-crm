/**
 * Os subsidios de ferias e de Natal de UM periodo da folha, partilhado pela «Visao geral» e pelo calculo real (`useCalculoReal`).
 *
 * COM PERIODO (ja aberto na base): a decisao «este periodo paga ferias / Natal» e a ASSINATURA da configuracao vem da mesma leitura
 * (`rpc_hr_subsidios_assinatura`, hook `useSubsidiosAssinatura`). E a unica fonte: o cliente so aplica a proporcao, os duodecimos e o
 * vinculo. A assinatura que segue no fecho (`subsidiosAssinatura`) e a da leitura COM QUE O CALCULO FOI FEITO: nunca se le de novo ao
 * fechar (apanharia a configuracao nova e a base nao daria pela diferenca). Se a configuracao mudar, a releitura muda a decisao e a
 * assinatura juntas e o calculo refaz-se; e se o fecho for recusado (HRA90), `reler` volta a ler.
 * SEM PERIODO (ainda por abrir): nao ha o que fechar; mostra-se pela configuracao da organizacao (`useSubsidiosConfig`), sem assinatura.
 *
 * `subsidiosLeitura` diz como se leu o que e preciso: so `ok` deixa fechar; `indisponivel` (a base ainda nao tem a RPC) conta como
 * desligada; recusada, com erro ou a carregar bloqueia o fecho, e num periodo aberto o ecra di-lo em vez de pagar a zero.
 */
import { useCallback, useMemo } from "react";
import { periodoPagaSubsidios, decidirSubsidios, type SubsidiosConfig } from "@/components/rh-exemplo/hooks/subsidiosReal";
import { useSubsidiosAssinatura } from "@/components/rh-exemplo/hooks/useSubsidiosAssinatura";
import { useSubsidiosConfig } from "@/components/rh-exemplo/hooks/useSubsidiosConfig";
import { usePessoasVinculosVigentes, vinculoContinuoDoPeriodo } from "@/components/rh-exemplo/hooks/usePessoasVinculosVigentes";
import type { EstadoLeitura } from "@/components/rh-exemplo/hooks/useProcessamentoResultados";
import type { SubsidiosExtraEntrada } from "@/components/rh-exemplo/lib/processamentoTotais";
import type { EntradaCalculoReal } from "./calculoReal";

/**
 * @param mes o mes (1-12) do periodo: o do ULTIMO dia, nunca o do primeiro.
 * @param ultimoDia o fim do periodo (`AAAA-MM-DD`).
 * @param periodoId o periodo na base; sem ele (por abrir) decide-se pela configuracao e nao ha assinatura.
 */
export function useSubsidiosDoPeriodo(mes: number, ultimoDia: string, periodoId?: string | null) {
  const temPeriodo = Boolean(periodoId);
  const assinaturaHook = useSubsidiosAssinatura(periodoId);
  // So se le a configuracao a parte quando nao ha periodo: com periodo a fonte e uma so.
  const configHook = useSubsidiosConfig(!temPeriodo);
  const leitura = assinaturaHook.leitura;

  const { ativoDesde, feriasMes, natalMes } = leitura ?? { ativoDesde: null, feriasMes: 0, natalMes: 0 };
  const configDoPeriodo = useMemo<SubsidiosConfig | null>(
    () => (leitura ? { ativoDesde, feriasMes, natalMes } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so contam os tres valores; `leitura` e um objecto novo a cada leitura.
    [leitura !== null, ativoDesde, feriasMes, natalMes],
  );
  const config: SubsidiosConfig | null = temPeriodo ? configDoPeriodo : configHook.config;
  const pagaSubsidios = temPeriodo ? Boolean(leitura && (leitura.pagaFerias || leitura.pagaNatal)) : periodoPagaSubsidios(config, { mes, dataFim: ultimoDia });
  /** O que a base decidiu para o periodo; `undefined` sem periodo (decide-se pelo mes da configuracao). */
  const pagaFerias = leitura?.pagaFerias ?? false;
  const pagaNatal = leitura?.pagaNatal ?? false;
  const decisao = useMemo(() => (temPeriodo ? { pagaFerias, pagaNatal } : undefined), [temPeriodo, pagaFerias, pagaNatal]);
  const vinculosHook = usePessoasVinculosVigentes(pagaSubsidios);

  const leituraBase: EstadoLeitura = temPeriodo ? assinaturaHook.estado : configHook.estado;
  const subsidiosLeitura: EstadoLeitura =
    leituraBase !== "ok"
      ? leituraBase
      : !pagaSubsidios
        ? "ok"
        : vinculosHook.recusado
          ? "recusado"
          : vinculosHook.error
            ? "erro"
            : vinculosHook.carregado
              ? "ok"
              : "a_carregar";

  /** A assinatura que segue no fecho: a da leitura do calculo; `null` com o pagamento desligado para a folha (nao se envia). */
  const subsidiosAssinatura: string | null = temPeriodo && leitura?.aplica ? leitura.assinatura : null;

  /** A entrada de `calcularResultadoReal`: a cadeia continua de vinculos que cobre o mes do FIM do periodo (so se lê quando o periodo paga). */
  const subsidiosDaPessoa = useCallback(
    (pessoaId: string): NonNullable<EntradaCalculoReal["subsidios"]> => ({
      config,
      mes,
      vinculo: pagaSubsidios ? vinculoContinuoDoPeriodo(vinculosHook.vinculos.get(pessoaId), ultimoDia) : null,
      ...(decisao ? { decisao } : {}),
    }),
    [config, mes, pagaSubsidios, vinculosHook.vinculos, ultimoDia, decisao],
  );

  /** A entrada do motor (`subsidiosExtra`), para quem chama `calcularProcessamentoPessoa` directamente. */
  const subsidiosExtraDaPessoa = useCallback(
    (pessoaId: string): SubsidiosExtraEntrada | undefined => {
      const { vinculo, decisao: d } = subsidiosDaPessoa(pessoaId);
      return decidirSubsidios(config, { mes, dataFim: ultimoDia }, vinculo, d);
    },
    [subsidiosDaPessoa, config, mes, ultimoDia],
  );

  /** A releitura da assinatura decorre (depois de um fecho recusado): o fecho espera, senao reenviava a assinatura velha. */
  const subsidiosAReler = temPeriodo && assinaturaHook.aReler === true;

  return { subsidiosLeitura, subsidiosDaPessoa, subsidiosExtraDaPessoa, pagaSubsidios, subsidiosAssinatura, subsidiosAReler, relerSubsidios: assinaturaHook.reler };
}
