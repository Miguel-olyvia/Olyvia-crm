// «Dar como ganho» na ficha real (neg_ganhar_negocio). A interface só oferece: quem decide se o negócio pode ganhar é a base (NG006), e
// converter a lead em cliente acontece lá. Escolhe a lead a converter quando a pessoa tem mais de uma aberta, diz o que aconteceu
// (conversão feita, pessoa que já era cliente, lead já convertida, outras leads abertas, já estava ganho) e traduz os erros pelo CÓDIGO
// dentro do diálogo. NG015 (sem lead aberta nem cliente) mostra o erro e não oferece solução: é uma decisão de produto por tomar.
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useDadosNegocio, type DadosNegocio } from "./costuraNegocio";
import { DialogoDeEnvio, ErroDeEnvio } from "./DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "./estilos";
import { useMutacoesDaFicha, type MutacoesNegocio, type ResultadoGanho } from "./mutacoesNegocio";
import type { NegocioMes } from "./negocioMetas";
import { leadMaisRecente, SeletorLead } from "./SeletorLead";
import type { EnvioAssincrono } from "./useEnvioAssincrono";

const N = "pessoasPagina.neg.win.";
const CHAVE_NG006 = "pessoasPagina.erroNeg.ng006";

type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** O que se diz depois de ganhar: o que aconteceu à lead e, se houver, o aviso das outras leads abertas. */
export function textoDoGanho(t: Traduzir, nome: string, r: ResultadoGanho): string {
  const principal = !r.mudou ? t(`${N}done.already`, { name: nome }) : t(`${N}done.${r.conversao ?? "generic"}`, { name: nome });
  if (r.outrasLeadsAbertas <= 0) return principal;
  const aviso = r.outrasLeadsAbertas === 1 ? t(`${N}otherLeads.one`) : t(`${N}otherLeads.many`, { count: r.outrasLeadsAbertas });
  return `${principal} ${aviso}`;
}

interface FormGanharProps {
  negocio: NegocioMes;
  mutacoes: MutacoesNegocio;
  dados: DadosNegocio | null;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoGanho?: (anuncio: string) => void;
}

function FormGanhar({ negocio, mutacoes, dados, envio, aoFechar, aoGanho }: FormGanharProps) {
  const { t } = useTranslation();
  const leads = dados?.leadsAbertas ?? [];
  const [lead, setLead] = useState(leadMaisRecente(leads)?.id ?? "");
  // Com uma só lead (ou nenhuma) a base escolhe; só com duas ou mais é que se manda a que o utilizador escolheu.
  const leadId = leads.length > 1 && lead !== "" ? lead : null;
  const guardado = useRef<ResultadoGanho | null>(null);
  // A regra «proposta aceite» pede outro documento que a «contrato assinado»: a mensagem do NG006 acompanha a regra (ainda pelo código).
  const chaveErro = envio.erro === CHAVE_NG006 && dados?.momentoGanho === "proposta_aceite" ? `${N}ng006.proposal` : envio.erro;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    envio.enviar(
      async () => { guardado.current = await mutacoes.ganhar(negocio.id, leadId); },
      () => {
        aoFechar();
        if (guardado.current) aoGanho?.(textoDoGanho(t, negocio.pessoa, guardado.current));
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {leads.length > 1 && <SeletorLead leads={leads} valor={lead} rotulo={t(`${N}lead`)} aoMudar={setLead} />}
      <ErroDeEnvio chave={chaveErro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${N}cancel`)}
        </Button>
        <Button type="submit" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {t(`${N}confirm`)}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface GanharNegocioDialogoProps {
  /** O negócio a ganhar; `null` = fechado. */
  negocio: NegocioMes | null;
  aoFechar: () => void;
  /** Depois de ganhar: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoGanho?: (anuncio: string) => void;
}

export function GanharNegocioDialogo({ negocio, aoFechar, aoGanho }: GanharNegocioDialogoProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  const dados = useDadosNegocio();
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  if (!mutacoes || !mostrado) return null;
  return (
    <DialogoDeEnvio
      aberto={negocio !== null} aoFechar={aoFechar} titulo={t(`${N}title`)}
      descricao={t(`${N}description`, { name: mostrado.pessoa, work: mostrado.servico })}
    >
      {(envio) => <FormGanhar key={mostrado.id} negocio={mostrado} mutacoes={mutacoes} dados={dados} envio={envio} aoFechar={aoFechar} aoGanho={aoGanho} />}
    </DialogoDeEnvio>
  );
}
