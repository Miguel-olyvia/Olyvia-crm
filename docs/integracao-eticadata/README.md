# Integração com o Eticadata (faturas, recibos e pagamentos)

Estado a 21/10/2026: **em standby.** Segundo o revendedor, para usar o módulo da API com certificação, **a nossa plataforma também tem de ser certificada pela AT**.
Até lá, a fatura emite-se no Eticadata e a Olyvia, no máximo, regista o número ou lê-o do SQL, como o `registarFatura` da V2. O resto deste documento fica para quando se retomar.
Ainda não há ligação nenhuma ao ERP, nem a de leitura. Este documento junta o que se sabe, o que se decidiu e o que falta.

---

## 1. O que é

O sistema financeiro das empresas do grupo é o **Cegid Eticadata ERP V22**. A Olyvia (CRM, Negócios, Obras) precisa de:

- **emitir faturas**, certificadas pela AT, quando o Financeiro carrega em «Emitir a fatura»: a da obra (por tranche) e a de cada adenda ou imprevisto;
- **registar o recibo** quando o pagamento é validado;
- **ler** os números, os PDFs, os pagamentos e os saldos dos clientes, para os mostrar no negócio e no portal do cliente.

## 2. O servidor e as bases de dados

| | |
|---|---|
| Servidor | `BMINVESTE-SRV`, na rede local, sem acesso pela internet (o IP e os acessos estão no email do revendedor) |
| SQL Server | 2017 **Express**, instância `BMINVESTE-SRV\ETICADATA` |
| BD de sistema | `sistema` |

| Empresa | BD real | BD de testes |
|---|---|---|
| BMGest | `Emp_B001` | |
| BMInvest | `Emp_B002` | |
| **Mudelar** | **`Emp_B004`** | **`Emp_Z004`**, `Emp_ZB04` |
| BM24 | `Emp_B005` | |
| BMClean | `Emp_B006` | `Emp_ZB06` |
| Só No Lar | `Emp_B007` | |
| (base) | | `Emp_Base` |

As credenciais (as do servidor e as do `sa`) chegaram por email. **Não ficam neste repositório nem em nenhum ficheiro.**
Pedimos ao revendedor para trocar a password do `sa` e criar um utilizador só de leitura. A Olyvia nunca usa o `sa`.

Nota: o SQL Server Express não tem SQL Agent, por isso nada pode ficar agendado do lado do SQL. Tem também o limite de 10 GB por BD, o que chega para ler.

## 3. O que diz o manual (ERP V22, «Manual de Plataforma e Customização», cap. 9)

- **API de integração** (§9): é a mesma API que o ERP usa e permite tudo o que o ERP faz. Existe em duas formas:
  - **DLLs .NET**, para os componentes desktop: `Eticadata.ERP.dll`, `Eticadata.Movs.dll`, `Eticadata.Tables.dll`, `Eticadata.Generics.dll` e `Eticadata.EtiVersions.dll`. São .NET Framework 4.8 e devem compilar-se para **x86**, porque usam DLLs de terceiros de 32 bits. Têm de ser da mesma versão da BD e correm a partir da pasta `Bin` da instalação.
  - **WebServices**, para os componentes web. O manual não os documenta (está na secção 8, pergunta em aberto).
- **Como se usa**:
  1. Inicializa-se o `EtiAplicacao` com `InitializeEtiApp(app, servidor, BD sistema, login, password, …)`.
  2. A partir dele obtém-se `Movimentos.MovVendas`.
  3. `GetNew(...)` cria o documento novo, e o número definitivo só fica certo no `Update`.
  4. `AlteraEntidade(...)` define o cliente; os métodos `Altera<Campo>` disparam as regras do ERP.
  5. As linhas acrescentam-se com `AddLin` e lêem-se com `Linha(i)`; as linhas começam em 1.
  6. `Validate()` confirma o documento e devolve os avisos.
  7. `Update(...)` grava.
  8. Se houver erro, vem em `EtiErrorCode`, `EtiErrorDescription` e `EtiErrorLine`.
- **Certificação** (§9.3.9): o documento é **assinado pela Eticadata na primeira gravação** se estiver tudo isto:
  - a empresa é portuguesa e não é de formação;
  - está licenciado o módulo **«Plataforma de Integração com Certificação»**;
  - o tipo de documento é para entregar ao cliente;
  - a secção **não** é de documentos Externos nem Manuais;
  - o documento é novo (`IsNew`) e a gravação é feita com `MovVendas.Update(…)`;
  - não vem de pré-venda automática nem de integração offline.
- **Consultas** (§9.1.5): a API não serve para listas. O manual diz para ler **diretamente do SQL Server** (`EtiApp.ActiveEmpresa.ConnectionStringNET`).
- **Licença** (§9.1.1): um programa fora do ERP precisa do módulo «Plataforma de Integração», contado por postos. Já vem incluído na linha Extended.
- **Eventos** (§9.2): o ERP pode correr código nosso em eventos como «Depois de gravar». Pode servir mais tarde para avisar a Olyvia de pagamentos registados no ERP.

**A regra que não se quebra:** a fatura cria-se **sempre pela API**. Escrever nas tabelas não a certifica, e pode partir a cadeia de assinaturas da série e o SAF-T.

## 4. A arquitetura

```
 Olyvia (Vercel + Supabase)                                   Rede da empresa
 ┌──────────────────────────┐   HTTPS + token   ┌──────────────────────────────────────────────┐
 │ edge function            │ ────────────────► │ Ponte Eticadata (serviço Windows, .NET 4.8 x86)│
 │ erp-faturar / erp-recibo │ ◄──────────────── │  └─ DLLs Eticadata → MovVendas.Update          │
 │ erp-sincronizar (leitura)│   (Cloudflare     │  └─ SELECT (utilizador só de leitura)          │
 └──────────────────────────┘    Tunnel)        │ SQL Server BMINVESTE-SRV\ETICADATA             │
                                                └──────────────────────────────────────────────┘
```

- **A ponte** é um serviço Windows pequeno, que corre **no BMINVESTE-SRV** (ou noutra máquina da rede com o ERP instalado). É a única coisa que fala com o ERP.
- **Como a Olyvia lá chega**: por um **Cloudflare Tunnel**, ou outro túnel de saída. Assim não se abre nenhuma porta no router e o SQL Server nunca fica exposto. Cada pedido leva um token, e a ponte só aceita os pedidos das edge functions da Olyvia.
- **A leitura** também passa pela ponte, com um utilizador SQL só de leitura, porque o SQL não sai da rede. A Olyvia guarda uma cópia do que precisa (o número, o estado e o PDF) nas tabelas dela.
- **Se o ERP estiver em baixo**, a fatura fica «por emitir» na Olyvia, com o erro à vista, e o Financeiro tenta de novo. Nunca se gera um número na Olyvia.

## 5. O contrato da ponte (proposta)

Todos os pedidos levam o cabeçalho `Authorization: Bearer <token>` e um `idempotencia` (o id do pedido na Olyvia). Com ele, a ponte não emite duas vezes a mesma fatura se o pedido se repetir.

### `POST /faturas`
Emite uma fatura certificada.
```json
{
  "idempotencia": "neg-1027-tranche-1",
  "empresa": "Emp_B004",
  "serie": "<por definir>", "seccao": "<por definir>", "tipoDoc": "<por definir>",
  "cliente": { "nif": "123456789", "nome": "Tiago Almeida", "morada": "...", "codigoErp": null },
  "linhas": [
    { "descricao": "Remodelação de cozinha · 1.ª tranche (30%)", "quantidade": 1, "precoUnitario": 2635.23, "taxaIva": 6 },
    { "descricao": "Conjunto de móveis de cozinha", "quantidade": 1, "precoUnitario": 1200.00, "taxaIva": 23 }
  ],
  "vencimento": "2026-11-05",
  "referenciaOlyvia": "CT 2026/1027"
}
```
Resposta: `{ "numero": "FT B004/123", "atcud": "XXXX-123", "data": "2026-10-21", "total": 4269.55, "pdf": "<url ou base64>" }`.
Em erro: `{ "erro": "<EtiErrorCode>", "mensagem": "<EtiErrorDescription>", "linha": <EtiErrorLine> }`.

### `POST /recibos`
Regista o recibo de uma fatura paga.
```json
{ "idempotencia": "rec-FT B004/123", "empresa": "Emp_B004", "fatura": "FT B004/123", "valor": 4269.55, "data": "2026-10-25", "meio": "Transferência" | "Referência MB" | "Débito direto", "referencia": "TRF 1025-551" }
```
Resposta: `{ "numero": "RC B004/45", "pdf": "..." }`.

### `GET /documentos?empresa=Emp_B004&desde=2026-10-01`
Lê as faturas, os recibos e as notas de crédito alterados desde uma data, para a sincronização. **Só leitura.**

### `GET /clientes/:nif?empresa=Emp_B004`
Lê o cliente no ERP (código e saldo), para não o criar em duplicado.

**Por decidir com o revendedor:** se o cliente se cria pela API quando não existe (`Tabelas.Clientes`); os códigos de IVA (6% e 23%) e o motivo de isenção; o artigo ou serviço genérico a usar nas linhas «livres»; e a série, a secção e o tipo de documento.

## 6. O que a Olyvia lê do SQL (a mapear na BD de testes `Emp_Z004`)

Quando houver o utilizador só de leitura, mapeiam-se estas tabelas na **`Emp_Z004`**, sempre com `SELECT`:

- os documentos de venda (cabeçalho e linhas): número, série, data, cliente, totais, estado e ATCUD;
- os recibos e as liquidações: que fatura foi paga, quando e por que meio;
- os clientes: NIF, código e saldo;
- onde ficam os PDFs, se o ERP os guarda numa pasta.

Os nomes reais das tabelas ainda não se conhecem e vão ser escritos aqui depois desse mapeamento.

## 7. Onde liga no protótipo (e depois na app)

O protótipo (`src/pages/prototipo-negocios/`, versão «Atual») já tem o circuito todo, com números simulados. Na migração, cada ação passa a chamar a ponte:

| No protótipo (`motor.ts`) | Hoje faz | Com o Eticadata |
|---|---|---|
| `emitir(id)` | `FT 2026/<n>` simulado, sai para o portal | `POST /faturas`; guarda o número, o ATCUD e o PDF que o ERP devolve |
| `faturarAdendas(id)` | uma fatura por adenda assinada (inclui os imprevistos) | um `POST /faturas` por adenda |
| `escolherMetodo` / `autorizarDebito` / `avisarPagamento` | o cliente escolhe no portal (transferência, referência MB ou débito direto) e avisa que pagou | ficam na Olyvia; o meio segue para o recibo |
| `validar(id)` | `RC 2026/<n>` simulado; emite a encomenda de cliente e passa o negócio a Obra | `POST /recibos`; só avança com o recibo confirmado |
| `validarPagamentosAdenda(id)` | o recibo da adenda | `POST /recibos` por adenda |
| (novo) | — | a sincronização com `GET /documentos` marca como pagas as faturas recebidas diretamente no ERP |

**Pagamentos (21/10):**
- A referência MB e o débito direto são, para já, **simulados no protótipo** (`pagamentoCliente.ts`: entidade, referência e IBAN de exemplo).
- Para a referência MB e o débito direto (SEPA) a sério, é precisa uma conta num prestador de pagamentos. Isto é **independente do Eticadata**: o Eticadata só regista o recibo.

**Assinaturas (21/10):** o contrato, as adendas e o auto assinam-se com a Chave Móvel Digital ou com **código por SMS**. O SMS segue as regras da `sms-otp` da app original (SMSAPI: 6 dígitos, 5 minutos, 5 tentativas, reenviar ao fim de 60 s, no máximo 3 em 10 minutos). Não depende do ERP.

## 8. Perguntas ao revendedor (email de 21/10, só as críticas)

1. Temos licenciado o módulo **«Plataforma de Integração com Certificação»**? Se não, qual é o custo?
2. Que **série e secção** devemos usar para as faturas da aplicação? Podem configurá-las primeiro na `Emp_Z004`?
3. Podem criar um **utilizador SQL Server só de leitura** e trocar a password do `sa`?

Depois destas, perguntar também:
- se os **WebServices** estão instalados e documentados (podem dispensar a ponte em .NET);
- se há um exemplo de código de uma fatura com IVA a 6% e 23% e do respetivo recibo;
- onde ficam os PDFs;
- que versão exata do V22 está instalada;
- que disponibilidade e que custo tem o acompanhamento.

## 9. Próximos passos

| # | Passo | Depende de |
|---|---|---|
| 1 | Mapear as tabelas na `Emp_Z004` (secção 6) | utilizador só de leitura |
| 2 | Ponte mínima: `GET /documentos` (só leitura), ligada por túnel | 1 |
| 3 | Na ponte: `POST /faturas` contra a `Emp_Z004`, a confirmar que sai assinada e com ATCUD | módulo de certificação; série e secção de teste |
| 4 | Na ponte: `POST /recibos` | 3 |
| 5 | Edge functions na Olyvia (`erp-faturar`, `erp-recibo`, `erp-sincronizar`) e ligação às ações da secção 7 | 2–4, migração do protótipo |
| 6 | Passar para a `Emp_B004` (real), com uma série nova | aprovação do Financeiro |

**Riscos:**
- Sem o módulo de certificação, a fatura não pode sair da Olyvia. A alternativa é a emissão manual no ERP, com a Olyvia só a ler.
- As DLLs têm de acompanhar a versão do ERP: cada atualização do ERP obriga a atualizar a ponte.
- O servidor e o túnel têm de estar ligados para se faturar.
