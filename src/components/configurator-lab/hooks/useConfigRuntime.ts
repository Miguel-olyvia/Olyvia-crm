/**
 * useConfigRuntime — orquestra resolve + validate (runtime) para o InteractivePreview.
 *
 * organizationId e priceContext são explícitos. templateId é opcional:
 * se omitido, o preview corre sobre o template ativo (comportamento comercial);
 * se fornecido, opera sobre essa versão específica (Lab).
 * Sem pricing.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resolveConfiguration,
  validateConfiguration,
  type ConfigSelection,
  type ResolveResult,
  type ValidateResult,
} from "@/lib/configurator-runtime";
import { useDebounce } from "@/hooks/useDebounce";

interface Params {
  productId: string | null;
  organizationId: string | null;
  priceContext: string | null;
  templateId?: string | null;
  enabled?: boolean;
}

export function useConfigRuntime({
  productId,
  organizationId,
  priceContext,
  templateId = null,
  enabled = true,
}: Params) {
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const [selection, setSelection] = useState<ConfigSelection>({});
  const debouncedSelection = useDebounce(selection, 300);

  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [validating, setValidating] = useState(false);

  // resolve quando muda product / org / context / templateId
  useEffect(() => {
    if (!enabled || !productId || !organizationId) {
      setResolved(null);
      setResolveError(null);
      setSelection({});
      setValidation(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveConfiguration({ productId, organizationId, priceContext, templateId }).then((r) => {
      if (cancelled) return;
      setResolving(false);
      if ("error" in r) {
        setResolveError(r.error);
        setResolved(null);
        return;
      }
      setResolveError(null);
      setResolved(r);
      setSelection({});
    });
    return () => {
      cancelled = true;
    };
  }, [productId, organizationId, priceContext, templateId, enabled]);

  // validate (runtime) com debounce
  useEffect(() => {
    if (!enabled || !productId || !organizationId || !resolved?.template) {
      setValidation(null);
      return;
    }
    let cancelled = false;
    setValidating(true);
    validateConfiguration({
      productId,
      organizationId,
      selection: debouncedSelection,
      priceContext,
      mode: "runtime",
      templateId,
    }).then((r) => {
      if (cancelled) return;
      setValidating(false);
      if ("error" in r) {
        console.warn("[useConfigRuntime] validate error", r.error);
        return;
      }
      setValidation(r);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSelection, productId, organizationId, priceContext, templateId, enabled, resolved?.template?.id]);

  const setSlotValue = useCallback((slotId: string, value: ConfigSelection[string]) => {
    setSelection((prev) => ({ ...prev, [slotId]: value }));
  }, []);

  const clearSlot = useCallback((slotId: string) => {
    setSelection((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  const errors = validation?.errors ?? [];
  const warnings = validation?.warnings ?? [];
  const effectiveOptions = validation?.effective_options_per_slot ?? {};
  const hiddenSlots = useMemo(() => new Set(validation?.hidden_slots ?? []), [validation?.hidden_slots]);
  const requiredSlots = useMemo(() => new Set(validation?.required_slots ?? []), [validation?.required_slots]);

  return {
    resolving,
    resolveError,
    resolved,
    selection,
    setSlotValue,
    clearSlot,
    validating,
    validation,
    errors,
    warnings,
    effectiveOptions,
    hiddenSlots,
    requiredSlots,
  };
}
