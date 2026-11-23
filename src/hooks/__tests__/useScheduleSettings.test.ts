import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// A confirmacao da visita configura-se so no formulario. O interruptor da
// organizacao (schedule_settings.send_confirmation_on_confirm) saiu do ecra e
// a coluna fica inerte na base: o ecra de definicoes nunca a pode voltar a
// gravar, nem com um valor antigo lido da base.

const updateSpy = vi.fn();
const insertSpy = vi.fn();
let settingsRow: Record<string, unknown> | null = null;

vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: () => Promise.resolve("biz-user"),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: () => Promise.resolve({ data: { holidays: [] }, error: null }) },
    from: (table: string) => {
      if (table === "schedule_holidays") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.or = () => chain;
        chain.order = () => Promise.resolve({ data: [], error: null });
        chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
        return chain;
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: settingsRow, error: null }) }),
        }),
        update: (payload: Record<string, unknown>) => {
          updateSpy(payload);
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert: (payload: Record<string, unknown>) => {
          insertSpy(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "novo", ...payload }, error: null }),
            }),
          };
        },
      };
    },
  },
}));

import { useScheduleSettings } from "../useScheduleSettings";

const FIELD = "send_confirmation_on_confirm";

describe("useScheduleSettings: o interruptor da confirmacao no CRM ja nao existe", () => {
  beforeEach(() => {
    updateSpy.mockClear();
    insertSpy.mockClear();
    settingsRow = null;
  });

  it.each([true, false])(
    "uma linha lida da base com %s nao traz o campo para o estado do ecra",
    async (stored) => {
      settingsRow = { id: "s1", organization_id: "org", country_code: "PT", [FIELD]: stored };
      const { result } = renderHook(() => useScheduleSettings("org"));
      await waitFor(() => expect(result.current.settings?.id).toBe("s1"));
      expect(result.current.settings).not.toHaveProperty(FIELD);
    },
  );

  it("guardar sobre uma linha existente nao manda o campo (nem com valor antigo true)", async () => {
    settingsRow = { id: "s1", organization_id: "org", country_code: "PT", [FIELD]: true };
    const { result } = renderHook(() => useScheduleSettings("org"));
    await waitFor(() => expect(result.current.settings?.id).toBe("s1"));

    // o que o ecra envia: a linha inteira com as edicoes por cima
    await act(async () => {
      await result.current.saveSettings({ ...(result.current.settings ?? {}), timezone: "Europe/Madrid" });
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.timezone).toBe("Europe/Madrid");
    expect(payload).not.toHaveProperty(FIELD);
  });

  it("um valor antigo que alguem passe a saveSettings tambem e retirado do UPDATE", async () => {
    settingsRow = { id: "s1", organization_id: "org", country_code: "PT" };
    const { result } = renderHook(() => useScheduleSettings("org"));
    await waitFor(() => expect(result.current.settings?.id).toBe("s1"));

    await act(async () => {
      await result.current.saveSettings({ timezone: "Europe/Lisbon", [FIELD]: true } as never);
    });

    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty(FIELD);
    expect(payload.timezone).toBe("Europe/Lisbon");
  });

  it("criar as definicoes pela primeira vez nao manda o campo (a omissao da base fica false)", async () => {
    settingsRow = null;
    const { result } = renderHook(() => useScheduleSettings("org"));
    await waitFor(() => expect(result.current.settings?.id).toBe(""));

    await act(async () => {
      await result.current.saveSettings({ timezone: "Europe/Lisbon", [FIELD]: true } as never);
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.organization_id).toBe("org");
    expect(payload).not.toHaveProperty(FIELD);
  });
});
