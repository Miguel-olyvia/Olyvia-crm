import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * O Cliente é o passo terminal e não se arrasta.
 *
 * É o único módulo que não cria nada a seguir a si — converte, e acaba. Nada
 * pode vir depois dele.
 *
 * Isso não estava garantido em lado nenhum até 2026-08-31: havia DOIS manípulos
 * de arrasto (`DealWorkflowConfig.handleFlowDragEnd` e
 * `PipelineModuleToggle.handleDragEnd`), ambos a chamar `arrayMove` sem guarda,
 * e o Cliente podia ficar em primeiro.
 *
 * Este é o teste rápido; as 24 ordens estão em `ordens-do-pipeline.spec.ts`.
 */

const PASSO = '[class*="min-w-\\[70px\\]"]'

async function abrirPainel(page: Page): Promise<Locator> {
  await page.goto('/deals', { waitUntil: 'domcontentloaded' })
  const botao = page.getByRole('button', { name: 'Workflow' }).first()
  await botao.waitFor({ timeout: 40_000 })
  await botao.click()
  const painel = page.locator('[role="dialog"]').filter({ hasText: 'Fluxo Automático' }).first()
  await painel.waitFor({ timeout: 20_000 })
  return painel
}

async function ordemNoEcra(passos: Locator): Promise<string[]> {
  const n = await passos.count()
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(((await passos.nth(i).innerText()).split('\n')[0] ?? '').trim())
  }
  return out
}

test.describe('Pipeline de aquisição — o Cliente é terminal', () => {
  test.setTimeout(90_000)

  test('o Cliente não tem pega de arrasto; os outros módulos têm', async ({ page }) => {
    const painel = await abrirPainel(page)
    const passos = painel.locator(PASSO)
    const nomes = await ordemNoEcra(passos)

    expect(nomes.length, 'o fluxo devia ter módulos').toBeGreaterThanOrEqual(2)
    expect(nomes[nomes.length - 1]).toBe('Cliente')

    for (let i = 0; i < nomes.length; i++) {
      const pegas = await passos.nth(i).locator('[class*="cursor-grab"]').count()
      if (nomes[i] === 'Cliente') {
        // Melhor um gesto que nem começa do que um que começa e volta atrás.
        expect(pegas, 'o Cliente não devia ter pega de arrasto').toBe(0)
      } else {
        expect(pegas, `${nomes[i]} devia ter pega de arrasto`).toBeGreaterThan(0)
      }
    }
  })

  test('arrastar o Cliente para o início não o move nem escreve nada', async ({ page }) => {
    const painel = await abrirPainel(page)
    const passos = painel.locator(PASSO)
    const antes = await ordemNoEcra(passos)
    const iCliente = antes.indexOf('Cliente')
    expect(iCliente).toBeGreaterThanOrEqual(0)

    const origem = passos.nth(iCliente)
    const destino = passos.nth(0)
    await origem.hover()
    await page.waitForTimeout(300)
    const a = await origem.boundingBox()
    const z = await destino.boundingBox()
    if (!a || !z) throw new Error('sem coordenadas')

    const sx = a.x + a.width / 2
    const sy = a.y + a.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.waitForTimeout(300)
    for (let k = 1; k <= 18; k++) {
      await page.mouse.move(sx + ((z.x - a.x) * k) / 18, sy + ((z.y - a.y) * k) / 18)
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    await page.waitForTimeout(2500)

    const depois = await ordemNoEcra(passos)
    expect(depois).toEqual(antes)

    // Nenhuma confirmação: um gesto ilegal não chega a propor escrita nenhuma.
    // `reorderPipelineModules` devolve o mesmo array, e o chamador compara por
    // identidade antes de derivar as regras.
    const dialogos = await page.locator('[role="dialog"]').count()
    expect(dialogos, 'não devia ter aberto confirmação nenhuma').toBe(1)
  })
})
