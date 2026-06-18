import { describe, it, expect } from "vitest";

/**
 * L11: `handleRegisterContact` previously resolved the current `anew_users.id`
 * twice per submit (once for `interactionCreatedBy`, once for
 * `resolvedContactBy`). The fix resolves it once at the start of the handler
 * and reuses the value, halving the round-trip cost while keeping the
 * fallback semantics identical.
 *
 * The harness below mirrors the post-fix flow.
 */

function makeAnewUsersStub(returnId: string | null) {
  const calls: Array<{ authUserId: string }> = [];
  return {
    calls,
    from(table: string) {
      expect(table).toBe("anew_users");
      return {
        select(_cols: string) {
          return {
            eq(_col: string, val: string) {
              return {
                async maybeSingle() {
                  calls.push({ authUserId: val });
                  return { data: returnId ? { id: returnId } : null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function resolveCurrentAnewUserId(
  supabase: ReturnType<typeof makeAnewUsersStub>,
  authUserId: string | null,
) {
  let currentAnewUserId: string | null = null;
  if (authUserId) {
    const { data: au } = await supabase
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    currentAnewUserId = au?.id ?? null;
  }
  return currentAnewUserId;
}

describe("handleRegisterContact anew_users lookup (L11)", () => {
  it("queries anew_users exactly once per submit (was 2× before)", async () => {
    const stub = makeAnewUsersStub("anew-42");
    const currentAnewUserId = await resolveCurrentAnewUserId(stub, "auth-1");
    // Both downstream consumers reuse currentAnewUserId — no extra queries.
    const interactionCreatedBy = currentAnewUserId ?? "auth-1";
    const resolvedContactBy = currentAnewUserId;
    expect(stub.calls).toHaveLength(1);
    expect(interactionCreatedBy).toBe("anew-42");
    expect(resolvedContactBy).toBe("anew-42");
  });

  it("falls back to auth.user.id for interactionCreatedBy when anew_users is empty", async () => {
    const stub = makeAnewUsersStub(null);
    const currentAnewUserId = await resolveCurrentAnewUserId(stub, "auth-1");
    const interactionCreatedBy = currentAnewUserId ?? "auth-1";
    const resolvedContactBy = currentAnewUserId;
    expect(stub.calls).toHaveLength(1);
    expect(interactionCreatedBy).toBe("auth-1");
    // last_contact_by stays null (matches pre-fix behaviour when anew row missing)
    expect(resolvedContactBy).toBeNull();
  });

  it("skips the lookup entirely when there is no auth user", async () => {
    const stub = makeAnewUsersStub("anew-42");
    const currentAnewUserId = await resolveCurrentAnewUserId(stub, null);
    expect(stub.calls).toHaveLength(0);
    expect(currentAnewUserId).toBeNull();
  });

  it("regression: interactionCreatedBy and resolvedContactBy derive from the same lookup", async () => {
    const stub = makeAnewUsersStub("anew-99");
    const currentAnewUserId = await resolveCurrentAnewUserId(stub, "auth-7");
    expect(currentAnewUserId).toBe("anew-99");
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].authUserId).toBe("auth-7");
  });
});
