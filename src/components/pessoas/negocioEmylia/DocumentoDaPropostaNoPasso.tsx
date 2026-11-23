// 23/11 (pedido do dono): o passo «Proposta» do negócio no CRM mostra o DOCUMENTO DO TEMPLATE, o mesmo que o cliente vê no portal
// (ProposalPortalDocument + os blocos da obra), e não a folha da Emylia (PropostaDoc, que continua noutros sítios: o portal da
// Emylia, as adendas, o «Imprimir» da ficha de /negocios).
//  · Com a proposta real do negócio (proposals.negocio_id): o documento dessa proposta (o template dela, os orçamentos dela).
//  · Sem ela (ainda não se enviou para o portal): o mesmo documento montado a partir do template escolhido no passo e dos dados do
//    negócio. O que só existe com a proposta criada: o número guardado, a data de criação (o ano do número é o de hoje), a validade
//    gravada e as linhas do orçamento do template; até lá, o 03 é o orçamento detalhado da Emylia.
// A vista do cliente monta-se aqui a partir do negócio (vistaDoCliente: d sem custos), sem precisar da vista gravada.
// Regra do dono: «o que está escrito no template é o verdadeiro»: onde o template tem cabeçalho, ele manda; sem cabeçalho, a carta e o
// resumo da Emylia. Os textos do template levam as variáveis ({{condicoes_pagamento}}, …) com os dados deste negócio.
import { useEffect, useState } from "react";
import type { Estado, Negocio } from "@/emylia/motor";
import { vistaDoCliente } from "@/emylia/real/vistaCliente";
import { ProposalPortalDocument } from "@/components/proposals/ProposalPortalDocument";
import { loadProposalPortalData, type ProposalPortalData } from "@/components/proposals/proposalPortalData";
import { CapaDoDocumento, DocumentoObra } from "@/components/portal/obra/DocumentoObra";
import { propostaDaVista, type VistaDoPortal } from "@/components/portal/obra/dadosObra";
import { capaDaVista } from "@/components/portal/obra/capaEOrcamento";
import { orcamentoDaVista } from "@/components/portal/obra/orcamentoObra";
import { variaveisDaObra } from "@/components/portal/obra/variaveisDaObra";
import { numeroDaProposta, numeroDaPropostaDoNegocio, versaoDaProposta } from "@/lib/numeroDocumento";
import { temTextoUtil } from "@/lib/textoDaProposta";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { useDadosDaProposta, type TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";

export interface DocumentoDaPropostaNoPassoProps {
  negocioId: string | null;
  d: Negocio;
  S: Estado;
  /** O template escolhido no passo (já com a cópia congelada por cima); null sem template. */
  tpl: TemplateDeAspeto | null;
  /** O nome e o logótipo reais da organização (para o documento antes da proposta real). */
  empresa: { nome: string; logo: string | null };
}

type Leitura = { estado: "sem-proposta" | "a-ler" | "pronta" | "erro"; dados: ProposalPortalData | null; erro: string | null };

const ESTADO: Record<string, string> = {
  draft: "Rascunho", sent: "A aguardar decisão", pending: "A aguardar decisão", accepted: "Proposta aceite", rejected: "Proposta rejeitada", expired: "Proposta expirada",
};

/** A proposta real do negócio (o documento do portal), lida pelo mesmo caminho do «Preview Portal». */
function usePropostaReal(propostaId: string | null): Leitura {
  const [l, setL] = useState<Leitura>({ estado: propostaId ? "a-ler" : "sem-proposta", dados: null, erro: null });
  useEffect(() => {
    if (!propostaId) { setL({ estado: "sem-proposta", dados: null, erro: null }); return; }
    let vivo = true;
    setL({ estado: "a-ler", dados: null, erro: null });
    loadProposalPortalData(propostaId)
      .then((dados) => { if (vivo) setL(dados?.proposal ? { estado: "pronta", dados, erro: null } : { estado: "sem-proposta", dados: null, erro: null }); })
      .catch((e: unknown) => {
        captureFlowError(e, "proposal-workflow");
        if (vivo) setL({ estado: "erro", dados: null, erro: e instanceof Error ? e.message : "erro desconhecido" });
      });
    return () => { vivo = false; };
  }, [propostaId]);
  return l;
}

/** O estado da proposta do negócio no motor, nas palavras da base (o que o documento usa para «aceite»/«recusada»). */
const estadoDoMotor = (d: Negocio): string => (d.orc?.aceite ? "accepted" : d.orc?.recusada ? "rejected" : d.orc?.enviada ? "sent" : "draft");

export function DocumentoDaPropostaNoPasso({ negocioId, d, S, tpl, empresa }: DocumentoDaPropostaNoPassoProps) {
  const dadosDaProposta = useDadosDaProposta(negocioId);
  const real = usePropostaReal(dadosDaProposta.data?.id ?? null);
  if (!d.orc) return null;
  // o motor muda d e S no sítio (ctx.run): calcula-se a cada desenho, como a folha da Emylia
  const vista: VistaDoPortal = vistaDoCliente(d, S);
  const p = real.dados?.proposal ?? null;
  const status: string = p?.status ?? estadoDoMotor(d);
  const docs = { proposta: status };
  const obra = propostaDaVista(vista, { docs, validaAte: p?.valid_until ?? null, comercial: real.dados?.commercial?.name ?? null });
  const template = real.dados ? real.dados.template : tpl;
  const capa = temTextoUtil((template as { header_text?: unknown } | null)?.header_text) ? null : capaDaVista(vista, obra, docs);
  // o 03: o orçamento do template (as linhas da proposta real); sem ele, o detalhado da Emylia
  const orcamento = real.dados && real.dados.quotes.length > 0 ? null : orcamentoDaVista(vista, docs);
  const variaveis = variaveisDaObra(obra);
  const numero = p
    ? numeroDaProposta({ numeroNegocio: d.id, versao: versaoDaProposta(d), criadoEm: p.created_at ?? null, guardado: p.proposal_number ?? null })
    : numeroDaPropostaDoNegocio(d);
  const semIva = orcamento ? orcamento.mo + orcamento.mat : null;
  const proposta = p ?? {
    id: `previa-${d.id}`, title: d.servico, proposal_number: null, created_at: new Date().toISOString(),
    valid_until: obra ? obra.condicoes.validaAte.toISOString() : null, status: "draft", value: obra?.total ?? 0,
    ...(semIva !== null ? { subtotal: semIva } : {}), description: null,
    client: { name: d.f.nome_fiscal || d.nome, email: d.f.email || null, phone: d.tel || null },
  };
  const cor = (template as { primary_color?: string | null } | null)?.primary_color || undefined;
  return (
    <section aria-label="Documento da proposta" className="space-y-3" data-testid="documento-da-proposta-no-passo">
      {real.estado === "a-ler" && <p role="status" className="text-sm text-muted-foreground">A ler a proposta deste negócio…</p>}
      {real.estado === "erro" && <p role="alert" className="text-[15px] text-destructive">Não foi possível ler a proposta deste negócio: {real.erro}. Mostra-se a pré-visualização a partir do negócio.</p>}
      {!p && real.estado !== "a-ler" && (
        <p role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[15px] text-muted-foreground">
          Pré-visualização: é assim que o cliente vai ver a proposta no portal. Ainda não foi criada: o número, a data e as linhas do orçamento do template ficam definidos ao enviar para o portal.
        </p>
      )}
      <ProposalPortalDocument
        proposal={proposta}
        template={template}
        quotes={real.dados?.quotes ?? []}
        quoteLines={real.dados?.quoteLines ?? {}}
        quoteFees={real.dados?.quoteFees ?? {}}
        commercial={real.dados?.commercial ?? null}
        company={real.dados?.company ?? { name: empresa.nome, logo_url: empresa.logo }}
        mode="preview"
        idiomasDoDocumento={real.dados?.idiomasDoDocumento}
        statusLabel={ESTADO[status] ?? status}
        numeroMostrado={numero}
        variaveis={variaveis}
        capaObra={capa ? <CapaDoDocumento capa={capa} /> : undefined}
        documentoObra={obra ? <DocumentoObra dados={obra} orcamento={orcamento} cor={cor} /> : undefined}
      />
    </section>
  );
}
