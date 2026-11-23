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

test('initial load renders saved drawers and solver assumptions', async ({ page }) => {
  await page.addInitScript(({ key, project }) => {
    localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project));
  }, { key, project: sampleProject });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Drawer Lumber Planner/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lumber & milling assumptions' })).toBeVisible();
  for (const field of [
    'Saw kerf (in)', 'Total edge trim (in)', 'Extra length / part (in)',
    'Extra panel width (in)', 'Minimum glue-up strip width (in)',
  ]) await expect(page.getByLabel(field)).toBeVisible();
  await expect(page.getByLabel('Purchased lumber profile')).toHaveCount(0);
  await expect(page.getByLabel('Drawer identifier')).toHaveValue('Upper-left');
  await expect(page.getByLabel('Quantity')).toHaveValue('2');
  await expect(page.locator('#boards')).toHaveCount(0);
  await expect(page.locator('#cutListBody')).toHaveCount(0);
  await expect(page.locator('#previews .preview-card')).toHaveCount(1);
});

test('solver assumptions and drawer edits survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Saw kerf (in)').fill('0.1');
  await page.getByLabel('Drawer identifier').first().fill('Main bank');
  await page.reload();
  await expect(page.getByLabel('Purchased lumber profile')).toHaveCount(0);
  await expect(page.getByLabel('Saw kerf (in)')).toHaveValue('0.1');
  await expect(page.getByLabel('Board width (in)')).toHaveCount(0);
  await expect(page.getByLabel('Board length (ft)')).toHaveCount(0);
  await expect(page.getByLabel('4/4 SAB price ($/BF)')).toHaveCount(0);
  await expect(page.getByLabel('Drawer identifier').first()).toHaveValue('Main bank');
  await expect(page.getByLabel('Saw kerf (in)')).toBeVisible();
});




test('vertical drawer uses only upright panels and ignores depth for stock requirements', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.groups[0].height=12;
  project.groups[0].items[0]={id:2,label:'Trash cubby',qty:1,width:24,depth:0,vertical:true};
  project.inventory=[{id:'B1',width:7,length:70},{id:'B2',width:7,length:70}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const card=page.locator('#previews .preview-card');
  await expect(page.getByLabel('Vertical drawer: Trash cubby')).toBeChecked();
  await expect(card).toContainText('24" upright height');
  await expect(card).toContainText('Vertical');
  await expect(card.locator('svg polygon')).toHaveCount(2);
  const before=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(before.parts).toHaveLength(2);
  expect(before.parts.every(p=>['front','back'].includes(p.role))).toBe(true);
  expect(before.parts.every(p=>p.length===30)).toBe(true);
  const firstPanel=await card.locator('svg polygon').first().getAttribute('points');
  await page.getByLabel('Depth').fill('38');
  const after=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(after.parts).toEqual(before.parts);
  expect(await card.locator('svg polygon').first().getAttribute('points')).not.toBe(firstPanel);
  await page.reload();
  await expect(page.getByLabel('Vertical drawer: Trash cubby')).toBeChecked();
});

test('vertical checkbox changes solver demands and persists after reload', async ({ page }) => {
  const project = structuredClone(sampleProject);
  project.groups[0].items[0].qty = 1;
  project.groups[0].items[0].width = 6;
  await page.addInitScript(({ key, project }) => localStorage.getItem(key) || localStorage.setItem(key, JSON.stringify(project)), { key, project });
  await page.goto('/');
  const before=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))).parts.length);
  await page.getByLabel('Vertical drawer: Upper-left').check();
  const after=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))).parts.length);
  expect(before).toBe(4);
  expect(after).toBe(2);
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


test('all main sections collapse independently and reset to expanded after reload', async ({ page }) => {
  await page.goto('/');
  const sections=page.locator('main > details.collapsible');
  await expect(sections).toHaveCount(7);
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


test('unassigned drawer surfaces are red while assigned surfaces stay normal', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.groups[0].items=[{id:2,label:'Partial drawer',qty:1,width:18,depth:20}];
  project.inventory=[{id:'B1',label:'One 6-inch board',width:6,length:26}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(plan.assigned).toBe(1);
  expect(plan.unassigned).toHaveLength(3);
  const faces=page.locator('#previews .preview-card .part-face');
  await expect(faces).toHaveCount(4);
  for(const role of ['front','back','left','right']){
    const assigned=plan.assignments['2:1:'+role];
    const surface=page.locator('#previews .part-face[data-part="'+role+'"]');
    if(assigned)await expect(surface).not.toHaveClass(/is-unassigned/);
    else{
      await expect(surface).toHaveClass(/is-unassigned/);
      await expect(surface).toHaveAttribute('data-unassigned-count','1');
    }
  }
  const cut=page.locator('#boardLayouts .board-cut').first();
  const assignedRole=plan.boards[0].cuts[0].lanes[0].role;
  await cut.hover();
  await expect(page.locator('#previews .part-face[data-part="'+assignedRole+'"]')).toHaveClass(/is-highlighted/);
});

test('unassigned tint clears when enough boards are added', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.groups[0].items=[{id:2,label:'Drawer A',qty:1,width:18,depth:20}];
  project.inventory=[{id:'B1',width:6,length:26}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  await expect(page.locator('#previews .part-face.is-unassigned')).toHaveCount(3);
  await page.getByRole('button',{name:'+ Add board'}).click();
  await page.getByLabel('Board B2 width').fill('12');
  await page.getByLabel('Board B2 length').fill('96');
  await expect(page.locator('#previews .part-face.is-unassigned')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#previews .part-face.is-unassigned')).toHaveCount(0);
});


test('exports measured board inventory as a multipage printable PDF', async ({ page }) => {
  const fs = require('node:fs/promises');
  const project=structuredClone(sampleProject);
  project.inventory=Array.from({length:37},(_,i)=>({
    id:'B'+(i+1),label:i===0?'Wide stock':'B'+(i+1),
    width:i%2?6.125:12.25,length:96+i
  }));
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Export inventory PDF'}).click()
  ]);
  expect(download.suggestedFilename()).toBe('drawer-measured-lumber-inventory.pdf');
  const bytes=await fs.readFile(await download.path());
  const pdf=bytes.toString('latin1');
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf).toContain('%%EOF');
  expect(pdf).toMatch(/\/Count 3(?:\s|>)/);
  expect(pdf.match(/\/Type \/Page \/Parent /g)).toHaveLength(3);
  expect(pdf).toContain('(B1)');
  expect(pdf).toContain('(B37)');
  expect(pdf).toContain('(Wide stock)');
  expect(pdf).toContain('(12-1/4")');
  expect(pdf).not.toContain('(12.25")');
  expect(pdf).toContain('(96")');
  expect(pdf).toContain('(Page 3 / 3)');
  // Each cross-reference entry must locate its corresponding object.
  const xrefAt=Number(pdf.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  expect(pdf.slice(xrefAt,xrefAt+5)).toBe('xref\n');
  for(const match of pdf.matchAll(/^(\d{10}) 00000 n /gm)){
    const offset=Number(match[1]);
    expect(pdf.slice(offset)).toMatch(/^\d+ 0 obj\n/);
  }
});

test('PDF inventory exporter includes only measured boards, independent of assignments', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.inventory=[{id:'B12',label:'My maple board',width:5.875,length:88.5}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  await page.getByLabel('Board B12 width').fill('7.25');
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Export inventory PDF'}).click()
  ]);
  const fs = require('node:fs/promises');
  const pdf=(await fs.readFile(await download.path())).toString('latin1');
  expect(pdf).toContain('(B12)');
  expect(pdf).toContain('(My maple board)');
  expect(pdf).toContain('(7-1/4")');
  expect(pdf).toContain('(88-1/2")');
  expect(pdf).not.toContain('(B1)');
  await expect(page.getByLabel('Board B12 width')).toHaveValue('7.25');
});


test('clicking a crosscut pins the matching drawer face until changed or cleared', async ({ page }) => {
  const project=structuredClone(sampleProject);
  project.groups[0].items=[{id:2,label:'Kitchen drawer',qty:1,width:18,depth:20}];
  project.inventory=[{id:'B1',label:'Long maple board',width:12,length:96}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const cuts=page.locator('#boardLayouts .board-cut');
  await expect(cuts).toHaveCount(4);
  const first=cuts.first();
  const role=await first.getAttribute('aria-label');
  const firstRole=['front','back','left','right'].find(part=>role.includes(part));
  await first.click();
  await page.mouse.move(0,0);
  await expect(page.locator('.part-face.is-highlighted')).toHaveAttribute('data-part',firstRole);
  await expect(first).toHaveClass(/is-selected/);
  await cuts.nth(2).click();
  await page.mouse.move(0,0);
  const newRole=(await cuts.nth(2).getAttribute('aria-label'));
  await expect(page.locator('.part-face.is-highlighted')).toHaveAttribute('data-part',['front','back','left','right'].find(part=>newRole.includes(part)));
  await expect(first).not.toHaveClass(/is-selected/);
  await cuts.nth(2).click();
  await page.mouse.move(0,0);
  await expect(page.locator('.part-face.is-highlighted')).toHaveCount(0);
  await expect(cuts.nth(2)).not.toHaveClass(/is-selected/);
  await first.focus();
  await page.keyboard.press('Enter');
  await page.mouse.move(0,0);
  await expect(first).toHaveClass(/is-selected/);
  await expect(page.locator('.part-face.is-highlighted')).toHaveAttribute('data-part',firstRole);
});

test('clicking full-width crosscut background selects its first part and width label is renamed', async ({page})=>{
  const project=structuredClone(sampleProject);
  project.groups[0].items=[{id:2,label:'Drawers',qty:1,width:18,depth:20}];
  project.inventory=[{id:'B1',width:12,length:96}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  await expect(page.getByLabel('Extra panel width (in)')).toHaveValue('0.25');
  await expect(page.getByLabel('Extra width / strip (in)')).toHaveCount(0);
  const segment=page.locator('#boardLayouts .board-segment').first();
  await segment.click({position:{x:2,y:2}});
  await page.mouse.move(0,0);
  await expect(page.locator('.part-face.is-highlighted')).toHaveCount(1);
  await segment.focus();
  await page.keyboard.press(' ');
  await page.mouse.move(0,0);
  await expect(page.locator('.part-face.is-highlighted')).toHaveCount(0);
  await page.getByLabel('Extra panel width (in)').fill('0.375');
  await page.reload();
  await expect(page.getByLabel('Extra panel width (in)')).toHaveValue('0.375');
});


test('removes all generic estimator UI while keeping measured solver and backups', async ({page})=>{
  const project=structuredClone(sampleProject);
  project.inventory=[{id:'B1',label:'Measured maple',width:12,length:96}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  for(const heading of ['Material estimate','Yield by height','Initial crosscut list'])
    await expect(page.getByRole('heading',{name:heading})).toHaveCount(0);
  for(const field of ['Board width (in)','Board length (ft)','4/4 SAB price ($/BF)','Safety margin (%)'])
    await expect(page.getByLabel(field)).toHaveCount(0);
  await expect(page.getByLabel('Drawer identifier')).toHaveValue('Upper-left');
  await expect(page.getByLabel('Board B1 label')).toHaveValue('Measured maple');
  await expect(page.locator('#solverSummary')).toContainText('Assigned panels');
  await expect(page.locator('#previews .preview-card')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Save project (.json)'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Export drawer CSV'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Export inventory PDF'})).toBeVisible();
});

test('legacy estimator settings are ignored when saved project is imported',async ({page})=>{
  const project=structuredClone(sampleProject);
  project.inventory=[{id:'B3',label:'Maple',width:6,length:80}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save project (.json)'}).click()]);
  const fs=require('node:fs/promises');
  const exportData=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  expect(exportData.project.settings).toEqual({
    kerf:0.125,edgeTrim:0.5,endExtra:6,widthExtra:0.25,minGlueWidth:2
  });
  expect(exportData.project.inventory[0].id).toBe('B3');
  expect(exportData.project.groups[0].items[0].label).toBe('Upper-left');
});


test('mixed-width drawer panels share a full-width crosscut', async ({page})=>{
  const project=structuredClone(sampleProject);
  project.settings.kerf=.125;
  project.groups=[
    {id:1,height:5,items:[{id:2,label:'Five-inch panel',qty:1,width:18,depth:0,vertical:true}]},
    {id:3,height:6,items:[{id:4,label:'Six-inch panel',qty:1,width:18,depth:0,vertical:true}]},
  ];
  project.inventory=[{id:'B1',label:'Wide maple',width:12.25,length:24}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(plan.assigned).toBe(2);
  expect(plan.crosscuts).toBe(1);
  const cut=plan.boards[0].cuts[0];
  expect(cut.lanes).toHaveLength(2);
  expect(cut.lanes.map(l=>l.width).sort((a,b)=>a-b)).toEqual([5.25,6.25]);
  expect(cut.lanes[1].offset).toBeGreaterThan(cut.lanes[0].offset);
  expect(cut.lanes[0].width+cut.lanes[1].width+project.settings.kerf)
    .toBeLessThanOrEqual(plan.boards[0].usableWidth);
  await expect(page.locator('#boardLayouts .board-cut')).toHaveCount(2);
});

test('mixed-length rip lanes retain actual lengths and CSV trim instructions', async ({page})=>{
  const fs=require('node:fs/promises');
  const project=structuredClone(sampleProject);
  project.groups=[
    {id:1,height:5,items:[{id:2,label:'Short',qty:1,width:18,depth:0,vertical:true}]},
    {id:3,height:6,items:[{id:4,label:'Long',qty:1,width:20,depth:0,vertical:true}]},
  ];
  project.inventory=[{id:'B1',width:12.25,length:26}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(plan.assigned).toBe(2);
  expect(plan.crosscuts).toBe(1);
  expect(plan.boards[0].cuts[0].length).toBe(26);
  expect(plan.boards[0].cuts[0].lanes.map(l=>l.length).sort((a,b)=>a-b)).toEqual([24,26]);
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Export assigned cuts CSV'}).click()
  ]);
  const csv=await fs.readFile(await download.path(),'utf8');
  expect(csv).toContain('Rip Length / Trim To (in)');
  expect(csv).toContain(',"24""","5-1/4""",');
  expect(csv).toContain(',"26""","6-1/4""",');
});

test('optimizer is deterministic and never commits overlapping crosscuts or partial panels', async ({page})=>{
  const project=structuredClone(sampleProject);
  project.settings.minGlueWidth=2;
  project.groups[0].height=11;
  project.groups[0].items[0]={id:2,label:'Tall',qty:4,width:18,depth:20};
  project.inventory=[
    {id:'B1',width:12,length:96},
    {id:'B2',width:6,length:96},
    {id:'B3',width:11,length:90},
    {id:'B4',width:7,length:80}
  ];
  await page.goto('/');
  const {a,b}=await page.evaluate(project=>({
    a:window.DrawerSolver.solve(project),
    b:window.DrawerSolver.solve(project)
  }),project);
  expect(a).toEqual(b);
  const assignments=new Map(Object.entries(a.assignments));
  expect(a.assigned+a.unassigned.length).toBe(a.parts.length);
  for(const board of a.boards){
    let pos=0;
    for(const cut of board.cuts){
      expect(cut.start).toBeGreaterThanOrEqual(pos-1e-5);
      expect(cut.length).toBeGreaterThan(0);
      expect(cut.start+cut.length).toBeLessThanOrEqual(board.length+1e-5);
      let width=0;
      for(const lane of cut.lanes){
        expect(lane.length).toBeLessThanOrEqual(cut.length+1e-5);
        expect(lane.width).toBeGreaterThan(0);
        expect(lane.offset).toBeGreaterThanOrEqual(width-1e-5);
        width=lane.offset+lane.width;
        expect(width).toBeLessThanOrEqual(board.usableWidth+1e-5);
      }
      pos=cut.start+cut.length+cut.kerf;
    }
  }
  for(const part of a.parts){
    const strips=assignments.get(part.id);
    if(!strips){
      expect(a.unassigned.some(p=>p.id===part.id)).toBe(true);
      continue;
    }
    expect(strips.reduce((sum,x)=>sum+x.width,0)).toBeCloseTo(part.width,4);
    if(strips.length>1)for(const strip of strips)expect(strip.width).toBeGreaterThanOrEqual(2);
  }
});


test('drawer configuration letters are persistent, non-recycled and included in backups', async ({page})=>{
  const fs=require('node:fs/promises');
  const project=structuredClone(sampleProject);
  project.inventory=[];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  await expect(page.locator('.drawer-code')).toHaveText('A');
  await page.getByRole('button',{name:'+ Drawer'}).first().click();
  await expect(page.locator('.drawer-code')).toHaveText(['A','B']);
  await page.locator('.drawer-row').first().getByRole('button',{name:'×'}).click();
  await page.getByRole('button',{name:'+ Drawer'}).first().click();
  await expect(page.locator('.drawer-code')).toHaveText(['B','C']);
  await page.reload();
  await expect(page.locator('.drawer-code')).toHaveText(['B','C']);
  await expect(page.locator('#previews .preview-card').first()).toContainText('B ·');
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Save project (.json)'}).click()
  ]);
  const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  expect(backup.project.groups[0].items.map(x=>x.code)).toEqual(['B','C']);
  expect(backup.project.nextCodeIndex).toBe(3);
  const [csvDownload]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Export drawer CSV'}).click()
  ]);
  const csv=await fs.readFile(await csvDownload.path(),'utf8');
  expect(csv).toContain('Label,Vertical,Code');
  expect(csv).toMatch(/,B\r?\n/);
  expect(csv).toMatch(/,C\r?\n?/);
});

test('coordinate text appears over every assigned rip lane and matches cut CSV',async ({page})=>{
  const fs=require('node:fs/promises');
  const project=structuredClone(sampleProject);
  project.groups=[
    {id:1,height:5,items:[{id:2,label:'Base drawers',qty:2,width:18,depth:20}]},
    {id:3,height:6,items:[{id:4,label:'Other drawers',qty:1,width:18,depth:20}]}
  ];
  project.inventory=[{id:'B1',width:12.25,length:192},{id:'B2',width:12.25,length:192}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(plan.assigned).toBeGreaterThan(0);
  const expected=plan.boards.flatMap(b=>b.cuts.flatMap(c=>c.lanes.map(l=>l.coordinate)));
  expect(await page.locator('#boardLayouts .board-coordinate').allTextContents()).toEqual(expected);
  expect(await page.locator('#boardLayouts .board-cut').evaluateAll(els=>els.map(el=>el.getAttribute('data-coordinate')))).toEqual(expected);
  expect(expected.some(c=>/^A2-[FBLR]$/.test(c))).toBe(true);
  expect(expected.some(c=>/^B1-[FBLR]$/.test(c))).toBe(true);
  await expect(page.locator('#previews .preview-card').first()).toContainText('A ·');
  await expect(page.locator('#previews .preview-card').nth(1)).toContainText('B ·');
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Export assigned cuts CSV'}).click()
  ]);
  const csv=await fs.readFile(await download.path(),'utf8');
  expect(csv).toContain('Panel Coordinate');
  for(const coordinate of new Set(expected))expect(csv).toContain(','+coordinate+',');
});

test('glued panel strips show suffixes and unassigned coordinates remain visible',async ({page})=>{
  const project=structuredClone(sampleProject);
  project.groups=[{id:1,height:11,items:[{id:2,label:'Tall drawers',qty:1,width:18,depth:0,vertical:true}]}];
  project.inventory=[{id:'B1',width:6.25,length:70},{id:'B2',width:6.25,length:70}];
  await page.addInitScript(({key,project})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
  },{key,project});
  await page.goto('/');
  const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
  expect(plan.assigned).toBe(2);
  expect(plan.glueUps).toBe(2);
  const coordinates=await page.locator('#boardLayouts .board-coordinate').allTextContents();
  expect(coordinates.sort()).toEqual(['A1-B/1','A1-B/2','A1-F/1','A1-F/2']);
  await page.getByLabel('Board B2 length').fill('10');
  await expect(page.locator('#solverUnassigned')).toContainText('A1-B');
  await expect(page.locator('#solverUnassigned')).not.toContainText('A1-F');
  await expect(page.locator('#boardLayouts .board-coordinate')).toHaveText(['A1-F/1','A1-F/2']);
});


test('JSON import retains multi-letter configuration coordinates and future ID counter',async ({page})=>{
  await page.goto('/');
  const project=structuredClone(sampleProject);
  project.groups[0].items[0].code='AA';
  project.nextCodeIndex=28;
  const file={name:'saved-drawers.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({format:'drawer-lumber-planner',project}))};
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#projectFile').setInputFiles(file);
  await expect(page.locator('.drawer-code')).toHaveText('AA');
  await expect(page.locator('#previews .preview-card').first()).toContainText('AA ·');
  await page.getByRole('button',{name:'+ Drawer'}).first().click();
  await expect(page.locator('.drawer-code')).toHaveText(['AA','AC']);
  await page.reload();
  await expect(page.locator('.drawer-code')).toHaveText(['AA','AC']);
});


test('crosscut assignment view shows strip width × length and exports dimensional plan PDF',async({page})=>{
 const fs=require('node:fs/promises');
 const project=structuredClone(sampleProject);
 project.groups=[{id:1,height:5,items:[{id:2,label:'Base box',qty:1,width:18,depth:20}]}];
 project.inventory=[{id:'B1',label:'Maple Twelve',width:12,length:96}];
 await page.addInitScript(({key,project})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
 },{key,project});
 await page.goto('/');
 const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
 await expect(page.getByRole('button',{name:'Export crosscut PDF'})).toBeVisible();
 const dimensionLabels=page.locator('#boardLayouts .board-width-label');
 const formatInches=value=>{
  const units=Math.round(Math.abs(value)*16),whole=Math.floor(units/16),remainder=units%16;
  if(!remainder)return (value<0?'-':'')+whole+'"';
  const gcd=(a,b)=>b?gcd(b,a%b):a,divisor=gcd(remainder,16);
  return (value<0?'-':'')+(whole?whole+'-':'')+(remainder/divisor)+'/'+(16/divisor)+'"';
 };
 const expectedDimensions=plan.boards.flatMap(board=>board.cuts.flatMap(cut=>cut.lanes.map(lane=>
  formatInches(lane.width)+' × '+formatInches(lane.length))));
 await expect(dimensionLabels).toHaveCount(expectedDimensions.length);
 expect(await dimensionLabels.allTextContents()).toEqual(expectedDimensions);
 const [download]=await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button',{name:'Export crosscut PDF'}).click()
 ]);
 expect(download.suggestedFilename()).toBe('drawer-crosscut-assignment.pdf');
 const bytes=await fs.readFile(await download.path());
 const pdf=bytes.toString('latin1');
 expect(pdf.startsWith('%PDF-1.4')).toBe(true);
 expect(pdf).toContain('%%EOF');
 expect(pdf).toContain('(CROSSCUT ASSIGNMENT PLAN)');
 expect(pdf).toContain('(STRIP WIDTH)');
 expect(pdf).toContain('(CROSSCUT LENGTH)');
 expect(pdf).toContain('(TRIM-TO LENGTH)');
 expect(pdf).toContain('(B1  Maple Twelve  12" W x 96" L)');
 expect(pdf).toContain('(5-1/4")');
 expect(pdf).not.toContain('(5.25")');
 for(const lane of plan.boards[0].cuts.flatMap(c=>c.lanes)){
  expect(pdf).toContain('('+lane.coordinate+')');
  expect(pdf).toContain('('+formatInches(lane.width)+')');
  expect(pdf).toContain('('+formatInches(lane.length)+')');
 }
 const xref=Number(pdf.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
 expect(pdf.slice(xref,xref+5)).toBe('xref\n');
});

test('crosscut PDF paginates many boards and reports unassigned panel coordinates',async({page})=>{
 const fs=require('node:fs/promises');
 const project=structuredClone(sampleProject);
 project.groups=[{id:1,height:11,items:[{id:2,label:'Tall boxes',qty:2,width:18,depth:20}]}];
 project.inventory=Array.from({length:18},(_,i)=>({id:'B'+(i+1),label:'Maple '+(i+1),width:6,length:38}));
 await page.addInitScript(({key,project})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
 },{key,project});
 await page.goto('/');
 const plan=await page.evaluate(()=>window.DrawerSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
 const [download]=await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button',{name:'Export crosscut PDF'}).click()
 ]);
 const pdf=(await fs.readFile(await download.path())).toString('latin1');
 const pages=Number(pdf.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/)?.[1]);
 expect(pages).toBeGreaterThan(1);
 expect((pdf.match(/\/Type \/Page \/Parent /g)||[]).length).toBe(pages);
 expect(pdf).toContain('(B18  Maple 18  6" W x 38" L)');
 if(plan.unassigned.length){
  expect(pdf).toContain('UNASSIGNED PANELS');
  for(const part of plan.unassigned)expect(pdf).toContain(part.coordinate);
 }
});

test('fraction formatter rounds to sixteenths and exporter scripts are versioned',async({page})=>{
 await page.goto('/');
 const formats=await page.evaluate(()=>[12.5,5.25,6.125,12,5.3125,7.03,0.03].map(window.InchMeasurements.format));
 expect(formats).toEqual(['12-1/2"','5-1/4"','6-1/8"','12"','5-5/16"','7"','0"']);
 for(const asset of ['measurements.js','inventory-pdf.js','crosscut-pdf.js']){
  await expect(page.locator('script[src^="'+asset+'?"]')).toHaveCount(1);
 }
});

test('bottom solver derives conventional drawer sizes and matches sheet thickness',async({page})=>{
 const project=structuredClone(sampleProject);
 project.groups=[
  {id:1,height:5,items:[{id:2,code:'A',label:'Shallow',qty:2,width:20,depth:30}]},
  {id:3,height:7,items:[{id:4,code:'B',label:'Deep',qty:1,width:20,depth:30}]},
  {id:5,height:11,items:[{id:6,code:'C',label:'Upright',qty:1,width:20,depth:10,vertical:true}]}
 ];
 project.bottomSettings={wallThickness:.5,grooveDepth:.25,kerf:.125,allowRotation:false};
 project.sheets=[{id:'S1',label:'Quarter',width:48,length:96,thickness:.25,qty:1}];
 await page.addInitScript(({key,project})=>localStorage.setItem(key,JSON.stringify(project)),{key,project});
 await page.goto('/');
 const plan=await page.evaluate(()=>window.BottomSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
 expect(plan.parts.map(p=>[p.coordinate,p.width,p.length,p.thickness])).toEqual([
  ['A1-BT',19.5,29.75,.25],['A2-BT',19.5,29.75,.25],['B1-BT',19.5,29.75,.5],['C1-BT',10.5,9.5,.5]
 ]);
 expect(plan.placed).toBe(2);
 expect(plan.unassigned.map(p=>p.coordinate)).toEqual(['B1-BT','C1-BT']);
 expect(plan.skippedVertical).toBe(0);
 await expect(page.getByRole('heading',{name:'Drawer bottom sheet cutting solver'})).toBeVisible();
 await expect(page.locator('#bottomSummary')).toContainText('2 / 4');
 await expect(page.locator('#bottomLayouts svg')).toHaveCount(1);
 await expect(page.locator('#bottomCutList')).toContainText('19-1/2" × 29-3/4"');
});

test('bottom nesting respects kerf and keeps placed rectangles disjoint',async({page})=>{
 await page.goto('/');
 const outcome=await page.evaluate(()=>{
  const project={
   groups:[{id:1,height:5,items:[{id:2,code:'A',label:'Bottoms',qty:4,width:20.5,depth:20.5}]}],
   bottomSettings:{wallThickness:.5,grooveDepth:.25,kerf:.25,allowRotation:false},
   sheets:[{id:'S1',width:41,length:41,thickness:.25,qty:1}]
  };
  return window.BottomSolver.solve(project);
 });
 expect(outcome.placed).toBe(4);
 const placements=outcome.sheets[0].placements;
 for(let i=0;i<placements.length;i++)for(let j=i+1;j<placements.length;j++){
  const a=placements[i],b=placements[j];
  expect(a.x+a.cutWidth+.25<=b.x+1e-6||b.x+b.cutWidth+.25<=a.x+1e-6||
   a.y+a.cutLength+.25<=b.y+1e-6||b.y+b.cutLength+.25<=a.y+1e-6).toBe(true);
 }
});

test('sheet inventory, settings, and PDF bottom cutting list persist',async({page})=>{
 const fs=require('node:fs/promises');
 const project=structuredClone(sampleProject);
 project.groups=[{id:1,height:5,items:[{id:2,code:'A',qty:1,width:20,depth:30,label:'Utensils'}]}];
 await page.addInitScript(({key,project})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project))},{key,project});
 await page.goto('/');
 await page.getByRole('button',{name:'+ Add sheet'}).click();
 await page.getByLabel('Sheet S1 width').fill('48');
 await page.getByLabel('Sheet S1 width').press('Tab');
 await page.getByLabel('Drawer wall thickness (in)').fill('0.625');
 await page.getByLabel('Drawer wall thickness (in)').press('Tab');
 await page.reload();
 await expect(page.getByLabel('Sheet S1 width')).toHaveValue('48');
 await expect(page.getByLabel('Drawer wall thickness (in)')).toHaveValue('0.625');
 await expect(page.locator('#bottomCutList')).toContainText('19-1/4" × 29-5/8"');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export bottom PDF'}).click()]);
 expect(download.suggestedFilename()).toBe('drawer-bottom-cutting-plan.pdf');
 const pdf=(await fs.readFile(await download.path())).toString('latin1');
 expect(pdf).toContain('(19-1/4" x 29-5/8")');
 expect(pdf).toContain('(A1-BT)');
 expect(pdf).not.toContain('(19.25 x 29.50)');
});


test('bottom solver prioritizes full-length grain-parallel rips, then crosscuts within strips',async({page})=>{
 const project=structuredClone(sampleProject);
 project.groups=[
  {id:1,height:5,items:[{id:2,code:'A',label:'Short',qty:2,width:20,depth:30}]},
  {id:3,height:5,items:[{id:4,code:'B',label:'Narrow',qty:2,width:11,depth:30}]}
 ];
 // Sheet dimensions are intentionally reversed: grain follows the longer edge.
 project.sheets=[{id:'S1',label:'Maple quarter',width:96,length:48,thickness:.25,qty:1}];
 project.bottomSettings={wallThickness:.5,grooveDepth:.25,kerf:.125,allowRotation:false};
 await page.addInitScript(({key,project})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
 },{key,project});
 await page.goto('/');
 const plan=await page.evaluate(()=>window.BottomSolver.solve(JSON.parse(localStorage.getItem('drawer-lumber-planner-v1'))));
 expect(plan.cutOrder).toBe('rip-first');
 expect(plan.placed).toBe(4);
 expect(plan.usedSheets).toBe(1);
 const sheet=plan.sheets[0];
 expect([sheet.width,sheet.length]).toEqual([48,96]);
 expect(sheet.strips).toHaveLength(2);
 expect(sheet.strips.map(s=>s.width).sort((a,b)=>a-b)).toEqual([10.5,19.5]);
 for(const strip of sheet.strips){
  expect(strip.length).toBe(96);
  expect(strip.placements).toHaveLength(2);
  expect(strip.placements[0].x).toBe(strip.placements[1].x);
  expect(strip.placements[0].y).toBe(0);
  expect(strip.placements[1].y).toBe(29.875);
 }
 await expect(page.locator('#bottomLayouts')).toContainText('RIP FIRST');
 await expect(page.locator('#bottomLayouts')).toContainText('full-length strips');
 const fs=require('node:fs/promises');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export bottom PDF'}).click()]);
 const pdf=(await fs.readFile(await download.path())).toString('latin1');
 expect(pdf).toContain('(RIP FIRST: full-length strips parallel to grain, then crosscut within each strip.)');
 expect(pdf).toContain('full length');
});

test('bottom joinery uses side/front grooves with rear overlap, and four grooves for verticals',async({page})=>{
 await page.goto('/');
 const project={
  groups:[
   {id:1,height:5,items:[{id:2,code:'A',qty:1,width:20,depth:24}]},
   {id:3,height:12,items:[{id:4,code:'B',qty:1,width:28,depth:22,vertical:true}]}
  ],
  bottomSettings:{wallThickness:.625,grooveDepth:.25},
  sheets:[]
 };
 const parts=await page.evaluate(p=>window.BottomSolver.demands(p),project);
 expect(parts.map(({coordinate,width,length,thickness,construction,vertical})=>
  ({coordinate,width,length,thickness,construction,vertical}))).toEqual([
  {coordinate:'A1-BT',width:19.25,length:23.625,thickness:.25,construction:'three-groove-back-overlap',vertical:false},
  {coordinate:'B1-BT',width:11.25,length:21.25,thickness:.5,construction:'four-groove',vertical:true}
 ]);
});

test('sheet layout projects horizontal and vertical cut guides across entire sheet',async({page})=>{
 const project=structuredClone(sampleProject);
 project.groups=[{id:1,height:5,items:[{id:2,code:'A',qty:4,width:20.5,depth:20.5}]}];
 project.bottomSettings={wallThickness:.5,grooveDepth:.25,kerf:.125,allowRotation:false};
 project.sheets=[{id:'S1',width:48,length:96,thickness:.25,qty:1}];
 await page.addInitScript(({key,project})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(project));
 },{key,project});
 await page.goto('/');
 const guides=page.locator('#bottomLayouts .sheet-cut-guides line');
 expect(await guides.count()).toBeGreaterThan(0);
 const lines=await guides.evaluateAll(nodes=>nodes.map(n=>({
  x1:+n.getAttribute('x1'),x2:+n.getAttribute('x2'),
  y1:+n.getAttribute('y1'),y2:+n.getAttribute('y2'),
  opacity:n.parentNode.getAttribute('opacity')
 })));
 expect(lines.some(l=>l.y1===2&&l.y2===98)).toBe(true);
 expect(lines.some(l=>l.x1===2&&l.x2===50)).toBe(true);
 expect(lines.every(l=>l.opacity==='.42')).toBe(true);
});
