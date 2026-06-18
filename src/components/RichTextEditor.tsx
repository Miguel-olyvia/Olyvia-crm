import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { useTableSelectionToolbar } from "@/hooks/useTableSelectionToolbar";
import { TableContextToolbar } from "@/components/contracts/TableContextToolbar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link,
  Type,
  Variable,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variables?: { key: string; label: string; description?: string }[];
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  extraToolbarButtons?: React.ReactNode;
}

export interface RichTextEditorHandle {
  insertVariable: (variable: string) => void;
  execCommand: (command: string, value?: string) => void;
}

// Default variables for proposal emails
const DEFAULT_VARIABLES = [
  { key: "{{nome_cliente}}", label: "Nome do Cliente", description: "Nome completo do cliente" },
  { key: "{{email_cliente}}", label: "Email do Cliente", description: "Email do cliente" },
  { key: "{{telefone_cliente}}", label: "Telefone do Cliente", description: "Telefone do cliente" },
  { key: "{{nome_empresa}}", label: "Nome da Empresa", description: "Nome da sua empresa" },
  { key: "{{email_empresa}}", label: "Email da Empresa", description: "Email da empresa" },
  { key: "{{telefone_empresa}}", label: "Telefone da Empresa", description: "Telefone da empresa" },
  { key: "{{titulo_proposta}}", label: "Título da Proposta", description: "Título da proposta" },
  { key: "{{valor_proposta}}", label: "Valor da Proposta", description: "Valor total da proposta" },
  { key: "{{validade_proposta}}", label: "Validade", description: "Data de validade da proposta" },
  { key: "{{link_proposta}}", label: "Link da Proposta", description: "URL para visualizar a proposta" },
  { key: "{{nome_utilizador}}", label: "Nome do Utilizador", description: "Nome de quem envia" },
  { key: "{{email_utilizador}}", label: "Email do Utilizador", description: "Email de quem envia" },
  { key: "{{data_atual}}", label: "Data Atual", description: "Data de hoje" },
];

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
  value,
  onChange,
  placeholder = "Escreva aqui...",
  variables = DEFAULT_VARIABLES,
  className = "",
  minHeight = "150px",
  maxHeight,
  extraToolbarButtons,
}, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showVariables, setShowVariables] = useState(false);
  const isInternalChange = useRef(false);
  const savedSelectionRef = useRef<Range | null>(null);
  const tableSelection = useTableSelectionToolbar(editorRef);

  // Save selection whenever focus leaves the editor
  const handleBlur = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  // Sync external value changes (e.g. template selection) into the contentEditable div
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const sanitizedValue = sanitizeRichHtml(value);
    if (editorRef.current && editorRef.current.innerHTML !== sanitizedValue) {
      editorRef.current.innerHTML = sanitizedValue;
    }
  }, [value]);

  const execCommand = useCallback((command: string, value?: string) => {
    if (!editorRef.current) return;
    // Restore the selection that was saved on blur (the toolbar Select steals focus)
    const sel = window.getSelection();
    if (savedSelectionRef.current && sel && (!sel.rangeCount || !editorRef.current.contains(sel.anchorNode))) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
    editorRef.current.focus();
    document.execCommand(command, false, value);
    isInternalChange.current = true;
    onChange(sanitizeRichHtml(editorRef.current.innerHTML));
    // Persist the new caret/selection for the next toolbar action
    const s2 = window.getSelection();
    if (s2 && s2.rangeCount > 0 && editorRef.current.contains(s2.anchorNode)) {
      savedSelectionRef.current = s2.getRangeAt(0).cloneRange();
    }
  }, [onChange]);

  const insertVariable = useCallback((variable: string) => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    if (!selection) return;

    // Restore saved selection first (before focus moves cursor to start)
    if (savedSelectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedSelectionRef.current);
    }
    
    editorRef.current.focus();

    // If still no valid selection inside editor, place cursor at end
    if (!selection.rangeCount || !editorRef.current.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const range = selection.getRangeAt(0);
    const variableSpan = document.createElement("span");
    variableSpan.className = "bg-primary/20 text-primary px-1 rounded text-sm font-mono";
    variableSpan.contentEditable = "false";
    variableSpan.textContent = variable;
    
    range.deleteContents();
    range.insertNode(variableSpan);
    
    // Move cursor after the inserted variable
    range.setStartAfter(variableSpan);
    range.setEndAfter(variableSpan);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Save this new position
    savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    
    isInternalChange.current = true;
    onChange(sanitizeRichHtml(editorRef.current.innerHTML));
    setShowVariables(false);
  }, [onChange]);

  useImperativeHandle(ref, () => ({ insertVariable, execCommand }), [insertVariable, execCommand]);

  const handleInput = () => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(sanitizeRichHtml(editorRef.current.innerHTML));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  return (
    <div ref={containerRef} className={`relative border rounded-lg overflow-hidden bg-background ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/30 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('bold')}
          title="Negrito"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('italic')}
          title="Itálico"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('underline')}
          title="Sublinhado"
        >
          <Underline className="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('justifyLeft')}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('justifyCenter')}
          title="Centrar"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('justifyRight')}
          title="Alinhar à direita"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('insertUnorderedList')}
          title="Lista"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => execCommand('insertOrderedList')}
          title="Lista numerada"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {extraToolbarButtons}

        {/* Variables Popover */}
        <Popover open={showVariables} onOpenChange={setShowVariables}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              title="Inserir variável"
            >
              <Variable className="h-3.5 w-3.5" />
              Variáveis
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2 z-[650]" align="start">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium px-2">
                Clique para inserir uma variável dinâmica
              </p>
              <ScrollArea className="h-[250px]">
                <div className="space-y-1">
                  {variables.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      className="w-full flex items-start gap-2 p-2 rounded hover:bg-muted text-left transition-colors"
                    >
                      <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                        {v.key}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{v.label}</p>
                        {v.description && (
                          <p className="text-[10px] text-muted-foreground">{v.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onBlur={handleBlur}
        className="p-3 outline-none prose prose-sm max-w-none overflow-y-auto"
        style={{ minHeight, maxHeight }}
        data-placeholder={placeholder}
      />

      {tableSelection && containerRef.current && (
        <TableContextToolbar
          info={tableSelection}
          containerEl={containerRef.current}
          onChange={handleInput}
        />
      )}

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
      `}</style>
    </div>
  );
});