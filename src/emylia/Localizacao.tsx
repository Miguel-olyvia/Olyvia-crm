// Morada da obra a partir da localização do dispositivo.
// Útil na visita: o comercial está no local e um toque preenche a rua, o
// código postal e a localidade. O browser pede autorização na primeira vez.
// No protótipo, a morada vem do OpenStreetMap (Nominatim). Na app, há que
// escolher o serviço e abrir "geolocation" no Permissions-Policy, que hoje o bloqueia.
import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

interface Morada { morada: string; cp: string; localidade: string; concelho: string }

export async function moradaDaPosicao(lat: number, lon: number): Promise<Morada> {
  const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt&lat=${lat}&lon=${lon}`;
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("morada " + r.status);
  const j = await r.json();
  const a = (j && j.address) || {};
  const rua = a.road || a.pedestrian || a.footway || a.residential || "";
  return {
    morada: [rua, a.house_number].filter(Boolean).join(" "),
    cp: a.postcode || "",
    // o Nominatim junta às vezes a união de freguesias entre parênteses: fica só o nome
    localidade: String(a.town || a.city || a.village || a.suburb || a.hamlet || "").replace(/\s*\(.*\)\s*$/, ""),
    concelho: a.municipality || a.county || a.city || "",
  };
}

type Estado = { k: "parado" } | { k: "a procurar" } | { k: "ok"; t: string; aviso?: boolean } | { k: "erro"; t: string };

export function UsarLocalizacao({ ctx, d, texto = "Usar a localização deste dispositivo" }: { ctx: Ctx; d: Negocio; texto?: string }) {
  const [e, setE] = useState<Estado>({ k: "parado" });

  const usar = () => {
    if (!("geolocation" in navigator)) { setE({ k: "erro", t: "Este dispositivo não dá a localização. Escreva a morada à mão." }); return; }
    setE({ k: "a procurar" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        try {
          const m = await moradaDaPosicao(latitude, longitude);
          if (!m.morada && !m.localidade) throw new Error("sem morada");
          ctx.run(() => ctx.A.localizacao(d.id, m, latitude, longitude, accuracy));
          const prec = Math.round(accuracy);
          setE(prec > 100
            ? { k: "ok", aviso: true, t: `A localização é pouco precisa (± ${prec} m). Confirme a rua e o número.` }
            : { k: "ok", t: `Morada preenchida pela localização (± ${prec} m). Confirme o número da porta.` });
        } catch {
          setE({ k: "erro", t: "Não foi possível saber a morada deste ponto. Escreva-a à mão." });
        }
      },
      (err) => setE({
        k: "erro",
        t: err.code === err.PERMISSION_DENIED
          ? "Sem autorização para usar a localização. Pode ativá-la nas definições do browser, ou escrever a morada à mão."
          : "Não foi possível obter a localização. Tente outra vez, ou escreva a morada à mão.",
      }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="lg" onClick={usar} disabled={e.k === "a procurar"} className="w-full sm:w-auto">
        {e.k === "a procurar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="mr-2 h-4 w-4" aria-hidden="true" />}
        {e.k === "a procurar" ? "A procurar a morada…" : texto}
      </Button>
      <p aria-live="polite" className={cn("text-[15px]", e.k === "erro" ? "text-destructive" : e.k === "ok" && e.aviso ? "text-warning" : "text-muted-foreground")}>
        {e.k === "ok" || e.k === "erro" ? e.t : ""}
      </p>
    </div>
  );
}
