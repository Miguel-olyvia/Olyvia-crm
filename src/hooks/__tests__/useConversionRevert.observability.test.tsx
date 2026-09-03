/**
 * `useConversionRevert` is one of the 159 caught-error sites instrumented by the
 * "errors that only lived in a toast" sweep. It is a good stand-in for the whole
 * class: the RPC failure is caught, shown to the user in a destructive toast,
 * and the hook returns `false` so the caller carries on. Nothing ever left the
 * browser.
 *
 * The instrumentation is meant to be purely additive, so these tests assert both
 * halves of that claim:
 *
 *  1. the failure is now reported to Sentry, tagged `entity-conversion`;
 *  2. NOTHING the user sees changed — the same toast, with the same title, the
 *     same raw `error.message` description and the same `destructive` variant,
 *     the same `false` return value, and no exception escaping to the caller.
 *
 * Point 2 is the one that matters most: hiding the raw technical message from
 * the user is a separate, deliberately deferred decision, and this test is what
 * stops the sweep from quietly making it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const captureException = vi.fn();
const toast = vi.fn();
const rpc = vi.fn();

vi.mock("@sentry/react", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

// Identity translation: the error toast is asserted on the exact key the hook
// passes, so a reworded toast still fails the test. O aviso de sucesso não passa
// por traduções — é português literal, como o diálogo que o antecede — e por
// isso é asserido pelo texto que o utilizador lê mesmo.
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useConversionRevert } from "@/hooks/useConversionRevert";

beforeEach(() => {
  captureException.mockReset();
  toast.mockReset();
  rpc.mockReset();
});

describe("useConversionRevert observability", () => {
  it("reports the failed revert to Sentry, tagged entity-conversion", async () => {
    const rpcError = new Error('permission denied for function rpc_revert_client_to_lead');
    rpc.mockResolvedValue({ data: null, error: rpcError });

    const { result } = renderHook(() => useConversionRevert());
    await result.current.revertClientToLead("client-1");

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(rpcError, {
      tags: { flow: "entity-conversion" },
    });
  });

  it("still shows the user the exact same destructive toast, raw message included", async () => {
    const rpcError = new Error("null value in column \"source_id\" violates not-null constraint");
    rpc.mockResolvedValue({ data: null, error: rpcError });

    const { result } = renderHook(() => useConversionRevert());
    await result.current.revertClientToLead("client-1");

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({
      title: "conversion.revert.error",
      description: "null value in column \"source_id\" violates not-null constraint",
      variant: "destructive",
    });
  });

  it("does not change the caller's contract: it resolves to false instead of throwing", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("boom") });

    const { result } = renderHook(() => useConversionRevert());

    await expect(result.current.revertClientToLead("client-1")).resolves.toBe(false);
  });

  it("keeps working when Sentry itself blows up — observability must not break the flow", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    captureException.mockImplementation(() => {
      throw new Error("Sentry not initialised");
    });

    const { result } = renderHook(() => useConversionRevert());

    // The user still gets their toast and the caller still gets `false`, even
    // though the reporting call threw underneath.
    await expect(result.current.revertClientToLead("client-1")).resolves.toBe(false);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("reports nothing and shows the success toast naming the stage the lead went back to", async () => {
    rpc.mockResolvedValue({
      data: { status: "qualified", estado_anterior_conhecido: true },
      error: null,
    });

    const { result } = renderHook(() => useConversionRevert());
    const ok = await result.current.revertClientToLead("client-1");

    expect(ok).toBe(true);
    expect(captureException).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: "Conversão revertida",
      description:
        "A ficha de cliente foi apagada e a pessoa voltou ao funil de leads em Qualificado." +
        " Os orçamentos, propostas, contratos e acessos ao portal continuam ligados à pessoa e não se perdem.",
    });
  });

  // O ecrã não pode afirmar que repôs o estado anterior quando ele nunca foi
  // guardado: aí a lead vai para negociação e a mensagem tem de o dizer.
  it("says the previous stage was never recorded instead of pretending it knows", async () => {
    rpc.mockResolvedValue({
      data: { status: "negotiation", estado_anterior_conhecido: false },
      error: null,
    });

    const { result } = renderHook(() => useConversionRevert());
    await result.current.revertClientToLead("client-1");

    expect(toast).toHaveBeenCalledWith({
      title: "Conversão revertida",
      description:
        "A ficha de cliente foi apagada e a pessoa voltou ao funil de leads." +
        " O estado anterior não ficou registado, por isso ficou em Negociação." +
        " Os orçamentos, propostas, contratos e acessos ao portal continuam ligados à pessoa e não se perdem.",
    });
  });

  it("calls the lead-revert RPC, not the retired contact one", async () => {
    rpc.mockResolvedValue({ data: { status: "negotiation" }, error: null });

    const { result } = renderHook(() => useConversionRevert());
    await result.current.revertClientToLead("client-1");

    expect(rpc).toHaveBeenCalledWith("rpc_revert_client_to_lead", { p_client_id: "client-1" });
  });
});
