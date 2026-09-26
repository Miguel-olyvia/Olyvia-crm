import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Check, ChevronRight, Search, X } from "./icons";
import type { Estado, EstadoTarefa, Origem, Prioridade } from "../domain/tipos";
import { ROTULO_ESTADO, ROTULO_ESTADO_TAREFA } from "../domain/tipos";
import { useRotulos } from "../auth/Rotulos";
import { ErroDeEscrita } from "../lib/dados";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- Button -- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type ButtonSize = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98]";
  const sizes: Record<ButtonSize, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand text-white shadow-sm hover:bg-brand-dark",
    secondary:
      "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300",
    ghost: "text-slate-600 hover:bg-slate-100",
    subtle: "bg-brand-50 text-brand-800 hover:bg-brand-100",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  };
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props} />;
}

export function IconButton({
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        className
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- Inputs --- */

/**
 * Passa a `ref` para o `<input>` real.
 *
 * Sem isto não há como pôr o cursor num campo a partir de fora — e é disso que
 * vive o atalho `/` da lista de ordens, que sem ref não teria onde pegar.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20",
          className
        )}
        {...props}
      />
    );
  }
);

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/**
 * Um campo com rótulo.
 *
 * `min-w-0` não é decoração: um filho de grelha ou de flex tem
 * `min-width: auto`, e por isso recusa-se a encolher abaixo do seu conteúdo.
 * Com um texto longo lá dentro — uma morada, o nome de um item de catálogo —
 * a coluna crescia, o texto nunca partia, e a página saía para fora do ecrã
 * do telemóvel. `break-words` sozinho não resolve: primeiro a caixa tem de
 * poder encolher.
 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  hint?: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer select-none items-center gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          checked ? "bg-brand" : "bg-slate-300"
        )}
      >
        <span
          className={cx(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
      {(label || hint) && (
        <span className="leading-tight">
          {label && <span className="block text-sm text-slate-700">{label}</span>}
          {hint && <span className="block text-xs text-slate-400">{hint}</span>}
        </span>
      )}
    </label>
  );
}

/* -------------------------------------------------------------- Combobox -- */

export interface ComboOption {
  value: string;
  label: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecionar…",
  searchPlaceholder = "Pesquisar…",
  className,
  disabled,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
      >
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
        <span className={cx("min-w-0 flex-1 truncate text-left", !selected && "text-slate-400")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronRight
          width={15}
          height={15}
          className={cx("shrink-0 text-slate-400 transition-transform", open ? "-rotate-90" : "rotate-90")}
        />
      </button>

      {open && (
        <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-elevated">
          <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
            <Search width={15} height={15} className="shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const opt = filtered[active];
                  if (opt) choose(opt.value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-slate-400">Sem resultados.</p>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cx(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-brand-50 text-brand-900" : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check width={14} height={14} className="shrink-0 text-brand" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Cartão -- */

export function Card({
  children,
  className,
  onClick,
  id,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Para se poder apontar um link a esta secção — ver `/ajuda#sugerir`. */
  id?: string;
}) {
  return (
    <div
      id={id}
      onClick={onClick}
      className={cx("rounded-xl border border-slate-200/80 bg-white shadow-card", className)}
    >
      {children}
    </div>
  );
}

/**
 * O cabeçalho de um cartão: ícone, título, e o que se pode fazer ali.
 *
 * Antes disto cada painel desenhava o seu — quinze `<h2>` com quinze conjuntos
 * de classes parecidas mas não iguais, e por isso quinze alturas de linha
 * ligeiramente diferentes numa página que os empilha todos. Uma ficha de ordem
 * com dez cartões desalinhados lê-se como dez coisas soltas em vez de uma.
 *
 * O ícone não é decoração: numa página comprida é por ele que se volta a
 * encontrar a secção depois de se ter descido.
 */
export function Seccao({
  icone,
  titulo,
  contagem,
  acao,
  children,
  className,
}: {
  icone?: ReactNode;
  titulo: string;
  /** Quantos itens tem. Zero mostra-se: "0 anexos" é informação. */
  contagem?: number | string;
  acao?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 items-center justify-between gap-3", className)}>
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
        {icone && <span className="shrink-0 text-slate-400">{icone}</span>}
        <span className="min-w-0 truncate">{titulo}</span>
        {contagem !== undefined && (
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-500">
            {contagem}
          </span>
        )}
        {children}
      </h2>
      {acao && <div className="flex shrink-0 items-center gap-1.5">{acao}</div>}
    </div>
  );
}

/**
 * Uma condição ligada, com a porta para a desligar.
 *
 * Um contador que diz "3 filtros" obriga a abrir a gaveta para saber quais.
 * As pastilhas dizem-no sem se abrir nada, e cada uma tira-se onde está — que
 * é o gesto que se quer fazer quando a lista sai curta de mais.
 */
export function Chip({
  children,
  onRemover,
  titulo,
}: {
  children: ReactNode;
  onRemover?: () => void;
  titulo?: string;
}) {
  return (
    <span
      title={titulo}
      className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-100"
    >
      <span className="min-w-0 truncate">{children}</span>
      {onRemover && (
        <button
          type="button"
          onClick={onRemover}
          aria-label="Tirar este filtro"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-brand-600 transition-colors hover:bg-brand-100 hover:text-brand-900"
        >
          <X width={11} height={11} />
        </button>
      )}
    </span>
  );
}

/* -------------------------------------------------------------- Feedback -- */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
      <span className="relative flex h-9 w-9 items-center justify-center">
        <span className="absolute h-9 w-9 animate-ping rounded-full bg-brand/15" />
        <span className="absolute h-9 w-9 rounded-full bg-brand/5" />
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
      </span>
      {label && <span className="animate-pulse text-sm">{label}</span>}
    </div>
  );
}

/**
 * A roda pequena, para dentro de um botão.
 *
 * O `Spinner` é um bloco de ecrã inteiro (`py-12`): posto dentro de um botão,
 * empurrava-o e o botão saltava de tamanho durante o envio. São duas coisas
 * diferentes e passaram a ter dois nomes.
 */
export function Rodinha({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current align-[-2px]",
        className
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-100", className)} />;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        className ?? "bg-slate-50 text-slate-600 ring-slate-200"
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Erro que o utilizador pode ler e sobre o qual pode agir. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3.5 text-sm text-red-800">
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs font-medium underline underline-offset-2 hover:text-red-900"
        >
          Tentar outra vez
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------- Etiquetas do domínio --- */

/**
 * O estado de uma ordem, com cor. As cores encodam gravidade, não decoram:
 * cinzento espera, roxo anda, âmbar parou, verde acabou, vermelho morreu.
 */
const CORES_ESTADO: Record<Estado, string> = {
  por_aprovar: "bg-slate-100 text-slate-700 ring-slate-200",
  agendada: "bg-sky-50 text-sky-700 ring-sky-200",
  em_curso: "bg-brand-50 text-brand-800 ring-brand-200",
  pausada: "bg-amber-50 text-amber-800 ring-amber-200",
  fechada: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  confirmada: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  cancelada: "bg-slate-100 text-slate-500 ring-slate-200 line-through",
};

export function EstadoOrdem({ estado }: { estado: Estado }) {
  return <Badge className={CORES_ESTADO[estado]}>{ROTULO_ESTADO[estado]}</Badge>;
}

const CORES_ORIGEM: Record<Origem, string> = {
  preventiva: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  corretiva: "bg-orange-50 text-orange-700 ring-orange-200",
  obra: "bg-teal-50 text-teal-700 ring-teal-200",
};

export function OrigemOrdem({ origem }: { origem: Origem }) {
  // A cor vem do código (é o motor); o nome vem da empresa.
  const { nome } = useRotulos();
  return <Badge className={CORES_ORIGEM[origem]}>{nome("origem", origem)}</Badge>;
}

const CORES_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "bg-slate-50 text-slate-500 ring-slate-200",
  normal: "bg-slate-50 text-slate-600 ring-slate-200",
  alta: "bg-amber-50 text-amber-800 ring-amber-200",
  urgente: "bg-red-50 text-red-700 ring-red-200",
};

export function PrioridadeOrdem({ prioridade }: { prioridade: Prioridade }) {
  const { nome } = useRotulos();
  if (prioridade === "normal") return null; // o normal não precisa de etiqueta
  return (
    <Badge className={CORES_PRIORIDADE[prioridade]}>{nome("prioridade", prioridade)}</Badge>
  );
}

const CORES_TAREFA: Record<EstadoTarefa, string> = {
  pendente: "bg-slate-50 text-slate-500 ring-slate-200",
  feita: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  nao_conforme: "bg-red-50 text-red-700 ring-red-200",
  nao_aplicavel: "bg-slate-50 text-slate-400 ring-slate-200",
};

export function EstadoTarefaBadge({ estado }: { estado: EstadoTarefa }) {
  return <Badge className={CORES_TAREFA[estado]}>{ROTULO_ESTADO_TAREFA[estado]}</Badge>;
}

/** Barra de progresso das tarefas. */
export function Barra({ percentagem, className }: { percentagem: number; className?: string }) {
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-valuenow={percentagem}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, percentagem))}%` }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- Modal -- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };
  return (
    <div
      className="animate-in-fade fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={cx(
          "animate-in-pop flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-elevated sm:max-h-[85vh] sm:rounded-2xl",
          widths[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <IconButton label="Fechar" onClick={onClose}>
            <X width={16} height={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  tone = "brand",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: ReactNode;
  tone?: "danger" | "brand";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}

/* ------------------------------------------------- Peças de formulário -- */

/**
 * Gravar, com o erro do servidor à vista.
 *
 * As RPCs escrevem mensagens para serem lidas por pessoas ("Uma gama sem
 * limites nunca dá veredicto nenhum"). Trocá-las por uma genérica seria deitar
 * fora a parte útil.
 *
 * Vive aqui, e não em Definições, desde que os formulários de local e de
 * categoria saíram de lá para o sítio onde se usam.
 */
export function useGravar() {
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async (fn: () => Promise<unknown>, aoAcabar: () => void) => {
    setAGravar(true);
    setErro(null);
    try {
      await fn();
      aoAcabar();
    } catch (e) {
      setErro(
        e instanceof ErroDeEscrita
          ? e.message
          : "Não foi possível falar com o servidor. Tenta outra vez."
      );
    } finally {
      setAGravar(false);
    }
  };

  return { aGravar, erro, gravar };
}

/** Um botão de escolha única, para quando são poucas e cabem numa linha. */
export function Escolha({
  ligado,
  onClick,
  children,
}: {
  ligado: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-all active:scale-[0.98]",
        ligado
          ? "bg-brand text-white ring-brand"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
      )}
    >
      {children}
    </button>
  );
}
