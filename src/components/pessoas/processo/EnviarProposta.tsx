// "Enviar a proposta": as condições (validade, prazo de execução, início previsto, pagamento, garantia e notas) pedidas antes de o
// negócio passar a Proposta. Só exemplo: nada sai da página. Montado uma vez, ao nível da página, pelo `ProcessoProvider`.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "../CamposDataHora";
import { useAvisoAlternado } from "./avisoAlternado";
import {
  GARANTIAS, MAX_NOTAS_PROPOSTA, PAGAMENTOS, VALIDADES, validarCondicoes, type CondicoesForm, type ErroCondicao,
} from "./condicoesProposta";
import { eur } from "./formatoOrcamento";
import { GrupoOpcoesProcesso } from "./GrupoOpcoesProcesso";
import { MarcaObrigatorio } from "./MarcaObrigatorio";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";

const P = "pessoasPagina.proposal.";

/** O fim da chave do texto do erro do início (`proposal.start.error.<fim>`). */
const fimDoErroDeInicio = (erro: ErroCondicao): string => (erro === "obrigatorio" ? "required" : erro === "passado" ? "past" : "invalid");

interface FormProps {
  hoje: string;
  iniciais: CondicoesForm;
  aoEnviar: (condicoes: CondicoesForm) => FaltaProcesso[];
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
}

function Formulario({ hoje, iniciais, aoEnviar, explicar, aoFechar }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const alternar = useAvisoAlternado();
  const [form, setForm] = useState(iniciais);
  const [tentou, setTentou] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const prazo = useRef<HTMLInputElement>(null);
  const inicio = useRef<HTMLInputElement>(null);
  const notas = useRef<HTMLTextAreaElement>(null);
  const erros = validarCondicoes(form, hoje);
  const mudar = (parcial: Partial<CondicoesForm>) => setForm((f) => ({ ...f, ...parcial }));
  const erroDoPrazo = tentou && erros.prazo !== undefined;
  const erroDoInicio = tentou && erros.inicio !== undefined;
  const erroDasNotas = tentou && erros.notas !== undefined;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (erros.prazo) { prazo.current?.focus(); return; }
    if (erros.inicio) { inicio.current?.focus(); return; }
    if (erros.notas) { notas.current?.focus(); return; }
    const faltas = aoEnviar(form);
    // O motivo diz-se DENTRO do diálogo (alerta): a região live da página fica fora do modal. Alterna um espaço inseparável para repetir.
    setMotivo(faltas.length > 0 ? alternar(explicar(faltas)) : null);
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <GrupoOpcoesProcesso
        legenda={t(`${P}validity`)} valor={form.validade} aoMudar={(validade) => mudar({ validade })}
        opcoes={VALIDADES.map((d) => ({ valor: String(d), rotulo: t(`${P}validity.option`, { days: d }) }))}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-baseline">
            <Label htmlFor={`${id}-prazo`}>{t(`${P}duration`)}</Label>
            <MarcaObrigatorio />
          </div>
          <Input
            ref={prazo} id={`${id}-prazo`} value={form.prazo} inputMode="numeric" autoComplete="off" aria-required="true" aria-invalid={erroDoPrazo || undefined}
            aria-describedby={`${id}-prazo-ajuda${erroDoPrazo ? ` ${id}-prazo-erro` : ""}`} className={cn("min-h-11", FOCO, erroDoPrazo && "border-destructive")}
            onChange={(e) => mudar({ prazo: e.target.value })}
          />
          <p id={`${id}-prazo-ajuda`} className="text-xs text-muted-foreground">{t(`${P}duration.hint`)}</p>
          {erroDoPrazo && <MensagemErro id={`${id}-prazo-erro`} texto={t(`${P}duration.error`)} />}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline">
            <Label htmlFor={`${id}-inicio`}>{t(`${P}start`)}</Label>
            <MarcaObrigatorio />
          </div>
          {/* `dark:[color-scheme:dark]`: no tema escuro o calendário e o ícone nativos do seletor também ficam escuros (só neste controlo). */}
          <Input
            ref={inicio} id={`${id}-inicio`} type="date" min={hoje} value={form.inicio} aria-required="true" aria-invalid={erroDoInicio || undefined}
            aria-describedby={erroDoInicio ? `${id}-inicio-erro` : undefined}
            className={cn("min-h-11 dark:[color-scheme:dark]", FOCO, erroDoInicio && "border-destructive")}
            onChange={(e) => mudar({ inicio: e.target.value })}
          />
          {erroDoInicio && erros.inicio && <MensagemErro id={`${id}-inicio-erro`} texto={t(`${P}start.error.${fimDoErroDeInicio(erros.inicio)}`)} />}
        </div>
      </div>
      <GrupoOpcoesProcesso
        legenda={t(`${P}payment`)} valor={form.pagamento} aoMudar={(pagamento) => mudar({ pagamento })}
        opcoes={PAGAMENTOS.map((p) => ({ valor: p, rotulo: t(`${P}payment.${p}`) }))}
      />
      <GrupoOpcoesProcesso
        legenda={t(`${P}warranty`)} valor={form.garantia} aoMudar={(garantia) => mudar({ garantia })}
        opcoes={GARANTIAS.map((anos) => ({ valor: String(anos), rotulo: anos === 1 ? t(`${P}warranty.one`) : t(`${P}warranty.many`, { years: anos }) }))}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notas`}>{t(`${P}notes`)}</Label>
        <Textarea
          ref={notas} id={`${id}-notas`} value={form.notas} rows={3} className={cn("min-h-0", FOCO)} aria-invalid={erroDasNotas || undefined}
          aria-describedby={`${id}-contagem${erroDasNotas ? ` ${id}-notas-erro` : ""}`} onChange={(e) => mudar({ notas: e.target.value })}
        />
        <p id={`${id}-contagem`} className="text-right text-xs tabular-nums text-muted-foreground">
          {t(`${P}notes.count`, { count: form.notas.length, max: MAX_NOTAS_PROPOSTA })}
        </p>
        {erroDasNotas && <MensagemErro id={`${id}-notas-erro`} texto={t(`${P}notes.error`, { max: MAX_NOTAS_PROPOSTA })} />}
      </div>
      {motivo !== null && <MensagemErro id={`${id}-motivo`} texto={motivo} />}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${P}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${P}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

interface EnviarPropostaProps {
  /** O negócio cuja proposta se envia; `null` com o diálogo fechado. */
  negocio: NegocioDoPasso | null;
  /** O total do orçamento, com IVA. */
  total: number;
  hoje: string;
  /** As condições com que o formulário abre (os valores habituais e o prazo sugerido). */
  iniciais: CondicoesForm;
  /** Envia a proposta; devolve o que falta (vazio = enviou, e quem chama fecha o diálogo). */
  aoEnviar: (condicoes: CondicoesForm) => FaltaProcesso[];
  /** O texto de "o que falta" de um portão, já traduzido (o diálogo di-lo num alerta). */
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function EnviarProposta({ negocio, total, hoje, iniciais, aoEnviar, explicar, aoFechar, aoDevolverFoco }: EnviarPropostaProps) {
  const { t } = useTranslation();
  const ultimo = useRef(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent hideClose className="max-w-xl motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t(`${P}title`, { work: mostrado?.trabalho ?? "" })}</DialogTitle>
          <DialogDescription>{t(`${P}description`, { name: mostrado?.nome ?? "", total: eur(total) })}</DialogDescription>
        </DialogHeader>
        {mostrado && <Formulario key={mostrado.id} hoje={hoje} iniciais={iniciais} aoEnviar={aoEnviar} explicar={explicar} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
