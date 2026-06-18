import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";

interface Props {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** When true, renders as a plain text + edit pencil. When false, renders just text. */
  editable?: boolean;
}

/**
 * Click-to-edit text. Saves on Enter or blur; cancels on Escape.
 */
export function EditableLabel({
  value,
  onSave,
  className,
  inputClassName,
  placeholder,
  editable = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={inputClassName ?? "h-7 text-sm"}
      />
    );
  }

  return (
    <span
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : -1}
      onMouseDown={(e) => {
        if (!editable) return;
        e.stopPropagation();
      }}
      onClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        e.preventDefault();
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (!editable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }
      }}
      className={`group inline-flex items-center gap-1.5 text-left ${editable ? "hover:text-primary cursor-text" : "cursor-default"} ${className ?? ""}`}
      title={editable ? "Clique para editar" : undefined}
    >
      <span className="truncate">{value}</span>
      {editable && (
        <Pencil className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0 pointer-events-none" />
      )}
    </span>
  );
}
