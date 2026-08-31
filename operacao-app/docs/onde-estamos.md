# Onde estamos, e como continuar

> Escrito no fim da sessão de 30 de agosto de 2026, para se poder retomar
> amanhã sem reconstruir o contexto.
>
> Se só leres uma coisa: **§1 (estado)** e **§5 (por onde começar)**.

---

> ⚠ **As secções 1 a 9 são de 30 de agosto.** O que é verdade hoje está na
> **§0**, logo a seguir — começa por aí.

## 0. O que mudou a 31 de agosto

O módulo está **no ar** em `/operacao`, e as **nove** coisas que estavam por
fazer estão feitas. Restava uma, e está mais abaixo.

### O que se fez

| | Onde se vê |
|---|---|
| **Notificações** no sino do CRM — ordem atribuída, corretiva por aprovar, atraso, pausa expirada, plano falhado | o sino do Olyvia |
| **A ordem inicia-se sozinha** à primeira resposta | ficha da ordem |
| **Ficha do equipamento** — tudo o que se lhe fez e a evolução das leituras | `/analises` › Equipamento |
| **PMP cumprido** por cliente e por mês | `/analises` › Manutenção preventiva |
| **Exportar leituras** para folha de cálculo | `/analises` › Exportar medições |
| **Agenda: férias, horários e feriados** ao marcar uma visita | ficha da ordem |
| **Ecrã de agenda do dia** com a equipa toda lado a lado | `/agenda` |
| **Packs de configuração** — Manutenção, Obras, Limpeza | `/definicoes` › Procedimentos |
| **Assinatura do cliente** no telemóvel do técnico | ficha da ordem, depois de fechar |

### O que falta

**Trabalhar sem rede.** É a mais cara da lista, e a recomendação continua a ser
esperar pelo piloto — não por ser difícil, mas porque a forma de a resolver
depende de saber ONDE a rede falha. Se for só responder a tarefas é uma coisa;
se for tirar fotos numa cave é outra, bem mais cara.

### Os ficheiros SQL, por ordem

Cada um pode voltar a correr sozinho numa base já completa — isso é testado,
e foi a razão de um deploy falhado.

```
schema.sql → permissoes.sql → notificacoes.sql → rpcs.sql → rpcs-tarefas.sql
  → planos.sql → correcoes-modelo.sql → medicoes.sql → agenda.sql
  → despacho.sql → orcamentos.sql → anexos.sql → assinaturas.sql
  → planos-crud.sql → config.sql → packs.sql → custos.sql → analises.sql
  → cliente-crm.sql → pos-instalacao.sql
```

### O que está verificado

**19 validadores** contra Postgres a sério, **276 testes** de domínio, typecheck
e build limpos. Zero chaves estrangeiras de `ops_*` para fora.

**As duas únicas escritas fora de `ops_*`**, ambas deliberadas e testadas: uma
linha no sino (`notifications`), e os ficheiros no balde `operacoes`.

### Onde está o resto

O inventário completo — ecrãs, tabelas, vistas, escritas, avisos — está em
[`mapa-do-modulo.md`](mapa-do-modulo.md). É por aí que se começa para saber
"o que faz este ecrã" ou "onde está isto guardado".

**As secções 1 a 9 abaixo são de 30 de agosto** e ficam como registo do que se
sabia nessa altura. O que interessa hoje está aqui em cima e no mapa.

---

## 1. O estado, em três linhas

O módulo está **completo de ponta a ponta** e **instalado em produção**. Está a
ser usado por uma pessoa (o Ruben), no computador e no telemóvel, com dados
reais.

Nada foi para o `main`. Tudo vive no ramo `feature/operacoes`, com **27 commits
por enviar**.

Ninguém da equipa de operações o usou ainda.

---

## 2. O que já funciona

Do zero até entregar ao cliente:

| | Onde |
|---|---|
| Montar a operação — locais, equipamentos, medições, checklists, equipa | `/definicoes` |
| Planos preventivos que geram ordens sozinhos | `/planos` |
| Abrir uma ordem quando o telefone toca | `/ordens/nova` |
| Atribuir, agendar, com aviso de choque | na ficha da ordem |
| Executar: responder tarefas e medições | na ficha da ordem |
| Fotos, com "só para nós" | na ficha da ordem |
| Custos: material do catálogo ou de uma compra | na ficha da ordem |
| Orçamentado contra gasto, linha a linha | na ficha da ordem |
| Relatório em PDF para o cliente | ficha da ordem, depois de fechar |
| Orçamento aceite → obra | `/orcamentos` |
| O que mudou face ao Infraspeak, e o tutorial | `/ajuda` |

**Verificado:** 12 validadores contra Postgres a sério, 123 testes de domínio,
build limpo, zero erros de lint.

**Garantia que se mantém:** zero chaves estrangeiras de `ops_*` para fora, e
zero escritas em tabelas do CRM. Há testes que falham se alguém as criar.

*(A única exceção, deliberada e documentada: o bucket `operacoes` em
`storage`.)*

---

## 3. O que está instalado em produção

Confirmado por consulta à base no fim da sessão. **Todos os ficheiros SQL
foram corridos:**

```
schema.sql · permissoes.sql · rpcs.sql · rpcs-tarefas.sql · planos.sql
correcoes-modelo.sql · medicoes.sql · despacho.sql · orcamentos.sql
anexos.sql · planos-crud.sql · config.sql · custos.sql · cliente-crm.sql
```

**Não há nada por correr.** Se acrescentares SQL novo, a ordem está em
`tools/validar-instalacao.mjs` e no `README.md`.

---

## 4. O que ficou por confirmar

Corrigi três coisas no fim da sessão que **ainda não foram testadas no
telemóvel**:

| Correção | Como confirmar |
|---|---|
| Texto a sair do ecrã (`min-w-0` no `Field`) | abrir Nova ordem e Definições num telemóvel |
| Foto da câmara a falhar (`crypto.randomUUID`) | tirar uma foto numa ordem, pelo IP da rede |
| Botões de custo apagados sem explicação | abrir "Lançar" numa empresa sem catálogo |

**Se a foto ainda falhar**, o erro passa a dizer porquê: ficheiro grande
demais, armazenamento por criar, ou sem permissão.

---

## 5. Por onde começar amanhã

### Primeiro: fechar o que está aberto

1. **Confirmar as três correções no telemóvel** (§4). Cinco minutos.
2. **Decidir o push.** Estão 27 commits parados. Ver §7.

### Depois, por esta ordem

Cada uma explicada em [`a-seguir.md`](a-seguir.md).

**1. Notificações** — meio dia
A falha mais sentida, e a mais barata. O CRM já tem a tabela `notifications`,
e é genérica: escreve-se uma linha e a pessoa vê no sino que já usa.
*Decisão a tomar: é a primeira escrita numa tabela do CRM.*

**2. Iniciar a ordem sozinha** — uma hora
Ao abrir a primeira tarefa. Tira um passo a toda a gente e não perde nada — a
sessão de trabalho começa na mesma.

**3. Relatório do ativo**
Todas as intervenções de um equipamento, com a evolução das leituras. Os dados
já estão gravados em `ops_ordem_tarefa_medicao`; falta o ecrã.

**4. Agenda: férias e horários** — meio dia para o essencial
Falta um mapa entre utilizador de Operações e recurso de agenda. Feito isso, o
aviso de choque passa a saber que a pessoa está de férias.

**5. PMP cumprido**
A percentagem de preventiva feita, por cliente e período. É o indicador
contratual.

**6. Assinatura do cliente no telemóvel**
O CRM já recolhe assinaturas com validade legal.

**7. Offline**
O mais caro. Deixar para quando o piloto disser quantas vezes falhou por falta
de rede.

### Em paralelo, quando houver ocasião

**O piloto.** Um edifício, um técnico, uma semana. É o que ensina mais do que
qualquer coisa que se possa verificar sozinho — as três coisas corrigidas hoje
vieram de meia hora de uso real, e nenhuma aparecia nos 123 testes.

---

## 6. Como correr as coisas

```bash
cd operacao-app

npm run dev                # servidor local, porta 5274
npm test -- --run          # 123 testes de domínio
npm run typecheck
npm run build
```

**Os 12 validadores** correm o SQL contra um Postgres a sério (PGlite, sem
Docker):

```bash
npm run validar-schema         npm run validar-medicoes
npm run validar-instalacao     npm run validar-despacho
npm run validar-rpcs           npm run validar-orcamentos
npm run validar-planos         npm run validar-anexos
npm run validar-restricao      npm run validar-config
npm run validar-custos         npm run validar-cliente-crm
```

**Aplicar SQL em produção:** os ficheiros estão em `db/`, e correm-se colando
no SQL Editor do Supabase. Há também `npm run supabase:<nome>`, que precisa de
`DATABASE_URL` no `.env`.

### Testar no telemóvel sem publicar

O `vite.config.ts` já tem `host: true`. Falta abrir a porta na firewall do
Windows, **como administrador**:

```powershell
New-NetFirewallRule -DisplayName "Olyvia Operacoes 5274" `
  -Direction Inbound -Protocol TCP -LocalPort 5274 `
  -RemoteAddress LocalSubnet -Action Allow
```

Depois, no telemóvel, com o mesmo Wi-Fi: `http://<ip-do-pc>:5274`

Para apagar a regra no fim:
`Remove-NetFirewallRule -DisplayName "Olyvia Operacoes 5274"`

---

## 7. O push, e o que está em causa

```
ramo:     feature/operacoes
commits:  27 por enviar
main:     intocado
```

Duas opções, decididas em conjunto na sessão passada:

**Só o ramo** *(escolhido, mas o push ficou bloqueado)*
`git push -u origin feature/operacoes` → o Vercel cria um URL de
pré-visualização. Ninguém no CRM vê nada. O link aparece na página do commit
no GitHub — não é preciso conta no Vercel.

**Direto para produção**
Merge em `main` → `www.olyvia-ai.com/operacao` fica no ar, e o menu do CRM
ganha "Operações" para quem tiver a permissão `operations.view`.

⚠ **O push está bloqueado** para o assistente pelo modo automático. Tem de ser
corrido à mão, ou com `!git push …` na conversa.

⚠ **Por confirmar:** se as variáveis `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` estão disponíveis no ambiente de
pré-visualização do Vercel. Se não estiverem, a app carrega mas não fala com a
base. Resolve-se acrescentando-as e voltando a publicar.

Fora de `operacao-app/`, só quatro ficheiros mudam: `vercel.json`,
`menuConfig.ts`, `AppSidebar.tsx` (7 linhas) e `translations/index.ts`.

---

## 8. Coisas que custaram a descobrir

Para não se voltarem a descobrir.

**As organizações.** A atividade comercial está quase toda na **Mudelar** (178
clientes, 981 orçamentos, o catálogo, as compras). A **Grupo BMLar** tem 17
clientes e mais nada. Testar ligações ao CRM na BMLar dá sempre vazio — e
parece avaria.

**Contexto seguro.** `crypto.randomUUID()` não existe fora de HTTPS ou
`localhost`. Ao testar pelo IP da rede, tudo o que depender de APIs de contexto
seguro falha — e o erro não diz porquê.

**`min-width: auto`.** Um filho de grelha ou de flex recusa-se a encolher
abaixo do conteúdo. `break-words` não chega: primeiro a caixa tem de poder
encolher. Está resolvido no `Field`, que é o invólucro comum.

**Políticas `FOR ALL`.** O `USING` de uma política `FOR ALL` **também se aplica
ao SELECT**. Uma política de escrita assim dá leitura sem se dar por isso — foi
como uma fuga de custos apareceu, apanhada por um teste. Usar uma política por
comando.

**Dependências entre funções.** O Postgres deixa criar uma função que chama
outra que ainda não existe; só rebenta ao ser usada. Verificar que uma função
existe **não prova** que funciona. Foi assim que `despacho.sql` passou
despercebido por dois dias.

**Duas pessoas com o mesmo nome.** Há dois "Ricardo Belchior" no CRM, com
emails diferentes. Identificar pessoas por email, nunca por nome.

---

## 9. Os documentos

| | |
|---|---|
| [`../README.md`](../README.md) | como está construído, os ficheiros SQL, a autorização em três camadas |
| [`mapa-do-modulo.md`](mapa-do-modulo.md) | **o inventário**: ecrãs, tabelas, vistas, escritas, avisos, ordem de instalação |
| [`a-seguir.md`](a-seguir.md) | o que vem a seguir, com o levantamento do que o CRM já tem |
| [`deploy-falhado.md`](deploy-falhado.md) | o deploy que falhou, e porquê |
| [`portal-do-cliente.md`](portal-do-cliente.md) | o cliente a pedir assistência sozinho |
| `/ajuda` na app | três portas: porquê mudar (para quem decide), como funciona (com fluxogramas), como se usa |
