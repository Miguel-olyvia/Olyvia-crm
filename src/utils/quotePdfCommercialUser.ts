import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve o "comercial" do orçamento para mostrar no rodapé do PDF.
 *
 * Ordem de prioridade:
 *   1. quotes.assigned_to (anew_users.id)
 *   2. quotes.created_by  (anew_users.id)
 *   3. utilizador autenticado (fallback final)
 *
 * O PDF de um orçamento deve ser determinístico: o contacto no rodapé
 * representa o comercial responsável pelo orçamento, não quem está a
 * descarregar/visualizar.
 */
export async function resolveQuotePdfCommercialUser(quoteData: any) {
  const commercialId = quoteData?.assigned_to ?? quoteData?.created_by ?? null;

  if (commercialId) {
    const { data: commercial } = await (supabase as any)
      .from("anew_users")
      .select("id, name, email, phone")
      .eq("id", commercialId)
      .maybeSingle();

    if (commercial) {
      return {
        id: commercial.id,
        name: commercial.name || "",
        email: commercial.email || "",
        phone: commercial.phone || "",
      };
    }
  }

  // Fallback final: utilizador autenticado (orçamentos antigos sem assigned_to/created_by)
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: authAnewUser } = await (supabase as any)
    .from("anew_users")
    .select("id, name, email, phone")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  return {
    id: authAnewUser?.id || authUser.id,
    name: authAnewUser?.name || "",
    email: authAnewUser?.email || authUser.email || "",
    phone: authAnewUser?.phone || "",
  };
}
