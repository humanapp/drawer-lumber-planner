/* Measured-stock crosscut planner.
 * All cuts are full-board-width crosscuts; lane offsets describe later rip cuts.
 * Deterministic multi-candidate 2D packing with complete-panel glue-up fallback.
 * Heuristic: no claim of mathematical optimality.
 */
(function(root) {
 'use strict';
 const n=x=>Math.max(0,Number(x)||0), EPS=1e-7;
 const round=x=>Math.round(x*100000)/100000;
 const letters=index=>{let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;};
 const roleLetter={front:'F',back:'B',left:'L',right:'R'};
 function demands(project) {
  const out=[],s=project.settings||{},extra=n(s.endExtra),widthExtra=n(s.widthExtra);
  let designIndex=0;
  for(const group of project.groups||[]){
   const width=n(group.height)+widthExtra;
   if(width<=0)continue;
   for(const item of group.items||[]){
    const code=/^[A-Z]+$/.test(item.code||'')?item.code:letters(designIndex);
    designIndex++;
    const q=Math.floor(n(item.qty)),w=n(item.width),d=n(item.depth);
    if(!q||!w||(!item.vertical&&!d))continue;
    const roles=item.vertical?[['front',w+extra],['back',w+extra]]:
      [['front',w+extra],['back',w+extra],['left',d+extra],['right',d+extra]];
    for(let copy=1;copy<=q;copy++)for(const [role,length] of roles)
     out.push({id:String(item.id)+':'+copy+':'+role,
      drawerId:String(item.id),drawerLabel:String(item.label||'Drawer '+item.id),
      code,coordinate:code+copy+'-'+roleLetter[role],
      copy,role,length,width,vertical:item.vertical===true,heightGroup:n(group.height)});
   }
  }
  return out;
 }
 function inventoryOf(project,edgeTrim){
  return (project.inventory||[]).filter(b=>n(b.width)>0&&n(b.length)>0).map((b,i)=>({
   id:String(b.id||'B'+(i+1)),label:String(b.label||b.id||'Board '+(i+1)),
   width:n(b.width),length:n(b.length),
   usableWidth:Math.max(0,n(b.width)-edgeTrim),available:n(b.length),cuts:[]
  }));
 }
 // The physical board is shortened by a full-width crosscut. Rip lanes
 // may be shorter, in which case their excess length is subsequently trimmed.
 function cut(board,length,lanes,kerf,assignments){
  const start=round(board.length-board.available);
  const remaining=board.available-length;
  const usedKerf=remaining>EPS?kerf:0;
  const id=board.id+':C'+(board.cuts.length+1);
  board.cuts.push({id,start,length,kerf:usedKerf,lanes});
  board.available=Math.max(0,round(remaining-usedKerf));
  for(const lane of lanes){
   if(!assignments.has(lane.partId))assignments.set(lane.partId,[]);
   assignments.get(lane.partId).push({boardId:board.id,cutId:id,width:lane.width,
    length:lane.length,role:lane.role,drawerId:lane.drawerId});
  }
 }
 function lane(part,width,offset,strip=1,strips=1){
  return {partId:part.id,drawerId:part.drawerId,drawerLabel:part.drawerLabel,
   copy:part.copy,role:part.role,coordinate:part.coordinate+(strips>1?'/'+strip:''),
   width:round(width),length:part.length,
   strip,strips,offset:round(offset)};
 }
 function orderedBoards(boards,mode){
  const result=[...boards];
  result.sort((a,b)=>{
   if(mode===0)return a.length-b.length||a.usableWidth-b.usableWidth;
   if(mode===1)return b.length-a.length||b.usableWidth-a.usableWidth;
   if(mode===2)return a.usableWidth-b.usableWidth||a.length-b.length;
   if(mode===3)return b.usableWidth-a.usableWidth||a.length-b.length;
   if(mode===4)return a.length*a.usableWidth-b.length*b.usableWidth;
   return b.length*b.usableWidth-a.length*a.usableWidth;
  });
  return result;
 }
 // Select the best mixed-width packing for one candidate crosscut length.
 // A strip may be shorter than the full-width blank, but never longer.
 function pattern(board,pending,kerf,mode){
  if(board.usableWidth<=EPS||board.available<=EPS)return null;
  const feasible=pending.filter(p=>p.width<=board.usableWidth+EPS&&
    p.length<=board.available+EPS);
  if(!feasible.length)return null;
  // Bound per-cut search for practical interactive performance.
  const lengths=[...new Set(feasible.map(p=>round(p.length)))].sort((a,b)=>b-a);
  const sampled=lengths.length<=14?lengths:
    [...new Set([...lengths.slice(0,6),...lengths.slice(-4),
      ...[.25,.5,.75,.9].map(t=>lengths[Math.floor(t*(lengths.length-1))])])];
  let best=null,bestScore=-Infinity;
  for(const length of sampled){
   if(length>board.available+EPS)continue;
   let pool=feasible.filter(p=>p.length<=length+EPS);
   const order=mode%4;
   pool.sort((a,b)=>{
    if(order===0)return b.width-a.width||b.length-a.length||a.id.localeCompare(b.id);
    if(order===1)return b.length-a.length||b.width-a.width||a.id.localeCompare(b.id);
    if(order===2)return b.width*b.length-a.width*a.length||b.length-a.length||a.id.localeCompare(b.id);
    return a.width-b.width||b.length-a.length||a.id.localeCompare(b.id);
   });
   // Require a panel of the candidate length. Otherwise we would overcut
   // all rip lanes and could improve the pattern by shortening its crosscut.
   const first=pool.find(p=>Math.abs(p.length-length)<=EPS);
   if(!first)continue;
   const selected=[first];
   let used=first.width;
   for(const p of pool){
    if(p===first)continue;
    const next=used+kerf+p.width;
    if(next>board.usableWidth+EPS)continue;
    selected.push(p);used=next;
   }
   // Counts, wood waste, and width utilization compete within a search run;
   // the final comparison evaluates the complete plan lexicographically.
   const area=selected.reduce((v,p)=>v+p.width*p.length,0);
   const waste=Math.max(0,board.usableWidth*length-area);
   const utilization=area/(board.usableWidth*length);
   const score=selected.length*(100+(mode%3)*9)+utilization*24-
     waste/(board.usableWidth*length)*9-
     (length/board.length)*(mode%2===0?2:8);
   if(score>bestScore+EPS){
    bestScore=score;best={length,parts:selected,used,area,waste};
   }
  }
  return best;
 }
 function onePiece(boards,parts,kerf,mode,assignments,pending){
  for(const board of orderedBoards(boards,mode%6)){
   while(board.available>EPS && pending.size){
    const options=[...pending.values()].filter(p=>p.width<=board.usableWidth+EPS);
    if(!options.length)break;
    const option=pattern(board,options,kerf,Math.floor(mode/3));
    if(!option)break;
    let offset=0;
    const lanes=option.parts.map(p=>{
     const result=lane(p,p.width,offset);
     offset+=p.width+kerf;
     return result;
    });
    cut(board,option.length,lanes,kerf,assignments);
    for(const p of option.parts)pending.delete(p.id);
   }
  }
 }
 function glueUps(boards,parts,kerf,minWidth,mode,assignments,pending){
  const leftovers=[...pending.values()].sort((a,b)=>
   (mode%2?b.length-a.length:b.width-a.width)||b.width-a.width);
  for(const part of leftovers){
   const candidates=[];
   for(const board of boards){
    if(board.usableWidth+EPS<minWidth||board.available+EPS<part.length)continue;
    const count=Math.max(0,Math.floor((board.available+kerf+EPS)/(part.length+kerf)));
    for(let i=0;i<count;i++)candidates.push({board,width:board.usableWidth,slot:i});
   }
   candidates.sort((a,b)=>b.width-a.width||a.board.available-b.board.available||
     a.board.id.localeCompare(b.board.id));
   let picked=null,capacity=0;
   // Prefer two strips and the tightest total width to avoid monopolizing
   // two wide blanks when a wide + narrow option works.
   if(part.width+EPS>=2*minWidth){
    let excess=Infinity;
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
     const total=candidates[i].width+candidates[j].width;
     if(total+EPS<part.width)continue;
     if(total-part.width<excess-EPS){
      excess=total-part.width;picked=[candidates[i],candidates[j]];capacity=total;
     }
    }
   }
   if(!picked){
    let total=0;const tryThese=[];
    for(const candidate of candidates){
     if(tryThese.length*minWidth+minWidth>part.width+EPS)break;
     tryThese.push(candidate);total+=candidate.width;
     if(tryThese.length>=2&&total+EPS>=part.width){
      picked=tryThese;capacity=total;break;
     }
    }
   }
   if(!picked||picked.length*minWidth>part.width+EPS||capacity+EPS<part.width)continue;
   // For multiple blanks coming from the same board, commit each sequentially
   // only after the entire glue-up has proved possible.
   picked.sort((a,b)=>a.width-b.width||a.board.id.localeCompare(b.board.id));
   let rest=part.width;const strips=[];
   for(let i=0;i<picked.length;i++){
    const future=(picked.length-i-1)*minWidth;
    const width=Math.min(picked[i].width,rest-future);
    if(width+EPS<minWidth)break;
    strips.push({board:picked[i].board,width});rest-=width;
   }
   if(strips.length!==picked.length||rest>EPS)continue;
   // Match inventory capacities (including kerf) without mutating on failure.
   const counts=new Map();
   for(const x of strips)counts.set(x.board,(counts.get(x.board)||0)+1);
   if([...counts].some(([b,c])=>b.available+EPS<c*part.length+Math.max(0,c-1)*kerf))continue;
   strips.forEach((x,i)=>cut(x.board,part.length,[lane(part,x.width,0,i+1,strips.length)],kerf,assignments));
   pending.delete(part.id);
  }
 }
 function candidate(project,parts,settings,mode){
  const boards=inventoryOf(project,settings.edgeTrim);
  const pending=new Map(parts.map(p=>[p.id,p]));
  const assignments=new Map();
  onePiece(boards,parts,settings.kerf,mode,assignments,pending);
  glueUps(boards,parts,settings.kerf,settings.minGlueWidth,mode,assignments,pending);
  const assigned=parts.length-pending.size;
  const glueUpsCount=[...assignments.values()].filter(x=>x.length>1).length;
  const crosscuts=boards.reduce((s,b)=>s+b.cuts.length,0);
  const waste=boards.reduce((sum,b)=>sum+b.cuts.reduce((v,c)=>{
   const occupied=c.lanes.reduce((a,l)=>a+l.width*l.length,0);
   return v+Math.max(0,b.usableWidth*c.length-occupied);
  },0),0);
  const usedLength=boards.reduce((sum,b)=>sum+(b.length-b.available),0);
  return {boards,parts,assigned,unassigned:[...pending.values()],crosscuts,
   glueUps:glueUpsCount,assignments:Object.fromEntries(assignments),waste,usedLength};
 }
 function better(a,b){
  if(!b)return true;
  if(a.assigned!==b.assigned)return a.assigned>b.assigned;
  if(a.glueUps!==b.glueUps)return a.glueUps<b.glueUps;
  if(a.crosscuts!==b.crosscuts)return a.crosscuts<b.crosscuts;
  if(Math.abs(a.waste-b.waste)>EPS)return a.waste<b.waste;
  return a.usedLength<b.usedLength-EPS;
 }
 function solve(project){
  const raw=project.settings||{};
  const settings={kerf:n(raw.kerf),edgeTrim:n(raw.edgeTrim),
   minGlueWidth:raw.minGlueWidth===undefined?2:n(raw.minGlueWidth)};
  const parts=demands(project);
  let best=null;
  // Independent strategies: board order, panel order, and length/width
  // pattern selection. Compare COMPLETE outcomes rather than first-fit moves.
  for(let mode=0;mode<24;mode++){
   const plan=candidate(project,parts,settings,mode);
   if(better(plan,best))best=plan;
  }
  const inventoryBF=best.boards.reduce((sum,b)=>sum+b.width*b.length/144,0);
  const warnings=[];
  if(best.boards.some(b=>b.usableWidth<=EPS))
   warnings.push('Some boards have no usable width after edge trim.');
  return {...best,inventoryBF,warnings};
 }
 root.DrawerSolver={solve,demands};
})(typeof window!=='undefined'?window:globalThis);
