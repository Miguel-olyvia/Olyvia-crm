/**
 * Os quatro campos de que as cinco seccoes do assistente sao feitas.
 *
 * PORQUE EXISTEM
 * --------------
 * Numa revisao da ronda anterior apareceram campos sem etiqueta associada --
 * em particular selectores, onde e facil esquecer que o `htmlFor` tem de
 * apontar para o GATILHO e nao para um `input` que nao existe. Aqui a
 * associacao e estrutural: quem usa `CampoSelect` nao consegue produzir um
 * selector sem etiqueta.
 *
 * A mensagem de erro e o texto de ajuda ficam ligados ao campo por
 * `aria-describedby`, e o campo marcado `aria-invalid`, para o leitor de ecra
 * anunciar "NIF, invalido, tem de ter nove digitos" ao receber o foco.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CountrySelect } from "@/components/CountrySelect";
import { cn } from "@/lib/utils";

/**
 * QUEM MARCA UM CAMPO COMO TOCADO
 * ------------------------------
 * A validacao de FORMATO so se mostra depois de sair do campo. Para isso
 * alguem tem de saber que o campo foi visitado, e esse alguem e o formulario
 * -- nao o campo. O contexto leva-lhe o aviso sem obrigar as cinco seccoes a
 * reencaminhar um `onBlur` por cada um dos seus campos, e garante que NENHUM
 * campo fica de fora por esquecimento no sitio da chamada.
 */
const CamposTocadosContext = createContext<(campoId: string) => void>(() => {});

export function CamposTocadosProvider({
  onTocar,
  children,
}: {
  onTocar: (campoId: string) => void;
  children: ReactNode;
}) {
  return <CamposTocadosContext.Provider value={onTocar}>{children}</CamposTocadosContext.Provider>;
}

/**
 * Para campos que vivem FORA deste ficheiro (por exemplo `CampoConta`, que
 * envolve um Popover+Command proprio) mas que ainda assim tem de marcar-se
 * como tocados no `onBlur` do seu gatilho, como `CampoSelect` faz no
 * `SelectTrigger`. Nao exportar o contexto em si -- so este acesso.
 */
export function useTocarCampo(): (campoId: string) => void {
  return useContext(CamposTocadosContext);
}

/** O Radix nao aceita `value=""` num SelectItem: e preciso um valor sentinela. */
export const SEM_ESCOLHA = "__sem_escolha__";

interface CampoBaseProps {
  id: string;
  label: string;
  ajuda?: string;
  erro?: string | null;
  className?: string;
  /**
   * Marca visualmente o campo como um PALPITE ainda por confirmar (por
   * exemplo, o nome partido a partir de uma conta de CRM). Desaparece assim
   * que quem chama deixar de o considerar palpite -- normalmente ao ver o
   * campo tocado ou editado. Nunca substitui o texto de `ajuda`: os dois
   * convivem, e e por `ajuda` que a mensagem do palpite chega a quem usa
   * leitor de ecra.
   */
  marcado?: boolean;
  /**
   * Obrigatorio, anunciado a quem usa leitor de ecra -- nao so a vermelho. O
   * asterisco visual e decorativo (`aria-hidden`); o "(obrigatorio)" que o
   * acompanha e que da o nome acessivel a exigencia, e `aria-required` no
   * proprio controlo e o que faz um leitor de ecra dizer "obrigatorio" ao
   * entrar no campo, antes mesmo de o tentar submeter vazio.
   */
  obrigatorio?: boolean;
}

function Envolvente({
  id,
  label,
  ajuda,
  erro,
  className,
  marcado,
  obrigatorio,
  children,
}: CampoBaseProps & { children: ReactNode }) {
  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md",
        marcado && "ring-1 ring-amber-400/70 bg-amber-50/40 p-2 dark:bg-amber-950/20",
        className,
      )}
    >
      <Label htmlFor={id}>
        {label}
        {obrigatorio && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
            <span className="sr-only"> (obrigatorio)</span>
          </>
        )}
      </Label>
      {children}
      {ajuda && !erro && (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

interface CampoTextoProps extends CampoBaseProps {
  valor: string;
  onChange: (valor: string) => void;
  tipo?: "text" | "email" | "date" | "number" | "tel" | "time";
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: string;
}

export function CampoTexto({
  id,
  label,
  ajuda,
  erro,
  className,
  marcado,
  obrigatorio,
  valor,
  onChange,
  tipo = "text",
  placeholder,
  disabled,
  min,
  max,
  step,
}: CampoTextoProps) {
  const tocar = useContext(CamposTocadosContext);
  return (
    <Envolvente
      id={id}
      label={label}
      ajuda={ajuda}
      erro={erro}
      className={className}
      marcado={marcado}
      obrigatorio={obrigatorio}
    >
      <Input
        id={id}
        type={tipo}
        value={valor}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        required={obrigatorio}
        aria-required={obrigatorio || undefined}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={cn(erro && "border-destructive")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => tocar(id)}
      />
    </Envolvente>
  );
}

export interface OpcaoSelect {
  value: string;
  label: string;
}

interface CampoSelectProps extends CampoBaseProps {
  valor: string;
  onChange: (valor: string) => void;
  opcoes: OpcaoSelect[];
  /** Rotulo da opcao "sem escolha". Omitido = o campo nao aceita vazio. */
  vazioLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CampoSelect({
  id,
  label,
  ajuda,
  erro,
  className,
  obrigatorio,
  valor,
  onChange,
  opcoes,
  vazioLabel,
  placeholder,
  disabled,
}: CampoSelectProps) {
  const tocar = useContext(CamposTocadosContext);
  return (
    <Envolvente
      id={id}
      label={label}
      ajuda={ajuda}
      erro={erro}
      className={className}
      obrigatorio={obrigatorio}
    >
      <Select
        value={valor === "" ? SEM_ESCOLHA : valor}
        disabled={disabled}
        onValueChange={(v) => onChange(v === SEM_ESCOLHA ? "" : v)}
      >
        {/* O `id` vai no GATILHO: e ele o controlo que a etiqueta identifica. */}
        <SelectTrigger
          id={id}
          aria-required={obrigatorio || undefined}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
          className={cn(erro && "border-destructive")}
          onBlur={() => tocar(id)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {vazioLabel && <SelectItem value={SEM_ESCOLHA}>{vazioLabel}</SelectItem>}
          {opcoes.map((opcao) => (
            <SelectItem key={opcao.value} value={opcao.value}>
              {opcao.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Envolvente>
  );
}

interface CampoPaisProps extends CampoBaseProps {
  /** Codigo ISO 3166-1 alpha-2. String vazia = sem escolha. */
  valor: string;
  onChange: (codigo: string) => void;
  disabled?: boolean;
}

/**
 * O pais, com pesquisa, sobre a tabela `countries`.
 *
 * Existe para que a nacionalidade e o pais da morada usem A MESMA fonte e o
 * MESMO componente: sao dois campos e um sitio para corrigir. Para a base
 * ambos sao duas letras maiusculas, e nenhum dos dois tem logica propria.
 */
export function CampoPais({
  id,
  label,
  ajuda,
  erro,
  className,
  obrigatorio,
  valor,
  onChange,
  disabled,
}: CampoPaisProps) {
  const tocar = useContext(CamposTocadosContext);
  return (
    <Envolvente
      id={id}
      label={label}
      ajuda={ajuda}
      erro={erro}
      className={className}
      obrigatorio={obrigatorio}
    >
      <CountrySelect
        id={id}
        value={valor}
        disabled={disabled}
        aria-required={obrigatorio || undefined}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={cn(erro && "border-destructive")}
        onChange={onChange}
        onBlur={() => tocar(id)}
      />
    </Envolvente>
  );
}

interface CampoInterruptorProps {
  id: string;
  label: string;
  descricao?: string;
  checked: boolean;
  onChange: (valor: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function CampoInterruptor({
  id,
  label,
  descricao,
  checked,
  onChange,
  disabled,
  className,
}: CampoInterruptorProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-md border p-3", className)}>
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {descricao && (
          <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
            {descricao}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={descricao ? `${id}-ajuda` : undefined}
        onCheckedChange={onChange}
      />
    </div>
  );
}
