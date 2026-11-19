import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import {
  EMAIL_PURPOSE_COLUMN,
  getLocaleTemplateId,
  hasLocaleEntry,
  localeDisplayName,
  setLocaleTemplateId,
  type EmailPurposeKey,
} from "@/lib/formEmailLocales";
import { TEMPLATE_DEFAULT } from "./EmailsTabParts";
import type { EmailTemplateOption, EmailsTabFields, EmailsTabPatch } from "./emailsTabTypes";

/** Aviso discreto (âmbar, legível no tema escuro) que acompanha um ou mais seletores. */
function MissingNote({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

interface EventTemplateSelectProps {
  id: string;
  label: string;
  options: EmailTemplateOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  defaultLabel: string;
  /** Altura mínima de 44px no seletor (alvo de toque). */
  touchTarget?: boolean;
  /** Aviso discreto por baixo deste seletor. */
  note?: string;
  /** Id de um aviso que está fora deste componente e que também descreve o seletor. */
  describedBy?: string;
}

/** Um seletor de modelo de email; a opção por omissão grava null. */
export function EventTemplateSelect({
  id,
  label,
  options,
  value,
  onChange,
  defaultLabel,
  touchTarget,
  note,
  describedBy,
}: EventTemplateSelectProps) {
  const { t } = useTranslation();
  const noteId = note ? `${id}-note` : undefined;
  // Um modelo apagado ou inativo já não vem nas opções: sem isto o seletor ficava em branco.
  const unavailable = !!value && !options.some((tpl) => tpl.id === value);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Select
        value={value || TEMPLATE_DEFAULT}
        onValueChange={(v) => onChange(v === TEMPLATE_DEFAULT ? null : v)}
      >
        <SelectTrigger
          id={id}
          className={touchTarget ? "min-h-[44px]" : undefined}
          aria-describedby={noteId ?? describedBy}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TEMPLATE_DEFAULT}>{defaultLabel}</SelectItem>
          {unavailable && value && <SelectItem value={value}>{t("emailAudience.templateUnavailable")}</SelectItem>}
          {options.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {note && noteId && <MissingNote id={noteId} text={note} />}
    </div>
  );
}

interface PurposeTemplateFieldProps {
  purpose: EmailPurposeKey;
  /** Id do seletor único; no modo por idioma cada seletor recebe `${id}-${idioma}`. */
  id: string;
  label: string;
  /** Nome da finalidade, para o grupo de seletores ser anunciado por inteiro. */
  groupLabel: string;
  options: EmailTemplateOption[];
  branding: EmailsTabFields;
  onPatch: EmailsTabPatch;
  /** Idiomas ativos do formulário, o por omissão primeiro. Menos de dois = seletor único. */
  locales: string[];
  /** Texto da opção «sem modelo» (padrão do sistema; o do comercial tem o seu). */
  defaultLabel: string;
}

/**
 * Modelo de email de uma finalidade. Com um só idioma ativo é o seletor de sempre, que grava
 * na coluna única (e no mapa, se o mapa já tiver entrada do idioma por omissão, porque o servidor
 * usa-a antes da coluna). Com vários, um seletor por idioma, que grava em
 * `email_locale_templates[finalidade][idioma]`; o do idioma por omissão grava também na coluna
 * única, que continua a ser o modelo dos idiomas sem modelo próprio (é o que o servidor usa).
 */
export function PurposeTemplateField({
  purpose,
  id,
  label,
  groupLabel,
  options,
  branding,
  onPatch,
  locales,
  defaultLabel,
}: PurposeTemplateFieldProps) {
  const { t } = useTranslation();
  const column = EMAIL_PURPOSE_COLUMN[purpose];
  const columnValue = branding[column];
  const map = branding.email_locale_templates;
  const defaultLocale = locales[0] ?? "pt";
  const defaultValue = getLocaleTemplateId(map, purpose, defaultLocale) ?? columnValue;
  const writeColumn = (next: string | null): Partial<EmailsTabFields> => ({ [column]: next });

  if (locales.length < 2) {
    return (
      <EventTemplateSelect
        id={id}
        label={label}
        options={options}
        value={defaultValue}
        defaultLabel={defaultLabel}
        onChange={(next) =>
          onPatch({
            ...writeColumn(next),
            ...(hasLocaleEntry(map, purpose, defaultLocale)
              ? { email_locale_templates: setLocaleTemplateId(map, purpose, defaultLocale, next) }
              : {}),
          })
        }
      />
    );
  }

  const columnName = options.find((o) => o.id === columnValue)?.name;
  const ownOf = (locale: string) => (locale === defaultLocale ? defaultValue : getLocaleTemplateId(map, purpose, locale));
  const withoutOwn = locales.filter((locale) => !ownOf(locale));
  // Sem modelo por omissão, todos os idiomas sem modelo próprio caem no padrão do sistema:
  // um só aviso por finalidade, em vez de o repetir em cada idioma.
  const groupNoteId = `${id}-note`;
  const groupNote = !defaultValue
    ? t("emailAudience.localeNoOwnTemplate", { language: withoutOwn.map(localeDisplayName).join(", ") })
    : null;

  // Ao mudar o modelo do idioma por omissão, os outros idiomas sem modelo próprio usavam o da
  // coluna: ficam com ele, em vez de mudarem em silêncio com a coluna.
  const changeDefault = (next: string | null) => {
    let nextMap = map;
    if (columnValue && columnValue !== next) {
      for (const other of locales.slice(1)) {
        if (!getLocaleTemplateId(map, purpose, other)) nextMap = setLocaleTemplateId(nextMap, purpose, other, columnValue);
      }
    }
    onPatch({ ...writeColumn(next), email_locale_templates: setLocaleTemplateId(nextMap, purpose, defaultLocale, next) });
  };

  return (
    <div role="group" aria-label={t("emailAudience.localeGroup", { purpose: groupLabel })} className="space-y-3">
      {locales.map((locale) => {
        const isDefault = locale === defaultLocale;
        const language = localeDisplayName(locale);
        const value = ownOf(locale);
        // Sem modelo próprio, o servidor usa a coluna única; é isso que a opção vazia diz.
        const byDefault = t("emailAudience.localeSameAsDefaultShort");
        const emptyLabel = !isDefault && columnValue ? (columnName ? `${byDefault}: ${columnName}` : byDefault) : defaultLabel;
        const ownNote = !value && !groupNote && !isDefault ? t("emailAudience.localeNoOwnTemplate", { language }) : undefined;
        return (
          <EventTemplateSelect
            key={locale}
            id={`${id}-${locale}`}
            label={`${label} — ${language}`}
            options={options}
            value={value}
            defaultLabel={emptyLabel}
            touchTarget
            note={ownNote}
            describedBy={!value && groupNote ? groupNoteId : undefined}
            onChange={(next) =>
              isDefault
                ? changeDefault(next)
                : onPatch({ email_locale_templates: setLocaleTemplateId(map, purpose, locale, next) })
            }
          />
        );
      })}
      {groupNote && <MissingNote id={groupNoteId} text={groupNote} />}
    </div>
  );
}
