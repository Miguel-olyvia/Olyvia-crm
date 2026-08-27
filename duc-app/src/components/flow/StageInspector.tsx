import { useState, type ReactNode } from "react";
import {
  type DucField,
  type DucItemSection,
  type DucStage,
  type FieldType,
  type StageNotify,
  type StageRecipient,
} from "../../lib/ducSchema";
import type { DucSection } from "../../lib/types";
import type { OrgMember } from "../../lib/members";
import { Badge, Button, Combobox, Select, Textarea, Toggle, cx } from "../ui";
import {
  Plus,
  Trash,
  ChevronRight,
  X,
  Settings,
} from "../icons";

// ---------------------------------------------------------------------------

export const FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "date",
  "checkbox",
  "number",
  "select",
  "phases",
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto",
  textarea: "Texto longo",
  date: "Data",
  checkbox: "Sim/Não",
  number: "Número",
  select: "Lista (opções)",
  phases: "Fases de pagamento",
};

export const SECTION_KEYS: DucSection[] = [
  "scope",
  "material",
  "consumable",
  "control_point",
  "change_log",
  "service_map",
];

export const SECTION_LABELS: Record<DucSection, string> = {
  scope: "Âmbito",
  material: "Materiais",
  consumable: "Consumíveis",
  control_point: "Pontos de controlo",
  change_log: "Registo de alterações",
  service_map: "Mapa de serviços",
};

function parseOptions(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((o) => o.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------

export interface StageInspectorHandlers {
  onPatchStage: (
    idx: number,
    patch: Partial<Pick<DucStage, "title" | "responsible" | "intro">>
  ) => void;
  onAddField: (stageIdx: number) => void;
  onRemoveField: (stageIdx: number, fieldIdx: number) => void;
  onPatchField: (stageIdx: number, fieldIdx: number, patch: Partial<DucField>) => void;
  onMoveField: (stageIdx: number, fieldIdx: number, dir: -1 | 1) => void;
  onAddSection: (stageIdx: number) => void;
  onRemoveSection: (stageIdx: number, sectionIdx: number) => void;
  onPatchSection: (
    stageIdx: number,
    sectionIdx: number,
    patch: Partial<Pick<DucItemSection, "section" | "title" | "hint">>
  ) => void;
  onAddColumn: (stageIdx: number, sectionIdx: number) => void;
  onRemoveColumn: (stageIdx: number, sectionIdx: number, colIdx: number) => void;
  onPatchColumn: (
    stageIdx: number,
    sectionIdx: number,
    colIdx: number,
    patch: Partial<DucItemSection["columns"][number]>
  ) => void;
  onPatchNotify: (stageIdx: number, notify: StageNotify) => void;
}

export function StageInspector({
  stage,
  stageIdx,
  keyErrors,
  members,
  onClose,
  onDelete,
  handlers,
}: {
  stage: DucStage;
  stageIdx: number;
  keyErrors: Set<string> | undefined;
  members: OrgMember[];
  onClose: () => void;
  onDelete: () => void;
  handlers: StageInspectorHandlers;
}) {
  const sections = stage.itemSections ?? [];

  return (
    <aside className="flex h-full w-full flex-col bg-white">
      {/* Cabeçalho do inspector */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-800 ring-1 ring-brand-100">
            {stage.no}
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              <Settings width={12} height={12} /> Editar etapa
            </p>
            <p className="mt-0.5 max-w-[16rem] truncate text-sm font-semibold text-slate-800">
              {stage.title || "Sem título"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar inspetor"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-700"
        >
          <X width={16} height={16} />
        </button>
      </div>

      {/* Corpo com scroll */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* Metadados da etapa */}
        <section className="space-y-3">
          <LabeledInput
            label="Título da etapa"
            value={stage.title}
            onChange={(v) => handlers.onPatchStage(stageIdx, { title: v })}
          />
          <LabeledInput
            label="Responsável"
            value={stage.responsible}
            onChange={(v) => handlers.onPatchStage(stageIdx, { responsible: v })}
          />
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-slate-700">Introdução</span>
            <Textarea
              rows={3}
              value={stage.intro ?? ""}
              onChange={(e) => handlers.onPatchStage(stageIdx, { intro: e.target.value })}
              placeholder="Texto de contexto apresentado no topo da etapa (opcional)."
            />
          </label>
        </section>

        {/* Campos */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Campos <Badge className="ml-1">{stage.fields.length}</Badge>
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlers.onAddField(stageIdx)}
            >
              <Plus width={14} height={14} /> Campo
            </Button>
          </div>
          {stage.fields.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
              Sem campos. Adicione o primeiro.
            </p>
          ) : (
            <div className="space-y-3">
              {stage.fields.map((field, fieldIdx) => (
                <FieldEditor
                  key={fieldIdx}
                  field={field}
                  stageIdx={stageIdx}
                  fieldIdx={fieldIdx}
                  isFirst={fieldIdx === 0}
                  isLast={fieldIdx === stage.fields.length - 1}
                  keyInvalid={
                    !field.key.trim() || (keyErrors?.has(field.key.trim()) ?? false)
                  }
                  onPatch={handlers.onPatchField}
                  onRemove={handlers.onRemoveField}
                  onMove={handlers.onMoveField}
                />
              ))}
            </div>
          )}
        </section>

        {/* Tabelas de itens */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Tabelas de itens <Badge className="ml-1">{sections.length}</Badge>
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlers.onAddSection(stageIdx)}
            >
              <Plus width={14} height={14} /> Tabela
            </Button>
          </div>
          {sections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
              Sem tabelas de itens nesta etapa.
            </p>
          ) : (
            <div className="space-y-4">
              {sections.map((section, sectionIdx) => (
                <SectionEditor
                  key={sectionIdx}
                  section={section}
                  stageIdx={stageIdx}
                  sectionIdx={sectionIdx}
                  handlers={handlers}
                />
              ))}
            </div>
          )}
        </section>

        {/* Notificações por email */}
        <NotifySection
          notify={stage.notify}
          members={members}
          onChange={(n) => handlers.onPatchNotify(stageIdx, n)}
        />
      </div>

      {/* Rodapé: eliminar etapa */}
      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
        <Button variant="danger" size="sm" className="w-full" onClick={onDelete}>
          <Trash width={14} height={14} /> Eliminar esta etapa
        </Button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function NotifySection({
  notify,
  members,
  onChange,
}: {
  notify: StageNotify | undefined;
  members: OrgMember[];
  onChange: (n: StageNotify) => void;
}) {
  const [emailInput, setEmailInput] = useState("");

  const current: StageNotify = notify ?? { recipients: [], onEnter: false, onClose: true };
  const recipients = current.recipients ?? [];

  const patch = (p: Partial<StageNotify>) => onChange({ ...current, ...p });

  const addRecipient = (r: StageRecipient) => {
    if (recipients.some((x) => x.type === r.type && x.value === r.value)) return;
    patch({ recipients: [...recipients, r] });
  };
  const removeRecipient = (idx: number) =>
    patch({ recipients: recipients.filter((_, i) => i !== idx) });

  const availableMembers = members.filter(
    (m) => !recipients.some((r) => r.type === "member" && r.value === m.id)
  );

  const addEmail = () => {
    const v = emailInput.trim();
    if (!v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return;
    addRecipient({ type: "email", value: v });
    setEmailInput("");
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Notificações <Badge className="ml-1">{recipients.length}</Badge>
        </h3>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Quem recebe email quando esta etapa entra ou fecha — membros da organização ou emails
        externos.
      </p>

      {recipients.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {recipients.map((r, i) => (
            <span
              key={`${r.type}-${r.value}`}
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                r.type === "member"
                  ? "bg-brand-50 text-brand-800 ring-brand-100"
                  : "bg-amber-50 text-amber-700 ring-amber-100"
              )}
            >
              {r.type === "member" ? r.label ?? "Membro" : r.value}
              <button
                type="button"
                onClick={() => removeRecipient(i)}
                className="opacity-60 transition-opacity hover:opacity-100"
                aria-label="Remover destinatário"
              >
                <X width={11} height={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {availableMembers.length > 0 && (
          <Combobox
            value=""
            onChange={(id) => {
              const m = members.find((x) => x.id === id);
              if (m) addRecipient({ type: "member", value: m.id, label: m.name });
            }}
            placeholder="Adicionar membro…"
            searchPlaceholder="Pesquisar membro…"
            options={availableMembers.map((m) => ({ value: m.id, label: m.name }))}
          />
        )}

        <div className="flex items-center gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
            placeholder="email externo…"
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <Button variant="secondary" size="sm" onClick={addEmail}>
            <Plus width={14} height={14} /> Email
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">Ao entrar na etapa</span>
          <Toggle checked={Boolean(current.onEnter)} onChange={(v) => patch({ onEnter: v })} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">Ao fechar a etapa</span>
          <Toggle checked={Boolean(current.onClose)} onChange={(v) => patch({ onClose: v })} />
        </div>
      </div>

      {/* Alerta de etapa parada (SLA) */}
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">Alertar se ficar aberta mais de</span>
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              value={current.alertAfterDays ?? ""}
              onChange={(e) =>
                patch({
                  alertAfterDays:
                    e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                })
              }
              placeholder="0"
              className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <span className="text-sm text-slate-500">dias</span>
          </span>
        </label>
        <p className="mt-1 text-[11px] text-slate-400">
          Ex.: 7 → alerta os destinatários se a etapa não fechar numa semana. Vazio/0 = sem alerta.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function FieldEditor({
  field,
  stageIdx,
  fieldIdx,
  isFirst,
  isLast,
  keyInvalid,
  onPatch,
  onRemove,
  onMove,
}: {
  field: DucField;
  stageIdx: number;
  fieldIdx: number;
  isFirst: boolean;
  isLast: boolean;
  keyInvalid: boolean;
  onPatch: (stageIdx: number, fieldIdx: number, patch: Partial<DucField>) => void;
  onRemove: (stageIdx: number, fieldIdx: number) => void;
  onMove: (stageIdx: number, fieldIdx: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <div className="space-y-2.5">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Etiqueta</span>
          <input
            type="text"
            value={field.label}
            onChange={(e) => {
              const label = e.target.value;
              const patch: Partial<DucField> = { label };
              if (!field.key.trim()) patch.key = slugify(label);
              onPatch(stageIdx, fieldIdx, patch);
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">
            Chave (identificador único)
          </span>
          <input
            type="text"
            value={field.key}
            onChange={(e) => onPatch(stageIdx, fieldIdx, { key: e.target.value })}
            className={cx(
              "w-full rounded-md border bg-white px-3 py-2 font-mono text-xs outline-none focus:ring-1",
              keyInvalid
                ? "border-red-400 focus:border-red-500 focus:ring-red-400"
                : "border-slate-300 focus:border-brand focus:ring-brand"
            )}
          />
          {keyInvalid && (
            <span className="block text-[11px] text-red-500">
              Chave obrigatória e única dentro da etapa.
            </span>
          )}
        </label>

        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-600">Tipo</span>
            <Select
              value={field.type}
              onChange={(e) =>
                onPatch(stageIdx, fieldIdx, { type: e.target.value as FieldType })
              }
              className="w-full"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex flex-col">
            <IconBtn
              label="Subir"
              disabled={isFirst}
              onClick={() => onMove(stageIdx, fieldIdx, -1)}
            >
              <ChevronRight width={14} height={14} className="-rotate-90" />
            </IconBtn>
            <IconBtn
              label="Descer"
              disabled={isLast}
              onClick={() => onMove(stageIdx, fieldIdx, 1)}
            >
              <ChevronRight width={14} height={14} className="rotate-90" />
            </IconBtn>
          </div>
          <IconBtn
            label="Remover campo"
            danger
            onClick={() => onRemove(stageIdx, fieldIdx)}
          >
            <Trash width={14} height={14} />
          </IconBtn>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(field.required)}
            onChange={(e) => onPatch(stageIdx, fieldIdx, { required: e.target.checked })}
            className="h-4 w-4 accent-teal-600"
          />
          <span className="text-xs text-slate-600">
            Obrigatório <span className="text-slate-400">(bloqueia o fecho da etapa)</span>
          </span>
        </label>
      </div>

      {field.type === "select" && (
        <label className="mt-3 block space-y-1">
          <span className="text-xs font-medium text-slate-600">
            Opções (uma por linha ou separadas por vírgula)
          </span>
          <Textarea
            rows={2}
            value={(field.options ?? []).join("\n")}
            onChange={(e) =>
              onPatch(stageIdx, fieldIdx, { options: parseOptions(e.target.value) })
            }
            placeholder="Opção A, Opção B, Opção C"
          />
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionEditor({
  section,
  stageIdx,
  sectionIdx,
  handlers,
}: {
  section: DucItemSection;
  stageIdx: number;
  sectionIdx: number;
  handlers: StageInspectorHandlers;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="space-y-2.5">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Título da tabela</span>
          <input
            type="text"
            value={section.title}
            onChange={(e) =>
              handlers.onPatchSection(stageIdx, sectionIdx, { title: e.target.value })
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </label>
        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-600">Tipo de secção</span>
            <Select
              value={section.section}
              onChange={(e) =>
                handlers.onPatchSection(stageIdx, sectionIdx, {
                  section: e.target.value as DucSection,
                })
              }
              className="w-full"
            >
              {SECTION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SECTION_LABELS[k]}
                </option>
              ))}
            </Select>
          </label>
          <IconBtn
            label="Remover tabela"
            danger
            onClick={() => handlers.onRemoveSection(stageIdx, sectionIdx)}
          >
            <Trash width={14} height={14} />
          </IconBtn>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Nota (opcional)</span>
          <input
            type="text"
            value={section.hint ?? ""}
            onChange={(e) =>
              handlers.onPatchSection(stageIdx, sectionIdx, { hint: e.target.value })
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            placeholder="Texto de ajuda apresentado sob o título."
          />
        </label>
      </div>

      {/* Colunas */}
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Colunas</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlers.onAddColumn(stageIdx, sectionIdx)}
          >
            <Plus width={13} height={13} /> Coluna
          </Button>
        </div>
        <div className="space-y-2">
          {section.columns.map((col, colIdx) => (
            <div
              key={colIdx}
              className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5"
            >
              <input
                type="text"
                value={col.label}
                onChange={(e) =>
                  handlers.onPatchColumn(stageIdx, sectionIdx, colIdx, {
                    label: e.target.value,
                  })
                }
                placeholder="Etiqueta da coluna"
                className="min-w-[8rem] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
              />
              <Select
                value={col.type}
                onChange={(e) =>
                  handlers.onPatchColumn(stageIdx, sectionIdx, colIdx, {
                    type: e.target.value as FieldType,
                  })
                }
                className="px-2 py-1 text-xs"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(col.own)}
                  onChange={(e) =>
                    handlers.onPatchColumn(stageIdx, sectionIdx, colIdx, {
                      own: e.target.checked,
                    })
                  }
                  className="h-3.5 w-3.5 accent-teal-600"
                />
                Própria
              </label>
              <IconBtn
                label="Remover coluna"
                danger
                onClick={() => handlers.onRemoveColumn(stageIdx, sectionIdx, colIdx)}
              >
                <Trash width={13} height={13} />
              </IconBtn>
            </div>
          ))}
          {section.columns.length === 0 && (
            <p className="text-xs text-slate-400">Sem colunas.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitivos locais.

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </label>
  );
}

function IconBtn({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors disabled:pointer-events-none disabled:opacity-30",
        danger
          ? "hover:bg-red-50 hover:text-red-500"
          : "hover:bg-slate-100 hover:text-slate-700"
      )}
    >
      {children}
    </button>
  );
}

/** Slug estável a partir de um texto — para sugerir chaves de campos. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
