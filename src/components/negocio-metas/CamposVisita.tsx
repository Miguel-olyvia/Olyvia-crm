import { MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ITEM, N, Rotulo } from "./PecasNovoNegocio";
import { PerguntaEscolha } from "./PerguntaEscolha";
import { FOCO } from "./estilos";
import type { VisitaNegocio } from "./negocioMetas";
import { CHAVES_MORADA, type ChaveMorada } from "./moradaObra";
import { COMERCIAIS_EXEMPLO } from "./novoNegocio";
import { PERGUNTA_DURACAO_VISITA, PERGUNTA_PRESENTES_VISITA, PERGUNTA_TIPO_VISITA } from "./visitaExemplo";
import { ESTADOS_VISITA } from "./visitasNegocio";

interface Props {
  /** A base dos ids da visita: os dos campos são `<base>-<campo>`. */
  base: string;
  visita: VisitaNegocio;
  aoMudar: (parcial: Partial<VisitaNegocio>) => void;
}

const CAMPO = cn("min-h-11", FOCO);
const ROTULO_MORADA: Record<ChaveMorada, string> = { rua: "address.street", codigoPostal: "address.postal", localidade: "address.city", andar: "address.unit" };
const ID_MORADA: Record<ChaveMorada, string> = { rua: "rua", codigoPostal: "cp", localidade: "localidade", andar: "andar" };

/** Data, hora, quem fez e estado de uma visita. */
function DadosBase({ base, visita, aoMudar }: Props) {
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
            {ESTADOS_VISITA.map((e) => <SelectItem key={e} value={e} className={ITEM}>{t(`${N}visits.status.${e}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** A morada da visita: os quatro campos; ao escrever, deixa de se dizer que veio da lead (fica "escrita à mão"). */
function MoradaDaVisita({ base, visita, aoMudar }: Props) {
  const { t } = useTranslation();
  const origem = visita.veioDaPessoa && visita.igualALead !== null ? (visita.igualALead ? "same" : "other") : null;
  const mudar = (chave: ChaveMorada, valor: string) => aoMudar({ morada: { ...visita.morada, [chave]: valor }, igualALead: null });
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">{t(`${N}visits.address.title`)}</legend>
      {origem && (
        <p role="note" className="flex items-start gap-2 text-sm text-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`${N}visits.address.${origem}`)}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CHAVES_MORADA.map((chave) => (
          <div key={chave} className={cn("space-y-1.5", chave === "rua" && "sm:col-span-2")}>
            <Rotulo para={`${base}-${ID_MORADA[chave]}`} texto={t(`${N}${ROTULO_MORADA[chave]}`)} />
            <Input
              id={`${base}-${ID_MORADA[chave]}`} value={visita.morada[chave]} className={CAMPO} autoComplete="off"
              placeholder={chave === "codigoPostal" ? t(`${N}address.postal.placeholder`) : undefined}
              onChange={(e) => mudar(chave, e.target.value)}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Os campos de uma visita: dados, tipo, quem vai estar, duração, morada e nota. O tipo escolhe-se sempre; os outros podem ficar por indicar. */
export function CamposVisita({ base, visita, aoMudar }: Props) {
  const { t } = useTranslation();
  const alternar = (campo: "quemVaiEstar" | "duracao") => (opcao: string) => aoMudar({ [campo]: visita[campo] === opcao ? "" : opcao });
  return (
    <div className="space-y-4">
      <DadosBase base={base} visita={visita} aoMudar={aoMudar} />
      <PerguntaEscolha pergunta={PERGUNTA_TIPO_VISITA} valor={visita.tipo} aoEscolher={(tipo) => aoMudar({ tipo: tipo as VisitaNegocio["tipo"] })} />
      <PerguntaEscolha pergunta={PERGUNTA_PRESENTES_VISITA} valor={visita.quemVaiEstar || undefined} aoEscolher={alternar("quemVaiEstar")} />
      <PerguntaEscolha pergunta={PERGUNTA_DURACAO_VISITA} valor={visita.duracao || undefined} aoEscolher={alternar("duracao")} />
      <MoradaDaVisita base={base} visita={visita} aoMudar={aoMudar} />
      <div className="space-y-1.5">
        <Rotulo para={`${base}-nota`} texto={t(`${N}visits.note`)} />
        <Input id={`${base}-nota`} value={visita.nota} maxLength={200} autoComplete="off" className={CAMPO} onChange={(e) => aoMudar({ nota: e.target.value })} />
      </div>
    </div>
  );
}
