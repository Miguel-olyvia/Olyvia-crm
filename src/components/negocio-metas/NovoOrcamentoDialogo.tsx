import { useId, useRef, useState, type FormEvent, type Ref } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import {
  acrescentarOrcamento, ESTADOS_ORCAMENTO, lerValor, validarOrcamento, type DadosOrcamento, type ErroOrcamento,
} from "./negocioAcoes";
import { guardarNegocio, proximaSequenciaOrcamento } from "./negociosAlterados";
import type { EstadoOrcamentoDetalhe } from "./negocioDetalhes";
import type { NegocioMes } from "./negocioMetas";

const A = "businessGoals.act.";

interface NovoOrcamentoDialogoProps {
  /** O negócio a que se acrescenta o orçamento; `null` = fechado. */
  negocio: NegocioMes | null;
  /** O dia de hoje (AAAA-MM-DD): a data do orçamento. */
  hoje: string;
  aoFechar: () => void;
  /** Depois de criar: o texto para o leitor de ecrã. */
  aoCriar?: (anuncio: string) => void;
}

interface CamposOrcamentoProps {
  id: string;
  dados: DadosOrcamento;
  erro: ErroOrcamento | null;
  campoValor: Ref<HTMLInputElement>;
  aoMudar: (parcial: Partial<DadosOrcamento>) => void;
}

/** Os três campos do orçamento: valor, descrição e estado. */
function CamposOrcamento({ id, dados, erro, campoValor, aoMudar }: CamposOrcamentoProps) {
  const { t } = useTranslation();
  const opcoes = ESTADOS_ORCAMENTO.map((valor) => ({ value: valor, label: t(`businessGoals.painel.quotes.state.${valor}`) }));
  const comErroValor = erro === "valorVazio" || erro === "valorInvalido" || erro === "valorGrande";
  const comErroDescricao = erro === "descricaoComprida";
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-valor`}>{t(`${A}quote.value`)}</Label>
        <Input
          ref={campoValor} id={`${id}-valor`} value={dados.valor} inputMode="decimal" autoComplete="off"
          aria-invalid={comErroValor ? true : undefined} aria-describedby={`${id}-valor-ajuda${comErroValor ? ` ${id}-valor-erro` : ""}`}
          className={cn("min-h-11", FOCO, comErroValor && "border-destructive")}
          onChange={(e) => aoMudar({ valor: e.target.value })}
        />
        <p id={`${id}-valor-ajuda`} className="text-xs text-muted-foreground">{t(`${A}quote.value.hint`)}</p>
        {comErroValor && <MensagemErro id={`${id}-valor-erro`} texto={t(`${A}quote.error.${erro}`)} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-desc`}>{t(`${A}quote.desc`)}</Label>
        <Input
          id={`${id}-desc`} value={dados.descricao} autoComplete="off" placeholder={t(`${A}quote.desc.placeholder`)}
          aria-invalid={comErroDescricao ? true : undefined} aria-describedby={comErroDescricao ? `${id}-desc-erro` : undefined}
          className={cn("min-h-11", FOCO, comErroDescricao && "border-destructive")}
          onChange={(e) => aoMudar({ descricao: e.target.value })}
        />
        {comErroDescricao && <MensagemErro id={`${id}-desc-erro`} texto={t(`${A}quote.error.descricaoComprida`)} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-estado`}>{t(`${A}quote.state`)}</Label>
        <NativeSelect
          id={`${id}-estado`} value={dados.estado} options={opcoes} className={cn("h-11", FOCO)}
          onValueChange={(v) => aoMudar({ estado: v as EstadoOrcamentoDetalhe })}
        />
      </div>
    </>
  );
}

function FormOrcamento({ negocio, hoje, aoFechar, aoCriar }: Omit<NovoOrcamentoDialogoProps, "negocio"> & { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const id = useId();
  const [dados, setDados] = useState<DadosOrcamento>({ valor: "", descricao: "", estado: "rascunho" });
  const [tentou, setTentou] = useState(false);
  const campoValor = useRef<HTMLInputElement>(null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (validarOrcamento(dados)) { campoValor.current?.focus(); return; }
    const novo = acrescentarOrcamento(negocio, dados, proximaSequenciaOrcamento(), hoje);
    if (!novo) return;
    guardarNegocio(novo.negocio, { id: novo.orcamentoId, detalhe: novo.detalhe });
    toast.success(t(`${A}quote.created`));
    aoCriar?.(t(`${A}quote.announce`, { valor: formatarMeta("euro", lerValor(dados.valor)), name: negocio.pessoa }));
    aoFechar();
  };
  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <CamposOrcamento
        id={id} dados={dados} erro={tentou ? validarOrcamento(dados) : null} campoValor={campoValor}
        aoMudar={(parcial) => setDados((d) => ({ ...d, ...parcial }))}
      />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${A}quote.cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${A}quote.submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

/** O erro de um campo: ícone e texto (a cor não é o único sinal). */
function MensagemErro({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {texto}
    </p>
  );
}

/**
 * "Criar orçamento": um diálogo curto (valor, descrição e estado) que acrescenta o orçamento ao negócio EM MEMÓRIA
 * (`negociosAlterados.ts`), por isso o valor, a cadeia e os totais da página mudam logo. Só exemplo: nada é gravado.
 */
export function NovoOrcamentoDialogo({ negocio, hoje, aoFechar, aoCriar }: NovoOrcamentoDialogoProps) {
  const { t } = useTranslation();
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent className="motion-reduce:!animate-none">
        <DialogHeader>
          <DialogTitle>{t(`${A}quote.title`)}</DialogTitle>
          <DialogDescription>{t(`${A}quote.description`, { name: mostrado?.pessoa ?? "" })}</DialogDescription>
        </DialogHeader>
        {mostrado && <FormOrcamento key={mostrado.id} negocio={mostrado} hoje={hoje} aoFechar={aoFechar} aoCriar={aoCriar} />}
      </DialogContent>
    </Dialog>
  );
}
