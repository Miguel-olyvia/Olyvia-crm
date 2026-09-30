import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/useTranslation";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import {
  CHECKOUT_CODE_KEYS,
  CHECKOUT_STATUS_KEYS,
  PORTAL_CODE_KEYS,
  PORTAL_STATUS_KEYS,
  resolveFunctionErrorKey,
} from "@/components/billing/billingUtils";

const P = "billing.page.";

interface CheckoutOptions {
  body: Record<string, unknown>;
  /** Identifies what is in progress (package id, plan key...), for per-button spinners. */
  actionId: string;
  successKey: string;
  errorTitleKey: string;
}

/**
 * Purchase and payment-portal calls for one organization. One action at a time:
 * the guard is a ref (a second click in the same tick is dropped) and stays set
 * after a redirect, because the page is leaving.
 */
export function useBillingActions(organizationId: string | null, canManageBilling: boolean, onChanged: () => void) {
  const { t } = useTranslation();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const busyRef = useRef(false);
  const orgRef = useRef(organizationId);

  // Busy state belongs to one organization: switching org must not carry it over.
  useEffect(() => {
    orgRef.current = organizationId;
    busyRef.current = false;
    setActiveAction(null);
  }, [organizationId]);

  // Back/forward cache restore after the Stripe redirect: the page comes back
  // frozen in its "redirecting" state, so release the guard.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        busyRef.current = false;
        setActiveAction(null);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const run = useCallback(
    async (
      actionId: string,
      execute: () => Promise<{ redirected: boolean }>,
      onError: (error: any) => Promise<void>,
    ) => {
      if (!organizationId || !canManageBilling || busyRef.current) return;
      busyRef.current = true;
      setActiveAction(actionId);
      const startedFor = organizationId;
      let redirecting = false;
      try {
        redirecting = (await execute()).redirected;
      } catch (error: any) {
        await onError(error);
      } finally {
        // Only release if the organization did not change meanwhile (the switch already reset the guard).
        if (!redirecting && orgRef.current === startedFor) {
          busyRef.current = false;
          setActiveAction(null);
        }
      }
    },
    [organizationId, canManageBilling],
  );

  const startCheckout = useCallback(
    ({ body, actionId, successKey, errorTitleKey }: CheckoutOptions) =>
      run(
        actionId,
        async () => {
          const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", {
            body: { organization_id: organizationId, ...body },
          });
          if (error) throw error;
          if (data?.error) throw data;
          if (data?.mode === "stripe" && data?.url) {
            window.location.href = data.url;
            return { redirected: true };
          }
          // mode === 'manual' (or unknown response): confirm and reload.
          toast.success(t(successKey));
          onChanged();
          return { redirected: false };
        },
        async (error) => {
          const mappedKey = await resolveFunctionErrorKey(error, CHECKOUT_CODE_KEYS, CHECKOUT_STATUS_KEYS);
          const message = mappedKey ? t(mappedKey) : await getFriendlyErrorMessage(error);
          toast.error(`${t(errorTitleKey)}: ${message}`);
        },
      ),
    [run, organizationId, t, onChanged],
  );

  const openPortal = useCallback(
    () =>
      run(
        "portal",
        async () => {
          const { data, error } = await supabase.functions.invoke("stripe-create-portal-session", {
            body: { organization_id: organizationId },
          });
          if (error) throw error;
          if (data?.error) throw data;
          if (typeof data?.url === "string" && data.url) {
            window.location.href = data.url;
            return { redirected: true };
          }
          throw new Error("portal_no_url");
        },
        async (error) => {
          const mappedKey = await resolveFunctionErrorKey(error, PORTAL_CODE_KEYS, PORTAL_STATUS_KEYS);
          const message = mappedKey ? t(mappedKey) : t(`${P}portal.errorInternal`);
          toast.error(`${t(`${P}portal.errorTitle`)}: ${message}`);
        },
      ),
    [run, organizationId, t],
  );

  return { activeAction, busy: activeAction !== null, startCheckout, openPortal };
}
