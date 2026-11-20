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
    localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project));
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
    localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project));
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
  expect(bf8).toBeGreaterThanOrEqual(bf4 - 0.2);
  expect(bf8).toBeLessThanOrEqual(bf4 + 2 * 8 * 8 / 12 + 0.2);
  expect(cost8).toBeLessThan(cost4);
  await expect(page.getByLabel('4/4 S2S price ($/BF)')).toHaveValue('9');
  await expect(page.getByLabel('8/4 rough price ($/BF)')).toHaveValue('5');
});

test('initial crosscut list accounts for two resawn layers per 8/4 blank', async ({ page }) => {
  await page.addInitScript(({ key, project }) => {
    localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project));
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
  await page.addInitScript(({ key, project }) => localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project)),
    { key, project: legacy });
  await page.goto('/');
  await expect(page.getByLabel('Purchased lumber profile')).toHaveValue('s2s4');
  await expect(page.getByLabel('4/4 S2S price ($/BF)')).toHaveValue('9');
  await expect(page.getByLabel('Drawer identifier')).toHaveValue('Upper-left');
});

test('vertical drawer shows two upright panels, vertical seams, and no side crosscuts', async ({ page }) => {
  const project = structuredClone(sampleProject);
  project.settings.lumberProfile = 's2s4';
  project.groups[0].height = 12;
  project.groups[0].items[0] = { id: 2, label: 'Trash cubby', qty: 1, width: 24, depth: 0, vertical: true };
  await page.addInitScript(({ key, project }) => localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project)), { key, project });
  await page.goto('/');
  const card = page.locator('#previews .preview-card');
  await expect(page.getByLabel('Vertical drawer: Trash cubby')).toBeChecked();
  await expect(card).toContainText('24\" upright height');
  await expect(card).toContainText('Vertical');
  await expect(card.locator('svg polygon')).toHaveCount(2);
  const seams = await card.locator('svg line').evaluateAll(els =>
    els.filter(el => el.hasAttribute('stroke-opacity')).map(el => ({
      x1: +el.getAttribute('x1'), x2: +el.getAttribute('x2'),
      y1: +el.getAttribute('y1'), y2: +el.getAttribute('y2')
    }))
  );
  expect(seams.length).toBe(2);
  for (const seam of seams) {
    expect(seam.x1).toBeCloseTo(seam.x2);
    expect(seam.y2).toBeGreaterThan(seam.y1);
  }
  await expect(page.locator('#cutListBody')).toContainText('30.000');
  await expect(page.locator('#cutListBody')).not.toContainText('sides');
  const qty = Number(await page.locator('#cutListFoot .numeric').innerText());
  expect(qty).toBe(4);
  await expect(page.locator('[data-itemid="2"]')).toHaveText('4.0');
  const costBefore = await page.locator('#cost').innerText();
  const countBefore = await page.locator('#cutListFoot .numeric').innerText();
  const rearBefore = await card.locator('svg polygon').first().getAttribute('points');
  await page.getByLabel('Depth').fill('38');
  const rearAfter = await card.locator('svg polygon').first().getAttribute('points');
  expect(rearAfter).not.toBe(rearBefore);
  await expect(page.locator('#cost')).toHaveText(costBefore);
  await expect(page.locator('#cutListFoot .numeric')).toHaveText(countBefore);
  await expect(card).toContainText('24\" upright height');
  await page.reload();
  await expect(page.getByLabel('Vertical drawer: Trash cubby')).toBeChecked();
});

test('vertical checkbox updates cut counts and remains checked after JSON round trip via local storage', async ({ page }) => {
  const project = structuredClone(sampleProject);
  project.groups[0].items[0].qty = 1;
  project.groups[0].items[0].width = 6;
  await page.addInitScript(({ key, project }) => localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project)), { key, project });
  await page.goto('/');
  const before = Number(await page.locator('#cutListFoot .numeric').innerText());
  await page.getByLabel('Vertical drawer: Upper-left').check();
  const after = Number(await page.locator('#cutListFoot .numeric').innerText());
  expect(after).toBeLessThan(before);
  await page.reload();
  await expect(page.getByLabel('Vertical drawer: Upper-left')).toBeChecked();
});

test('6/4 SAB profile uses nominal 1.5-inch purchase thickness, one layer and its own price', async ({ page }) => {
  const project = structuredClone(sampleProject);
  project.settings.lumberProfile = 's2s4';
  project.settings.price6 = 4.25;
  await page.addInitScript(({ key, project }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(project));
  }, {key, project});
  await page.goto('/');
  const boards4 = Number(await page.locator('#boards').innerText());
  const bf4 = Number(await page.locator('#purchase').innerText());
  const cuts4 = await page.locator('#cutListFoot .numeric').innerText();
  await page.getByLabel('Purchased lumber profile').selectOption('sab6');
  await expect(page.getByLabel('6/4 SAB price ($/BF)')).toHaveValue('4.25');
  expect(Number(await page.locator('#boards').innerText())).toBe(boards4);
  expect(Number(await page.locator('#purchase').innerText())).toBeCloseTo(bf4*1.5, 0);
  await expect(page.locator('#cutListFoot .numeric')).toHaveText(cuts4);
  await page.reload();
  await expect(page.getByLabel('Purchased lumber profile')).toHaveValue('sab6');
  await expect(page.getByLabel('6/4 SAB price ($/BF)')).toHaveValue('4.25');
});


test('measured wide board packs paired panels into two full-width crosscuts', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.settings.lumberProfile='s2s4';
  project.groups[0].items[0]={id:2,label:'Cabinet A',qty:1,width:18,depth:20};
  project.inventory=[{id:'B1',label:'Maple 12',width:12,length:96}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const result=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(result.assigned).toBe(4);
  expect(result.unassigned).toHaveLength(0);
  expect(result.crosscuts).toBe(2);
  expect(result.glueUps).toBe(0);
  expect(result.boards[0].cuts.map(x=>x.lanes.length)).toEqual([2,2]);
  await expect(page.locator('#boardLayouts svg')).toHaveCount(1);
  await expect(page.locator('#solverSummary')).toContainText('4 / 4');
  const region=page.locator('#boardLayouts .board-cut').first();
  const role=await region.getAttribute('aria-label');
  const expected=role.includes('front')?'front':role.includes('back')?'back':role.includes('left')?'left':'right';
  await region.hover();
  await expect(page.locator('.part-face.is-highlighted')).toHaveAttribute('data-part',expected);
  await page.mouse.move(0,0);
  await expect(page.locator('.part-face.is-highlighted')).toHaveCount(0);
});

test('measured inventory persists and unassigned panels are reported', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'+ Add board'}).click();
  await page.getByLabel('Board B1 label').fill('Maple 6 inch');
  await page.getByLabel('Board B1 width').fill('6');
  await page.getByLabel('Board B1 length').fill('40');
  await page.reload();
  await expect(page.getByLabel('Board B1 label')).toHaveValue('Maple 6 inch');
  await expect(page.getByLabel('Board B1 length')).toHaveValue('40');
  await expect(page.locator('#solverSummary')).toContainText('Unassigned panels');
  await expect(page.locator('#solverUnassigned')).toContainText('panels still need stock');
});

test('missing stock does not commit incomplete multi-strip glue-ups', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.settings.lumberProfile='s2s4';
  project.groups[0].height=11;
  project.groups[0].items[0]={id:2,label:'Tall box',qty:1,width:18,depth:20};
  project.inventory=[{id:'B1',width:6,length:32}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const result=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(result.assigned).toBe(0);
  expect(result.unassigned).toHaveLength(4);
  expect(result.crosscuts).toBe(0);
});

test('vertical stock solver ignores depth while using width for crosscut lengths', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.settings.lumberProfile='s2s4';
  project.groups[0].height=6;
  project.groups[0].items[0]={id:2,label:'Spice',qty:1,width:24,depth:10,vertical:true};
  project.inventory=[{id:'B1',width:14,length:66}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const first=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(first.parts).toHaveLength(2);
  expect(first.crosscuts).toBe(1);
  expect(first.boards[0].cuts[0].length).toBe(30);
  await page.getByLabel('Depth').fill('50');
  const second=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(second.crosscuts).toBe(first.crosscuts);
  expect(second.parts).toEqual(first.parts);
});


test('actual board assignments suppress legacy assumed glue seams', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.groups[0].height=11;
  project.groups[0].items[0]={id:2,label:'Tall drawer',qty:1,width:18,depth:20};
  project.inventory=[{id:'B1',width:12,length:96},{id:'B2',width:12,length:96}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const result=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(result.assigned).toBe(4);
  expect(result.glueUps).toBe(0);
  await expect(page.locator('#previews .preview-card svg line[stroke-opacity="0.42"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Export assigned cuts CSV'})).toBeVisible();
});
