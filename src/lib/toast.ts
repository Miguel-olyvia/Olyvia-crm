/**
 * Sanitizing wrapper around `sonner`'s `toast`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The app has two toast channels:
 *
 *  - Channel A: `src/hooks/use-toast.ts` — a single choke point that already
 *    runs every message through `sanitizeDbErrorForDisplay`, covering ~167
 *    call sites without editing any of them.
 *  - Channel B: the files that call `sonner` directly. They bypass channel A
 *    entirely, so a raw Postgres/PostgREST error handed to `toast.error(...)`
 *    used to reach the user verbatim AND go unreported.
 *
 * This module is channel B's equivalent choke point: import `toast` from here
 * instead of from `sonner` and the same sanitizer runs.
 *
 * WHAT IT CHANGES
 * ---------------
 * Only the *displayed text*. The message and `data.description` are run
 * through the sanitizer when — and only when — they are plain strings.
 * Everything else (ReactNode titles, render functions, JSX descriptions,
 * durations, actions, ids, variants, return values) is forwarded to `sonner`
 * untouched. Behaviour is otherwise identical to importing `sonner` directly.
 *
 * NEVER BREAKS A TOAST
 * --------------------
 * `sanitizeDbErrorForDisplay` is documented as never throwing, but this
 * wrapper does not rely on that: every call is guarded, and any failure
 * degrades to "show the original text, unsanitized". A toast must never be
 * lost because of sanitization.
 *
 * NOTE: `<Toaster />` is a component, not a notification — it still comes from
 * `sonner` (via `src/components/ui/sonner.tsx`) and is unaffected by this.
 */
import { toast as sonnerToast } from "sonner";
import { sanitizeDbErrorForDisplay } from "@/utils/sanitizeDbErrorForDisplay";

type SonnerToast = typeof sonnerToast;
type ToastData = Parameters<SonnerToast>[1];

/**
 * Sanitizes a string, degrading to the original value on any failure.
 */
function safeText(value: string): string {
  try {
    return sanitizeDbErrorForDisplay(value).text;
  } catch {
    return value;
  }
}

/**
 * Sanitizes the toast title only when it is a plain string. ReactNodes and
 * render functions are passed through as-is — they are authored markup, not
 * database output.
 */
function sanitizeMessage<T>(message: T): T {
  return typeof message === "string" ? (safeText(message) as unknown as T) : message;
}

/**
 * Returns a copy of `data` with a sanitized `description` when that field is a
 * plain string. Returns the exact same object reference otherwise, so options
 * carrying non-serializable values (actions, JSX) are never cloned.
 */
function sanitizeData(data?: ToastData): ToastData | undefined {
  if (!data || typeof data.description !== "string") return data;
  const sanitized = safeText(data.description);
  if (sanitized === data.description) return data;
  return { ...data, description: sanitized };
}

/**
 * Wraps one sonner entry point so it sanitizes the title and the string
 * description. Call arity is preserved: when the caller passed no options
 * object, none is forwarded — the wrapper must be indistinguishable from
 * calling `sonner` directly.
 */
function withSanitizedText<F extends (message: never, data?: never) => unknown>(fn: F) {
  return (...args: Parameters<F>): ReturnType<F> => {
    const message = sanitizeMessage(args[0]);
    return (args.length > 1
      ? fn(message, sanitizeData(args[1] as ToastData) as never)
      : fn(message)) as ReturnType<F>;
  };
}

const sanitizingToast = withSanitizedText(
  sonnerToast as unknown as (message: never, data?: never) => string | number
);

/**
 * Drop-in replacement for `sonner`'s `toast`.
 *
 * Sanitized variants: the callable form plus `success`, `error`, `info`,
 * `warning`, `message` and `loading` — every entry point that takes
 * user-facing text.
 *
 * Passed straight through: `promise`, `custom`, `dismiss`, `getHistory` and
 * `getToasts` — these take promises, JSX or ids rather than a display string.
 * `toast.promise`'s own `success`/`error` strings are NOT sanitized; migrate
 * such call sites deliberately rather than assuming coverage.
 */
export const toast: SonnerToast = Object.assign(sanitizingToast, sonnerToast, {
  success: withSanitizedText(sonnerToast.success),
  error: withSanitizedText(sonnerToast.error),
  info: withSanitizedText(sonnerToast.info),
  warning: withSanitizedText(sonnerToast.warning),
  message: withSanitizedText(sonnerToast.message),
  loading: withSanitizedText(sonnerToast.loading),
}) as unknown as SonnerToast;
