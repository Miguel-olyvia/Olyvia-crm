import { test, expect } from '@playwright/test'

// Os cinco ecras de ausencias e de assiduidade que continuam a existir. Este
// ficheiro responde a uma pergunta so, e e a que nenhuma revisao consegue
// responder: abrem?
//
// A razao de existir e concreta -- duas vezes nesta obra os ecras foram
// escritos, revistos e aprovados, e estavam inalcancaveis porque as permissoes
// existiam no catalogo e nao estavam atribuidas a papel nenhum. Ninguem deu por
// isso ate alguem tentar abrir.
//
// Nao escreve nada na base: so navega e observa.

const ECRAS = [
  { rota: '/rh/ausencias', nome: 'as minhas ausencias' },
  { rota: '/rh/ausencias/aprovacoes', nome: 'aprovacoes' },
  { rota: '/rh/ausencias/organizacao', nome: 'ausencias da organizacao' },
  { rota: '/rh/assiduidade', nome: 'o meu ponto' },
  { rota: '/rh/assiduidade/organizacao', nome: 'mapa de assiduidade' },
] as const

// Os tres ecras que esta ronda tirou: tipos de ausencia (passaram a fixos,
// nao configuraveis), ponto da equipa (so existia o meu ponto, nao o da
// equipa) e dispositivos de picagem (nao existem dispositivos proprios).
const ECRAS_REMOVIDOS = [
  { rota: '/rh/definicoes/ausencias-tipos', nome: 'tipos de ausencia' },
  { rota: '/rh/assiduidade/equipa', nome: 'ponto da equipa' },
  { rota: '/rh/definicoes/assiduidade-dispositivos', nome: 'dispositivos de picagem' },
] as const

test.describe('RH — ausencias e assiduidade', () => {
  for (const { rota, nome } of ECRAS) {
    test(`${nome} abre e nao e negado`, async ({ page }) => {
      const errosEmExecucao: string[] = []
      page.on('pageerror', e => errosEmExecucao.push(e.message))

      await page.goto(rota, { waitUntil: 'domcontentloaded' })

      // O ecra tem de sair do estado de carregamento antes de se afirmar seja
      // o que for sobre ele.
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Access Denied'), `${nome}: negado por permissoes`).toHaveCount(0)
      await expect(page.getByText('Perfil não encontrado'), `${nome}: sem ficha`).toHaveCount(0)
      expect(page.url(), `${nome}: foi redireccionado para fora`).toContain(rota)

      // Uma chave de traducao por resolver aparece no ecra como o proprio
      // caminho da chave. E o defeito que a revisao encontrou em quinze sitios
      // do fluxo de pedir ausencia, e nao ha teste unitario que o veja.
      await expect(
        page.getByText(/\bhr\.[a-z]+\.[a-zA-Z.]+\b/),
        `${nome}: ha chaves de traducao por resolver a aparecer no ecra`,
      ).toHaveCount(0)

      expect(errosEmExecucao, `${nome}: rebentou em execucao`).toEqual([])
    })
  }

  for (const { rota, nome } of ECRAS_REMOVIDOS) {
    test(`${nome} ja nao existe`, async ({ page }) => {
      await page.goto(rota, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle')

      // A rota deixou de estar registada em App.tsx: cai no catch-all "*" e
      // mostra o 404, sem mudar de endereco (react-router nao redirecciona).
      await expect(
        page.getByText(/page not found/i),
        `${nome}: a rota ainda responde, devia ter sido removida`,
      ).toBeVisible()
    })
  }

  // O menu passou a ter DUAS seccoes para o mesmo dominio -- "A minha area"
  // (ausencias e ponto proprios, publico geral) e "Recursos Humanos" (pessoas,
  // aprovacoes, mapas da organizacao). AppSidebar so mostra o painel de UMA
  // seccao de cada vez (a que a URL actual activa), por isso verificam-se as
  // duas com navegacoes separadas, e nao numa unica visita.

  test('"A minha area" abre com as ausencias e o ponto proprios', async ({ page }) => {
    await page.goto('/rh/ausencias', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /a minha área|my area/i }),
      'nao abriu o painel de "A minha area"',
    ).toBeVisible()

    for (const entrada of [
      /minhas ausências|my absences/i,
      /o meu ponto|my time clock/i,
    ]) {
      await expect(
        page.getByRole('button', { name: entrada }).first(),
        `nao ha entrada de menu para ${entrada}`,
      ).toBeVisible()
    }

    // "Ponto da equipa" saiu desta seccao (e do menu todo).
    await expect(
      page.getByRole('button', { name: /ponto da equipa|team attendance/i }),
      'a entrada "ponto da equipa" ainda aparece no menu',
    ).toHaveCount(0)
  })

  test('"Recursos Humanos" abre com pessoas, aprovacoes e os mapas da organizacao', async ({ page }) => {
    await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /recursos humanos|human resources/i }),
      'nao abriu o painel de "Recursos Humanos"',
    ).toBeVisible()

    // Aprovacoes fica em Recursos Humanos por decisao explicita: quem manda e
    // a permissao de aprovar, nao a seccao.
    for (const entrada of [
      /aprovações|approvals/i,
      /ausências de todos|everyone's absences/i,
      /mapa de assiduidade|attendance map/i,
    ]) {
      await expect(
        page.getByRole('button', { name: entrada }).first(),
        `nao ha entrada de menu para ${entrada}`,
      ).toBeVisible()
    }

    // Tipos de ausencia e dispositivos de picagem saíram desta seccao (e do
    // menu todo).
    for (const entrada of [
      /tipos de ausência|absence types/i,
      /dispositivos de picagem|clocking devices/i,
    ]) {
      await expect(
        page.getByRole('button', { name: entrada }),
        `a entrada removida ainda aparece no menu: ${entrada}`,
      ).toHaveCount(0)
    }
  })
})
