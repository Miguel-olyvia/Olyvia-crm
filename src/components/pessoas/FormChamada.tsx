// "Registar chamada" como vista de detalhe dentro da ficha (o mesmo padrão de abrir um negócio): "← Voltar" e o título, o
// cabeçalho e o percurso da ficha ficam, o conteúdo das abas dá lugar ao formulário e o rodapé fica fixo com "Guardar"
// (o único botão cheio) e "Cancelar". O Esc e o Voltar cancelam; a ficha devolve o foco ao botão "Registar chamada".
import { lazy, Suspense, useEffect, useRef, useId, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { DadosChamada } from "./acoesPessoa";
import { entradaDaVisita, validarAgenda } from "./agendaVisitaForm";
import { BotoesPainel } from "./BotoesPainel";
import { textoAgenda } from "./chamadaPassos";
import { DetalhesPasso } from "./DetalhesPasso";
import { ErroAcao } from "./ErroAcao";
import { NotaChamada } from "./NotaChamada";
import { OpcoesResultado } from "./OpcoesResultado";
import type { AcoesFicha, PropsPainel } from "./PainelBase";
import type { PassoChamada } from "./pessoasTipos";
import { ProximoPassoChamada } from "./ProximoPassoChamada";
import { useExecutarAcao } from "./useExecutarAcao";
import type { FormAgenda } from "./useFormAgendaVisita";
import { useFormChamada } from "./useFormChamada";

export type PropsFormChamada = Pick<PropsPainel, "id" | "pessoa" | "resumo" | "hoje" | "aoFechar"> & {
  acoes: AcoesFicha;
  /** Dentro de um diálogo (o do "A fazer"): sem "← Voltar", que só faz sentido na vista da ficha; fica o "Cancelar". */
  semVoltar?: boolean;
  /** Depois de guardar: a frase para o leitor de ecrã e (para quem o quiser) o próximo passo escolhido. */
  aoConcluir: (mensagem: string, passo?: PassoChamada) => void;
  /** O id do título visível: um diálogo à volta do formulário liga-se a ele com `aria-labelledby`. Sem isto, o formulário gera um. */
  idTitulo?: string;
  /** Só o Pipeline: o negócio do cartão. A chamada (e a visita que ela marque) fica ligada a ele; sem isto, é só da pessoa. */
  negocioId?: string;
  /** Só o Pipeline: a chamada não se grava só na pessoa. Sem `negocioId` não grava e avisa para abrir primeiro o negócio. */
  exigirNegocio?: boolean;
};

/** A frase para o leitor de ecrã: a chamada e, se houve, a visita, a chamada agendada ou a abordagem encerrada. */
function mensagemChamada(t: ReturnType<typeof useTranslation>["t"], nome: string, d: Omit<DadosChamada, "hoje">): string {
  const when = textoAgenda(d.data ?? "", d.hora ?? "");
  if (d.passo === "marcarVisita") return t("pessoasPagina.live.callVisit", { name: nome, when });
  if (d.passo === "ligarData") return t("pessoasPagina.live.callAgenda", { name: nome, when });
  return t(d.passo === "perder" ? "pessoasPagina.live.callLost" : "pessoasPagina.live.call", { name: nome });
}

const R = "pessoasPagina.real.visit.";

/** O primeiro campo com erro; sem nenhum (não há quadro, e a mensagem não é um campo) o foco vai para a própria mensagem (`data-foco-erro`). */
const PRIMEIRO_ERRO = '[aria-invalid="true"], [data-foco-erro]';

// O formulário ligado à base só se carrega quando a ficha real o abre: o exemplo (e os seus testes) nunca importa a ligação à base.
const FormChamadaNaBase = lazy(() => import("./FormChamadaNaBase").then((m) => ({ default: m.FormChamadaNaBase })));

/** A ficha real marca a visita da chamada na base (agenda, recursos, conflito); o exemplo continua com o dia, a hora e a morada em memória. */
export function FormChamada(props: PropsFormChamada) {
  const { t } = useTranslation();
  if (props.acoes.capacidades?.gerirVisitas !== true) return <CorpoChamada {...props} agendaReal={null} />;
  return (
    <Suspense fallback={<p role="status" className="px-6 pt-4 text-sm text-muted-foreground">{t(`${R}agenda.loading`)}</p>}>
      <FormChamadaNaBase {...props} />
    </Suspense>
  );
}

/** O corpo do formulário; com `agendaReal` (a ficha real) o passo «marcar visita» usa a agenda da base. */
export function CorpoChamada({ id, pessoa, resumo, hoje, acoes, aoFechar, aoConcluir, semVoltar = false, idTitulo: idDeFora, negocioId, exigirNegocio = false, agendaReal }: PropsFormChamada & { agendaReal: FormAgenda | null }) {
  const { t } = useTranslation();
  const f = useFormChamada(resumo, hoje, acoes.capacidades?.visita === false, agendaReal !== null);
  // A agenda da base só mostra os seus erros depois de tentar guardar (como o resto do formulário).
  const [tentouAgenda, setTentouAgenda] = useState(false);
  const [semNegocio, setSemNegocio] = useState(false);
  const comAgenda = agendaReal !== null && f.campos.passo === "marcarVisita";
  const erroAgenda = comAgenda && tentouAgenda && agendaReal ? validarAgenda(agendaReal.valor, hoje) : null;
  const acao = useExecutarAcao();
  const secao = useRef<HTMLElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const idGerado = useId();
  const idTitulo = idDeFora ?? idGerado;
  useEffect(() => titulo.current?.focus(), []);
  // Depois de uma tentativa falhada, o foco vai para o primeiro campo com erro.
  useEffect(() => {
    if (f.tentativas > 0) secao.current?.querySelector<HTMLElement>(PRIMEIRO_ERRO)?.focus();
  }, [f.tentativas]);
  /** Os dados com a visita da agenda (o dia e a hora são os dela); `null` se a agenda ainda não serve (os erros ficam à vista, com o foco no primeiro). */
  const comVisita = (dados: Omit<DadosChamada, "hoje">): Omit<DadosChamada, "hoje"> | null => {
    if (!agendaReal || dados.passo !== "marcarVisita") return dados;
    if (validarAgenda(agendaReal.valor, hoje)) {
      setTimeout(() => secao.current?.querySelector<HTMLElement>(PRIMEIRO_ERRO)?.focus(), 0);
      return null;
    }
    const { valor } = agendaReal;
    const revisita = resumo.registos.visitas.some((v) => v.estado !== "cancelada");
    const tipo = revisita ? "revisita" : "levantamento";
    const visita = entradaDaVisita({
      agenda: valor, nome: pessoa.nome, tipo, tituloTipo: t(`${R}kind.${tipo}`), destino: f.campos.destino, moradaLead: f.moradaLead, nota: "", quemVaiEstar: "",
    });
    return { ...dados, data: valor.data, hora: valor.hora, visita };
  };
  const guardar = () => {
    if (exigirNegocio && !negocioId) {
      setSemNegocio(true);
      return;
    }
    setSemNegocio(false);
    if (comAgenda) setTentouAgenda(true);
    const preparados = f.preparar();
    const comDados = preparados && comVisita(preparados);
    if (!comDados) return;
    const dados = negocioId ? { ...comDados, negocioId } : comDados;
    // O aviso de sucesso e a conclusão só chegam depois de a ação terminar (na base pode demorar ou falhar).
    const mensagem = mensagemChamada(t, pessoa.nome, dados);
    acao.executar(() => acoes.registarChamada(pessoa.id, dados), () => {
      toast.success(t("pessoasPagina.call.done"));
      aoConcluir(mensagem, dados.passo);
    }, mensagem);
  };
  return (
    <section ref={secao} id={id} aria-labelledby={idTitulo} className="px-6 pt-4">
      {!semVoltar && (
        <Button type="button" variant="ghost" className={cn("-ml-3 min-h-11 gap-2", FOCO)} onClick={aoFechar}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("pessoasPagina.call.back")}
        </Button>
      )}
      <div className={cn("mb-5 space-y-0.5", semVoltar ? "mt-0" : "mt-1")}>
        <h3 id={idTitulo} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">{t("pessoasPagina.panel.callTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.call.subtitle", { name: pessoa.nome })}</p>
      </div>
      <div className="space-y-5 pb-6">
        <OpcoesResultado valor={f.campos.resultado} aoEscolher={f.escolherResultado} />
        <NotaChamada nota={f.campos.nota} aoMudar={(nota) => f.mudar({ nota })} />
        <ProximoPassoChamada resultado={f.campos.resultado} passos={f.passos} valor={f.campos.passo} aoEscolher={(passo) => f.mudar({ passo })} />
        <DetalhesPasso
          campos={f.campos} erros={f.erros} moradaLead={f.moradaLead} erroMorada={f.erroMorada} hoje={hoje} aoMudar={f.mudar}
          agendaReal={agendaReal ? { form: agendaReal, erro: erroAgenda, desativado: acao.aGuardar } : undefined}
        />
      </div>
      <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-background px-6 py-3">
        {semNegocio && <p role="alert" className="mb-2 text-sm font-medium text-destructive">{t("pessoasPagina.call.openDealFirst")}</p>}
        <ErroAcao chave={acao.erro} chaveExtra={acao.erroExtra} className="mb-2" />
        <BotoesPainel
          guardar={guardar} aoCancelar={aoFechar} desativado={f.campos.resultado === null} dica={t("pessoasPagina.panel.hintResult")}
          aGuardar={acao.aGuardar}
        />
      </div>
    </section>
  );
}
