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
    'Board width (in)', 'Board length (ft)',
    'Saw kerf (in)', 'Total edge trim (in)', 'Extra length / part (in)',
    'Extra width / strip (in)', '4/4 SAB price ($/BF)', 'Safety margin (%)',
  ]) await expect(page.getByLabel(field)).toBeVisible();
  await expect(page.getByLabel('Purchased lumber profile')).toHaveCount(0);
  await expect(page.getByLabel('Drawer identifier')).toHaveValue('Upper-left');
  await expect(page.getByLabel('Quantity')).toHaveValue('2');
  await expect(page.locator('#boards')).not.toHaveText('—');
  await expect(page.locator('#cutListBody tr').first()).toBeVisible();
  await expect(page.locator('#previews .preview-card')).toHaveCount(1);
});

test('4/4 SAB price, assumptions and drawer edits survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Board width (in)').fill('10');
  await page.getByLabel('4/4 SAB price ($/BF)').fill('7.85');
  await page.getByLabel('Drawer identifier').first().fill('Main bank');
  await page.reload();
  await expect(page.getByLabel('Purchased lumber profile')).toHaveCount(0);
  await expect(page.getByLabel('Board width (in)')).toHaveValue('10');
  await expect(page.getByLabel('4/4 SAB price ($/BF)')).toHaveValue('7.85');
  await expect(page.getByLabel('Drawer identifier').first()).toHaveValue('Main bank');
  await expect(page.getByLabel('Saw kerf (in)')).toBeVisible();
});


test('initial crosscut list uses one blank per 4/4 SAB cut', async ({ page }) => {
  await page.addInitScript(({ key, project }) => {
    localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project));
  }, { key, project: { ...sampleProject, settings: { ...sampleProject.settings, lumberProfile: 's2s4' } } });
  await page.goto('/');
  const rows4 = await page.locator('#cutListBody tr').allTextContents();
  expect(rows4.join(' ')).toContain('24.000');
  expect(rows4.join(' ')).toContain('26.000');
  const qty4 = Number(await page.locator('#cutListFoot .numeric').innerText());
  expect(qty4).toBe(8);
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
  await expect(page.getByLabel('Purchased lumber profile')).toHaveCount(0);
  await expect(page.getByLabel('4/4 SAB price ($/BF)')).toHaveValue('9');
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

test('obsolete 8/4 setting migrates to 4/4 SAB while preserving drawers and inventory', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.inventory=[{id:'B1',label:'SAB maple',width:12,length:96}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  await expect(page.getByLabel('Purchased lumber profile')).toHaveCount(0);
  await expect(page.getByLabel('4/4 SAB price ($/BF)')).toHaveValue('9');
  await expect(page.getByLabel('Board B1 label')).toHaveValue('SAB maple');
  await expect(page.getByLabel('Drawer identifier')).toHaveValue('Upper-left');
  const boards=Number(await page.locator('#boards').innerText());
  const purchase=Number(await page.locator('#purchase').innerText());
  expect(purchase).toBeCloseTo(boards*8*8/12,1);
});


test('all main sections collapse independently and reset to expanded after reload', async ({ page }) => {
  await page.goto('/');
  const sections=page.locator('main > details.collapsible');
  await expect(sections).toHaveCount(9);
  for(const section of await sections.all())await expect(section).toHaveAttribute('open','');
  const inventory=page.locator('main > details.collapsible').filter({has:page.getByRole('heading',{name:'Measured lumber inventory'})});
  await inventory.locator('summary').click();
  await expect(inventory).not.toHaveAttribute('open','');
  await expect(page.getByRole('button',{name:'+ Add board'})).not.toBeVisible();
  const groupSection=page.locator('main > details.collapsible').filter({has:page.getByRole('heading',{name:'Drawer height groups'})});
  await expect(groupSection).toHaveAttribute('open','');
  await groupSection.locator('summary').click();
  await expect(groupSection).not.toHaveAttribute('open','');
  await expect(page.getByRole('button',{name:'+ Add height group'})).not.toBeVisible();
  await page.reload();
  await expect(inventory).toHaveAttribute('open','');
  await expect(groupSection).toHaveAttribute('open','');
  await expect(page.getByRole('button',{name:'+ Add board'})).toBeVisible();
  await expect(page.getByRole('button',{name:'+ Add height group'})).toBeVisible();
  expect(await page.evaluate(()=>{const saved=localStorage.getItem('drawer-lumber-planner-v1');return saved!==null&&Object.keys(JSON.parse(saved)).includes('collapsedSections')})).toBe(false);
});


test('glue-up strips respect editable 2-inch minimum and the setting survives reload', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.settings.minGlueWidth=2;
  project.groups[0].height=11;
  project.groups[0].items=[{id:2,label:'Vertical cabinet',qty:1,width:24,depth:0,vertical:true}];
  project.inventory=[
    {id:'B1',width:11,length:70},
    {id:'B2',width:6,length:70},
  ];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  await expect(page.getByLabel('Minimum glue-up strip width (in)')).toHaveValue('2');
  const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(plan.assigned).toBe(2);
  expect(plan.glueUps).toBe(2);
  for(const cut of plan.boards.flatMap(board=>board.cuts)){
    for(const lane of cut.lanes)expect(lane.width).toBeGreaterThanOrEqual(2-0.000001);
  }
  await page.getByLabel('Minimum glue-up strip width (in)').fill('6');
  const restricted=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(restricted.assigned).toBe(0);
  expect(restricted.unassigned).toHaveLength(2);
  expect(restricted.crosscuts).toBe(0);
  await page.reload();
  await expect(page.getByLabel('Minimum glue-up strip width (in)')).toHaveValue('6');
});

test('older saved projects default minimum glue-up strip to 2 inches', async ({ page }) => {
  const project=structuredClone(sampleProject);
  delete project.settings.minGlueWidth;
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  await expect(page.getByLabel('Minimum glue-up strip width (in)')).toHaveValue('2');
  await page.getByLabel('Minimum glue-up strip width (in)').fill('2.5');
  await page.reload();
  await expect(page.getByLabel('Minimum glue-up strip width (in)')).toHaveValue('2.5');
});
