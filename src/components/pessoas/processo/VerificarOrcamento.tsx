// "Verificar o orçamento": mostra a margem, os bloqueios (um preço ou uma venda abaixo do custo é duro e a Direção nunca o aprova; uma
// margem entre 0 % e o mínimo é mole e pode pedir-se a exceção) e os avisos (abaixo do alvo, que não bloqueia). Resolve-se aqui mesmo com "Usar X €" e
// "Tirar o desconto", ou pede-se a aprovação à Direção. Montado uma vez, ao nível da página, pelo `ProcessoProvider`.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "../CamposDataHora";
import { useAvisoAlternado } from "./avisoAlternado";
import { eur, pct } from "./formatoOrcamento";
import { nomeDaLinha } from "./nomesOrcamento";
import { MARGEM_ALVO, MARGEM_MIN, verificarOrcamento as calcularVerificacao, type Bloqueio } from "./orcamentoCalculo";
import type { OrcamentoDetalhado } from "./orcamentoDetalhado";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";
import type { DadosDoOrcamento } from "./transicoes";

const P = "pessoasPagina.verify.";
const BOTAO = cn("min-h-11", FOCO);

interface Acoes {
  aoAjustar: (dados: DadosDoOrcamento) => FaltaProcesso[];
  aoPedirDirecao: () => FaltaProcesso[];
  aoVerificar: () => FaltaProcesso[];
  aoEditar: () => void;
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
}

interface ConteudoProps extends Acoes {
  orcamento: OrcamentoDetalhado;
}

/** Um bloqueio ou aviso: o ícone e a palavra (a cor nunca é a única pista), o texto e, por baixo, o que o resolve. */
function ItemDaLista({ icone, tipo, texto, children }: { icone: JSX.Element; tipo: string; texto: string; children?: ReactNode }) {
  return (
    <li className="space-y-2 py-3">
      <p className="flex items-start gap-2 text-sm text-foreground">
        {icone}
        <span><strong className="font-semibold">{tipo}</strong>{": "}{texto}</span>
      </p>
      {children}
    </li>
  );
}

function Conteudo({ orcamento, aoAjustar, aoPedirDirecao, aoVerificar, aoEditar, explicar, aoFechar }: ConteudoProps) {
  const { t } = useTranslation();
  const id = useId();
  const alternar = useAvisoAlternado();
  const [motivo, setMotivo] = useState<string | null>(null);
  // Depois de um ajuste o botão que o fez desaparece (o bloqueio resolveu-se): o foco vai para o resumo, e não cai no body.
  const resumoRef = useRef<HTMLParagraphElement>(null);
  const [focarResumo, setFocarResumo] = useState(false);
  const verificacao = calcularVerificacao(orcamento);
  const margem = pct(verificacao.totais.margem);
  const { bloqueios } = verificacao;
  const semBloqueios = bloqueios.length === 0;

  useEffect(() => {
    if (!focarResumo) return;
    resumoRef.current?.focus();
    setFocarResumo(false);
  }, [focarResumo]);

  /**
   * Corre uma ação; se o portão diz que falta algo, di-lo num alerta (dentro do diálogo, onde o leitor de ecrã o ouve). Um ajuste
   * (`ajuste`) que deu certo leva o foco ao resumo, porque o botão que o fez vai desaparecer.
   */
  const correr = (acao: () => FaltaProcesso[], ajuste = false) => {
    const faltas = acao();
    setMotivo(faltas.length > 0 ? alternar(explicar(faltas)) : null);
    if (ajuste && faltas.length === 0) setFocarResumo(true);
  };
  const dados = (parcial: Partial<DadosDoOrcamento>): DadosDoOrcamento => ({
    linhas: orcamento.linhas, desconto: orcamento.desconto, vendaDireta: orcamento.vendaDireta, ...parcial,
  });
  const usarPreco = (b: Extract<Bloqueio, { tipo: "abaixoDoCusto" }>) =>
    correr(() => aoAjustar(dados({ linhas: orcamento.linhas.map((l) => (l.id === b.linha ? { ...l, precoUnitario: b.sugestao } : l)) })), true);
  const tirarDesconto = () => correr(() => aoAjustar(dados({ desconto: 0 })), true);

  const resumo = semBloqueios
    ? t(`${P}summary.ok`, { margin: margem })
    : t(bloqueios.length === 1 ? `${P}summary.one` : `${P}summary.many`, { margin: margem, count: bloqueios.length });
  const icone = (Icone: typeof AlertCircle, cor: string) => <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", cor)} aria-hidden="true" />;
  const trabalhoDe = (b: Extract<Bloqueio, { tipo: "abaixoDoCusto" }>): string =>
    nomeDaLinha(t, orcamento.linhas.find((l) => l.id === b.linha) ?? { trabalho: b.trabalho });
  const textoDoBloqueio = (b: Bloqueio): string => {
    if (b.tipo === "abaixoDoCusto") return t(`${P}block.belowCost`, { work: trabalhoDe(b), price: eur(b.precoUnitario), cost: eur(b.custo) });
    if (b.tipo === "vendaAbaixoDoCusto") return t(`${P}block.saleBelowCost`, { net: eur(b.semIva), cost: eur(b.custo) });
    return t(b.tipo === "margemBaixa" ? `${P}block.lowMargin` : `${P}block.discount`, { margin: pct(b.margem), min: pct(MARGEM_MIN) });
  };

  return (
    <div className="space-y-4">
      <p ref={resumoRef} role="status" tabIndex={-1} className={cn("text-sm font-medium text-foreground", FOCO)}>{resumo}</p>
      <ul role="list" aria-label={t(`${P}list.label`)} className="divide-y divide-border rounded-lg border border-border px-3">
        {bloqueios.map((b) => (
          <ItemDaLista key={b.tipo === "abaixoDoCusto" ? b.linha : b.tipo} icone={icone(AlertCircle, "text-destructive")} tipo={t(`${P}kind.block`)} texto={textoDoBloqueio(b)}>
            {(b.tipo === "abaixoDoCusto" || b.tipo === "vendaAbaixoDoCusto") && (
              <p className="pl-6 text-sm text-foreground">{t(`${P}block.neverApproved`)}</p>
            )}
            {b.tipo === "abaixoDoCusto" && (
              <div className="pl-6">
                <Button
                  type="button" variant="outline" className={BOTAO} onClick={() => usarPreco(b)}
                  aria-label={t(`${P}usePriceLabel`, { price: eur(b.sugestao), work: trabalhoDe(b) })}
                >
                  {t(`${P}usePrice`, { price: eur(b.sugestao) })}
                </Button>
              </div>
            )}
            {(b.tipo === "descontoBaixaMargem" || b.tipo === "vendaAbaixoDoCusto") && (
              <div className="pl-6">
                <Button type="button" variant="outline" className={BOTAO} onClick={tirarDesconto}>
                  {t(`${P}removeDiscount`)}
                </Button>
              </div>
            )}
          </ItemDaLista>
        ))}
        {verificacao.avisos.map((a) => (
          <ItemDaLista key={a.tipo} icone={icone(AlertTriangle, "text-warning")} tipo={t(`${P}kind.warn`)} texto={t(`${P}warn.target`, { margin: pct(a.margem), target: pct(MARGEM_ALVO) })} />
        ))}
        {semBloqueios && (
          <li className="flex items-start gap-2 py-3 text-sm text-foreground">
            {icone(CheckCircle2, "text-success")}
            <span>{t(`${P}allGood`)}</span>
          </li>
        )}
      </ul>
      {motivo !== null && <MensagemErro id={`${id}-motivo`} texto={motivo} />}
      <DialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
        <Button type="button" variant="ghost" className={BOTAO} onClick={aoFechar}>{t(`${P}close`)}</Button>
        <Button type="button" variant="outline" className={BOTAO} onClick={aoEditar}>{t(`${P}edit`)}</Button>
        {!verificacao.duro && !semBloqueios && <Button type="button" className={BOTAO} onClick={() => correr(aoPedirDirecao)}>{t(`${P}askDirection`)}</Button>}
        {semBloqueios && <Button type="button" className={BOTAO} onClick={() => correr(aoVerificar)}>{t(`${P}markVerified`)}</Button>}
      </DialogFooter>
    </div>
  );
}

/** Sem orçamento detalhado (os negócios de exemplo) não há o que verificar: diz-se, e fica a saída. */
function SemOrcamento({ aoFechar }: { aoFechar: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">{t(`${P}noQuote`)}</p>
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="ghost" className={BOTAO} onClick={aoFechar}>{t(`${P}close`)}</Button>
      </DialogFooter>
    </div>
  );
}

interface VerificarOrcamentoProps extends Acoes {
  /** O negócio cujo orçamento se verifica; `null` com o diálogo fechado. */
  negocio: NegocioDoPasso | null;
  /** O orçamento como está agora: muda quando "Usar X €" ou "Tirar o desconto" o alteram, e o diálogo mostra logo o resultado. */
  orcamento: OrcamentoDetalhado | undefined;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function VerificarOrcamento({ negocio, orcamento, aoDevolverFoco, ...acoes }: VerificarOrcamentoProps) {
  const { t } = useTranslation();
  const ultimo = useRef(negocio);
  const ultimoOrcamento = useRef(orcamento);
  if (negocio) ultimo.current = negocio;
  if (orcamento) ultimoOrcamento.current = orcamento;
  const mostrado = negocio ?? ultimo.current;
  const doOrcamento = orcamento ?? ultimoOrcamento.current;
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) acoes.aoFechar(); }}>
      <DialogContent hideClose className="max-w-xl motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t(`${P}title`, { work: mostrado?.trabalho ?? "" })}</DialogTitle>
          <DialogDescription>{t(`${P}description`, { name: mostrado?.nome ?? "", min: pct(MARGEM_MIN), target: pct(MARGEM_ALVO) })}</DialogDescription>
        </DialogHeader>
        {mostrado && (doOrcamento ? <Conteudo key={mostrado.id} orcamento={doOrcamento} {...acoes} /> : <SemOrcamento aoFechar={acoes.aoFechar} />)}
      </DialogContent>
    </Dialog>
  );
}
