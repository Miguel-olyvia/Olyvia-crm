// O grupo «Quem pede» do passo Chamada, por baixo do contacto: o tipo de cliente (Particular, Empresa, Condomínio) e o NIF. Só apresentação: o estado
// vive no assistente. Um condomínio não se despromove a empresa (a base passaria o tipo de cliente a empresa); o NIF abre sempre vazio e só diz o que a ficha sabe dele.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { FormularioIdentidade, TipoIdentidade } from "@/components/pessoas-lista/identidadeFormulario";

const A = "pessoasPagina.assistente.quemPede.";
const I = "pessoasPagina.real.ficha.identity.";

/** Os campos que a última validação ou a base recusaram: ficam `aria-invalid` até se voltar a escrever. */
export type CampoQuemPede = "nif" | "empresa" | "nomeProprio" | "apelido";

export interface QuemPedeProps {
  /** O que está escolhido (e os nomes que o tipo novo pede). */
  form: FormularioIdentidade;
  /** O tipo que a base tem; `null` enquanto a ficha não o disse (o tipo não se edita). */
  tipoAtual: TipoIdentidade | null;
  aoMudarForm: (parcial: Partial<FormularioIdentidade>) => void;
  nif: string;
  aoMudarNif: (valor: string) => void;
  /** Os últimos 3 dígitos do NIF, se a ficha os tem, e se há NIF registado. */
  nifUltimos3: string | null;
  nifRegistado: boolean;
  podeEditar: boolean;
  erroCampo: string | null;
}

const OPCOES: readonly TipoIdentidade[] = ["person", "organization", "condominio"];
const CHAVE_TIPO: Record<TipoIdentidade, string> = { person: "particular", organization: "empresa", condominio: "condominio" };

function Opcao({ id, valor, rotulo }: { id: string; valor: TipoIdentidade; rotulo: string }) {
  return (
    <Label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-normal">
      <RadioGroupItem id={id} value={valor} />
      {rotulo}
    </Label>
  );
}

export function GrupoQuemPede({ form, tipoAtual, aoMudarForm, nif, aoMudarNif, nifUltimos3, nifRegistado, podeEditar, erroCampo }: QuemPedeProps) {
  const { t } = useTranslation();
  const id = useId();
  const mudou = tipoAtual !== null && form.tipo !== tipoAtual;
  const pedeEmpresa = mudou && form.tipo !== "person";
  const pedePessoa = mudou && form.tipo === "person";
  const idNif = `${id}-nif`;
  const idAjudaNif = `${id}-nif-ajuda`;
  const ajudaNif = nifUltimos3 ? t(`${A}nifTem`, { n: nifUltimos3 }) : nifRegistado ? t(`${A}nifTemSemDigitos`) : t(`${A}nifSem`);
  const invalido = (campo: CampoQuemPede) => (erroCampo === campo ? true : undefined);
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">{t(`${A}titulo`)}</legend>
      <RadioGroup
        value={tipoAtual === null ? "" : form.tipo} onValueChange={(v) => aoMudarForm({ tipo: v as TipoIdentidade })} aria-label={t(`${A}tipo`)}
        disabled={!podeEditar || tipoAtual === null} className="gap-0 sm:flex sm:flex-wrap sm:gap-x-5"
      >
        {OPCOES.filter((o) => o !== "organization" || tipoAtual !== "condominio").map((o) => (
          <Opcao key={o} id={`${id}-${o}`} valor={o} rotulo={t(`${A}tipo.${CHAVE_TIPO[o]}`)} />
        ))}
      </RadioGroup>
      {(!podeEditar || tipoAtual === null) && (
        <p className="text-sm text-muted-foreground">{t(`${A}${!podeEditar ? "semPermissao" : "tipoSemFicha"}`)}</p>
      )}
      {pedeEmpresa && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-empresa`}>{t(`${I}${form.tipo === "condominio" ? "condominioName" : "companyName"}`)}</Label>
          <Input
            id={`${id}-empresa`} className={cn("min-h-11", FOCO)} maxLength={200} value={form.nomeEmpresa} aria-invalid={invalido("empresa")}
            onChange={(e) => aoMudarForm({ nomeEmpresa: e.target.value })}
          />
        </div>
      )}
      {pedePessoa && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-nome-proprio`}>{t(`${I}firstName`)}</Label>
            <Input
              id={`${id}-nome-proprio`} className={cn("min-h-11", FOCO)} maxLength={100} value={form.nomeProprio} aria-invalid={invalido("nomeProprio")}
              onChange={(e) => aoMudarForm({ nomeProprio: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-apelido`}>{t(`${I}lastName`)}</Label>
            <Input
              id={`${id}-apelido`} className={cn("min-h-11", FOCO)} maxLength={100} value={form.apelido} aria-invalid={invalido("apelido")}
              onChange={(e) => aoMudarForm({ apelido: e.target.value })}
            />
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={idNif}>{t(`${A}nif`)}</Label>
        <Input
          id={idNif} type="text" inputMode="numeric" autoComplete="off" maxLength={20} className={cn("min-h-11 sm:max-w-xs", FOCO)} value={nif}
          readOnly={!podeEditar} aria-invalid={invalido("nif")} aria-describedby={idAjudaNif} onChange={(e) => aoMudarNif(e.target.value)}
        />
        <p id={idAjudaNif} className="text-sm text-muted-foreground">{ajudaNif}</p>
      </div>
    </fieldset>
  );
}
