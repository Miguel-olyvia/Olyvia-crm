import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, EmptyState } from "./ui";
import { MapPin } from "./icons";
import { coordenadasValidas } from "../domain/mapa";
import type { OrdemNaAgenda } from "../domain/agenda";
import type { LocalRow } from "../lib/dados";

/**
 * Onde está o trabalho, num mapa.
 *
 * A pergunta que uma lista não responde: as quatro ordens de amanhã estão
 * todas na mesma zona, ou espalhadas pela cidade? Quem coordena decide o dia
 * a olhar para isto, e não a ler moradas uma a uma.
 *
 * ⚠ OS MOSAICOS DO MAPA — LER ANTES DE CRESCER
 *
 * Vêm do OpenStreetMap. São de graça e não exigem chave, mas a política de uso
 * deles pede que não se lhes faça uso intensivo: servem um piloto e uma
 * equipa de coordenação, não servem um produto com muitos ecrãs abertos o dia
 * todo. Quando isso acontecer é preciso um serviço pago (MapTiler, Mapbox,
 * Stadia) — troca-se `MOSAICOS` e mais nada muda.
 *
 * A CARTO foi a primeira escolha e passou a exigir chave: os mosaicos vinham
 * com "API KEY REQUIRED" escrito por cima. Só se viu a olhar para o ecrã.
 *
 * Os mosaicos são **imagens**, e é por isso que passam na política de
 * segurança do site, que só deixa `img-src https:`.
 *
 * ⚠ SÓ APARECE O QUE TEM PONTO
 *
 * Uma ordem cujo local não tem coordenadas não se pode desenhar. O ecrã diz
 * quantas ficaram de fora, em vez de as esconder — um mapa que mostra metade
 * do dia e não avisa é pior do que nenhum.
 */

const MOSAICOS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUICAO =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** As cores dos estados, iguais às das listas. */
const COR: Record<string, string> = {
  por_aprovar: "#a855f7",
  agendada: "#0ea5e9",
  em_curso: "#f59e0b",
  pausada: "#94a3b8",
  fechada: "#10b981",
  confirmada: "#059669",
};

interface Pino {
  ordem: OrdemNaAgenda;
  local: LocalRow;
  lat: number;
  lng: number;
}

/** Um pino desenhado à mão: sem imagens externas, e com a cor do estado. */
function icone(cor: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html:
      `<span style="display:block;width:18px;height:18px;border-radius:9999px;` +
      `background:${cor};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function MapaDaAgenda({
  ordens,
  locais,
  aoEscolher,
}: {
  ordens: readonly OrdemNaAgenda[];
  locais: readonly LocalRow[];
  aoEscolher: (codigo: string) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  // O clique vive num `ref` para o mapa não ter de ser recriado a cada render.
  const escolher = useRef(aoEscolher);
  escolher.current = aoEscolher;

  const { pinos, semPonto } = useMemo(() => {
    const porId = new Map(locais.map((l) => [l.id, l]));
    const com: Pino[] = [];
    let sem = 0;

    for (const o of ordens) {
      const l = o.local_id ? porId.get(o.local_id) : undefined;
      if (l && coordenadasValidas(l.latitude, l.longitude)) {
        com.push({ ordem: o, local: l, lat: l.latitude as number, lng: l.longitude as number });
      } else {
        sem += 1;
      }
    }
    return { pinos: com, semPonto: sem };
  }, [ordens, locais]);

  /* O mapa cria-se uma vez. Recriá-lo a cada mudança de filtro faria a vista
     saltar para o início, e quem estava a olhar para uma zona perdia-a. */
  useEffect(() => {
    if (!caixa.current || mapa.current) return;
    const m = L.map(caixa.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(MOSAICOS, { attribution: ATRIBUICAO, maxZoom: 19 }).addTo(m);
    m.setView([39.5, -8.0], 6); // Portugal, até haver pinos.
    camada.current = L.layerGroup().addTo(m);
    mapa.current = m;

    // O Leaflet mede o contentor no momento em que nasce. Se nessa altura o
    // ecrã ainda não estava desenhado, fica com um quadrado pequeno no meio e
    // só carrega os mosaicos dessa área — foi o que aconteceu.
    const medir = () => m.invalidateSize();
    const t = window.setTimeout(medir, 0);
    const observador = new ResizeObserver(medir);
    observador.observe(caixa.current);

    return () => {
      window.clearTimeout(t);
      observador.disconnect();
      m.remove();
      mapa.current = null;
      camada.current = null;
    };
  }, []);

  /* Os pinos redesenham-se a cada mudança. */
  useEffect(() => {
    const m = mapa.current;
    const c = camada.current;
    if (!m || !c) return;

    c.clearLayers();
    if (pinos.length === 0) return;

    for (const p of pinos) {
      const marca = L.marker([p.lat, p.lng], {
        icon: icone(COR[p.ordem.estado] ?? "#64748b"),
        title: `${p.ordem.codigo} — ${p.ordem.titulo}`,
      });
      marca.bindPopup(
        `<div style="font:13px/1.4 system-ui,sans-serif;min-width:170px">` +
          `<div style="font-family:ui-monospace,monospace;font-size:11px;color:#64748b">` +
          escaparHtml(p.ordem.codigo) +
          `</div>` +
          `<div style="font-weight:600;margin:2px 0 4px">${escaparHtml(p.ordem.titulo)}</div>` +
          `<div style="color:#64748b">${escaparHtml(p.local.nome)}</div>` +
          `</div>`
      );
      marca.on("click", () => escolher.current(p.ordem.codigo));
      marca.addTo(c);
    }

    // Enquadra tudo o que há para ver. Com um pino só, aproxima-se do bairro —
    // um mapa do país inteiro com um ponto no meio não diz nada.
    const limites = L.latLngBounds(pinos.map((p) => [p.lat, p.lng] as [number, number]));
    if (pinos.length === 1) m.setView(limites.getCenter(), 15);
    else m.fitBounds(limites, { padding: [40, 40], maxZoom: 16 });
  }, [pinos]);

  return (
    <Card className="overflow-hidden p-0">
      {pinos.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={<MapPin className="h-5 w-5" />}
            title="Nada para mostrar no mapa"
            description={
              semPonto > 0
                ? `Há ${semPonto} ${semPonto === 1 ? "ordem" : "ordens"} neste período, mas o local delas não tem ponto marcado. Marca-se na ficha do sítio, em Locais, com o GPS ou colando um link do Google Maps.`
                : "Não há ordens neste período."
            }
          />
        </div>
      ) : (
        <>
          <div ref={caixa} className="h-[26rem] w-full sm:h-[32rem]" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span>
              {pinos.length} {pinos.length === 1 ? "ordem no mapa" : "ordens no mapa"}
            </span>
            {/* Um mapa que mostra metade do dia e não avisa é pior do que
                nenhum. */}
            {semPonto > 0 && (
              <span className="text-amber-700">
                {semPonto} sem ponto marcado — {semPonto === 1 ? "não aparece" : "não aparecem"} aqui
              </span>
            )}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {Object.entries({
                agendada: "Agendada",
                em_curso: "Em curso",
                fechada: "Fechada",
              }).map(([k, t]) => (
                <span key={k} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: COR[k] }}
                  />
                  {t}
                </span>
              ))}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/** O título de uma ordem vai para dentro de HTML. Escapa-se sempre. */
function escaparHtml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* O mapa não deixa o cursor por cima dos pinos sem isto. */
const ESTILO = `.leaflet-container{font:inherit;background:#eef2f7}
.leaflet-container a{color:#6d28d9}`;
if (typeof document !== "undefined" && !document.getElementById("estilo-mapa")) {
  const el = document.createElement("style");
  el.id = "estilo-mapa";
  el.textContent = ESTILO;
  document.head.appendChild(el);
}
