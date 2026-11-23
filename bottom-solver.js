/* Drawer bottom cutting layouts for measured sheet goods.
 * Guillotine-compatible cuts, fixed grain by default, bounded deterministic
 * search. Plans are heuristic rather than a proof of optimality.
 */
(function(root){
'use strict';
const n=v=>Math.max(0,Number(v)||0),EPS=1e-7;
const round=v=>Math.round(v*100000)/100000;
const codeFor=i=>{let s='';for(let x=i+1;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;};
const thicknessFor=h=>n(h)<=5.5?0.25:0.5;
function demands(project){
 const config=project.bottomSettings||{},widthDeduction=config.widthDeduction===undefined?.5:n(config.widthDeduction),
  depthDeduction=config.depthDeduction===undefined?.5:n(config.depthDeduction);
 const parts=[];let index=0;
 for(const group of project.groups||[]){
  for(const item of group.items||[]){
   const code=/^[A-Z]+$/.test(item.code||'')?item.code:codeFor(index);
   index++;
   // Vertical pullouts have an upright height in the width field and their
   // depth is not a conventional drawer-box dimension.
   if(item.vertical)continue;
   const width=round(n(item.width)-widthDeduction),
    length=round(n(item.depth)-depthDeduction),qty=Math.floor(n(item.qty));
   if(width<=EPS||length<=EPS||qty<=0)continue;
   const thickness=thicknessFor(group.height);
   for(let copy=1;copy<=qty;copy++)parts.push({
    id:String(item.id)+':'+copy+':bottom',coordinate:code+copy+'-BT',
    drawerId:String(item.id),label:String(item.label||'Drawer '+item.id),
    thickness,width,length,copy
   });
  }
 }
 return parts;
}
function sheetsOf(project){
 const sheets=[];
 for(const [i,source] of (project.sheets||[]).entries()){
  const width=n(source.width),length=n(source.length),thickness=n(source.thickness);
  if(width<=EPS||length<=EPS||thickness<=EPS)continue;
  const qty=Math.min(100,Math.floor(n(source.qty??1)));
  for(let copy=1;copy<=qty;copy++)sheets.push({
   id:String(source.id||'S'+(i+1))+(qty>1?'-'+copy:''),
   label:String(source.label||source.id||'Sheet '+(i+1))+(qty>1?' #'+copy:''),
   width,length,thickness,placements:[],free:[{x:0,y:0,width,length}]
  });
 }
 return sheets;
}
function split(space,piece,kerf,axis){
 const w=space.width-piece.width-kerf,l=space.length-piece.length-kerf;
 // Alternate complete guillotine cut sequences; no overlapping free space.
 const rectangles=axis===0?[
  {x:space.x+piece.width+kerf,y:space.y,width:w,length:piece.length},
  {x:space.x,y:space.y+piece.length+kerf,width:space.width,length:l}
 ]:[
  {x:space.x+piece.width+kerf,y:space.y,width:w,length:space.length},
  {x:space.x,y:space.y+piece.length+kerf,width:piece.width,length:l}
 ];
 return rectangles.filter(r=>r.width>EPS&&r.length>EPS).map(r=>({
  x:round(r.x),y:round(r.y),width:round(r.width),length:round(r.length)
 }));
}
function plan(project,mode){
 const sheets=sheetsOf(project),parts=demands(project),
   settings=project.bottomSettings||{},kerf=n(settings.kerf===undefined?.125:settings.kerf),
   allowRotation=settings.allowRotation===true;
 const remaining=[...parts];
 const ordering=mode%4;
 remaining.sort((a,b)=>{
  if(a.thickness!==b.thickness)return a.thickness-b.thickness;
  const aa=a.width*a.length,ba=b.width*b.length;
  if(ordering===0)return ba-aa||b.width-a.width;
  if(ordering===1)return Math.max(b.width,b.length)-Math.max(a.width,a.length)||ba-aa;
  if(ordering===2)return b.length-a.length||b.width-a.width;
  return b.width-a.width||b.length-a.length;
 });
 const unassigned=[];
 for(const part of remaining){
  let best=null;
  for(let si=0;si<sheets.length;si++){
   const sheet=sheets[si];
   if(Math.abs(sheet.thickness-part.thickness)>EPS)continue;
   for(let fi=0;fi<sheet.free.length;fi++){
    const free=sheet.free[fi];
    for(const rotated of (allowRotation?[false,true]:[false])){
     const width=rotated?part.length:part.width,length=rotated?part.width:part.length;
     if(width>free.width+EPS||length>free.length+EPS)continue;
     for(const axis of [0,1]){
      const offcuts=split(free,{width,length},kerf,axis);
      const residual=offcuts.reduce((sum,r)=>sum+r.width*r.length,0);
      const lost=free.width*free.length-width*length-residual;
      const sheetPenalty=sheet.placements.length?0:50000;
      const score=sheetPenalty+
       (free.width*free.length-width*length)*(mode%2===0?1:.2)+
       lost*(mode%2===0?.3:2)+
       offcuts.length*(mode%3===0?2:0)+si*.0001;
      if(!best||score<best.score-EPS)best={sheet,fi,free,axis,rotated,width,length,offcuts,score};
     }
    }
   }
  }
  if(!best){unassigned.push(part);continue}
  const sheet=best.sheet;
  sheet.free.splice(best.fi,1,...best.offcuts);
  sheet.placements.push({...part,x:best.free.x,y:best.free.y,
   cutWidth:best.width,cutLength:best.length,rotated:best.rotated,axis:best.axis});
 }
 const placed=sheets.reduce((s,b)=>s+b.placements.length,0),
  usedSheets=sheets.filter(b=>b.placements.length).length,
  wastedArea=sheets.reduce((sum,b)=>sum+b.placements.length?
    sum+b.width*b.length-b.placements.reduce((v,p)=>v+p.width*p.length,0):sum,0),
  usedArea=sheets.reduce((sum,b)=>sum+b.placements.reduce((v,p)=>v+p.width*p.length,0),0);
 return {sheets,parts,placed,unassigned,usedSheets,wastedArea,usedArea,kerf,allowRotation,
   skippedVertical:(project.groups||[]).flatMap(g=>g.items||[]).filter(i=>i.vertical).length};
}
function solve(project){
 let best=null;
 const better=(a,b)=>!b||a.placed>b.placed||
  (a.placed===b.placed&&(a.usedSheets<b.usedSheets||
   (a.usedSheets===b.usedSheets&&(a.wastedArea<b.wastedArea-EPS))));
 for(let mode=0;mode<12;mode++){
  const candidate=plan(project,mode);
  if(better(candidate,best))best=candidate;
 }
 return best;
}
root.BottomSolver={solve,demands,sheetsOf};
})(typeof window!=='undefined'?window:globalThis);
