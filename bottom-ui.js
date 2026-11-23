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
function render(state,save){
 if(!Array.isArray(state.sheets))state.sheets=[];
 state.bottomSettings={widthDeduction:.5,depthDeduction:.5,kerf:.125,allowRotation:false,...state.bottomSettings};
 const commit=()=>{save();render(state,save)};
 const settings=$('bottomSettings'),inventory=$('bottomSheets'),summary=$('bottomSummary'),
  drawings=$('bottomLayouts'),list=$('bottomCutList');
 if(!settings)return;
 for(const el of [settings,inventory,summary,drawings,list])el.replaceChildren();
 for(const [key,label,step] of [
  ['widthDeduction','Bottom width deduction (in)',.0625],
  ['depthDeduction','Bottom depth deduction (in)',.0625],
  ['kerf','Sheet saw kerf (in)',.001]
 ]){
  const field=node('label',{class:'field'},label);
  const input=node('input',{type:'number',min:0,step,value:state.bottomSettings[key],'aria-label':label});
  input.onchange=()=>{state.bottomSettings[key]=Math.max(0,Number(input.value)||0);commit()};
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
   const input=node('input',{type:'number',min:0,step,value:sheet[key],'aria-label':'Sheet '+sheet.id+' '+name});
   input.onchange=()=>{sheet[key]=Number(input.value);commit()};row.append(input);
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
  card.append(node('p',{class:'note'},sheet.placements.length+' bottoms; '+sheet.free.length+' available rectangular offcuts. Diagram: sheet width horizontally; grain along vertical length.'));
  const image=svg('svg',{viewBox:'0 0 '+(sheet.width+4)+' '+(sheet.length+4),role:'img','aria-label':'Bottom layout for '+sheet.label});
  image.append(svg('rect',{x:2,y:2,width:sheet.width,height:sheet.length,fill:'#e8d8bb',stroke:'#806a49','stroke-width':.3}));
  for(const [i,p] of sheet.placements.entries()){
   const x=p.x+2,y=p.y+2,w=p.cutWidth,h=p.cutLength;
   const group=svg('g');
   group.append(svg('rect',{x,y,width:w,height:h,fill:i%2?'#b6d2e4':'#b9d8bf',stroke:'#526d68','stroke-width':.2}));
   group.append(svg('title',{},p.coordinate+' · '+fmt(p.width)+' × '+fmt(p.length)+(p.rotated?' (rotated)':'')));
   if(w>=9&&h>=8){
    group.append(svg('text',{x:x+w/2,y:y+h/2-1,'text-anchor':'middle','font-size':Math.min(2.5,w/6),fill:'#22343a'},p.coordinate));
    group.append(svg('text',{x:x+w/2,y:y+h/2+2,'text-anchor':'middle','font-size':Math.min(1.9,w/11),fill:'#22343a'},fmt(p.width)+' × '+fmt(p.length)));
   }
   image.append(group);
  }
  card.append(image);drawings.append(card);
 }
 if(plan.placed){
  const table=node('table',{class:'bottom-table'});
  const header=node('tr');
  for(const title of ['Panel','Drawer','Thickness','Bottom W × D','Sheet','X / Y','Rotated'])header.append(node('th',{},title));
  table.append(header);
  for(const sheet of plan.sheets)for(const p of sheet.placements){
   const row=node('tr');
   for(const value of [p.coordinate,p.label,fmt(p.thickness),fmt(p.width)+' × '+fmt(p.length),sheet.label,fmt(p.x)+' / '+fmt(p.y),p.rotated?'90°':'—'])row.append(node('td',{},value));
   table.append(row);
  }
  list.append(table);
 }
 if(plan.unassigned.length)list.append(node('p',{class:'warn'},'Unassigned: '+plan.unassigned.map(p=>p.coordinate+' ('+fmt(p.width)+' × '+fmt(p.length)+', '+fmt(p.thickness)+')').join(', ')));
 if(plan.skippedVertical)list.append(node('p',{class:'note'},plan.skippedVertical+' vertical configuration(s) excluded: specify their bottom dimensions separately before cutting.'));
}
root.BottomUI={render};
})(typeof window!=='undefined'?window:globalThis);
