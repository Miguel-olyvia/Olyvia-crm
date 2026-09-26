import { useState } from "react";
import { Button, Field, Input, cx } from "./ui";
import { AlertTriangle, Check, MapPin, X } from "./icons";
import {
  comoTexto,
  coordenadasDeLink,
  coordenadasValidas,
  linkParaVer,
  type Coordenadas,
} from "../domain/mapa";

/**
 * Marcar onde fica um local — sem serviço de fora, sem chave, sem custo.
 *
 * Dois caminhos, e os dois são de graça:
 *
 *  1. **"Marcar aqui"** — o GPS do telemóvel. É de longe a maneira mais exata:
 *     quem está no sítio não se engana na morada;
 *  2. **Colar um link do Maps** — alguém procura no Google Maps, copia o link
 *     da barra de endereço e cola. O Google já fez a pesquisa, de graça, no
 *     sítio onde essa pessoa já estava a trabalhar.
 *
 * O segundo caminho é o que torna uma pesquisa paga **opcional em vez de
 * necessária**. Se um dia se quiser a pesquisa dentro da aplicação, ela entra
 * por cima disto sem mudar nada do que aqui está.
 */
export default function CampoDeMapa({
  valor,
  aoMudar,
  morada,
  aoMudarMorada,
}: {
  valor: Coordenadas | null;
  aoMudar: (c: Coordenadas | null) => void;
  morada: string;
  aoMudarMorada: (m: string) => void;
}) {
  const [colado, setColado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aLocalizar, setALocalizar] = useState(false);

  const marcarAqui = () => {
    if (!("geolocation" in navigator)) {
      setErro("Este dispositivo não sabe dizer onde está.");
      return;
    }
    setALocalizar(true);
    setErro(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setALocalizar(false);
        const c = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        if (!coordenadasValidas(c.latitude, c.longitude)) {
          setErro("O GPS devolveu uma posição que não faz sentido. Tenta outra vez.");
          return;
        }
        aoMudar(c);
      },
      (e) => {
        setALocalizar(false);
        // As três razões que acontecem na prática, cada uma com o que fazer.
        setErro(
          e.code === e.PERMISSION_DENIED
            ? "Faltou dar permissão de localização a esta página."
            : e.code === e.POSITION_UNAVAILABLE
              ? "Não foi possível apanhar sinal. Numa cave costuma não haver — experimenta lá fora."
              : "Demorou demasiado a encontrar a posição. Tenta outra vez."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  /**
   * Lê o texto — mas só quando ele está inteiro.
   *
   * Ler a cada tecla parecia melhor e estava errado: a meio de
   * `…!4d-8.6146` o texto já contém `41.1456,-8`, que é uma coordenada
   * válida. O campo aceitava-a, limpava-se, e o resto das teclas caía num
   * campo vazio — ficando gravado um sítio a 68 km do certo, sem nada a
   * assinalar. Por isso lê-se ao colar, ao sair do campo e no Enter, que são
   * os três momentos em que o texto está completo.
   */
  const ler = (texto: string) => {
    const t = texto.trim();
    if (!t) {
      setErro(null);
      return;
    }
    const r = coordenadasDeLink(t);
    if (r.ok) {
      aoMudar(r.coordenadas);
      setColado("");
      setErro(null);
    } else {
      setErro(r.motivo);
    }
  };

  const ver = valor ? linkParaVer(valor) : null;

  return (
    <div className="space-y-3 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70">
      <Field
        label="Morada"
        hint="Opcional. Serve para o relatório e para procurar, quando não há ponto no mapa."
      >
        <Input
          value={morada}
          onChange={(e) => aoMudarMorada(e.target.value)}
          placeholder="Ex.: Rua Augusta 100, 1100-053 Lisboa"
          className="w-full"
        />
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Onde fica, no mapa</span>

        {valor ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <MapPin width={15} height={15} className="shrink-0 text-emerald-600" />
            <span className="font-mono text-xs tabular-nums text-slate-700">
              {comoTexto(valor)}
            </span>
            {ver && (
              <a
                href={ver}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs font-medium text-brand-800 underline-offset-2 hover:underline"
              >
                ver no mapa
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                aoMudar(null);
                setErro(null);
              }}
              className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-700"
            >
              <X width={12} height={12} /> tirar
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Sem ponto marcado. A navegação vai tentar pela morada, que acerta quase sempre — mas
            um ponto não tem gralhas nem ruas com o mesmo nome noutra cidade.
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={marcarAqui} disabled={aLocalizar}>
            {aLocalizar ? "A apanhar sinal…" : valor ? "Marcar aqui outra vez" : "Marcar aqui"}
          </Button>
          <span className="text-xs text-slate-400">ou cola um link do Google Maps</span>
        </div>

        <Input
          value={colado}
          onChange={(e) => {
            setColado(e.target.value);
            // Enquanto se escreve, nada de erros: o texto ainda não está todo.
            setErro(null);
          }}
          onPaste={(e) => {
            // O caminho normal: colar lê logo, sem mais um toque.
            const t = e.clipboardData.getData("text");
            if (t) {
              e.preventDefault();
              setColado(t);
              ler(t);
            }
          }}
          onBlur={(e) => ler(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ler(colado);
            }
          }}
          placeholder="https://www.google.com/maps/…"
          className="mt-2 w-full text-xs"
        />

        {erro && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
            {erro}
          </p>
        )}

        {!erro && valor && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
            <Check width={13} height={13} /> Ponto marcado. O técnico abre a navegação daqui.
          </p>
        )}
      </div>

      <p className={cx("text-[11px] leading-relaxed text-slate-400")}>
        &ldquo;Marcar aqui&rdquo; usa o GPS deste aparelho — é o caminho certo quando se está no
        local. De secretária, procura no Google Maps e cola o link da barra de endereço.
      </p>
    </div>
  );
}
