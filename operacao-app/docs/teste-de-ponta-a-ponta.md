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

1. **Cria um cliente de teste com o TEU email.** Nunca uses um cliente real
   para o passo do relatório.
2. **Atribui as ordens a ti próprio.** Assim o sino que toca é o teu.

*(Hoje o email não chega de todo — ver [`email-que-nao-chega.md`](email-que-nao-chega.md).
Mesmo assim, a regra mantém-se: um dia chega, e mais vale o hábito estar certo.)*

---

## 3. O caminho, do CRM até ao cliente

Pica à medida que fores. **Cada passo diz o que tens de ver** — se vires outra
coisa, para e anota.

### Parte A — chegar lá

- [ ] **1.** Entrar no CRM, no endereço de teste.
- [ ] **2.** O menu tem **Operação**, com o ícone da chave inglesa.
- [ ] **3.** Carregar. Abre a página de entrada do módulo.
- [ ] **4.** Entrar. Cai no **Hoje**.

> ✅ Isto sozinho já prova o essencial: o CRM não partiu, e a ponte funciona.

### Parte B — montar (Definições)

- [ ] **5.** `Definições › Vocabulário` — mudar o nome de uma prioridade.
      *Ver: o nome novo aparece nas listas todas, sem recarregar.*
- [ ] **6.** `Definições › Locais` — criar uma morada e um espaço dentro dela.
- [ ] **7.** Criar um **equipamento** nesse espaço.
- [ ] **8.** `Definições › Procedimentos` — aplicar um **pack** (Manutenção).
      *Ver: aparecem checklists feitas.*
- [ ] **9.** `Definições › Tipos e custos` — confirmar que há pelo menos um tipo.

### Parte C — o trabalho

- [ ] **10.** `Nova ordem` — escolher o local, o equipamento e o cliente de teste.
- [ ] **11.** Atribuir **a ti**. *Ver: chega uma notificação ao sino do CRM.*
- [ ] **12.** Agendar para hoje. *Ver: aparece em `/agenda`.*
- [ ] **13.** Responder à primeira tarefa.
      *Ver: a ordem passa a **em curso** sozinha — ninguém carregou em "iniciar".*
- [ ] **14.** Registar uma **medição**.
- [ ] **15.** Tirar uma **foto** (no telemóvel, este passo é o importante).
- [ ] **16.** Lançar um **custo**.
- [ ] **17.** Escrever na **conversa** da ordem.
      *Ver: fica lá, e não há botão de apagar.*

### Parte D — fechar e entregar

- [ ] **18.** **Fechar** a ordem.
- [ ] **19.** Recolher a **assinatura** do cliente no ecrã.
- [ ] **20.** Abrir o **relatório**. *Ver: fotos, medições, custos e assinatura.*
- [ ] **21.** **Confirmar** a ordem.
- [ ] **22.** Carregar em **Enviar ao cliente**.
      *Ver: mostra o email de destino antes de confirmar. Depois de enviar,
      fica um evento no histórico da ordem.*
      ⚠ **O email não vai chegar** — é o bug do CRM, já documentado. O que
      este passo prova é que o módulo faz a parte dele.

### Parte E — o que se vê depois

- [ ] **23.** `/analises › Equipamento` — a ordem aparece no histórico dele.
- [ ] **24.** `/analises › Exportar medições` — a medição do passo 14 vem na folha.
- [ ] **25.** `/planos` — criar um plano preventivo e gerar a ordem.
- [ ] **26.** Voltar ao **CRM** pelo menu do utilizador.
      *Ver: o CRM continua exatamente como estava.*

---

## 4. No telemóvel, o que importa mesmo

O computador prova a lógica. O telemóvel prova o produto. Abre o **mesmo
endereço** no telemóvel e repete só isto:

- [ ] A **foto** (passo 15) — foi aqui que já falhou uma vez.
- [ ] A **assinatura** (passo 19) — o dedo no ecrã.
- [ ] Um ecrã em modo avião: responder a uma tarefa **sem rede**.
      *Ver: aceita, e sai sozinho quando a rede volta.*
      ⚠ **Não feches a aplicação sem rede** — abrir sem rede ainda não
      funciona, e é sabido.
- [ ] Texto a sair do ecrã em `Nova ordem` e em `Definições`.

---

## 5. Se alguma coisa correr mal

| O que vês | O que quer dizer |
|---|---|
| `/operacao` mostra a versão antiga | O build do módulo falhou e o CRM publicou à mesma — é de propósito. O aviso está nos registos do deploy (`tools/build-vercel.sh`). |
| Página em branco no `/operacao` | Faltam as variáveis `VITE_SUPABASE_*` no ambiente **Preview** do Vercel. |
| **Operação** não aparece no menu | Falta a permissão `operations.view`. |
| Erro a gravar, em qualquer sítio | Falta correr um SQL. A ordem está no `README.md` e em `tools/validar-instalacao.mjs`. |

---

## Ver também

- [`onde-estamos.md`](onde-estamos.md) — o estado do módulo
- [`email-que-nao-chega.md`](email-que-nao-chega.md) — porque é que o passo 22
  não chega à caixa de entrada
- [`mapa-do-modulo.md`](mapa-do-modulo.md) — o inventário completo
