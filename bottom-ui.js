/* Sheet inventory UI and cutting diagram, independent of hardwood inventory. */
(function(root){
'use strict';
const $=id=>document.getElementById(id),fmt=n=>root.InchMeasurements.format(n),ns='http://www.w3.org/2000/svg';
const node=(tag,attrs={},value)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(value!==undefined)e.textContent=String(value);return e};
const svg=(tag,attrs={},value)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(value!==undefined)e.textContent=String(value);return e};
const csv=x=>{const v=String(x??'');return /[,"\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const download=(name,blob)=>{
 const url=URL.createObjectURL(blob),a=node('a',{href:url,download:name});document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
};
function inchInput(value,label,onChange){
 const input=node('input',{type:'text','aria-label':label});
 input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;
 input.title='Inches: 5 1/2", 5/16", or 5.5. Rounded to the nearest 1/32".';
 input.value=root.InchMeasurements.formatInput(value);
 let committed=Number(value);
 const commit=()=>{
  const parsed=root.InchMeasurements.parse(input.value);
  if(parsed===null)return false;
  if(parsed!==committed){committed=parsed;onChange(parsed)}
  return true;
 };
 // A sheet edit updates the entire drawing and input set, so don't rerender
 // on every keystroke. Commit on change/blur, preserving partial fractions.
 input.onchange=()=>{
  if(!commit())input.value=root.InchMeasurements.formatInput(committed);
  else input.value=root.InchMeasurements.formatInput(committed);
 };
 input.onblur=()=>{
  if(!commit())input.value=root.InchMeasurements.formatInput(committed);
  else input.value=root.InchMeasurements.formatInput(committed);
 };
 input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();input.blur()}};
 return input;
}
function render(state,save){
 if(!Array.isArray(state.sheets))state.sheets=[];
 state.bottomSettings={wallThickness:.5,grooveDepth:.25,kerf:.125,factoryEdgeTrim:0,allowRotation:false,...state.bottomSettings};
 const commit=()=>{save();render(state,save)};
 const settings=$('bottomSettings'),inventory=$('bottomSheets'),summary=$('bottomSummary'),
  drawings=$('bottomLayouts'),list=$('bottomCutList');
 if(!settings)return;
 for(const el of [settings,inventory,summary,drawings,list])el.replaceChildren();
 for(const [key,label,step] of [
  ['wallThickness','Drawer wall thickness (in)',.0625],
  ['grooveDepth','Bottom groove penetration (in)',.0625],
  ['kerf','Panel cutting kerf (in)',.001],
  ['factoryEdgeTrim','Factory edge trim (in, per edge)',.03125]
 ]){
  const field=node('label',{class:'field'},label);
  const input=inchInput(state.bottomSettings[key],label,value=>{
   state.bottomSettings[key]=value;commit()
  });
  field.append(input);settings.append(field);
 }
 const rotation=node('label',{class:'field'},'Allow 90° rotation (changes grain direction)');
 const check=node('input',{type:'checkbox','aria-label':'Allow bottom rotation'});
 check.style.width='20px';check.checked=state.bottomSettings.allowRotation===true;
 check.onchange=()=>{state.bottomSettings.allowRotation=check.checked;commit()};
 rotation.prepend(check);settings.append(rotation);
 const nextID=()=>1+Math.max(0,...state.sheets.map(s=>Number(String(s.id).match(/^S(\d+)$/)?.[1])||0));
 $('addSheet').onclick=()=>{
  const id='S'+nextID();
  state.sheets.push({id,label:id,thickness:.25,qty:1,width:48,length:96});
  commit();
 };
 $('exportBottomPdf').onclick=()=>download('drawer-bottom-cutting-plan.pdf',root.BottomPdf.makePdf(root.BottomSolver.solve(state)));
 $('exportBottomCsv').onclick=()=>{
  const plan=root.BottomSolver.solve(state);
  const lines=['Sheet,Panel,Drawer,Thickness (in),Width (in),Depth (in),X (in),Y (in),Rotated'];
  for(const sheet of plan.sheets)for(const p of sheet.placements)
   lines.push([csv(sheet.label),p.coordinate,csv(p.label),...([p.thickness,p.width,p.length,p.x,p.y].map(n=>csv(fmt(n)))),p.rotated?'yes':'no'].join(','));
  lines.push('','Unassigned Bottoms','Panel,Drawer,Thickness (in),Width (in),Depth (in)');
  for(const p of plan.unassigned)lines.push([p.coordinate,csv(p.label),...([p.thickness,p.width,p.length].map(n=>csv(fmt(n))))].join(','));
  download('drawer-bottom-cut-list.csv',new Blob([lines.join('\r\n')],{type:'text/csv'}));
 };
 const header=node('div',{class:'bottom-sheet-row bottom-sheet-head'});
 for(const text of ['Sheet label','Thickness','Qty','Width (in)','Length (in)',''])header.append(node('span',{},text));
 inventory.append(header);
 for(const sheet of state.sheets){
  const row=node('div',{class:'bottom-sheet-row'});
  const label=node('input',{type:'text',value:sheet.label||sheet.id,'aria-label':'Sheet '+sheet.id+' label'});
  label.onchange=()=>{sheet.label=label.value;commit()};row.append(label);
  const selector=node('select',{'aria-label':'Sheet '+sheet.id+' thickness'});
  for(const value of [.25,.5])selector.append(node('option',{value},fmt(value)));
  selector.value=String(sheet.thickness);
  selector.onchange=()=>{sheet.thickness=Number(selector.value);commit()};
  row.append(selector);
  for(const [key,name,step] of [['qty','quantity',1],['width','width',.125],['length','length',.125]]){
   const label='Sheet '+sheet.id+' '+name;
   if(key==='qty'){
    const input=node('input',{type:'number',min:0,step:1,value:sheet[key],'aria-label':label});
    input.onchange=()=>{sheet[key]=Math.max(0,Math.floor(Number(input.value)||0));commit()};
    row.append(input);
   }else{
    row.append(inchInput(sheet[key],label,value=>{sheet[key]=value;commit()}));
   }
  }
  const remove=node('button',{'aria-label':'Remove sheet '+sheet.id},'×');
  remove.onclick=()=>{state.sheets=state.sheets.filter(s=>s!==sheet);commit()};row.append(remove);
  inventory.append(row);
 }
 if(!state.sheets.length)inventory.append(node('p',{class:'note'},'Add your measured sheet goods to assign the bottoms.'));
 const plan=root.BottomSolver.solve(state);
 for(const [name,value] of [
  ['Bottoms assigned',plan.placed+' / '+plan.parts.length],
  ['Sheets used',plan.usedSheets],
  ['Unassigned',plan.unassigned.length]
 ]){
  const span=node('span');span.append(node('strong',{},value),document.createTextNode(' '+name));summary.append(span);
 }
 for(const sheet of plan.sheets){
  if(!sheet.placements.length)continue;
  const card=node('div',{class:'bottom-sheet-card'});
  card.append(node('strong',{},sheet.label+' — '+fmt(sheet.width)+' × '+fmt(sheet.length)+' — '+fmt(sheet.thickness)+' thick'));
  const ripFirst=plan.cutOrder==='rip-first';
  const instructions=ripFirst?
   'RIP FIRST: '+sheet.strips.length+' full-length strips parallel to grain; then crosscut the bottoms from each strip.':
   'Alternate guillotine layout used to fit more bottoms or reduce sheets; follow individual cuts.';
  const roughMargin=plan.kerf/2;
  card.append(node('p',{class:'note'},instructions+' '+sheet.placements.length+' bottoms; diagram width horizontal and grain vertical.'+
   (sheet.trim?' Factory edge trim '+fmt(sheet.trim)+' on each edge.':'')+
   (plan.kerf>0?' Red dashed marks = track-saw rough cuts; '+fmt(roughMargin)+' extra on interior edges only. Trimmed sheet edges are final edges.':'')));
  if(ripFirst)card.append(node('p',{class:'note'},sheet.strips.map(strip=>
   'R'+strip.index+': '+fmt(strip.width)+' wide × '+fmt(sheet.length)+' long; crosscut '+strip.placements.map(p=>fmt(p.cutLength)).join(', ')).join(' | ')));
  const image=svg('svg',{viewBox:'0 0 '+(sheet.width+4)+' '+(sheet.length+4),role:'img','aria-label':'Bottom layout for '+sheet.label});
  image.append(svg('rect',{x:2,y:2,width:sheet.width,height:sheet.length,fill:'#e8d8bb',stroke:'#806a49','stroke-width':.3}));
  // The outer perimeter is scrap; all placed rectangles start inside this boundary.
  if(sheet.trim>0){
   const t=Math.min(sheet.trim,sheet.width/2,sheet.length/2);
   for(const [x,y,w,h] of [
    [2,2,sheet.width,t],
    [2,2+sheet.length-t,sheet.width,t],
    [2,2+t,t,Math.max(0,sheet.length-2*t)],
    [2+sheet.width-t,2+t,t,Math.max(0,sheet.length-2*t)]
   ])if(w>0&&h>0)image.append(svg('rect',{x,y,width:w,height:h,fill:'#b3b3b3',opacity:'.7'}));
   if(sheet.usableWidth>0&&sheet.usableLength>0)
    image.append(svg('rect',{x:2+sheet.trim,y:2+sheet.trim,width:sheet.usableWidth,height:sheet.usableLength,
     fill:'none',stroke:'#6e6e6e','stroke-dasharray':'.8 .5','stroke-width':'.2'}));
  }

  for(const [i,p] of sheet.placements.entries()){
   const x=p.x+2,y=p.y+2,w=p.cutWidth,h=p.cutLength;
   const group=svg('g');
   group.append(svg('rect',{x,y,width:w,height:h,fill:i%2?'#b6d2e4':'#b9d8bf',stroke:'#526d68','stroke-width':.2}));
   const rough=root.BottomSolver.roughCutFor(p,sheet,plan.kerf);
   group.append(svg('title',{},p.coordinate+' · finished '+fmt(p.width)+' × '+fmt(p.length)+
    ' · rough '+fmt(rough.width)+' × '+fmt(rough.length)+(p.rotated?' (rotated)':'')+
    (rough.fits?'':' · insufficient edge allowance')));
   if(w>=12&&h>=11&&plan.kerf>0){
    group.append(svg('text',{x:x+w/2,y:y+h/2-3,'text-anchor':'middle','font-size':Math.min(2.35,w/6),fill:'#22343a'},p.coordinate));
    group.append(svg('text',{x:x+w/2,y:y+h/2-.1,'text-anchor':'middle','font-size':Math.min(1.65,w/12),fill:'#22343a'},'F '+fmt(p.width)+' × '+fmt(p.length)));
    group.append(svg('text',{x:x+w/2,y:y+h/2+2.6,'text-anchor':'middle','font-size':Math.min(1.65,w/12),fill:'#973137'},'R '+fmt(rough.width)+' × '+fmt(rough.length)));
   }else if(w>=9&&h>=8){
    group.append(svg('text',{x:x+w/2,y:y+h/2-1,'text-anchor':'middle','font-size':Math.min(2.5,w/6),fill:'#22343a'},p.coordinate));
    group.append(svg('text',{x:x+w/2,y:y+h/2+2,'text-anchor':'middle','font-size':Math.min(1.9,w/11),fill:'#22343a'},fmt(p.width)+' × '+fmt(p.length)));
   }
   image.append(group);
  }
  // Rough blanks extend by half the simulated saw-kerf corridor on every
  // edge. Red dashed paths mark the intended track-saw centerlines.
  // Crop to the physical sheet; report any missing allowance at trimmed edges.
  if(plan.kerf>0){
   const clipId='rough-sheet-'+String(sheet.id).replace(/[^a-zA-Z0-9_-]/g,'_');
   const defs=svg('defs'),clip=svg('clipPath',{id:clipId});
   clip.append(svg('rect',{x:2,y:2,width:sheet.width,height:sheet.length}));
   defs.append(clip);image.append(defs);
   const roughGroup=svg('g',{'class':'rough-cut-guides','aria-label':'Rough-cut track-saw centerlines',
    'clip-path':'url(#'+clipId+')'});
   for(const p of sheet.placements){
    const rough=root.BottomSolver.roughCutFor(p,sheet,plan.kerf),r=rough.bounds;
    const x1=r.x+2,y1=r.y+2,x2=x1+r.width,y2=y1+r.length;
    // Omit red cut marks on sides that already have a finished sheet edge.
    const path=[];
    if(!rough.finalEdges.top)path.push('M'+x1+' '+y1+' L'+x2+' '+y1);
    if(!rough.finalEdges.right)path.push('M'+x2+' '+y1+' L'+x2+' '+y2);
    if(!rough.finalEdges.bottom)path.push('M'+x1+' '+y2+' L'+x2+' '+y2);
    if(!rough.finalEdges.left)path.push('M'+x1+' '+y1+' L'+x1+' '+y2);
    const outline=svg('path',{d:path.join(' '),
     fill:'none',stroke:'#b3262c','stroke-width':'.23','stroke-dasharray':'1.1 .7',
     'class':'rough-cut-outline','data-panel':p.coordinate});
    outline.append(svg('title',{},p.coordinate+' rough '+fmt(rough.width)+' × '+fmt(rough.length)+
     (rough.fits?'':' — insufficient edge allowance')));
    roughGroup.append(outline);
   }
   image.append(roughGroup);
   const insufficient=sheet.placements.filter(p=>!root.BottomSolver.roughCutFor(p,sheet,plan.kerf).fits);
   if(insufficient.length){
    card.append(node('p',{class:'warn'},
     'Rough-cut edge clearance insufficient for '+insufficient.length+' panel(s): '+
     insufficient.map(p=>p.coordinate).join(', ')+'. The 1/2-kerf rough margin extends into the trimmed-off edge or outside the usable sheet.'));
   }
  }
  // Project cut positions across the full sheet as low-contrast alignment
  // guides; the colored panel borders remain the actual cut geometry.
  const verticalGuides=new Set(),horizontalGuides=new Set();
  for(const p of sheet.placements){
   const x=p.x+p.cutWidth,y=p.y+p.cutLength;
   if(x>1e-6&&x<sheet.width-1e-6)verticalGuides.add(x.toFixed(5));
   if(y>1e-6&&y<sheet.length-1e-6)horizontalGuides.add(y.toFixed(5));
  }
  const guides=svg('g',{'class':'sheet-cut-guides','aria-label':'Projected full-sheet cut guides',
   'pointer-events':'none',opacity:'.42'});
  for(const value of verticalGuides){
   const x=Number(value)+2;
   guides.append(svg('line',{x1:x,y1:2,x2:x,y2:sheet.length+2,
    stroke:'#929292','stroke-width':'.14','stroke-dasharray':'.75 .9'}));
  }
  for(const value of horizontalGuides){
   const y=Number(value)+2;
   guides.append(svg('line',{x1:2,y1:y,x2:sheet.width+2,y2:y,
    stroke:'#929292','stroke-width':'.14','stroke-dasharray':'.75 .9'}));
  }
  image.append(guides);
  card.append(image);drawings.append(card);
 }
 if(plan.placed){
  const table=node('table',{class:'bottom-table'});
  const header=node('tr');
  for(const title of ['Panel','Drawer','Thickness','Finished W × D','Rough W × D','Sheet','X / Y','Rotated'])header.append(node('th',{},title));
  table.append(header);
  for(const sheet of plan.sheets)for(const p of sheet.placements){
   const row=node('tr');
   const rough=root.BottomSolver.roughCutFor(p,sheet,plan.kerf);
   for(const value of [p.coordinate,p.label,fmt(p.thickness),fmt(p.width)+' × '+fmt(p.length),
    fmt(rough.width)+' × '+fmt(rough.length)+(rough.fits?'':' *'),sheet.label,
    fmt(p.x)+' / '+fmt(p.y),p.rotated?'90°':'—'])row.append(node('td',{},value));
   table.append(row);
  }
  list.append(table);
 }
 if(plan.unassigned.length)list.append(node('p',{class:'warn'},'Unassigned: '+plan.unassigned.map(p=>p.coordinate+' ('+fmt(p.width)+' × '+fmt(p.length)+', '+fmt(p.thickness)+')').join(', ')));
 list.append(node('p',{class:'note'},'Conventional bottoms: side and front grooves, rear edge under back. Vertical pullouts: four grooves; footprint width uses group height, depth uses row depth. Groove penetration is editable.'));
}
root.BottomUI={render};
})(typeof window!=='undefined'?window:globalThis);
