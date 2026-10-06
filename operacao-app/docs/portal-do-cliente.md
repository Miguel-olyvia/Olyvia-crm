# O cliente a acompanhar (e, depois, a pedir) trabalho

> **06/10/2026 — feita a "variante mais barata" para as OBRAS: o cliente
> acompanha a sua obra por um link privado.** Ver a secção
> [Acompanhamento da obra por link](#acompanhamento-da-obra-por-link-feito-a-06102026).
> O "pedir assistência" (ordens) continua por fazer — o resto deste
> documento é o levantamento original, de agosto.

---

## Acompanhamento da obra por link (feito a 06/10/2026)

**O que o cliente vê** — `/operacao/acompanhar/<token>`, sem conta, no
telemóvel: a marca da empresa, o título e a morada da obra, o progresso
(pesado pelo tempo previsto), início e conclusão prevista (com a data
original riscada se mudou), a etapa atual e a seguinte, todas as etapas com
datas, as **atualizações** (atrasos já comunicados: motivo, a nota dada ao
cliente e a nova data), as **fotos escolhidas** e o contacto do supervisor
(ligar / email).

**O que nunca vê:** custos, tempos, nomes da equipa (além do supervisor),
notas internas, o "contexto" dos atrasos, atrasos ainda não comunicados,
fotos não marcadas.

**Na ficha da obra (Operações):** "Partilhar com o cliente" → gerar o link
(30 dias a 1 ano), copiar, enviar por WhatsApp ou email, ver quantas vezes o
cliente o abriu, desativar, e **"Ver o que o cliente vê"** (a mesma página,
numa moldura de telemóvel). Nas fotos de cada tarefa, o interruptor
**"Mostrar ao cliente"** (por defeito, nenhuma foto é visível).

**Quem pode:** pré-visualizar — quem vê a obra. Gerar/desativar o link e
escolher as fotos — o supervisor da obra ou admin/gestor (a mesma regra do
"cliente avisado").

**Como está feito** (`db/acompanhamento-cliente.sql`, depois de `obras.sql`
e `obras-fotos.sql`):

- `ops_obra_partilha`: um link por obra, com **só o hash** (sha256) do token
  — quem lê a base não reconstrói o link; o token aparece uma vez, ao gerar.
  Validade, revogação, contagem de acessos. Gerar um novo revoga o anterior.
  Tabela fechada: só as RPCs lhe tocam.
- `rpc_ops_acompanhar(token)` (anon): mesma mensagem para "não existe" e
  "revogado"; "expirou" diz-se. Obra cancelada fecha o link.
- `ops_obra_acompanhamento_dados(obra)`: a ÚNICA fonte do que o cliente vê —
  usada pelo link e pela pré-visualização, para nunca divergirem.
- Fotos: `ops_obra_tarefa_foto.visivel_cliente`; a política de storage
  `ops_acompanhar_fotos_ler` deixa assinar (URL de 1 h) só fotos marcadas de
  obras com link ativo. Consequência conhecida: quem souber o caminho exato
  de uma foto marcada (uuids) consegue assiná-la enquanto o link estiver
  ativo — o mesmo nível de segredo do próprio link.
- Provado em `tools/validar-acompanhamento.mjs` (44 verificações).
- Zero escritas no CRM.

**Porque link e não o portal do cliente do CRM:** o portal exige conta e
ligação `client_portal_users` → cliente → obra, e a maioria dos clientes de
obra não tem conta. O link resolve já o telefonema do "quando é que vêm?";
quando o portal for a porta habitual, a mesma `ops_obra_acompanhamento_dados`
serve-o (só muda a verificação de acesso).

---

## Levantamento original: o cliente a pedir assistência sozinho

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
