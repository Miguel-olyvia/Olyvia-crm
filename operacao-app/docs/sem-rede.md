# Sem rede

> Feito a 06/10/2026, no ramo `feat/ops-offline`. Ainda não visto num
> telemóvel a sério: está provado nos testes (fila, ecrãs) e no PGlite (SQL).

Uma garagem −2 não tem rede. Antes, o técnico carregava em "Iniciar", a app
dizia "Sem ligação. Tenta outra vez." e o trabalho ficava por registar.
Agora o técnico trabalha na mesma, e o que fez segue sozinho quando a rede
volta, **com a hora a que carregou no botão**.

## O que funciona sem rede

| Ecrã | Sem rede |
|---|---|
| **As minhas tarefas** (obras) | Abre com a lista guardada da última vez (com aviso de quando é). Iniciar, Pausar e Terminar (com justificação e medida real) ficam guardados e aparecem já no ecrã, marcados "por enviar". |
| **Fotos das tarefas de obra** | A foto fica guardada no telemóvel, aparece com a etiqueta "por enviar" e sobe quando houver rede. |
| **Ordem → Trabalho a fazer** | Abre com a ordem guardada da última vez. As respostas (conforme / não conforme / valor / observações) e as leituras das medições ficam guardadas e aparecem já. O veredicto e a corretiva só aparecem quando a base as recebe — é ela que decide. |
| **A aplicação** | Abre sem rede (service worker), desde que tenha sido aberta uma vez com rede nesse telemóvel. Pode instalar-se no ecrã inicial (manifest). |
| **Entrar** | Quem já tinha entrado nesse telemóvel entra sem rede (a função em Operações guardada da última vez abre o ecrã; a base volta a decidir em cada escrita). |

No topo de todas as páginas, uma barra diz o estado:

- **Sem rede — N alterações por enviar.**
- **A enviar N alterações…** (sozinho quando a rede volta, ao abrir a app, e
  de 30 em 30 s enquanto houver coisas por enviar; também há "Enviar agora").
- **N alterações feitas sem rede foram enviadas.** (desaparece ao fim de 6 s)
- **A base não aceitou N coisas feitas sem rede** — com a lista, a mensagem
  da base, e "Tentar outra vez" / "Descartar". Nada se perde sem a pessoa
  decidir.

## Como funciona

### A fila (`src/lib/offline/fila.ts`)

- **Ordem.** Envia-se pela ordem em que se fez ("Iniciar" antes de
  "Terminar").
- **Uma vez só.** Cada ação tem um id gerado no telemóvel. Se a rede cair
  depois de a ação chegar à base mas antes da resposta, o reenvio leva o
  mesmo id e a base devolve o resultado da primeira vez, sem aplicar outra
  vez. No telemóvel, só corre um envio de cada vez.
- **Sem rede, pára.** Um erro de rede deixa tudo como estava e não tenta o
  resto.
- **Recusa, não se perde.** Se a base recusar (a tarefa mudou entretanto,
  falta a justificação…), a ação fica "não aceite" com a mensagem da base, e
  as seguintes **da mesma tarefa** ficam à espera (as de outras tarefas
  seguem).
- **Com rede, como sempre.** Um toque com rede envia já; um erro da base
  aparece no ecrã como antes (ex.: a folha da justificação). Só vai para a
  fila o que falhou por falta de rede — ou o que vem atrás de coisas da mesma
  tarefa ainda por enviar.

Guardada em IndexedDB (sobrevive a fechar a app; guarda as fotos como Blob).

### A hora certa e o "uma vez só" na base (`db/offline.sql`)

`rpc_ops_obra_offline(p_acao_id, p_tipo, p_tarefa_id, p_quando, …)`:

- usa a hora do telemóvel (`p_quando`), **limitada**: nunca no futuro, nunca
  há mais de 72 h, nunca antes do fim do último relógio da pessoa;
- chama por dentro as RPCs de sempre (`rpc_ops_obra_iniciar_tarefa`,
  `rpc_ops_obra_terminar_tarefa`) — as regras são as mesmas; no "Terminar",
  os relógios fecham-se à hora do telemóvel ANTES, por isso a justificação é
  pedida (ou não) com o tempo verdadeiro;
- guarda cada ação em `ops_offline_acao` (só a RPC lhe toca); a mesma ação
  outra vez devolve o mesmo resultado.

Sem `db/offline.sql` aplicado, a app usa as RPCs de sempre (funciona, mas com
a hora do envio).

**Aplicar:** colar `db/offline.sql` no SQL Editor do Supabase, depois de
`db/obras.sql`. Idempotente. Validado em `tools/validar-obras.mjs` (secção
"sem rede").

### O service worker (`public/sw.js`)

- Só `/operacao/` (o CRM e o DUC não são tocados).
- Páginas: rede primeiro, a cópia guardada sem rede.
- Ficheiros do build: guardados todos ao instalar e postos em dia a cada
  abertura com rede (lista em `precache.json`, gerada pelo `vite.config.ts`).
- **Desligar de emergência:** pôr `DESLIGAR = true` em `public/sw.js` e
  publicar — o SW apaga as suas caches e desregista-se.
- Os dados nunca passam pelo SW (a base é outro domínio).

## O que fica de fora (e porquê)

- **O relógio das ordens** ("Começar a contar nesta tarefa" numa ordem):
  precisa de rede — o ecrã diz isso. As respostas, essas, guardam-se.
- **Mudar o estado de uma ordem** (iniciar, pausar, fechar): precisa de rede.
  Uma resposta dada sem rede numa ordem que ainda não foi iniciada fica "não
  aceite" quando chegar — e a pessoa vê porquê.
- **Extras, atrasos, a ficha do local e o resto da obra**: precisam de rede.
- **Sessão expirada:** quem fique muito tempo sem rede com a app fechada pode
  ter de voltar a entrar (o Supabase renova a sessão pela rede).
- **Fotos repetidas:** se a rede cair exatamente entre o envio da foto e o
  seu registo, o reenvio reutiliza o mesmo ficheiro (mesmo caminho), mas a
  base pode registá-la duas vezes se a resposta do registo se perder.

## Ficheiros

- `db/offline.sql` — tabela `ops_offline_acao` e `rpc_ops_obra_offline`.
- `src/lib/offline/` — `armazem.ts` (IndexedDB), `fila.ts` (as regras),
  `executar.ts` (o que cada ação faz na base), `index.ts` (cache, estado,
  envio automático, `useOffline`).
- `src/domain/offlineObras.ts`, `src/domain/offlineOrdens.ts` — o que o ecrã
  mostra com as ações por enviar por cima.
- `src/components/BarraOffline.tsx` — a barra do topo.
- `src/pages/MinhasTarefas.tsx`, `src/components/PainelTarefas.tsx`,
  `src/components/FotosTarefa.tsx`, `src/pages/OrdemDetalhe.tsx`,
  `src/auth/AuthProvider.tsx` — ligados à fila e à cache.
- `public/sw.js`, `public/manifest.webmanifest`, `vite.config.ts`
  (`precache.json`), `index.html` (manifest), `src/main.tsx` (registo).
- Testes: `src/lib/offline/__tests__/fila.test.ts`,
  `src/domain/__tests__/offlinePendentes.test.ts`.

## Como testar

1. Aplicar `db/offline.sql`. Publicar.
2. No telemóvel, abrir `/operacao/minhas-tarefas` com rede (uma vez).
3. Modo de avião. Abrir a app: abre, com a barra "Sem rede".
4. Iniciar uma tarefa, esperar uns minutos, Terminar, tirar uma foto.
5. Tirar o modo de avião: "A enviar…" → "Enviadas". Na base, o relógio da
   tarefa começa e acaba às horas dos toques (não à hora do envio).
6. Para ver uma recusa: sem rede, iniciar uma tarefa; com outra conta (com
   rede) dá-la por feita; voltar a rede no telemóvel → "A base não aceitou…".
