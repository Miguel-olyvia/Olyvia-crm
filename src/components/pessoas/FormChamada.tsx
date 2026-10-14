// "Registar chamada" como vista de detalhe dentro da ficha (o mesmo padrão de abrir um negócio): "← Voltar" e o título, o
// cabeçalho e o percurso da ficha ficam, o conteúdo das abas dá lugar ao formulário e o rodapé fica fixo com "Guardar"
// (o único botão cheio) e "Cancelar". O Esc e o Voltar cancelam; a ficha devolve o foco ao botão "Registar chamada".
import { useEffect, useRef, useId } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { DadosChamada } from "./acoesPessoa";
import { BotoesPainel } from "./BotoesPainel";
import { textoAgenda } from "./chamadaPassos";
import { DetalhesPasso } from "./DetalhesPasso";
import { NotaChamada } from "./NotaChamada";
import { OpcoesResultado } from "./OpcoesResultado";
import type { AcoesFicha, PropsPainel } from "./PainelBase";
import { ProximoPassoChamada } from "./ProximoPassoChamada";
import { useFormChamada } from "./useFormChamada";

export type PropsFormChamada = Pick<PropsPainel, "id" | "pessoa" | "resumo" | "hoje" | "aoFechar" | "aoConcluir"> & { acoes: AcoesFicha };

/** A frase para o leitor de ecrã: a chamada e, se houve, a visita, a chamada agendada ou a perda. */
function mensagemChamada(t: ReturnType<typeof useTranslation>["t"], nome: string, d: Omit<DadosChamada, "hoje">): string {
  const when = textoAgenda(d.data ?? "", d.hora ?? "");
  if (d.passo === "marcarVisita") return t("pessoasPagina.live.callVisit", { name: nome, when });
  if (d.passo === "ligarData") return t("pessoasPagina.live.callAgenda", { name: nome, when });
  return t(d.passo === "perder" ? "pessoasPagina.live.callLost" : "pessoasPagina.live.call", { name: nome });
}

export function FormChamada({ id, pessoa, resumo, hoje, acoes, aoFechar, aoConcluir }: PropsFormChamada) {
  const { t } = useTranslation();
  const f = useFormChamada(resumo, hoje);
  const secao = useRef<HTMLElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const idTitulo = useId();
  useEffect(() => titulo.current?.focus(), []);
  // Depois de uma tentativa falhada, o foco vai para o primeiro campo com erro.
  useEffect(() => {
    if (f.tentativas > 0) secao.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [f.tentativas]);
  const guardar = () => {
    const dados = f.preparar();
    if (!dados) return;
    acoes.registarChamada(pessoa.id, dados);
    toast.success(t("pessoasPagina.call.done"));
    aoConcluir(mensagemChamada(t, pessoa.nome, dados));
  };
  return (
    <section ref={secao} id={id} aria-labelledby={idTitulo} className="px-6 pt-4">
      <Button type="button" variant="ghost" className={cn("-ml-3 min-h-11 gap-2", FOCO)} onClick={aoFechar}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("pessoasPagina.call.back")}
      </Button>
      <div className="mb-5 mt-1 space-y-0.5">
        <h3 id={idTitulo} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">{t("pessoasPagina.panel.callTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.call.subtitle", { name: pessoa.nome })}</p>
      </div>
      <div className="space-y-5 pb-6">
        <OpcoesResultado valor={f.campos.resultado} aoEscolher={f.escolherResultado} />
        <NotaChamada nota={f.campos.nota} aoMudar={(nota) => f.mudar({ nota })} />
        <ProximoPassoChamada resultado={f.campos.resultado} passos={f.passos} valor={f.campos.passo} aoEscolher={(passo) => f.mudar({ passo })} />
        <DetalhesPasso
          campos={f.campos} erros={f.erros} moradaLead={f.moradaLead} erroMorada={f.erroMorada} hoje={hoje} aoMudar={f.mudar}
        />
      </div>
      <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-background px-6 py-3">
        <BotoesPainel guardar={guardar} aoCancelar={aoFechar} desativado={f.campos.resultado === null} dica={t("pessoasPagina.panel.hintResult")} />
      </div>
    </section>
  );
}
