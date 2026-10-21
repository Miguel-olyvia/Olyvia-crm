// Editar as condições (terms) da proposta ligada ao negócio: prazo de execução, início previsto, pagamento e garantia, com as mesmas opções e a
// mesma validação do ecrã de enviar proposta (`validarCondicoes`). SEM validade nem notas: já têm coluna própria e esta escrita não lhes toca.
// Espera pela base (estado ocupado, duplo clique), diz o erro traduzido DENTRO do diálogo e só fecha em sucesso. Sem a mutação de guardar
// condições (o exemplo) não desenha nada.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PropostaCondicoes } from "@/components/negocio-metas/costuraNegocio";
import { DialogoDeEnvio, ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha, type MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { GarantiaTermos, PagamentoTermos } from "@/components/negocio-metas/termosProposta";
import type { EnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";
import { MensagemErro } from "./CamposDataHora";
import { GARANTIAS, PAGAMENTOS, validarCondicoes, type CondicoesForm, type ErroCondicao } from "./processo/condicoesProposta";
import { GrupoOpcoesProcesso } from "./processo/GrupoOpcoesProcesso";
import { MarcaObrigatorio } from "./processo/MarcaObrigatorio";

const N = "pessoasPagina.neg.terms.";
const P = "pessoasPagina.proposal.";

/** O fim da chave do texto do erro do início (`proposal.start.error.<fim>`). */
const fimDoErroDeInicio = (erro: ErroCondicao): string => (erro === "obrigatorio" ? "required" : erro === "passado" ? "past" : "invalid");

type Campos = Pick<CondicoesForm, "prazo" | "inicio" | "pagamento" | "garantia">;

/** O formulário abre com as condições da proposta; sem elas, com as escolhas habituais e o prazo e o início por preencher. */
function iniciaisDe(p: PropostaCondicoes): Campos {
  const c = p.condicoes;
  return c
    ? { prazo: String(c.prazo), inicio: c.inicio, pagamento: c.pagamento, garantia: String(c.garantia) }
    : { prazo: "", inicio: "", pagamento: "metade", garantia: "2" };
}

interface FormProps {
  negocio: NegocioMes;
  proposta: PropostaCondicoes;
  hoje: string;
  guardar: NonNullable<MutacoesNegocio["guardarCondicoes"]>;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoGuardado: (anuncio: string) => void;
}

function Formulario({ negocio, proposta, hoje, guardar, envio, aoFechar, aoGuardado }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const iniciais = useRef(iniciaisDe(proposta)).current;
  const [form, setForm] = useState<Campos>(iniciais);
  const [tentou, setTentou] = useState(false);
  const campoPrazo = useRef<HTMLInputElement>(null);
  const campoInicio = useRef<HTMLInputElement>(null);
  const mudar = (parcial: Partial<Campos>) => setForm((f) => ({ ...f, ...parcial }));
  // Só os quatro campos que se editam aqui (a validade e as notas vão com os valores neutros e os seus erros ignoram-se).
  const erros = validarCondicoes({ ...form, validade: "30", notas: "" }, hoje);
  // Um início que já lá estava e entretanto passou não bloqueia guardar outra condição.
  const erroInicio = erros.inicio === "passado" && form.inicio === iniciais.inicio ? undefined : erros.inicio;
  const mostrarPrazo = tentou && erros.prazo !== undefined;
  const mostrarInicio = tentou && erroInicio !== undefined;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    if (erros.prazo) { campoPrazo.current?.focus(); return; }
    if (erroInicio) { campoInicio.current?.focus(); return; }
    if (erros.pagamento || erros.garantia) return;
    envio.enviar(
      () => guardar(negocio.id, proposta.id, {
        prazo: Number(form.prazo.trim()), inicio: form.inicio, pagamento: form.pagamento as PagamentoTermos, garantia: Number(form.garantia) as GarantiaTermos,
      }),
      () => { aoFechar(); aoGuardado(t(`${N}done`, { name: negocio.pessoa })); },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {!proposta.legivel && <p className="text-sm text-muted-foreground">{t(`${N}dialog.unreadable`)}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-baseline">
            <Label htmlFor={`${id}-prazo`}>{t(`${P}duration`)}</Label>
            <MarcaObrigatorio />
          </div>
          <Input
            ref={campoPrazo} id={`${id}-prazo`} value={form.prazo} inputMode="numeric" autoComplete="off" aria-required="true"
            aria-invalid={mostrarPrazo || undefined} aria-describedby={`${id}-prazo-ajuda${mostrarPrazo ? ` ${id}-prazo-erro` : ""}`}
            className={cn("min-h-11", FOCO, mostrarPrazo && "border-destructive")} onChange={(e) => mudar({ prazo: e.target.value })}
          />
          <p id={`${id}-prazo-ajuda`} className="text-xs text-muted-foreground">{t(`${P}duration.hint`)}</p>
          {mostrarPrazo && <MensagemErro id={`${id}-prazo-erro`} texto={t(`${P}duration.error`)} />}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline">
            <Label htmlFor={`${id}-inicio`}>{t(`${P}start`)}</Label>
            <MarcaObrigatorio />
          </div>
          {/* `dark:[color-scheme:dark]`: no tema escuro o calendário e o ícone nativos do seletor também ficam escuros (só neste controlo). */}
          <Input
            ref={campoInicio} id={`${id}-inicio`} type="date" value={form.inicio} aria-required="true" aria-invalid={mostrarInicio || undefined}
            aria-describedby={mostrarInicio ? `${id}-inicio-erro` : undefined}
            className={cn("min-h-11 dark:[color-scheme:dark]", FOCO, mostrarInicio && "border-destructive")} onChange={(e) => mudar({ inicio: e.target.value })}
          />
          {mostrarInicio && erroInicio && <MensagemErro id={`${id}-inicio-erro`} texto={t(`${P}start.error.${fimDoErroDeInicio(erroInicio)}`)} />}
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
      <ErroDeEnvio chave={envio.erro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${N}cancel`)}
        </Button>
        <Button type="submit" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {t(`${N}submit`)}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface CondicoesPropostaDialogoProps {
  /** O negócio e a proposta a editar; `null` = fechado. */
  alvo: { negocio: NegocioMes; proposta: PropostaCondicoes } | null;
  hoje: string;
  aoFechar: () => void;
  /** Depois de gravar: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoGuardado: (anuncio: string) => void;
}

export function CondicoesPropostaDialogo({ alvo, hoje, aoFechar, aoGuardado }: CondicoesPropostaDialogoProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  // Ao fechar, o diálogo sai com o texto que tinha (não esvazia durante a animação).
  const ultimo = useRef(alvo);
  if (alvo) ultimo.current = alvo;
  const mostrado = alvo ?? ultimo.current;
  const guardar = mutacoes?.guardarCondicoes;
  if (!guardar || !mostrado) return null;
  const { negocio, proposta } = mostrado;
  return (
    <DialogoDeEnvio
      aberto={alvo !== null} aoFechar={aoFechar} titulo={t(`${N}dialog.title`)}
      descricao={t(`${N}dialog.description`, { name: negocio.pessoa, work: negocio.servico })}
    >
      {(envio) => (
        <Formulario key={proposta.id} negocio={negocio} proposta={proposta} hoje={hoje} guardar={guardar} envio={envio} aoFechar={aoFechar} aoGuardado={aoGuardado} />
      )}
    </DialogoDeEnvio>
  );
}
