// O orçamento do passo Orçamento como PDF, gerado pelo mesmo QuotePDFDocument dos Orçamentos do CRM (com o template escolhido).
// Estados: vazio (sem linhas, nunca se inventam), a carregar o gerador, erro (com o documento simples como alternativa, avisando) e pronto.
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentProps } from "react";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import type { TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";
import { FOCO } from "@/components/negocio-metas/estilos";
import { cn } from "@/lib/utils";
import { OrcamentoDocumento } from "./OrcamentoDocumento";
import { dadosParaPdf } from "./orcamentoParaPdf";

type PropsDoVisor = ComponentProps<typeof import("./OrcamentoPdfVisor").default>;
// se o pacote do gerador não carregar (rede), o passo mostra o erro e a alternativa em vez de rebentar
const MSG_CARREGAR = "não foi possível carregar o gerador de PDF";
function FalhaAoCarregar({ aoFalhar }: PropsDoVisor) {
  useEffect(() => { aoFalhar(MSG_CARREGAR); }, [aoFalhar]);
  return null;
}
// 2/11 (reunião: "está a acontecer outra vez aquele erro"): o lazy guardava a falha para sempre e «Tentar outra vez» nunca voltava a
// pedir o gerador. Agora cada tentativa pede-o de novo. Depois de uma versão nova do site, o pacote antigo deixa de existir: aí só
// recarregar a página resolve, e o aviso diz isso.
const visorDaTentativa = () => lazy(() => import("./OrcamentoPdfVisor").catch(() => ({ default: FalhaAoCarregar })));

interface Props { d: Negocio; S: Ctx["S"]; tpl: TemplateDeAspeto | null; orgId: string | null; nome: string; logoOrg: string | null }

export function OrcamentoPdf({ d, S, tpl, orgId, nome, logoOrg }: Props) {
  const [falha, setFalha] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const Visor = useMemo(visorDaTentativa, [tentativa]);
  const dados = dadosParaPdf(d, S);
  if (!dados) {
    return <p role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-[15px] text-muted-foreground">Ainda sem linhas: escolhe os serviços em Necessidades do cliente e fecha o levantamento.</p>;
  }
  if (falha !== null) {
    return (
      <div className="space-y-3">
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
          <p className="text-destructive">Não foi possível gerar o PDF do orçamento: {falha}. Abaixo está o documento simples, sem o aspeto do PDF.</p>
          {falha === MSG_CARREGAR && tentativa > 0 && <p className="text-muted-foreground">Se continuar, recarregue a página: pode haver uma versão nova da Olyvia.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setFalha(null); setTentativa((n) => n + 1); }} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>Tentar outra vez</button>
            {falha === MSG_CARREGAR && <button type="button" onClick={() => window.location.reload()} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>Recarregar a página</button>}
          </div>
        </div>
        <OrcamentoDocumento d={d} S={S} tpl={tpl} nome={nome} logoOrg={logoOrg} />
      </div>
    );
  }
  return (
    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">A carregar o gerador de PDF…</p>}>
      <Visor key={tentativa} dados={dados} tpl={tpl} orgId={orgId} aoFalhar={setFalha} />
    </Suspense>
  );
}
