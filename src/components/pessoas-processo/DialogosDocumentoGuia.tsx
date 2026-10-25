// Os diálogos dos passos de documento do guia do negócio, dentro da ficha: enviar a proposta, a resposta do cliente, criar o contrato e a assinatura.
// Cada um reaproveita o ecrã que a app já tem para esse passo (`SendProposalDialog`, `ProposalRejectReasonDialog`, `ContractDetailDialog`) e a mesma
// gravação das páginas de propostas e de contratos (ver `lib/proposals/responderProposta` e `lib/contracts/criarContratoDaProposta`); nada navega
// para outra página. Carregam-se juntos e só quando se abre o primeiro (`DocumentosDoNegocioReal`).
import { useEffect, useState } from "react";
import { ContractDetailDialog } from "@/components/contracts/ContractDetailDialog";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { chaveDoErroDeEnvio } from "@/components/negocio-metas/useEnvioAssincrono";
import { ProposalRejectReasonDialog, type ProposalRejectionDecision } from "@/components/proposals/ProposalRejectReasonDialog";
import { SendProposalDialog } from "@/components/proposals/SendProposalDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chaveDoErro, codigoDoErro } from "@/hooks/pessoas/errosNeg";
import { useAssinarContrato } from "@/hooks/pessoas/useAssinarContrato";
import { useMinutasAtivas, usePropostaParaContrato, type PropostaDoContrato } from "@/hooks/pessoas/useDadosDoContrato";
import { useTranslation } from "@/hooks/useTranslation";
import { criarContratoDaProposta } from "@/lib/contracts/criarContratoDaProposta";
import { aceitarProposta, recusarProposta } from "@/lib/proposals/responderProposta";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import type { PlanoDocumento } from "./documentosGuia";

const G = "pessoasPagina.guia.doc.";
const N = "pessoasPagina.neg.process.";

interface DialogoProps<P extends PlanoDocumento> {
  plano: P;
  organizationId: string;
  mutacoes: MutacoesNegocio;
  aoFechar: () => void;
  /** As permissões da sessão: a gravação recusa-se também sem elas (o botão desativado não é a guarda), e sem lista conhecida (`undefined`) também. */
  permissoes: readonly string[] | undefined;
}

type PlanoDe<K extends PlanoDocumento["passo"]> = Extract<PlanoDocumento, { passo: K }>;

const mensagemDe = (erro: unknown, padrao: string): string => (erro instanceof Error && erro.message ? erro.message : padrao);

/** Enviar a proposta: o diálogo de envio da página de propostas, com o destinatário, o assunto e a mensagem. */
export function EnviarPropostaNoGuia({ plano, organizationId, mutacoes, aoFechar, permissoes }: DialogoProps<PlanoDe<"enviarProposta">>) {
  // O diálogo de envio é partilhado e grava por conta própria: aqui não se renderiza sem `proposals.edit` conhecida (nem enquanto a lista não se conhece).
  const autorizado = permissoes !== undefined && permissoes.includes("proposals.edit");
  useEffect(() => { if (!autorizado) aoFechar(); }, [autorizado, aoFechar]);
  if (!autorizado) return null;
  return (
    <SendProposalDialog
      open onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}
      proposal={{ id: plano.propostaId, title: plano.titulo, proposal_number: plano.numero, organization_id: organizationId }}
      onSent={() => mutacoes.refrescar()}
    />
  );
}

/** A resposta do cliente: aceitou ou recusou (com o motivo). Grava a etapa da proposta como a página de propostas. */
export function RespostaPropostaNoGuia({ plano, organizationId, mutacoes, aoFechar, permissoes }: DialogoProps<PlanoDe<"registarRespostaCliente">>) {
  const { t } = useTranslation();
  const [aGravar, setAGravar] = useState(false);
  const [aPedirMotivo, setAPedirMotivo] = useState(false);

  /** Devolve se gravou: quem chama só larga o que o utilizador escreveu (o motivo) quando correu bem. */
  const gravar = async (fazer: () => Promise<{ workflowFailed: boolean }>, chaveOk: string): Promise<boolean> => {
    setAGravar(true);
    try {
      const { workflowFailed } = await fazer();
      toast.success(t(chaveOk));
      if (workflowFailed) toast.error(t(`${G}resposta.automacao`));
      mutacoes.refrescar();
      aoFechar();
      return true;
    } catch (erro) {
      toast.error(`${t(`${G}resposta.erro`)} ${mensagemDe(erro, "")}`.trim());
      return false;
    } finally {
      setAGravar(false);
    }
  };
  const aceitar = async (): Promise<void> => { await gravar(() => aceitarProposta({ propostaId: plano.propostaId, organizationId, permissoes }), `${G}resposta.aceite`); };
  const recusar = async (motivo: ProposalRejectionDecision): Promise<void> => {
    const gravou = await gravar(() => recusarProposta({ propostaId: plano.propostaId, organizationId, motivo, permissoes }), `${G}resposta.recusada`);
    // Se falhou, o diálogo do motivo fica aberto: o motivo e as notas escritos não se perdem e pode-se tentar de novo.
    if (gravou) setAPedirMotivo(false);
  };

  return (
    <>
      <Dialog open={!aPedirMotivo} onOpenChange={(aberto) => { if (!aberto && !aGravar) aoFechar(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(`${G}resposta.titulo`)}</DialogTitle>
            <DialogDescription>{t(`${G}resposta.descricao`, { proposta: plano.numero ?? plano.titulo })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={aGravar} onClick={() => setAPedirMotivo(true)}>{t(`${G}resposta.recusou`)}</Button>
            <Button type="button" className="min-h-11" disabled={aGravar} onClick={() => void aceitar()}>{aGravar ? t(`${G}resposta.aGuardar`) : t(`${G}resposta.aceitou`)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProposalRejectReasonDialog
        open={aPedirMotivo} onOpenChange={(aberto) => { if (!aberto && !aGravar) setAPedirMotivo(false); }}
        organizationId={organizationId} onConfirm={recusar}
      />
    </>
  );
}

const totalDe = (p: PropostaDoContrato): number => p.quotes.reduce((soma, q) => soma + (q.total ?? 0), 0);
const nomeDe = (p: PropostaDoContrato): string => `${p.title || "Sem título"} - ${p._clientName || "N/A"}`;
function formatarEuros(valor: number | null): string {
  if (!valor) return "-";
  const [inteiro, decimais] = Math.abs(valor).toFixed(2).split(".");
  return `€${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimais}`;
}

interface CriarContratoProps extends DialogoProps<PlanoDe<"criarContrato">> {
  /** O negócio do guia: o contrato liga-se a ele (a base liga-o ao nascer com o fecho v4; senão liga-se depois de criado). */
  negocioId: string;
}

/** O que se vê quando os dados do contrato não se leem (ou a proposta já não existe): a razão, tentar de novo (se foi uma falha) e fechar. */
function ErroDeLeituraDoContrato({ leituraFalhou, aoRefazer, aoFechar }: { leituraFalhou: boolean; aoRefazer: () => void; aoFechar: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${G}contrato.erroTitulo`)}</DialogTitle>
          <DialogDescription role="alert">{t(`${G}contrato.${leituraFalhou ? "leituraFalhou" : "propostaIndisponivel"}`)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t(`${G}contrato.fechar`)}</Button>
          {leituraFalhou && <Button type="button" className="min-h-11" onClick={aoRefazer}>{t(`${G}contrato.tentarDeNovo`)}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Criar o contrato: o diálogo de contratos da página, já com a proposta aceite escolhida, a gravar ligado ao negócio. */
export function CriarContratoNoGuia({ plano, organizationId, mutacoes, negocioId, aoFechar, permissoes }: CriarContratoProps) {
  const { t } = useTranslation();
  const [aGravar, setAGravar] = useState(false);
  const proposta = usePropostaParaContrato(plano.propostaId, organizationId);
  const minutas = useMinutasAtivas(organizationId);

  const guardar = async (dados: { proposal_id: string; template_id: string; start_date: string; end_date: string; notes: string; payment_terms: string; prompt_values?: Record<string, string> }): Promise<void> => {
    if (dados.start_date && dados.end_date && new Date(dados.end_date) <= new Date(dados.start_date)) {
      toast.error(t("clientContracts.toast.endDateBeforeStart"));
      return;
    }
    setAGravar(true);
    try {
      const criado = await criarContratoDaProposta({
        propostaId: dados.proposal_id, organizationId, negocioId: plano.negocioId, templateId: dados.template_id, startDate: dados.start_date,
        endDate: dados.end_date, notes: dados.notes, paymentTerms: dados.payment_terms, promptValues: dados.prompt_values, permissoes,
      });
      toast.success(t(`${G}contrato.criado`));
      if (!criado.ligadoAoNegocio) {
        try {
          await mutacoes.ligar(negocioId, { tipo: "contrato", id: criado.id });
          toast.success(t(`${N}contract.linked`));
        } catch (falha) {
          toast.error(`${t(`${N}contract.notLinked`)} ${t(chaveDoErroDeEnvio(falha))}`);
        }
      }
      mutacoes.refrescar();
      aoFechar();
    } catch (erro) {
      const descricao = plano.negocioId && codigoDoErro(erro) ? t(chaveDoErro(erro)) : await getFriendlyErrorMessage(erro);
      toast.error(t(`${G}contrato.erro`), { description: descricao });
    } finally {
      setAGravar(false);
    }
  };

  // Uma leitura que falhou (ou uma proposta que já não existe) mostra-se como erro: nunca um formulário sem proposta nem minutas, que parecia «não há nada».
  const leituraFalhou = proposta.isError || minutas.isError;
  if (leituraFalhou || (proposta.isSuccess && !proposta.data)) {
    const refazer = (): void => { if (proposta.isError) void proposta.refetch(); if (minutas.isError) void minutas.refetch(); };
    return <ErroDeLeituraDoContrato leituraFalhou={leituraFalhou} aoRefazer={refazer} aoFechar={aoFechar} />;
  }
  const carregada = proposta.isSuccess;
  return (
    <ContractDetailDialog
      open onOpenChange={(aberto) => { if (!aberto && !aGravar) aoFechar(); }}
      contract={null} isNew proposals={proposta.data ? [proposta.data] : []} templates={minutas.data ?? []}
      presetProposalId={plano.propostaId} proposalsLoaded={carregada}
      negocioLigado={plano.negocioId ? { titulo: null } : null}
      onSave={(dados) => void guardar(dados)} saving={aGravar}
      getProposalName={nomeDe} getProposalTotal={totalDe} formatCurrency={formatarEuros} getTranslatedStatus={(estado) => estado}
    />
  );
}

/** A assinatura: pede confirmação (assinar converte o contacto em cliente) e finaliza o contrato como a página de contratos. */
export function AssinarContratoNoGuia({ plano, mutacoes, aoFechar, permissoes }: DialogoProps<PlanoDe<"registarAssinatura">>) {
  const { t } = useTranslation();
  const assinar = useAssinarContrato();
  const [aGravar, setAGravar] = useState(false);

  const confirmar = async (): Promise<void> => {
    setAGravar(true);
    try {
      // A automação diz ela própria o erro (aviso) e devolve `false`; só o sucesso fecha.
      if (!(await assinar(plano.contratoId, permissoes))) return;
      toast.success(t(`${G}assinatura.feita`));
      mutacoes.refrescar();
      aoFechar();
    } catch (erro) {
      toast.error(`${t(`${G}assinatura.erro`)} ${mensagemDe(erro, "")}`.trim());
    } finally {
      setAGravar(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(aberto) => { if (!aberto && !aGravar) aoFechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${G}assinatura.titulo`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`${G}assinatura.descricao`, { contrato: plano.numero ?? "" })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={aGravar}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11" disabled={aGravar}
            onClick={(e) => { e.preventDefault(); void confirmar(); }}
          >
            {aGravar ? t(`${G}resposta.aGuardar`) : t(`${G}assinatura.confirmar`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
