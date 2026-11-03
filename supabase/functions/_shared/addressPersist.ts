/**
 * Gravacao da morada de uma lead (anew_addresses + anew_entity_addresses).
 *
 * Usada por create-lead (backfill de entidade reutilizada) e update-lead. A
 * gravacao e secundaria: o pedido do formulario publico NUNCA pode falhar por
 * causa dela, por isso esta funcao nunca lanca. Em vez de engolir o erro so
 * com console.error, faz UMA repeticao em erros transitorios e, se continuar
 * a falhar, regista no Sentry com etiquetas fixas (funcao, passo, codigo do
 * Postgres) e SEM rua, codigo postal, e-mail ou telefone.
 *
 * Se a morada foi criada por esta chamada mas o vinculo falhou, apaga-a para
 * nao deixar uma morada orfa (so se ninguem mais a vincular).
 */
import { captureError } from "./sentry.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export type AddressPersistStep = "address_insert" | "entity_address_insert" | "orphan_cleanup";

export interface PersistAddressParams {
  entityId: string;
  /** Id de uma morada ja existente com o mesmo address_key (reutilizar). */
  existingAddressId: string | null;
  addressKey: string;
  street: string;
  postalCode: string;
  city: string;
  createdBy: string | null;
  /** Nome da funcao Edge, para a etiqueta do registo. */
  fn: string;
}

export interface PersistAddressResult {
  ok: boolean;
  failedStep?: AddressPersistStep;
}

const RETRY_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Erros deterministas (violacao de integridade, classe 23, ou sintaxe/
 * permissao, classe 42) nao melhoram ao repetir. O resto (rede, timeouts,
 * bloqueios, erros sem codigo) trata-se como transitorio.
 */
export function isTransientDbError(error: { code?: string | null } | null | undefined): boolean {
  const code = typeof error?.code === "string" ? error.code : "";
  return !(code.startsWith("23") || code.startsWith("42"));
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : "none";
}

async function report(fn: string, step: AddressPersistStep, error: unknown): Promise<void> {
  try {
    // Mensagem fixa: a mensagem do PostgREST pode trazer valores da linha.
    await captureError(new Error(`address persistence failed: ${step}`), {
      function: fn,
      step,
      pg_code: errorCode(error),
    });
  } catch (_reportErr) {
    // O registo nunca pode partir o pedido.
  }
}

export async function persistEntityAddress(supabase: Db, p: PersistAddressParams): Promise<PersistAddressResult> {
  try {
    let addressId = p.existingAddressId;
    let createdHere = false;

    if (!addressId) {
      const insertOnce = () =>
        supabase
          .from("anew_addresses")
          .insert({
            address_key: p.addressKey,
            street: p.street,
            number: "",
            postal_code: p.postalCode,
            city: p.city || "",
            country: "PT",
            created_by: p.createdBy,
          })
          .select("id")
          .single();

      let { data, error } = await insertOnce();
      if (error && isTransientDbError(error)) {
        console.error(`[${p.fn}] address insert failed, retrying once:`, error);
        await sleep(RETRY_DELAY_MS);
        // A primeira tentativa pode ter gravado apesar do erro: reutilizar.
        const { data: rows } = await supabase
          .from("anew_addresses")
          .select("id")
          .eq("address_key", p.addressKey)
          .order("created_at", { ascending: true })
          .limit(1);
        const reusedId = Array.isArray(rows) && typeof rows[0]?.id === "string" ? rows[0].id : null;
        if (reusedId) {
          data = { id: reusedId };
          error = null;
        } else {
          ({ data, error } = await insertOnce());
          createdHere = !error;
        }
      } else {
        createdHere = !error;
      }
      if (error || !data?.id) {
        console.error(`[${p.fn}] address insert failed (continuing):`, error);
        await report(p.fn, "address_insert", error);
        return { ok: false, failedStep: "address_insert" };
      }
      addressId = data.id as string;
    }

    const linkOnce = () =>
      supabase.from("anew_entity_addresses").insert({
        entity_id: p.entityId,
        address_id: addressId,
        address_type: "primary",
        is_primary: true,
        created_by: p.createdBy,
      });

    let { error: linkError } = await linkOnce();
    if (linkError && isTransientDbError(linkError)) {
      console.error(`[${p.fn}] entity_address insert failed, retrying once:`, linkError);
      await sleep(RETRY_DELAY_MS);
      ({ error: linkError } = await linkOnce());
    }
    if (!linkError) return { ok: true };

    console.error(`[${p.fn}] entity_address insert failed (continuing):`, linkError);
    await report(p.fn, "entity_address_insert", linkError);

    if (createdHere) {
      try {
        const { count, error: countError } = await supabase
          .from("anew_entity_addresses")
          .select("id", { count: "exact", head: true })
          .eq("address_id", addressId);
        if (countError || count !== 0) {
          // Sem certeza de que esta sem vinculos: nao apagar.
          if (countError) await report(p.fn, "orphan_cleanup", countError);
        } else {
          const { error: delError } = await supabase.from("anew_addresses").delete().eq("id", addressId);
          if (delError) {
            console.error(`[${p.fn}] orphan address cleanup failed:`, delError);
            await report(p.fn, "orphan_cleanup", delError);
          }
        }
      } catch (cleanupErr) {
        console.error(`[${p.fn}] orphan address cleanup threw:`, cleanupErr);
        await report(p.fn, "orphan_cleanup", cleanupErr);
      }
    }
    return { ok: false, failedStep: "entity_address_insert" };
  } catch (err) {
    console.error(`[${p.fn}] address persistence failed (continuing):`, err);
    await report(p.fn, "address_insert", err);
    return { ok: false, failedStep: "address_insert" };
  }
}
