import { useRef, useState } from "react";
import { Home, Loader2, LocateFixed, MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroDoCampo, N, Rotulo } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import { ErroLocalizacao, obterMoradaDoLocal, type MoradaDoLocal } from "@/hooks/pessoas/localizacaoMorada";
import { MAX_ANDAR, MAX_LOCALIDADE, MAX_RUA, moradaDoContacto, type ChaveMorada, type MoradaObraForm, type OrigemMoradaObra } from "./moradaObra";
import type { OrigemMorada } from "./useEstadoNovoNegocio";

interface Props {
  /** A base dos ids dos campos (`<id>-rua`, `<id>-cp`, `<id>-localidade`, `<id>-andar`). */
  id: string;
  valores: MoradaObraForm;
  /** Há erro no código postal (o formato). */
  erroCodigoPostal: boolean;
  /** A morada escrita na aba Geral, para o atalho "Usar a morada do contacto". */
  moradaContacto: string;
  /** Preenchida a partir da visita (igual à morada da lead ou outra): diz-se em texto. `null` = escrita à mão. */
  origem?: OrigemMorada;
  aoMudar: (chave: ChaveMorada, valor: string) => void;
  aoPreencher: (morada: MoradaObraForm) => void;
  /** De onde veio a morada de agora (só o negócio real a sabe); diz-se por baixo do título. */
  origemObra?: OrigemMoradaObra | null;
  /** O negócio real: os atalhos «Preencher com os dados da entidade» e «Estou no local» no lugar de «Usar a morada do contacto». Sem isto, fica o atalho antigo. */
  real?: AtalhosMoradaReal;
}

export interface AtalhosMoradaReal {
  /** A morada da entidade (os quatro campos); `null` se não tem. */
  moradaEntidade: MoradaObraForm | null;
  aoPreencherDe: (morada: MoradaObraForm, origem: OrigemMoradaObra) => void;
  /** Quem dá a morada do local; por omissão a localização do dispositivo (nos testes, simulada). */
  obterLocal?: () => Promise<MoradaDoLocal>;
}

/** A precisão (em metros) a partir da qual se avisa para confirmar a rua e o número. */
const PRECISAO_FRACA = 100;

type EstadoLocal = { k: "parado" } | { k: "entidade"; vazia: boolean } | { k: "procura" } | { k: "ok"; metros: number; fraca: boolean } | { k: "erro"; motivo: string };

/** Os dois atalhos do negócio real. «Estou no local» pede a localização; as coordenadas nunca chegam aqui nem se guardam. */
function AtalhosReais({ id, real, moradaAtual }: { id: string; real: AtalhosMoradaReal; moradaAtual: MoradaObraForm }) {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<EstadoLocal>({ k: "parado" });
  const emCurso = useRef(false);
  const copiarEntidade = () => {
    // O feedback vai para a região aria-live que existe sempre (um toast pode não ser anunciado).
    if (!real.moradaEntidade) {
      setEstado({ k: "entidade", vazia: true });
      return;
    }
    real.aoPreencherDe({ ...real.moradaEntidade }, "entidade");
    setEstado({ k: "entidade", vazia: false });
  };
  const estouNoLocal = async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    setEstado({ k: "procura" });
    try {
      const { morada, precisaoMetros } = await (real.obterLocal ?? obterMoradaDoLocal)();
      real.aoPreencherDe({ ...morada, andar: moradaAtual.andar }, "localizacao");
      setEstado({ k: "ok", metros: precisaoMetros, fraca: precisaoMetros > PRECISAO_FRACA });
    } catch (erro) {
      setEstado({ k: "erro", motivo: erro instanceof ErroLocalizacao ? erro.motivo : "posicao" });
    } finally {
      emCurso.current = false;
    }
  };
  const procura = estado.k === "procura";
  const mensagem = estado.k === "entidade" ? t(`${N}address.fromEntity.${estado.vazia ? "empty" : "done"}`)
    : estado.k === "ok" ? t(`${N}address.here.${estado.fraca ? "weak" : "done"}`, { m: estado.metros })
    : estado.k === "erro" ? t(`${N}address.here.err.${estado.motivo}`) : "";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={copiarEntidade} className={cn("min-h-11 gap-2", FOCO)}>
          <Home className="h-4 w-4" aria-hidden="true" />
          {t(`${N}address.fromEntity`)}
        </Button>
        <Button
          type="button" variant="outline" onClick={estouNoLocal} aria-disabled={procura || undefined} aria-busy={procura || undefined}
          className={cn("min-h-11 gap-2", FOCO, procura && "opacity-70")}
        >
          {procura ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LocateFixed className="h-4 w-4" aria-hidden="true" />}
          {t(`${N}address.${procura ? "here.busy" : "here"}`)}
        </Button>
      </div>
      <p id={`${id}-local`} aria-live="polite" className={cn("text-sm", estado.k === "erro" ? "text-destructive" : "text-muted-foreground")}>{mensagem}</p>
    </>
  );
}

const CAMPO = cn("min-h-11", FOCO);

/** A morada da obra (fica no negócio, não na pessoa): rua, código postal 0000-000, localidade e andar, com o atalho de usar a morada do contacto. */
export function MoradaObra({ id, valores, erroCodigoPostal, moradaContacto, origem = null, aoMudar, aoPreencher, origemObra = null, real }: Props) {
  const { t } = useTranslation();
  const usarContacto = () => {
    if (moradaContacto.trim() === "") {
      toast.info(t(`${N}address.useContact.empty`));
      return;
    }
    aoPreencher(moradaDoContacto(moradaContacto));
    toast.info(t(`${N}address.useContact.done`));
  };
  return (
    <section aria-labelledby={`${id}-morada`} className="space-y-3">
      <h3 id={`${id}-morada`} className="text-sm font-semibold text-foreground">{t(`${N}address.title`)}</h3>
      <p className="text-sm text-muted-foreground">{t(`${N}address.note`)}</p>
      {origem && (
        <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`${N}address.fromVisit.${origem === "visitaIgual" ? "same" : "other"}`)}
        </p>
      )}
      {origemObra && <p className="text-sm text-muted-foreground">{t(`${N}address.origin.${origemObra}`)}</p>}
      {real ? <AtalhosReais id={id} real={real} moradaAtual={valores} /> : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={usarContacto} className={cn("min-h-11 gap-2", FOCO)}>
            <Home className="h-4 w-4" aria-hidden="true" />
            {t(`${N}address.useContact`)}
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Rotulo para={`${id}-rua`} texto={t(`${N}address.street`)} />
          <Input id={`${id}-rua`} value={valores.rua} maxLength={MAX_RUA} autoComplete="off" className={CAMPO} onChange={(e) => aoMudar("rua", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Rotulo para={`${id}-cp`} texto={t(`${N}address.postal`)} />
          <Input
            id={`${id}-cp`} value={valores.codigoPostal} inputMode="numeric" autoComplete="off" maxLength={8}
            placeholder={t(`${N}address.postal.placeholder`)} aria-invalid={erroCodigoPostal ? true : undefined}
            aria-describedby={erroCodigoPostal ? `${id}-cp-ajuda ${id}-cp-erro` : `${id}-cp-ajuda`} className={cn(CAMPO, erroCodigoPostal && "border-destructive")}
            onChange={(e) => aoMudar("codigoPostal", e.target.value)}
          />
          <p id={`${id}-cp-ajuda`} className="text-sm text-muted-foreground">{t(`${N}address.postal.hint`)}</p>
          <ErroDoCampo id={`${id}-cp-erro`} chave={erroCodigoPostal ? "error.postal.invalido" : undefined} />
        </div>
        <div className="space-y-1.5">
          <Rotulo para={`${id}-localidade`} texto={t(`${N}address.city`)} />
          <Input id={`${id}-localidade`} value={valores.localidade} maxLength={MAX_LOCALIDADE} autoComplete="off" className={CAMPO} onChange={(e) => aoMudar("localidade", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Rotulo para={`${id}-andar`} texto={t(`${N}address.unit`)} />
          <Input
            id={`${id}-andar`} value={valores.andar} maxLength={MAX_ANDAR} autoComplete="off" placeholder={t(`${N}address.unit.placeholder`)}
            className={CAMPO} onChange={(e) => aoMudar("andar", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
