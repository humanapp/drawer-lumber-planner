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
 const config=project.bottomSettings||{};
 // Groove width (1/4") controls the tongue thickness, NOT the panel footprint.
 // Geometry is set by the wall thickness and how deeply the bottom enters each
 // groove. Default: 1/2" walls with 1/4" groove penetration.
 const wallThickness=config.wallThickness===undefined?.5:n(config.wallThickness),
  grooveDepth=config.grooveDepth===undefined?.25:n(config.grooveDepth),
  inset=Math.max(0,wallThickness-grooveDepth);
 const parts=[];let index=0;
 for(const group of project.groups||[]){
  for(const item of group.items||[]){
   const code=/^[A-Z]+$/.test(item.code||'')?item.code:codeFor(index);
   index++;
   // Standard drawer: two side grooves + one front groove. At the rear,
   // the bottom runs below the shortened back to its outside rear face so
   // it can be screwed upward into the back.
   // Vertical pullout: bottom captured in grooves on all four sides.
   // Vertical drawer row Width is upright height; group Height is footprint
   // width. Row Depth is its front-to-back separation/footprint depth.
   const vertical=item.vertical===true;
   const outsideWidth=vertical?n(group.height):n(item.width);
   const outsideDepth=n(item.depth);
   const width=round(outsideWidth-2*inset),
    length=round(outsideDepth-(vertical?2*inset:inset)),
    qty=Math.floor(n(item.qty));
   if(width<=EPS||length<=EPS||qty<=0)continue;
   const thickness=thicknessFor(group.height);
   for(let copy=1;copy<=qty;copy++)parts.push({
    id:String(item.id)+':'+copy+':bottom',coordinate:code+copy+'-BT',
    drawerId:String(item.id),label:String(item.label||'Drawer '+item.id),
    thickness,width,length,copy,vertical,construction:vertical?'four-groove':'three-groove-back-overlap'
   });
  }
 }
 return parts;
}
function sheetsOf(project){
 const sheets=[];
 for(const [i,source] of (project.sheets||[]).entries()){
  // Sheet grain is assumed parallel to its longer dimension. Normalize the
  // diagram so full-length rips always run vertically.
  const width=Math.min(n(source.width),n(source.length)),
   length=Math.max(n(source.width),n(source.length)),thickness=n(source.thickness);
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
   skippedVertical:0};
}
// Rip-first layout: every strip runs the full length of the sheet, parallel
// to grain. Crosscuts within each strip follow, with a kerf between panels.
// Keep this separate from the generic guillotine heuristic so we can compare
// complete plans without giving up otherwise assignable parts.
function ripFirstPlan(project,mode){
 const sheets=sheetsOf(project),parts=demands(project),
  settings=project.bottomSettings||{},
  kerf=n(settings.kerf===undefined?.125:settings.kerf),
  allowRotation=settings.allowRotation===true;
 for(const sheet of sheets){sheet.strips=[];sheet.free=[]}
 const ordered=[...parts],strategy=mode%4;
 ordered.sort((a,b)=>{
  if(a.thickness!==b.thickness)return a.thickness-b.thickness;
  if(strategy===0)return b.width-a.width||b.length-a.length||a.id.localeCompare(b.id);
  if(strategy===1)return b.length-a.length||b.width-a.width||a.id.localeCompare(b.id);
  if(strategy===2)return b.width*b.length-a.width*a.length||a.id.localeCompare(b.id);
  return a.width-b.width||b.length-a.length||a.id.localeCompare(b.id);
 });
 const unassigned=[];
 for(const part of ordered){
  let best=null;
  for(let si=0;si<sheets.length;si++){
   const sheet=sheets[si];
   if(Math.abs(sheet.thickness-part.thickness)>EPS)continue;
   for(const rotated of (allowRotation?[false,true]:[false])){
    const width=rotated?part.length:part.width,
     length=rotated?part.width:part.length;
    if(length>sheet.length+EPS)continue;
    // Reuse a full-length strip before ripping another one. Only same-width
    // pieces share a strip, avoiding an unplanned secondary width rip.
    for(const strip of sheet.strips){
     if(Math.abs(strip.width-width)>EPS)continue;
     const start=strip.nextY===0?0:strip.nextY;
     if(start+length>sheet.length+EPS)continue;
     const slack=sheet.length-(start+length);
     const score=slack+(rotated?200:0)+si*.001;
     if(!best||score<best.score-EPS)
      best={sheet,strip,x:strip.x,y:start,width,length,rotated,score};
    }
    const previous=sheet.strips[sheet.strips.length-1];
    const x=previous?round(previous.x+previous.width+kerf):0;
    if(x+width>sheet.width+EPS)continue;
    // Prefer already used sheets over opening a new sheet, and prefer
    // tighter lane packing when two equivalent new strips are possible.
    const score=100000+(sheet.placements.length?0:100000)+
     (sheet.width-x-width)*10+(rotated?200:0)+si*.001;
    if(!best||score<best.score-EPS)
     best={sheet,strip:null,x,y:0,width,length,rotated,score};
   }
  }
  if(!best){unassigned.push(part);continue}
  const sheet=best.sheet;
  const strip=best.strip||{index:sheet.strips.length+1,x:best.x,
   width:best.width,length:sheet.length,nextY:0,placements:[]};
  if(!best.strip)sheet.strips.push(strip);
  const placement={...part,x:round(best.x),y:round(best.y),
   cutWidth:best.width,cutLength:best.length,rotated:best.rotated,
   strip:strip.index,axis:1};
  strip.placements.push(placement);
  sheet.placements.push(placement);
  const end=round(best.y+best.length);
  strip.nextY=end+kerf<=sheet.length+EPS?round(end+kerf):sheet.length;
 }
 for(const sheet of sheets){
  if(!sheet.strips.length){sheet.free=[{x:0,y:0,width:sheet.width,length:sheet.length}];continue}
  for(const strip of sheet.strips){
   const last=strip.placements[strip.placements.length-1];
   const y=round(last.y+last.cutLength);
   if(sheet.length-y>EPS)sheet.free.push({x:strip.x,y,width:strip.width,length:round(sheet.length-y)});
  }
  const last=sheet.strips[sheet.strips.length-1];
  const x=round(last.x+last.width);
  if(sheet.width-x>EPS)sheet.free.push({x,y:0,width:round(sheet.width-x),length:sheet.length});
 }
 const placed=sheets.reduce((sum,s)=>sum+s.placements.length,0),
  usedSheets=sheets.filter(s=>s.placements.length).length,
  wastedArea=sheets.reduce((sum,s)=>sum+(s.placements.length?
   s.width*s.length-s.placements.reduce((a,p)=>a+p.width*p.length,0):0),0),
  usedArea=sheets.reduce((sum,s)=>sum+s.placements.reduce((a,p)=>a+p.width*p.length,0),0);
 return {sheets,parts,placed,unassigned,usedSheets,wastedArea,usedArea,
  kerf,allowRotation,cutOrder:'rip-first',
  skippedVertical:0};
}
function solve(project){
 let best=null;
 const better=(a,b)=>!b||a.placed>b.placed||
  (a.placed===b.placed&&(a.usedSheets<b.usedSheets||
   (a.usedSheets===b.usedSheets&&(
    (a.cutOrder==='rip-first'&&b.cutOrder!=='rip-first')||
    ((a.cutOrder==='rip-first')===(b.cutOrder==='rip-first')&&
     a.wastedArea<b.wastedArea-EPS)))));
 // Prefer full-length grain-parallel ripping when it assigns the same
 // number of bottoms using the same number of sheets. The generic guillotine
 // search remains a fallback if it uses fewer sheets or assigns more panels.
 for(let mode=0;mode<8;mode++){
  const candidate=ripFirstPlan(project,mode);
  if(better(candidate,best))best=candidate;
 }
 for(let mode=0;mode<12;mode++){
  const candidate=plan(project,mode);
  if(better(candidate,best))best=candidate;
 }
 return best;
}
root.BottomSolver={solve,demands,sheetsOf};
})(typeof window!=='undefined'?window:globalThis);
