import { useLayoutEffect, useRef } from "react";
import { SmsVariableButtons } from "@/components/forms/SmsVariableButtons";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SmsMessageFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Mostra o botão do link de gerir/cancelar entre as variáveis. */
  includeLink: boolean;
  placeholder: string;
  /** Texto de ajuda por baixo dos botões (ex.: de que idioma vem a mensagem quando fica vazia). */
  help?: string;
  /** Anuncia a caixa e os seus botões como um grupo com o nome do rótulo (vários idiomas na mesma página). */
  grouped?: boolean;
}

/**
 * Caixa da mensagem do SMS de confirmação, com os botões de variáveis. Cada caixa guarda a sua própria
 * posição do cursor (ao perder o foco, p. ex. ao clicar num botão) e devolve-lhe o foco depois de
 * inserir uma variável.
 */
export function SmsMessageField({ id, label, value, onChange, includeLink, placeholder, help, grouped }: SmsMessageFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<{ start: number; end: number } | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const rememberCaret = () => {
    const el = ref.current;
    if (el) caret.current = { start: el.selectionStart, end: el.selectionEnd };
  };
  const applyCaret = (pos: number) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(pos, pos);
    caret.current = { start: pos, end: pos };
  };
  const insertVariable = (key: string) => {
    const el = ref.current;
    const live = el && document.activeElement === el ? { start: el.selectionStart, end: el.selectionEnd } : null;
    const range = live ?? caret.current ?? { start: value.length, end: value.length };
    const start = Math.min(range.start, value.length);
    const end = Math.min(Math.max(range.end, start), value.length);
    const token = `{{${key}}}`;
    const nextText = value.slice(0, start) + token + value.slice(end);
    const nextCaret = start + token.length;
    if (nextText === value) {
      // O valor não muda, logo não há re-render a esperar: aplica já.
      pendingCaret.current = null;
      applyCaret(nextCaret);
      return;
    }
    pendingCaret.current = nextCaret;
    onChange(nextText);
  };
  // Depois de a mensagem mudar, devolve o foco à caixa com o cursor a seguir ao que entrou.
  useLayoutEffect(() => {
    const pos = pendingCaret.current;
    if (pos == null) return;
    pendingCaret.current = null;
    applyCaret(pos);
  }, [value]);

  return (
    <div className="space-y-1" {...(grouped ? { role: "group", "aria-label": label } : {})}>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Textarea
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={rememberCaret}
        placeholder={placeholder}
        rows={3}
      />
      <SmsVariableButtons includeLink={includeLink} onInsert={insertVariable} />
      {help && <p className="text-[10px] text-muted-foreground">{help}</p>}
    </div>
  );
}
