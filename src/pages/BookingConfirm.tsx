import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const PRIMARY = "#85D3BE";

type View = "loading" | "confirmed" | "invalid" | "expired" | "cancelled";

const STRINGS: Record<View, { title: string; body: string }> = {
  loading: { title: "", body: "" },
  confirmed: {
    title: "Visita confirmada",
    body: "Obrigado! A sua confirmação foi registada.",
  },
  invalid: {
    title: "Link inválido",
    body: "Este link de confirmação não é válido.",
  },
  expired: {
    title: "Link expirado",
    body: "Este link já não está disponível — a visita já pode ter acontecido.",
  },
  cancelled: {
    title: "Visita cancelada",
    body: "Esta visita já foi cancelada, por isso não há nada para confirmar.",
  },
};

const errorViewFromCode = (code?: string): View => {
  switch (code) {
    case "EXPIRED":
      return "expired";
    case "CANCELLED":
      return "cancelled";
    default:
      return "invalid";
  }
};

export default function BookingConfirm() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    if (!token) {
      setView("invalid");
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke("confirm-booking", { body: { token } });
      if (error || data?.error) {
        setView(errorViewFromCode(data?.code));
        return;
      }
      setView("confirmed");
    })();
  }, [token]);

  const s = STRINGS[view];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-sm border p-8 text-center">
        {view === "loading" ? (
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: PRIMARY }} />
        ) : view === "confirmed" ? (
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: PRIMARY }} />
        ) : (
          <XCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        )}
        {view !== "loading" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{s.title}</h1>
            <p className="text-sm text-gray-600">{s.body}</p>
          </>
        )}
      </div>
    </div>
  );
}
