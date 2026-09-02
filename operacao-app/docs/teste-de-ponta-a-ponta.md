# Testar de A a Z, sem fazer merge

**1 de setembro de 2026.** Para validar o módulo a partir do CRM enquanto o
PR #12 espera.

> **A ideia em duas linhas.** O Vercel constrói **todos** os ramos, não só o
> `main`. O ramo `feature/operacoes` tem um endereço próprio onde está o CRM
> **e** o `/operacao`, na versão nova. Testa-se lá, e a produção não muda.

---

## 1. Onde testar

> Vercel → o projeto → **Deployments** → a entrada `feature/operacoes`
> (a mais recente) → **Visit**

Dá um endereço com esta cara:

```
https://olyvia-crm-git-feature-operacoes-<equipa>.vercel.app
```

Esse endereço é o **CRM inteiro**, construído a partir do ramo. O item
**Operação** do menu leva a `/operacao` no mesmo sítio — o link é relativo
(`src/components/sidebar/menuConfig.ts`), por isso não salta para produção.

**A produção (`www.olyvia-ai.com`) continua a servir o `main` e não é
tocada.** Ninguém mais recebe este endereço a não ser que lho dês.

### Duas coisas que vais reparar

| | Porquê |
|---|---|
| Tens de entrar **duas vezes** — uma no CRM, outra no `/operacao` | O módulo tem sessão própria (`storageKey: operacao-app-auth`). É de propósito: um problema de sessão no módulo nunca pode deitar abaixo o login do CRM. |
| O item **Operação** pode não aparecer no menu | Pede a permissão `operations.view`. Se faltar, é isso — não é o deploy. |

---

## 2. ⚠ Antes de começares: a base de dados é a de verdade

O endereço de teste é novo. **A base de dados não.** O preview e a produção
falam com o **mesmo** Supabase.

Isto é bom — testas com dados reais e com as permissões reais. Mas quer dizer
que **o que escreveres fica escrito**.

Nas tabelas `ops_*` isso é inofensivo: são novas e só tu as usas. O cuidado é
com as **duas portas que dão para o CRM**:

1. **O sino.** Atribuir uma ordem a um colega manda-lhe uma notificação a
   sério, no CRM a sério.
2. **A fila de emails.** Se o relatório automático estiver ligado, confirmar
   uma ordem põe um email na fila para o cliente dessa ficha.

### As duas regras do teste

1. **Usa um cliente de teste, com o TEU email.** Nunca um cliente real para o
   passo do relatório.
   ⚠ Criar um cliente novo no CRM pode falhar num endereço de preview — ver a
   **§6**. Nesse caso usa um que já exista, e no passo do relatório carrega em
   **Cancelar** depois de veres o email de destino.
2. **Atribui as ordens a ti próprio.** Assim o sino que toca é o teu.
   ℹ E não vai tocar: atribuir a si próprio **não avisa**, de propósito — quem
   se atribui já sabe. É uma linha de SQL a mudar, se se decidir que sim.

*(Hoje o email não chega de todo — ver [`email-que-nao-chega.md`](email-que-nao-chega.md).
Mesmo assim, a regra mantém-se: um dia chega, e mais vale o hábito estar certo.)*

---

## 3. O caminho, do CRM até ao cliente

Pica à medida que fores. **Cada passo diz o que tens de ver** — se vires outra
coisa, para e anota.

> ⚠ **Esta lista mudou a 1 de setembro.** O funil é outro: as categorias
> mudaram-se para Procedimentos, os locais saíram das Definições, e a ficha do
> local passou a ser uma página só. Ver
> [`o-que-mudou-a-1-de-setembro.md`](o-que-mudou-a-1-de-setembro.md).

### Parte A — chegar lá

- [ ] **1.** Entrar no CRM, no endereço de teste.
- [ ] **2.** O menu tem **Operação**, com o ícone da chave inglesa.
- [ ] **3.** Carregar. Abre a página de entrada do módulo.
- [ ] **4.** Entrar. Cai no **Hoje**.
- [ ] **5.** No cabeçalho há um **sino**. É o do CRM, mostrado aqui.

> ✅ Isto sozinho já prova o essencial: o CRM não partiu, e a ponte funciona.

### Parte B — montar (Definições)

- [ ] **6.** `Definições` — são **cinco** separadores. Os locais **não** estão cá.
- [ ] **7.** `Vocabulário` — mudar o nome de uma prioridade.
      *Ver: o nome novo aparece nas listas todas, sem recarregar.*
- [ ] **8.** `Procedimentos` — em cima há um cartão **"O guião do trabalho"**,
      a explicar categoria → medição → checklist → plano.
- [ ] **9.** `Procedimentos › + Categorias` — escolher uma família inteira.
      *Ver: as categorias aparecem no cartão em baixo.*
- [ ] **10.** `Procedimentos` — aplicar o pack **Manutenção**.
      *Ver: aparecem medições e checklists já feitas e publicadas.*
- [ ] **11.** `Tipos e custos` — confirmar que há pelo menos um tipo de trabalho.

### Parte C — os locais

- [ ] **12.** `Locais` → **+ Local**. Criar um, com morada.
- [ ] **13.** Na árvore, o **+** dessa linha → criar um espaço.
      *Ver: o cliente não é perguntado — herda de quem está por cima.*
- [ ] **14.** Abrir a ficha do local.
      *Ver: o mapa ao lado da morada.*
- [ ] **15.** No degrau do **local**, **+ Equipamento**.
- [ ] **16.** No degrau do **espaço**, **+ Equipamento**.
      *Ver: cada um fica debaixo do seu degrau, com recuo.*
- [ ] **17.** No degrau do espaço, **+ Espaço** → um espaço dentro do espaço.
      *Ver: mais um degrau, mais recuado.*
- [ ] **18.** Olhar para as contagens: `1 · 3 ao todo` no local.
- [ ] **19.** **Arrastar** um equipamento para outro degrau.
      *Ver: fica lá. No histórico dele fica "Mudou de local".*
- [ ] **20.** **✕** num equipamento → confirmar.
      *Ver: desaparece, e aparece "Ver o que foi removido (1)".*
- [ ] **21.** Abrir essa gaveta → **repor**.
- [ ] **22.** Tentar remover um **espaço com equipamentos**.
      *Ver: não deixa — explica que tens de os tirar primeiro.*
- [ ] **23.** **duplicar** num espaço.
      *Ver: nasce um irmão dentro do mesmo local, com o que tinha lá dentro.*

### Parte D — o trabalho

- [ ] **24.** `Nova ordem` — cliente, local, equipamento, e a **checklist** do pack.
- [ ] **25.** Reparar: por baixo do local há **"Novo espaço dentro de…"**.
- [ ] **26.** Atribuir **a ti**, agendar para hoje.
      ℹ *Não vai tocar o sino: atribuir a si próprio não avisa, de propósito.*
- [ ] **26b.** Carregar em **Sugerir**, ao lado de *Quem vai, e quando*.
      *Ver: a equipa ordenada, cada nome com as razões por baixo, e no topo a
      caixa que diz **quais das três perguntas contaram**. Numa instalação
      sem especialidades nas tarefas e sem coordenadas nos locais, ele diz
      isso por escrito em vez de fingir que pesou tudo — é o comportamento
      certo, não uma avaria.*
- [ ] **26c.** Escolher alguém na lista.
      *Ver: o campo do responsável fica preenchido, **e mais nada acontece**.
      A sugestão não grava: continua a ser preciso «Gravar quem vai».*
- [ ] **26d.** Tirar a data à ordem e carregar em **Sugerir** outra vez.
      *Ver: o botão de cada linha passa a **«Escolher e marcar para …»**, com
      o primeiro dia em que a pessoa cabe. A pergunta mudou de "quem está
      livre nesse dia" para "quem consegue ir mais cedo".*
- [ ] **27.** Responder à primeira tarefa.
      *Ver: a ordem passa a **em curso** sozinha. E a tarefa **fecha-se**, com um
      "alterar" pequeno.*
- [ ] **28.** **+ Tarefa** → nome, **Número**, unidade `bar`, mínimo 10, máximo 15.
      *Ver: aparece no fim da lista, com os limites escritos.*
- [ ] **29.** Escrever **8** nessa tarefa.
      *Ver: diz "fora dos limites" **antes** de gravar.*
- [ ] **30.** Registar uma **medição** da checklist.
- [ ] **31.** Tirar uma **foto**.
- [ ] **32.** Lançar um **custo**.
- [ ] **33.** Escrever na **conversa**.
      *Ver: fica lá, e não há botão de apagar.*

### Parte E — fechar e entregar

- [ ] **34.** **Fechar** a ordem.
- [ ] **35.** Recolher a **assinatura** no ecrã.
- [ ] **36.** Abrir o **relatório**.
      *Ver: fotos, medições, custos e assinatura.*
- [ ] **37.** **Confirmar** a ordem.
- [ ] **38.** **Enviar ao cliente** → ver o email de destino → 🛑 **Cancelar**.
      ⚠ *O email não chega — é o bug do CRM. O que este passo prova é que o
      módulo foi buscar o endereço certo.*

### Parte F — a agenda

- [ ] **39.** `/agenda › Mês`.
      *Ver: **os nomes das ordens**, não só quantas.*
- [ ] **40.** Carregar numa ordem.
      *Ver: abre um **painel ao lado**, com o cliente, o onde, o quem e o
      **mapa**. O endereço do browser não muda.*
- [ ] **41.** Carregar em **Esc**. Fecha.
- [ ] **42.** O mesmo nas vistas de **dia**, **semana** e **mapa**.
- [ ] **43.** No painel, **Abrir a ficha** → leva à ordem.

### Parte F2 — a lista e a ficha, refeitas a 2 de setembro

O que aqui se prova é sobretudo **memória** e **alcance**: que a lista não se
esquece do que lhe pediram, e que os botões não fogem de quem está a trabalhar.

- [ ] **43a.** `/ordens` — reparar nos **números** dos separadores, e no das
      atrasadas a **vermelho**.
- [ ] **43b.** Ligar um filtro de cliente → **recarregar a página** (F5).
      *Ver: o filtro continua lá. O endereço tem `?cliente=…`.*
- [ ] **43c.** Copiar o endereço e abri-lo noutro separador.
      *Ver: abre a mesma lista, já estreitada.*
- [ ] **43d.** Carregar em **voltar**.
      *Ver: volta ao estado anterior da lista, e não à página anterior.*
- [ ] **43e.** Escrever depressa na pesquisa.
      *Ver: a lista só vai à base **quando os dedos param**. Não pisca a cada
      letra, e o resultado é o da palavra inteira.*
- [ ] **43f.** Carregar em **`/`** com o cursor fora de qualquer campo.
      *Ver: o cursor salta para a pesquisa.*
- [ ] **43g.** Ordenar **por data** → ver as faixas **Atrasadas · Hoje ·
      Amanhã · …**. Ordenar **por prioridade** → as faixas desaparecem.
      ℹ *É de propósito: cabeçalhos de dia por cima de uma lista ordenada por
      urgência seriam duas respostas contraditórias no mesmo ecrã.*
- [ ] **43h.** Carregar em **As minhas**, e depois tirar a pastilha do filtro.
- [ ] **43i.** Descer a lista até ao fim.
      *Ver: a barra com as vistas e os filtros **fica colada ao topo**.*
- [ ] **43j.** Abrir uma ordem e descer até às sessões.
      *Ver: a barra com **Iniciar/Pausar/Fechar** continua no topo, com o
      código da ordem à vista.*
- [ ] **43k.** Numa ordem **em curso**, ficar parado a olhar meio minuto.
      *Ver: o tempo da sessão aberta **anda**. Antes ficava no valor que tinha
      quando a página carregou.*
- [ ] **43l.** Ler a **régua de cinco degraus** e a frase por baixo.
      *Ver: numa fechada diz que falta confirmar — que é onde as ordens ficam
      paradas sem ninguém saber porquê.*
- [ ] **43m.** Num ecrã largo, reparar nas **duas colunas**: o trabalho à
      esquerda, o contexto à direita.

### Parte G — o que fica depois

- [ ] **44.** Voltar à ficha do local → **"O que já se fez aqui"**.
      *Ver: a ordem, **com o nome do local ou do espaço à frente do título**.*
- [ ] **45.** `/analises › Equipamento` — a ordem no histórico dele.
- [ ] **46.** `/analises › Exportar medições` — a leitura na folha.
- [ ] **47.** `/planos` — criar um plano preventivo e gerar a ordem.
- [ ] **48.** `/ajuda` — passar pelos 4 separadores.
- [ ] **49.** Voltar ao **CRM** pelo menu do utilizador.
      *Ver: o CRM exatamente como estava.*

---

## 4. No telemóvel, o que importa mesmo

O computador prova a lógica. O telemóvel prova o produto. Abre o **mesmo
endereço** no telemóvel e repete só isto:

- [ ] A **foto** (passo 31) — foi aqui que já falhou uma vez.
- [ ] A **assinatura** (passo 35) — o dedo no ecrã.
- [ ] Um ecrã em modo avião: responder a uma tarefa **sem rede**.
      *Ver: aceita, e sai sozinha quando a rede volta.*
      ⚠ **Não feches a aplicação sem rede** — abrir sem rede ainda não
      funciona, e é sabido.
- [ ] A **ficha de um local com espaços**: a árvore não sai do ecrã, e os
      botões de cada degrau cabem.
- [ ] O botão **mover** num equipamento (arrastar não funciona com o dedo).
- [ ] O **painel da ordem** na agenda: encosta em baixo, não ao lado.
- [ ] Texto a sair do ecrã em `Nova ordem` e em `Definições`.
- [ ] ⚠ **A barra de ações da ficha da ordem.** Descer a ficha toda e
      confirmar que **Iniciar/Pausar/Fechar** ficam fixos em baixo, **por cima
      da navegação e sem a tapar**, e que a última linha da página não fica
      escondida por trás dela.
      ℹ *É o único sítio de todo o dia 2 em que a altura foi medida a olho.
      Se estiver mal, vê-se de imediato.*
- [ ] Na ficha da ordem, o **contexto vem primeiro** (onde é, quem vai) e as
      tarefas vêm a seguir. No computador é ao contrário, e é de propósito.
- [ ] `/ordens`: as faixas por dia e as linhas cabem sem scroll horizontal.
- [ ] `/` (Hoje): **o dia** aparece em cima, por hora.

---

## 5. Se alguma coisa correr mal

| O que vês | O que quer dizer |
|---|---|
| **"failed to send request"** ao criar um cliente **no CRM** | Uma edge function do CRM por reinstalar. Ver a secção abaixo. **Não é do módulo** — Operações não chama nenhuma. |
| `/operacao` mostra a versão antiga | O build do módulo falhou e o CRM publicou à mesma — é de propósito. O aviso está nos registos do deploy (`tools/build-vercel.sh`). |
| Página em branco no `/operacao` | Faltam as variáveis `VITE_SUPABASE_*` no ambiente **Preview** do Vercel. |
| **Operação** não aparece no menu | Falta a permissão `operations.view`. |
| **+ Tarefa** dá erro na ordem | Falta correr `db/tarefas-na-ordem.sql`. |
| Duplicar um local não leva os espaços | Falta correr `db/duplicar.sql` outra vez — a função ganhou um argumento. |
| Erro a gravar, noutro sítio qualquer | Falta correr um SQL. A ordem está no `README.md` e em `tools/validar-instalacao.mjs`. |

---

## 6. ⚠ O CRM e os endereços de preview

**Sintoma:** criar um cliente (ou qualquer coisa que chame uma edge function)
dá **"failed to send request"** no endereço de preview, e funciona em
produção.

**Causa, verificada a 1 de setembro de 2026.** As edge functions do CRM levam a
lista de endereços permitidos **colada lá dentro no momento em que são
instaladas** (`supabase/functions/_shared/cors.ts`). A lista foi corrigida a
**26 de agosto** para aceitar os endereços de preview do Vercel — mas só as
funções reinstaladas depois disso ficaram com a lista nova.

**A prova, em dois pedidos:**

```bash
curl -s -o /dev/null -D - -X OPTIONS   "$SUPABASE_URL/functions/v1/fiscal-entity-resolve"   -H "Origin: https://olyvia-XXXX-bmgest.vercel.app"   -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
```

| Função | Devolve |
|---|---|
| `send-email` (reinstalada depois de 26/08) | o endereço de preview ✅ |
| `fiscal-entity-resolve` (de 20 de julho) | `https://www.olyvia-ai.com` ❌ |

Quando não bate certo, o browser bloqueia o pedido **antes de ele sair** — e a
mensagem que aparece é exatamente essa.

**São 33 funções nesta situação**, entre elas `fiscal-entity-resolve`,
`search-entities`, `create-user`, `delete-user`, `sms-otp`, `nif-reveal`,
`send-quote-email` e `auto-schedule`.

**A correção não é código** — o código está certo. É reinstalar, a partir do
`main`:

```
supabase functions deploy fiscal-entity-resolve
```

É decisão de quem cuida do CRM, e mexe em produção.

**Para o teste do módulo não é preciso:** Operações **não chama uma única edge
function**. Usa-se um cliente que já exista e salta-se o passo de o criar.

---

## Ver também

- [`o-que-mudou-a-2-de-setembro.md`](o-que-mudou-a-2-de-setembro.md) — o que
  mudou nos passos **26b–26d** e na **Parte F2**, e porquê

- [`onde-estamos.md`](onde-estamos.md) — o estado do módulo
- [`o-que-mudou-a-1-de-setembro.md`](o-que-mudou-a-1-de-setembro.md) — porque é
  que esta lista mudou de forma
- [`email-que-nao-chega.md`](email-que-nao-chega.md) — porque é que o passo 38
  não chega à caixa de entrada
- [`mapa-do-modulo.md`](mapa-do-modulo.md) — o inventário completo
