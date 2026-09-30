import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { coordenadasValidas, linkParaIr, temSitio } from "../domain/mapa";
import { MapPin } from "./icons";

/**
 * Um ponto no mapa, do tamanho de um cartão.
 *
 * O módulo já tinha mapa — mas só na agenda, e só na vista que ninguém abre
 * primeiro. Quem estava a usar disse-o assim: "no local metermos o Google
 * Maps ou outro tipo de mapa gratuito para ser mais apelativo, inclusive na
 * agenda ao clicar na ordem para ver onde é o trabalho".
 *
 * Uma morada escrita é uma coisa que se lê; um mapa é uma coisa que se
 * reconhece. Antes de sair para um sítio, reconhecer vale mais.
 *
 * ⚠ **OpenStreetMap, não Google.** Não é preciso chave, não é preciso conta,
 * não há fatura no fim do mês, e nada do que aqui se vê sai para um terceiro
 * a não ser o pedido dos quadradinhos da imagem. É o mesmo que a vista de
 * mapa da agenda já usava — uma segunda biblioteca de mapas seria peso a mais
 * pela mesma coisa.
 *
 * O botão "Como lá chegar" abre a navegação do telemóvel (Google Maps, ou o
 * que a pessoa tiver por omissão). Aí o link é externo de propósito: ninguém
 * quer conduzir dentro de um `iframe`.
 */
export default function MapaPequeno({
  sitio,
  nome,
  altura = 160,
  className,
}: {
  /** Qualquer coisa com ponto no mapa — um local, o local de uma ordem. */
  sitio: {
    latitude?: number | null;
    longitude?: number | null;
    morada?: string | null;
    nome?: string | null;
  };
  /** O que aparece no balão. */
  nome?: string | null;
  altura?: number;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);

  const lat = Number(sitio.latitude);
  const lng = Number(sitio.longitude);
  // Desenhar precisa de coordenadas; "como lá chegar" contenta-se com a
  // morada. São duas perguntas diferentes e têm duas respostas diferentes.
  const daParaDesenhar = coordenadasValidas(sitio.latitude, sitio.longitude);

  useEffect(() => {
    if (!daParaDesenhar || !caixa.current || mapa.current) return;

    const m = L.map(caixa.current, {
      center: [lat, lng],
      zoom: 16,
      // Sem controlos: isto é um cartão, não um mapa para explorar. Quem
      // quiser explorar carrega em "Como lá chegar" e sai daqui.
      zoomControl: false,
      attributionControl: true,
      // O scroll da página não pode ficar preso num mapa a meio de um ecrã.
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);

    L.marker([lat, lng], {
      icon: L.divIcon({
        className: "",
        html:
          `<span style="display:block;width:18px;height:18px;border-radius:9999px;` +
          `background:#6d28d9;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      title: nome ?? undefined,
    }).addTo(m);

    mapa.current = m;

    // O contentor nasce muitas vezes com altura zero (dentro de um painel que
    // ainda está a abrir). Sem isto, o mapa desenha-se cinzento e só se
    // compõe se a janela mudar de tamanho.
    const t = setTimeout(() => m.invalidateSize(), 60);

    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
    };
  }, [daParaDesenhar, lat, lng, nome]);

  // Sem ponto, mas com morada: vale a pena na mesma o botão de navegação.
  if (!daParaDesenhar) {
    if (!temSitio(sitio)) return null;
    return (
      <a
        href={linkParaIr(sitio) ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className={className}
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
          <MapPin width={13} height={13} />
          Como lá chegar
        </span>
      </a>
    );
  }

  return (
    <div className={className}>
      <div
        ref={caixa}
        style={{ height: `${altura}px` }}
        className="w-full overflow-hidden rounded-lg ring-1 ring-slate-200"
        role="img"
        aria-label={`Mapa de ${nome ?? "onde é o trabalho"}`}
      />
      <a
        href={linkParaIr(sitio) ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
      >
        <MapPin width={13} height={13} />
        Como lá chegar
      </a>
    </div>
  );
}
