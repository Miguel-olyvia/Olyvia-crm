import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { MAX_NOTA_VISITA } from "@/components/pessoas/visitaPessoa";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErroDoCampo, ITEM, N, Rotulo } from "./PecasNovoNegocio";
import { PerguntaEscolha } from "./PerguntaEscolha";
import { FOCO } from "./estilos";
import type { EstadoVisitaNegocio, VisitaNegocio } from "./negocioMetas";
import { CHAVES_MORADA, MAX_ANDAR, MAX_LOCALIDADE, MAX_RUA, type ChaveMorada } from "./moradaObra";
import { COMERCIAIS_EXEMPLO } from "./novoNegocio";
import { PERGUNTA_DURACAO_VISITA, PERGUNTA_PRESENTES_VISITA, PERGUNTA_TIPO_VISITA } from "./visitaExemplo";
import { ESTADOS_VISITA } from "./visitasNegocio";

interface Props {
  /** A base dos ids da visita: os dos campos são `<base>-<campo>`. */
  base: string;
  visita: VisitaNegocio;
  aoMudar: (parcial: Partial<VisitaNegocio>) => void;
  /** Os estados a oferecer (por omissão todos); uma visita que já existe na base não os tem todos (ver `estadosPermitidos`). */
  estados?: readonly EstadoVisitaNegocio[];
  /** O código postal da morada da visita está fora do formato 0000-000 (depois de tentar guardar). */
  erroCodigoPostal?: boolean;
  /** Os campos só se leem (uma visita da base já feita ou cancelada): ficam desativados. */
  somenteLeitura?: boolean;
}

const CAMPO = cn("min-h-11", FOCO);
const ROTULO_MORADA: Record<ChaveMorada, string> = { rua: "address.street", codigoPostal: "address.postal", localidade: "address.city", andar: "address.unit" };
const ID_MORADA: Record<ChaveMorada, string> = { rua: "rua", codigoPostal: "cp", localidade: "localidade", andar: "andar" };
// Os limites da base nos textos da morada da visita (o código postal tem o formato 0000-000, oito caracteres).
const LIMITE_MORADA: Record<ChaveMorada, number> = { rua: MAX_RUA, codigoPostal: 8, localidade: MAX_LOCALIDADE, andar: MAX_ANDAR };

/** Data, hora, quem fez e estado de uma visita. */
function DadosBase({ base, visita, aoMudar, estados = ESTADOS_VISITA }: Props) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Rotulo para={`${base}-data`} texto={t(`${N}visits.date`)} />
        <Input id={`${base}-data`} type="date" value={visita.data} className={CAMPO} onChange={(e) => aoMudar({ data: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Rotulo para={`${base}-hora`} texto={t(`${N}visits.time`)} />
        <Input id={`${base}-hora`} type="time" value={visita.hora} className={CAMPO} onChange={(e) => aoMudar({ hora: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Rotulo para={`${base}-feitoPor`} texto={t(`${N}visits.by`)} />
        <Select value={visita.feitoPor} onValueChange={(feitoPor) => aoMudar({ feitoPor })}>
          <SelectTrigger id={`${base}-feitoPor`} className={CAMPO}><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMERCIAIS_EXEMPLO.map((c) => <SelectItem key={c} value={c} className={ITEM}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Rotulo para={`${base}-estado`} texto={t(`${N}visits.status`)} />
        <Select value={visita.estado} onValueChange={(estado) => aoMudar({ estado: estado as VisitaNegocio["estado"] })}>
          <SelectTrigger id={`${base}-estado`} className={CAMPO}><SelectValue /></SelectTrigger>
          <SelectContent>
            {estados.map((e) => <SelectItem key={e} value={e} className={ITEM}>{t(`${N}visits.status.${e}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** A morada da visita: os quatro campos; ao escrever, a visita deixa de ter a origem "igual à da lead" (fica "escrita à mão"). */
function MoradaDaVisita({ base, visita, aoMudar, erroCodigoPostal }: Pick<Props, "base" | "visita" | "aoMudar" | "erroCodigoPostal">) {
  const { t } = useTranslation();
  const mudar = (chave: ChaveMorada, valor: string) => aoMudar({ morada: { ...visita.morada, [chave]: valor }, igualALead: null });
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">{t(`${N}visits.address.title`)}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CHAVES_MORADA.map((chave) => {
          const invalido = chave === "codigoPostal" && erroCodigoPostal === true;
          const id = `${base}-${ID_MORADA[chave]}`;
          return (
            <div key={chave} className={cn("space-y-1.5", chave === "rua" && "sm:col-span-2")}>
              <Rotulo para={id} texto={t(`${N}${ROTULO_MORADA[chave]}`)} />
              <Input
                id={id} value={visita.morada[chave]} className={cn(CAMPO, invalido && "border-destructive")} autoComplete="off" maxLength={LIMITE_MORADA[chave]}
                placeholder={chave === "codigoPostal" ? t(`${N}address.postal.placeholder`) : undefined} inputMode={chave === "codigoPostal" ? "numeric" : undefined}
                aria-invalid={invalido ? true : undefined} aria-describedby={invalido ? `${id}-erro` : undefined}
                onChange={(e) => mudar(chave, e.target.value)}
              />
              {invalido && <ErroDoCampo id={`${id}-erro`} chave="error.postal.invalido" />}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Os campos de uma visita: dados, tipo, quem vai estar, duração, morada e nota. O tipo escolhe-se sempre; os outros podem ficar por indicar.
 * Uma visita da base já feita ou cancelada só se lê: o `fieldset` desativa tudo de uma vez (campos, listas e opções).
 */
export function CamposVisita({ base, visita, aoMudar, estados, erroCodigoPostal, somenteLeitura = false }: Props) {
  const { t } = useTranslation();
  const alternar = (campo: "quemVaiEstar" | "duracao") => (opcao: string) => aoMudar({ [campo]: visita[campo] === opcao ? "" : opcao });
  return (
    <fieldset disabled={somenteLeitura} className="m-0 min-w-0 space-y-4 border-0 p-0">
      <DadosBase base={base} visita={visita} aoMudar={aoMudar} estados={estados} />
      <PerguntaEscolha pergunta={PERGUNTA_TIPO_VISITA} valor={visita.tipo} aoEscolher={(tipo) => aoMudar({ tipo: tipo as VisitaNegocio["tipo"] })} />
      <PerguntaEscolha pergunta={PERGUNTA_PRESENTES_VISITA} valor={visita.quemVaiEstar || undefined} aoEscolher={alternar("quemVaiEstar")} />
      <PerguntaEscolha pergunta={PERGUNTA_DURACAO_VISITA} valor={visita.duracao || undefined} aoEscolher={alternar("duracao")} />
      <MoradaDaVisita base={base} visita={visita} aoMudar={aoMudar} erroCodigoPostal={erroCodigoPostal} />
      <div className="space-y-1.5">
        <Rotulo para={`${base}-nota`} texto={t(`${N}visits.note`)} />
        <Input id={`${base}-nota`} value={visita.nota} maxLength={MAX_NOTA_VISITA} autoComplete="off" className={CAMPO} onChange={(e) => aoMudar({ nota: e.target.value })} />
      </div>
    </fieldset>
  );
}
