// O conteúdo de cada passo da fase Contacto do assistente (só apresentação, tudo chega por props): Chamada, Qualificação, Morada da obra, Preparar a
// visita e Marcar a visita. Aproveitam-se os CAMPOS que já existem (as perguntas do questionário, os campos da morada), nunca o aspeto dos painéis
// antigos: o desenho é o do assistente. Um passo que grava no negócio, sem negócio, mostra a razão e o botão «Criar o negócio» (`SemNegocio`).
import { useId, type ReactNode } from "react";
import { Check, Phone } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/negocio-metas/estilos";
import { EstadoQuestionarioVivo } from "@/components/negocio-metas/EstadoQuestionario";
import { MoradaObra } from "@/components/negocio-metas/CamposMoradaObra";
import { PedidoDoCliente } from "@/components/negocio-metas/AbaQualificacao";
import { BlocosPerguntas } from "@/components/negocio-metas/PerguntaEscolha";
import type { EstadoDoQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import type { ChaveMorada, MoradaObraForm, OrigemMoradaObra } from "@/components/negocio-metas/moradaObra";
import type { BlocoDef, Respostas } from "@/components/negocio-metas/perguntasTipos";
import type { ErroResposta } from "@/components/negocio-metas/respostasQuestionario";
import { contarRespostas } from "@/components/negocio-metas/respostasVisita";
import { CONTACTOS_PREFERIDOS, HORAS_PREFERIDAS, opcoesDeLingua, LINGUAS_GRAVAVEIS } from "@/hooks/pessoas/useGuardarContactoPessoa";
import type { FormularioContacto } from "@/components/pessoas-lista/contactoFormulario";
import type { ContactoPreferido, HoraPreferida } from "../pessoasTipos";
import { GrupoQuemPede, type CampoQuemPede, type QuemPedeProps } from "./GrupoQuemPede";
import { DURACOES_PREPARAR, QUEM_VAI_ESTAR, type PrepararVisita } from "./rascunhoAssistente";

const A = "pessoasPagina.assistente.";
const C = "pessoasPagina.real.ficha.contact.";
const V = "pessoasPagina.real.visit.agenda.";
const N = "businessGoals.new.";
/** O limite da nota para a visita (o da agenda). */
const MAX_NOTA = 140;
const CAMPO = cn("min-h-11 w-full rounded-md border border-input bg-background px-3 text-[15px] text-foreground", FOCO);

function Ajuda({ children }: { children: ReactNode }) {
  return <p className="text-base text-muted-foreground">{children}</p>;
}

/** O passo precisa do negócio e a pessoa ainda não tem um: a razão em texto e o botão que cria (a ponte até o negócio nascer com a pessoa). */
export function SemNegocio({ aoCriar }: { aoCriar?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
      <p className="text-base text-foreground">{t(`${A}semNegocio`)}</p>
      {aoCriar && (
        <Button type="button" className={cn("min-h-11", FOCO)} onClick={aoCriar}>{t("pessoasPagina.todo.step.criarNegocio")}</Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Chamada

interface CorpoChamadaProps {
  chamadas: number;
  form: FormularioContacto;
  aoMudar: (parcial: Partial<FormularioContacto>) => void;
  podeEditar: boolean;
  /** O campo com erro (o formato, ou um contacto repetido), ligado por aria-invalid. */
  erroCampo: "email" | "telefone" | CampoQuemPede | null;
  aoRegistar: (origem: HTMLElement) => void;
  podeRegistar: boolean;
  /** O grupo «Quem pede» (tipo de cliente e NIF) por baixo do contacto; sem isto não aparece. */
  quemPede?: Omit<QuemPedeProps, "podeEditar" | "erroCampo">;
}

export function CorpoChamada({ chamadas, form, aoMudar, podeEditar, erroCampo, aoRegistar, podeRegistar, quemPede }: CorpoChamadaProps) {
  const { t } = useTranslation();
  const id = useId();
  const linguas = opcoesDeLingua(form.lingua);
  const estado = chamadas === 0 ? t(`${A}chamada.nenhuma`) : t(`${A}chamada.${chamadas === 1 ? "uma" : "varias"}`, { n: chamadas });
  return (
    <div className="space-y-5">
      <Ajuda>{t(`${A}chamada.ajuda`)}</Ajuda>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <p className="flex-1 text-base text-foreground">{estado}</p>
        {podeRegistar && (
          <Button type="button" className={cn("min-h-11", FOCO)} onClick={(e) => aoRegistar(e.currentTarget)}>{t(`${A}chamada.registar`)}</Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-telefone`}>{t(`${C}phone`)}</Label>
          <Input
            id={`${id}-telefone`} type="tel" inputMode="tel" autoComplete="off" maxLength={30} className={cn("min-h-11", FOCO)} value={form.telefone}
            readOnly={!podeEditar} aria-invalid={erroCampo === "telefone" ? true : undefined} onChange={(e) => aoMudar({ telefone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-email`}>{t(`${C}email`)}</Label>
          <Input
            id={`${id}-email`} type="email" autoComplete="off" maxLength={254} className={cn("min-h-11", FOCO)} value={form.email}
            readOnly={!podeEditar} aria-invalid={erroCampo === "email" ? true : undefined} onChange={(e) => aoMudar({ email: e.target.value })}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t(`${C}hint`)}</p>
      {quemPede && <GrupoQuemPede {...quemPede} podeEditar={podeEditar} erroCampo={erroCampo} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-preferido`}>{t(`${C}preferred`)}</Label>
          <select id={`${id}-preferido`} className={CAMPO} value={form.contacto} disabled={!podeEditar} onChange={(e) => aoMudar({ contacto: e.target.value as ContactoPreferido | "" })}>
            <option value="">{t(`${C}preferred.none`)}</option>
            {CONTACTOS_PREFERIDOS.map((c) => <option key={c} value={c}>{t(`${C}preferred.${c}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-hora`}>{t(`${C}time`)}</Label>
          <select id={`${id}-hora`} className={CAMPO} value={form.hora} disabled={!podeEditar} onChange={(e) => aoMudar({ hora: e.target.value as HoraPreferida | "" })}>
            <option value="">{t(`${C}time.none`)}</option>
            {HORAS_PREFERIDAS.map((h) => <option key={h} value={h}>{t(`${C}time.${h}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-lingua`}>{t(`${C}language`)}</Label>
          <select id={`${id}-lingua`} className={CAMPO} value={form.lingua} disabled={!podeEditar} onChange={(e) => aoMudar({ lingua: e.target.value })}>
            <option value="">{t(`${C}notSet`)}</option>
            {linguas.map((l) => <option key={l} value={l}>{LINGUAS_GRAVAVEIS.includes(l) ? t(`${C}language.${l}`) : l}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Qualificação

interface CorpoQualificacaoProps {
  blocos: readonly BlocoDef[];
  respostas: Respostas;
  aoEscolher: (pergunta: string, opcao: string) => void;
  aoEscrever: (pergunta: string, valor: string) => void;
  erros: Readonly<Record<string, ErroResposta>>;
  pedido: string;
  aoMudarPedido: (valor: string) => void;
  estado: EstadoDoQuestionario;
  aoRepetir: () => void;
}

export function CorpoQualificacao({ blocos, respostas, aoEscolher, aoEscrever, erros, pedido, aoMudarPedido, estado, aoRepetir }: CorpoQualificacaoProps) {
  const { t } = useTranslation();
  const id = useId();
  const { respondidas, total } = contarRespostas(blocos, respostas);
  return (
    <div className="space-y-6">
      <Ajuda>{t(`${A}qualificacao.ajuda`)}</Ajuda>
      <EstadoQuestionarioVivo estado={estado} aoRepetir={aoRepetir} />
      {estado === "pronto" && blocos.length === 0 && <p role="note" className="text-sm text-muted-foreground">{t(`${N}qform.qualEmpty`)}</p>}
      {estado === "pronto" && blocos.length > 0 && (
        <section className="space-y-4">
          <p className="text-sm tabular-nums text-muted-foreground">{t(`${N}answered`, { n: respondidas, m: total })}</p>
          <BlocosPerguntas blocos={blocos} respostas={respostas} aoEscolher={aoEscolher} aoEscrever={aoEscrever} erros={erros} />
        </section>
      )}
      <PedidoDoCliente id={id} valor={pedido} aoMudar={aoMudarPedido} />
    </div>
  );
}

// ---------------------------------------------------------------- Morada da obra

interface CorpoMoradaProps {
  morada: MoradaObraForm;
  origem: OrigemMoradaObra | null;
  aoMudar: (chave: ChaveMorada, valor: string) => void;
  aoPreencherDe: (morada: MoradaObraForm, origem: OrigemMoradaObra) => void;
  /** A morada da entidade (a da pessoa) para o atalho; `null` se não tem. */
  moradaEntidade: MoradaObraForm | null;
  erroCodigoPostal: boolean;
}

export function CorpoMorada({ morada, origem, aoMudar, aoPreencherDe, moradaEntidade, erroCodigoPostal }: CorpoMoradaProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-4">
      <Ajuda>{t(`${A}morada.ajuda`)}</Ajuda>
      <MoradaObra
        id={id} valores={morada} erroCodigoPostal={erroCodigoPostal} moradaContacto="" origem={null} origemObra={origem} semTitulo
        aoMudar={aoMudar} aoPreencher={(m) => aoPreencherDe(m, "manual")} real={{ moradaEntidade, aoPreencherDe }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Preparar a visita

function Escolhas({ legendaChave, opcoes, valor, rotulo, aoEscolher }: {
  legendaChave: string; opcoes: readonly string[]; valor: string; rotulo: (opcao: string) => string; aoEscolher: (opcao: string) => void;
}) {
  const { t } = useTranslation();
  const idLegenda = useId();
  return (
    <div className="space-y-2">
      <p id={idLegenda} className="text-sm font-semibold text-foreground">{t(legendaChave)}</p>
      <div role="group" aria-labelledby={idLegenda} className="flex flex-wrap gap-2">
        {opcoes.map((opcao) => {
          const ligado = valor === opcao;
          return (
            <button
              key={opcao} type="button" aria-pressed={ligado} onClick={() => aoEscolher(ligado ? "" : opcao)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-[15px] transition-colors motion-reduce:transition-none", FOCO,
                ligado ? "border-primary bg-primary/10 font-medium text-foreground ring-1 ring-primary" : "border-input bg-background text-foreground hover:bg-accent",
              )}
            >
              {ligado && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {rotulo(opcao)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CorpoPreparar({ valor, aoMudar }: { valor: PrepararVisita; aoMudar: (parcial: Partial<PrepararVisita>) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-5">
      <Ajuda>{t(`${A}preparar.ajuda`)}</Ajuda>
      <Escolhas
        legendaChave={`${A}preparar.duracao`} opcoes={DURACOES_PREPARAR} valor={valor.duracao} rotulo={(o) => t(`${V}duration.${o}`)}
        aoEscolher={(duracao) => aoMudar({ duracao })}
      />
      <Escolhas
        legendaChave={`${A}preparar.quem`} opcoes={QUEM_VAI_ESTAR} valor={valor.quem} rotulo={(o) => t(`${V}present.${o}`)}
        aoEscolher={(quem) => aoMudar({ quem })}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>{t(`${A}preparar.nota`)}</Label>
        <Textarea
          id={`${id}-nota`} value={valor.nota} rows={3} maxLength={MAX_NOTA} aria-describedby={`${id}-nota-contador`} className={cn("min-h-20", FOCO)}
          onChange={(e) => aoMudar({ nota: e.target.value })}
        />
        <p id={`${id}-nota-contador`} className="text-right text-sm tabular-nums text-muted-foreground">
          {t(`${A}preparar.contador`, { n: valor.nota.length, max: MAX_NOTA })}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Marcar a visita

interface CorpoMarcarProps {
  preparar: PrepararVisita;
  /** Já há uma visita marcada. */
  marcada: boolean;
  aoMarcar: (origem: HTMLElement) => void;
  podeMarcar: boolean;
  /** Uma razão que trava a marcação (a última chamada foi «Sem interesse» ou «Número errado»): o botão fica desativado e a razão diz-se em texto. */
  razaoBloqueio?: string;
}

export function CorpoMarcar({ preparar, marcada, aoMarcar, podeMarcar, razaoBloqueio }: CorpoMarcarProps) {
  const { t } = useTranslation();
  const idRazao = useId();
  const partes = [
    preparar.duracao ? t(`${V}duration.${preparar.duracao}`) : "",
    preparar.quem ? t(`${V}present.${preparar.quem}`) : "",
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      <Ajuda>{t(`${A}marcar.ajuda`)}</Ajuda>
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-base text-foreground">
        {partes.length > 0 ? t(`${A}marcar.preparada`, { dados: partes.join(" · ") }) : t(`${A}marcar.semPreparar`)}
      </p>
      {marcada && <p className="text-base font-medium text-foreground">{t(`${A}marcar.jaMarcada`)}</p>}
      {podeMarcar && (
        <Button
          type="button" className={cn("min-h-11", FOCO, razaoBloqueio && "opacity-60")} aria-disabled={razaoBloqueio ? true : undefined}
          aria-describedby={razaoBloqueio ? idRazao : undefined} onClick={(e) => { if (!razaoBloqueio) aoMarcar(e.currentTarget); }}
        >
          {t(`${A}marcar.botao`)}
        </Button>
      )}
      {razaoBloqueio && <p id={idRazao} className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">{razaoBloqueio}</p>}
    </div>
  );
}
