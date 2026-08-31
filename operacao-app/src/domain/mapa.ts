/**
 * Onde fica, e como lá chegar.
 *
 * Tudo funções puras, e **nenhum serviço de fora**. Não há chave de API, não
 * há pedido a ninguém, não há custo: um link para o Maps é só texto, e as
 * coordenadas entram por dois caminhos que também não custam nada.
 *
 *  1. **O técnico está lá.** Carrega em "marcar aqui" e o GPS do telemóvel dá
 *     as coordenadas — que é, de longe, a maneira mais exata de as obter;
 *  2. **Alguém procura e cola.** Procura-se no Google Maps, copia-se o link,
 *     cola-se. As coordenadas saem do próprio link.
 *
 * O segundo caminho é o que faz uma pesquisa paga ser opcional em vez de
 * necessária: o Google já faz a pesquisa, de graça, no sítio onde a pessoa já
 * está a trabalhar.
 */

export interface Coordenadas {
  latitude: number;
  longitude: number;
}

/* ─────────────────────────── Validar ───────────────────────────────────── */

/**
 * Uma latitude de 412 não é um sítio.
 *
 * Sem esta guarda, um engano a colar punha o técnico a conduzir para o meio do
 * nada — e o mapa nem dava erro, desenhava o pin onde calhasse. A mesma regra
 * está na base, em `ops_local_coordenadas_validas`.
 */
export function coordenadasValidas(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // 0,0 fica no Atlântico, ao largo do Gana. É quase sempre um campo vazio
    // que virou zero, e não um sítio onde alguém vá trabalhar.
    !(lat === 0 && lng === 0)
  );
}

/* ─────────────────────── Ler um link colado ────────────────────────────── */

export type LeituraDeLink =
  | { ok: true; coordenadas: Coordenadas }
  | { ok: false; motivo: string };

/**
 * As coordenadas dentro de um link do Maps.
 *
 * O Google Maps produz várias formas para a mesma coisa, conforme se chegou
 * lá — pesquisa, clique no mapa, partilha de telemóvel. Estas são as que
 * aparecem na prática:
 *
 *   .../maps/@38.7223,-9.1393,17z            clique no mapa
 *   .../maps/place/Nome/@38.7223,-9.1393,17z pesquisa
 *   .../maps?q=38.7223,-9.1393               partilha antiga
 *   .../maps/search/?api=1&query=38.7,-9.1   forma documentada
 *   .../data=!3d38.7223!4d-9.1393            o pin exato, dentro do link
 *
 * O `!3d…!4d…` é o mais fiável quando existe: o `@` é o centro do ecrã, e o
 * `!3d` é o sítio em si. Por isso é o primeiro a ser tentado.
 *
 * Links encurtados (`maps.app.goo.gl`, `goo.gl/maps`) não trazem coordenadas
 * nenhumas — só se resolvem indo à rede, e isso é precisamente o que este
 * caminho existe para evitar. Nesses, diz-se o que fazer em vez de falhar em
 * silêncio.
 */
export function coordenadasDeLink(texto: string): LeituraDeLink {
  const t = (texto ?? "").trim();
  if (!t) return { ok: false, motivo: "Cola aqui um link do Google Maps." };

  if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(t)) {
    return {
      ok: false,
      motivo:
        "Este link é encurtado e não traz as coordenadas. Abre-o no Maps, e copia o link " +
        "que aparece na barra de endereço.",
    };
  }

  // O pin exato, quando o link o traz.
  const pin = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) return aceitar(Number(pin[1]), Number(pin[2]));

  // O centro do ecrã.
  const arroba = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (arroba) return aceitar(Number(arroba[1]), Number(arroba[2]));

  // ?q= ou ?query=, e também "38.7223, -9.1393" colado à mão.
  const consulta = t.match(
    /(?:[?&](?:q|query|destination|ll)=)?(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/
  );
  if (consulta) return aceitar(Number(consulta[1]), Number(consulta[2]));

  return {
    ok: false,
    motivo:
      "Não consegui encontrar coordenadas nesse texto. Cola o link da barra de endereço do " +
      "Google Maps, ou escreve as coordenadas separadas por vírgula.",
  };
}

function aceitar(latitude: number, longitude: number): LeituraDeLink {
  return coordenadasValidas(latitude, longitude)
    ? { ok: true, coordenadas: { latitude, longitude } }
    : {
        ok: false,
        motivo: `Aquilo dá ${latitude}, ${longitude} — que não é um sítio no mapa.`,
      };
}

/* ──────────────────────────── Os links ─────────────────────────────────── */

/** As coordenadas como se escrevem e se colam: seis casas chegam a ~10 cm. */
export function comoTexto(c: Coordenadas): string {
  return `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`;
}

/**
 * O link para VER o sítio no mapa.
 *
 * A forma `?api=1&query=` é a documentada pelo Google, e é a única que abre a
 * aplicação no telemóvel em vez do browser. As outras funcionam hoje e não há
 * promessa nenhuma de que continuem.
 *
 * Sem coordenadas, vai a morada — o Google procura-a, e na maior parte das
 * vezes acerta. É pior do que um ponto, e muito melhor do que nada.
 */
export function linkParaVer(local: {
  latitude?: number | null;
  longitude?: number | null;
  morada?: string | null;
  nome?: string | null;
}): string | null {
  const alvo = alvoDoLocal(local);
  if (!alvo) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`;
}

/**
 * O link para IR — a navegação, passo a passo.
 *
 * É este que o técnico usa. `dir/?api=1&destination=` abre a navegação já
 * apontada ao destino, sem mais um toque.
 */
export function linkParaIr(local: {
  latitude?: number | null;
  longitude?: number | null;
  morada?: string | null;
  nome?: string | null;
}): string | null {
  const alvo = alvoDoLocal(local);
  if (!alvo) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(alvo)}`;
}

/**
 * O que se manda ao mapa: as coordenadas se as houver, senão a morada.
 *
 * As coordenadas ganham sempre. Uma morada escrita à mão tem gralhas, tem
 * "Lote 3" que o Google não conhece, e tem ruas com o mesmo nome em três
 * cidades. Um ponto não tem nada disso.
 */
function alvoDoLocal(local: {
  latitude?: number | null;
  longitude?: number | null;
  morada?: string | null;
  nome?: string | null;
}): string | null {
  if (coordenadasValidas(local.latitude, local.longitude)) {
    return `${local.latitude},${local.longitude}`;
  }
  const morada = local.morada?.trim();
  if (morada) return morada;
  return null;
}

/** Se dá para abrir no mapa de todo. */
export function temSitio(local: {
  latitude?: number | null;
  longitude?: number | null;
  morada?: string | null;
}): boolean {
  return alvoDoLocal(local) !== null;
}
