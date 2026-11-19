const { test, expect } = require('@playwright/test');

const key = 'drawer-lumber-planner-v1';
const sampleProject = {
  settings: {
    stockWidth: 8, stockThickness: 1, boardLength: 8, kerf: 0.125,
    edgeTrim: 0.5, endExtra: 6, widthExtra: 0.25,
    price: 9, price4: 9, price8: 5, lumberProfile: 'rough8',
    _profilePricesInitialized: true, margin: 0,
  },
  groups: [
    { id: 1, height: 5, items: [
      { id: 2, label: 'Upper-left', qty: 2, width: 18, depth: 20 }
    ] },
  ],
};

test('initial load renders saved drawers and all milling assumptions', async ({ page }) => {
  await page.addInitScript(({ key, project }) => {
    localStorage.setItem(key, JSON.stringify(project));
  }, { key, project: sampleProject });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Drawer Lumber Planner/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lumber & milling assumptions' })).toBeVisible();
  for (const field of [
    'Purchased lumber profile', 'Board width (in)', 'Board length (ft)',
    'Saw kerf (in)', 'Total edge trim (in)', 'Extra length / part (in)',
    'Extra width / strip (in)', '4/4 S2S price ($/BF)',
    '8/4 rough price ($/BF)', 'Safety margin (%)',
  ]) await expect(page.getByLabel(field)).toBeVisible();
  await expect(page.getByLabel('Purchased lumber profile')).toHaveValue('rough8');
  await expect(page.getByLabel('Drawer identifier')).toHaveValue('Upper-left');
  await expect(page.getByLabel('Quantity')).toHaveValue('2');
  await expect(page.locator('#boards')).not.toHaveText('—');
  await expect(page.locator('#cutListBody tr').first()).toBeVisible();
  await expect(page.locator('#previews .preview-card')).toHaveCount(1);
});

test('profile selection, assumptions and drawer edits survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Purchased lumber profile').selectOption('rough8');
  await page.getByLabel('Board width (in)').fill('10');
  await page.getByLabel('8/4 rough price ($/BF)').fill('4.5');
  await page.getByLabel('Drawer identifier').first().fill('Main bank');
  await page.reload();
  await expect(page.getByLabel('Purchased lumber profile')).toHaveValue('rough8');
  await expect(page.getByLabel('Board width (in)')).toHaveValue('10');
  await expect(page.getByLabel('8/4 rough price ($/BF)')).toHaveValue('4.5');
  await expect(page.getByLabel('Drawer identifier').first()).toHaveValue('Main bank');
  await expect(page.getByLabel('Saw kerf (in)')).toBeVisible();
});

test('8/4 profile reduces purchased plank count but uses twice nominal board feet per plank', async ({ page }) => {
  await page.addInitScript(({ key, project }) => {
    localStorage.setItem(key, JSON.stringify(project));
  }, { key, project: { ...sampleProject, settings: { ...sampleProject.settings, lumberProfile: 's2s4' } } });
  await page.goto('/');
  const count4 = Number(await page.locator('#boards').innerText());
  const bf4 = Number(await page.locator('#purchase').innerText());
  const cost4 = Number((await page.locator('#cost').innerText()).replace(/[$,]/g, ''));
  await page.getByLabel('Purchased lumber profile').selectOption('rough8');
  const count8 = Number(await page.locator('#boards').innerText());
  const bf8 = Number(await page.locator('#purchase').innerText());
  const cost8 = Number((await page.locator('#cost').innerText()).replace(/[$,]/g, ''));
  expect(count4).toBeGreaterThan(0);
  expect(count8).toBe(Math.ceil(count4 / 2));
  expect(bf8).toBeCloseTo(bf4, 0);
  expect(cost8).toBeLessThan(cost4);
  await expect(page.getByLabel('4/4 S2S price ($/BF)')).toHaveValue('9');
  await expect(page.getByLabel('8/4 rough price ($/BF)')).toHaveValue('5');
});

test('initial crosscut list accounts for two resawn layers per 8/4 blank', async ({ page }) => {
  await page.addInitScript(({ key, project }) => {
    localStorage.setItem(key, JSON.stringify(project));
  }, { key, project: { ...sampleProject, settings: { ...sampleProject.settings, lumberProfile: 's2s4' } } });
  await page.goto('/');
  const rows4 = await page.locator('#cutListBody tr').allTextContents();
  expect(rows4.join(' ')).toContain('24.000');
  expect(rows4.join(' ')).toContain('26.000');
  const qty4 = Number(await page.locator('#cutListFoot .numeric').innerText());
  await page.getByLabel('Purchased lumber profile').selectOption('rough8');
  const qty8 = Number(await page.locator('#cutListFoot .numeric').innerText());
  expect(qty8).toBe(Math.ceil(qty4 / 2));
});

test('legacy saved project retains its old price and drawer labels', async ({ page }) => {
  const legacy = structuredClone(sampleProject);
  delete legacy.settings.price4;
  delete legacy.settings.price8;
  delete legacy.settings.lumberProfile;
  delete legacy.settings._profilePricesInitialized;
  await page.addInitScript(({ key, project }) => localStorage.setItem(key, JSON.stringify(project)),
    { key, project: legacy });
  await page.goto('/');
  await expect(page.getByLabel('Purchased lumber profile')).toHaveValue('s2s4');
  await expect(page.getByLabel('4/4 S2S price ($/BF)')).toHaveValue('9');
  await expect(page.getByLabel('Drawer identifier')).toHaveValue('Upper-left');
});
