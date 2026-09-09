# O cliente a pedir assistência sozinho

> Hipótese registada em agosto de 2026, **não construída**. Este documento
> existe para quem a for construir não ter de refazer o levantamento.

---

## A conclusão, primeiro

**O canal já existe e os clientes já entram nele.** Falta um botão lá dentro.

O CRM tem um portal do cliente a funcionar, com login próprio, em
`/client-portal`. Hoje o cliente vê contratos, propostas e documentos. Não vê
nem abre trabalho.

Não é preciso construir autenticação, nem convites, nem recuperação de palavra-passe.
Isso está feito e em uso.

---

## O que já existe, verificado no esquema

### O portal

| Tabela | Para que serve |
|---|---|
| `client_portal_users` | liga `auth_user_id` → `client_id` → `organization_id`. É a identidade do cliente. |
| `client_portal_access_log` | quem entrou, quando |
| `client_portal_documents` | os ficheiros que o cliente vê |

Rotas já servidas pelo CRM:

```
/client-portal
/client-portal/contracts        /client-portal/contracts/:id
/client-portal/proposals        /client-portal/proposals/:id
/client-portal/documents
```

### Formulários públicos

`forms`, `form_fields`, `form_steps`, `form_submissions`, `form_branding`,
`form_districts`, `form_tracking_pixels`.

É por aqui que entram os leads. O mesmo mecanismo serviria um
*"Pedir assistência"* **sem login** — para quem ainda não é cliente, ou para um
inquilino que não tem conta.

### A ponte, já preparada

`ops_utilizador_cliente (utilizador_id, cliente_id)` foi criada com o módulo e
**nunca foi usada**. Era exatamente para isto: dizer que pessoas veem que
clientes.

Sem ela, um cliente veria as ordens de outro. É o tipo de erro que não se
desfaz — o dado já saiu.

---

## O desenho proposto

### O que o cliente faz

Um botão **"Pedir assistência"** no portal:

1. escreve o que se passa;
2. escolhe o sítio — só aparecem os locais **dele**;
3. tira uma foto, se quiser.

### O que acontece

Nasce uma ordem com `origem = 'corretiva'` e estado **`por_aprovar`**.

**Por aprovar, não agendada.** É a mesma regra que já existe para um técnico
que reporta um problema: quem distribui trabalho decide se aquilo entra na
fila. Sem isto, o cliente passa a marcar a agenda da equipa.

### O que o cliente passa a ver

O estado do pedido dele, e mais nada:

| Vê | Não vê |
|---|---|
| Estado da ordem | Custos |
| Data agendada | Nomes dos técnicos |
| Que já foi feita | Tarefas privadas |
| O relatório, quando fechar | Fotos marcadas "só para nós" |

É a mesma regra do relatório em PDF, que já está construída: o cliente comprou
o resultado, não o processo.

**O ganho maior não é o pedido — é o cliente deixar de telefonar a perguntar
quando é que alguém vai lá.**

---

## O que é preciso construir

### Na base

```sql
-- Quem pediu. Sem FK para client_portal_users, pela regra do módulo.
ALTER TABLE public.ops_ordem
  ADD COLUMN IF NOT EXISTS pedida_por_cliente uuid;   -- → client_portal_users.id

-- A vista que o portal lê. security_invoker OBRIGATÓRIO.
CREATE VIEW public.ops_v_ordem_cliente ...            -- só o que o cliente pode ver

-- E a RPC de entrada.
CREATE FUNCTION public.rpc_ops_pedido_de_cliente(...) -- nasce por_aprovar
```

`ops_utilizador_cliente` passa a ser preenchida quando se cria um acesso de
portal.

### No CRM (frontend)

Uma página nova em `/client-portal/assistencia`. É a **primeira vez** que este
módulo precisaria de código no CRM além do link do menu — vale a pena essa
decisão ser tomada de propósito, e não por acidente.

### Escreve fora de `ops_*`?

**Não, se for bem feito.** Lê `client_portal_users` para saber quem é o
cliente, e escreve só em `ops_*`.

---

## Porque é que isto NÃO foi feito já

Registado para não se perder o raciocínio:

**Um canal para clientes muda o volume de trabalho que entra.** Se a equipa
ainda não usa o módulo internamente, abrir a porta aos clientes é pôr pedidos a
cair num sítio onde ninguém está a olhar.

A ordem que faz sentido:

1. a equipa usa o módulo internamente (piloto de uma semana, um edifício);
2. o fluxo aguenta o volume que já existe;
3. **só então** se abre a porta.

---

## Três armadilhas conhecidas

**1. O cliente a ver ordens de outro cliente.**
A vista tem de ter `security_invoker = true` e filtrar por
`ops_utilizador_cliente`. Já aconteceu uma vez neste módulo, com os custos: uma
política `FOR ALL` dá leitura sem se dar por isso. Foi um teste que a apanhou.
Aqui o teste tem de existir **antes** do ecrã.

**2. Pedidos a chegarem sem ninguém ver.**
Sem notificações, um pedido fica parado até alguém abrir a aplicação. Ou se
constroem notificações ao mesmo tempo, ou se acorda um sítio onde alguém olha
todos os dias.

**3. O cliente a marcar a agenda.**
Se um pedido nascesse `agendada`, o cliente passava a decidir o trabalho da
equipa. Nasce `por_aprovar`, sempre.

---

## Uma variante mais barata, para considerar primeiro

**Só a metade de leitura.**

O cliente não pede nada — apenas *vê* o estado do trabalho que já foi
combinado por telefone.

- não muda o volume que entra;
- não precisa de notificações;
- resolve o telefonema do *"quando é que vêm?"*, que é metade do incómodo;
- é cerca de um terço do trabalho.

Se a dúvida for se vale a pena, esta variante responde à pergunta sem grande
compromisso.
