/*
 * Operações — service worker: abrir a app sem rede.
 *
 * Só guarda a APP (o HTML e os ficheiros do build). Os dados não passam por
 * aqui: a base é outro domínio (Supabase) e o que o técnico precisa sem rede
 * vive no IndexedDB da própria app (src/lib/offline).
 *
 *   · páginas (navegação)  → rede primeiro; sem rede, a última cópia do HTML
 *   · /assets/* (com hash)  → cache primeiro (o nome muda a cada build)
 *   · o resto do mesmo site → rede, e a cópia guardada se a rede falhar
 *
 * Âmbito: só /operacao/ (o CRM e o DUC não são tocados).
 * Desligar de emergência: publicar este ficheiro com DESLIGAR = true.
 */
const DESLIGAR = false;
const VERSAO = "operacao-sw-v1";
const BASE = new URL(self.registration.scope).pathname; // "/operacao/"
const PAGINA = BASE; // a cópia do index.html guarda-se com esta chave

self.addEventListener("install", (ev) => {
  self.skipWaiting();
  if (DESLIGAR) return;
  ev.waitUntil(
    (async () => {
      const c = await caches.open(VERSAO);
      await c.add(new Request(PAGINA, { cache: "reload" })).catch(() => {});
      // Todos os ficheiros do build (precache.json é gerado pelo vite.config):
      // assim abre sem rede também uma página que nunca se abriu com rede.
      await atualizarFicheiros();
    })()
  );
});

/**
 * Põe a cache em dia com o build publicado: guarda os ficheiros novos e
 * apaga os que já não existem. Corre ao instalar e a cada abertura com rede
 * (um build novo não muda este ficheiro, por isso o SW não se reinstala).
 */
async function atualizarFicheiros() {
  try {
    const r = await fetch(`${BASE}precache.json`, { cache: "no-store" });
    if (!r.ok) return;
    const lista = (await r.json()).map((f) => `${BASE}${f}`);
    const c = await caches.open(VERSAO);
    const tem = new Set((await c.keys()).map((q) => new URL(q.url).pathname));
    await Promise.all(lista.filter((f) => !tem.has(f)).map((f) => c.add(f).catch(() => {})));
    const quer = new Set(lista);
    await Promise.all(
      [...tem].filter((f) => f.startsWith(`${BASE}assets/`) && !quer.has(f)).map((f) => c.delete(f))
    );
  } catch {
    /* sem lista: guarda-se o que se for abrindo */
  }
}

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n.startsWith("operacao-sw-") && (DESLIGAR || n !== VERSAO)).map((n) => caches.delete(n)));
      if (DESLIGAR) {
        await self.registration.unregister();
        return;
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (ev) => {
  if (DESLIGAR) return;
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === "navigate") {
    ev.respondWith(
      (async () => {
        try {
          const r = await fetch(req);
          if (r.ok) {
            const c = await caches.open(VERSAO);
            await c.put(PAGINA, r.clone());
            ev.waitUntil(atualizarFicheiros());
          }
          return r;
        } catch {
          const guardada = await caches.match(PAGINA);
          return guardada || new Response("Sem rede e sem cópia da aplicação neste telemóvel.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`)) {
    ev.respondWith(
      (async () => {
        const guardada = await caches.match(req);
        if (guardada) return guardada;
        const r = await fetch(req);
        if (r.ok) {
          const c = await caches.open(VERSAO);
          await c.put(req, r.clone());
        }
        return r;
      })()
    );
    return;
  }

  ev.respondWith(
    (async () => {
      try {
        const r = await fetch(req);
        if (r.ok) {
          const c = await caches.open(VERSAO);
          await c.put(req, r.clone());
        }
        return r;
      } catch {
        const guardada = await caches.match(req);
        if (guardada) return guardada;
        throw new Error("sem rede");
      }
    })()
  );
});
