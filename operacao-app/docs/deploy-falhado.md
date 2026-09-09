# O deploy que falhou — resolvido

> 30 de agosto de 2026, o deploy falhou. 31 de agosto, causa encontrada e
> corrigida. Isto fica escrito porque o erro não estava onde parecia.

---

## A causa

O Vercel **rejeitou o `vercel.json`**. O build nem chegou a arrancar.

```
The `vercel.json` schema validation failed with the following message:
`buildCommand` should NOT be longer than 256 characters
```

| | caracteres | |
|---|---:|---|
| Antes do merge | 137 | ✅ publicou |
| **Com o `operacao-app` na cadeia** | **278** | ❌ **rejeitado** |
| Depois da correção | 26 | ✅ |

O `buildCommand` construía as três aplicações numa linha só, com `&&`. Juntar
a terceira passou o limite. Um limite que o Vercel não documenta em lado
nenhum visível, e que não tem nada que ver com o código.

**Nada no módulo estava errado.** Nem um import, nem um tipo, nem uma
dependência.

---

## Porque foi difícil de ver

Um build que falha deixa registos. **Este não deixou nenhum** — a rejeição é
anterior ao build, e a página do Vercel mostra "Error" sem uma linha por
baixo.

Sem registos, a suspeita cai naturalmente no que mudou: o módulo novo. E
como o módulo compila bem no Windows, a hipótese seguinte é "algo que só
falha em Linux". Foram-se eliminando hipóteses todas erradas.

O erro estava sempre à mão, num campo do próprio deploy que a interface não
mostra:

```bash
# precisa de acesso à equipa bmgest
npx vercel whoami
node -e '...' # GET /v13/deployments/<id> -> campo errorMessage
```

**A lição:** perante um "Error" sem registos, ir ao `errorMessage` do deploy
*antes* de desconfiar do código. Um build que falha tem registos; um que é
rejeitado, não.

---

## O que ficou diferente

**1. A cadeia mudou-se para um ficheiro** — [`tools/build-vercel.sh`](../../tools/build-vercel.sh).

O `vercel.json` passou a ter só:

```json
"buildCommand": "bash tools/build-vercel.sh"
```

Cabem lá comentários, e nunca mais volta a haver um limite de caracteres.

**2. O `operacao-app` saiu do caminho crítico do CRM.**

Antes, com `&&`, um build partido do módulo bloqueava o CRM inteiro. Agora o
módulo é o último passo e falha sozinho:

```bash
if npm --prefix operacao-app install && npm --prefix operacao-app run build; then
  ...
else
  echo "AVISO: o build do operacao-app falhou. O CRM foi publicado na mesma."
fi
```

O preço é `/operacao` ficar com a versão anterior sem o deploy falhar — por
isso o aviso é gritado nos registos. Isto cumpre a regra do módulo: **não
pode afetar nenhuma outra área.**

**3. Os documentos deixaram de ser ignorados pelo git.**

O `.gitignore` da raiz tem `docs/`, que apanhava também
`operacao-app/docs/`. Estes ficheiros nunca chegaram ao repositório, e o
`README.md` apontava para links partidos. Foi acrescentada a exceção
`!operacao-app/docs/`.

---

## Como se provou

A cadeia inteira foi corrida em Linux, no mesmo Node que o Vercel usa:

```bash
docker run --rm -m 8g -e NODE_OPTIONS=--max-old-space-size=6144 \
  -v "$PWD:/src:ro" node:22-slim bash -c '
    mkdir -p /app && cp -a /src/. /app/ && cd /app
    npm install && bash tools/build-vercel.sh
  '
```

Resultado: CRM, `duc-app` e `operacao-app` constroem, e o `dist/operacao/`
sai com os caminhos certos (`/operacao/assets/...`).

**Duas notas de quem correr isto:**

- Sem `--max-old-space-size`, o build do CRM rebenta por falta de memória —
  e rebenta **também no commit anterior, que publicou bem**. É limitação do
  contentor, não do código. Não é pista.
- O CI do GitHub (`frontend`, `Supabase Preview`) já falhava antes deste
  trabalho, em `tests/e2e/leads/embed-utm-source-attribution.spec.ts`. Também
  não é pista.

---

## O estado agora

| | |
|---|---|
| `main` no GitHub | ✅ o merge foi refeito (`90ac5bb`) e publicou |
| O site | ✅ no ar, com o `/operacao` a responder |
| O módulo | ✅ integrado no `main`, build provado em Linux antes de enviar |
| Base de dados | ✅ os ficheiros SQL estão em produção |

**Resolvido em 31 de agosto de 2026.** O deploy `dpl_3NUjYVJVFzysnvXxdhkvS6tYephu`
construiu as três aplicações e `www.olyvia-ai.com/operacao` responde.

Uma armadilha que apareceu no caminho, para quem tiver de a repetir: como o
revert deixou o merge antigo na história do `main`, um `git merge` normal
**não** trazia os ficheiros de volta — o git dava o trabalho por integrado.
Foi preciso reverter o revert primeiro (`47207e4`), e só depois fazer o merge.

---

## Onde está o resto

| | |
|---|---|
| [`onde-estamos.md`](onde-estamos.md) | o estado geral e o que construir a seguir |
| [`a-seguir.md`](a-seguir.md) | notificações, agenda, relatórios, WhatsApp |
| [`portal-do-cliente.md`](portal-do-cliente.md) | o cliente a pedir assistência |
