/* Deterministic rough crosscut solver.
 * A cut is always a full-width crosscut of the purchased board.
 * Lanes are proposed subsequent rip assignments, not cuts to make first.
 * This is a greedy heuristic, not an exhaustive optimum.
 */
(function(root) {
  'use strict';
  const n = value => Math.max(0, Number(value) || 0);
  const eps = 1e-7;
  function demands(project) {
    const out = [];
    const settings = project.settings || {};
    const extra = n(settings.endExtra), widthExtra = n(settings.widthExtra);
    for (const group of project.groups || []) {
      const panelWidth = n(group.height) + widthExtra;
      if (panelWidth <= 0) continue;
      for (const item of group.items || []) {
        const q = Math.floor(n(item.qty)), w = n(item.width), d = n(item.depth);
        if (!q || !w || (!item.vertical && !d)) continue;
        const roles = item.vertical
          ? [['front', w + extra], ['back', w + extra]]
          : [['front', w + extra], ['back', w + extra], ['left', d + extra], ['right', d + extra]];
        for (let copy = 1; copy <= q; copy++) for (const [role, length] of roles) {
          out.push({
            id: String(item.id) + ':' + copy + ':' + role,
            drawerId: String(item.id), drawerLabel: String(item.label || 'Drawer ' + item.id),
            copy, role, length, width: panelWidth, vertical: item.vertical === true,
            heightGroup: n(group.height)
          });
        }
      }
    }
    return out;
  }
  function solve(project) {
    const settings = project.settings || {}, kerf = n(settings.kerf), edgeTrim = n(settings.edgeTrim);
    const inventory = (project.inventory || []).filter(b => n(b.width)>0 && n(b.length)>0).map((board,index) => ({
      id: String(board.id || 'B' + (index+1)), label: String(board.label || board.id || 'Board ' + (index+1)),
      width: n(board.width), length: n(board.length),
      usableWidth: Math.max(0,n(board.width)-edgeTrim),
      available: n(board.length), cuts: []
    }));
    const parts = demands(project);
    const availableParts = new Map(parts.map(part=>[part.id,part]));
    const assignments = new Map();
    const warnings = [];
    if(inventory.some(b=>b.usableWidth <= 0))warnings.push('Some boards have no usable width after edge trim.');
    function slots(board,len){
      if(board.usableWidth <= 0 || board.available + eps < len) return 0;
      return Math.max(0,Math.floor((board.available + kerf + eps)/(len + kerf)));
    }
    function appendCut(board,length,lanes) {
      const start = board.length - board.available;
      const remaining = board.available - length;
      const consumedKerf = remaining > eps ? kerf : 0;
      board.cuts.push({
        id: board.id + ':C' + (board.cuts.length+1),start,length,
        kerf:consumedKerf, lanes
      });
      board.available = Math.max(0,remaining-consumedKerf);
      for(const lane of lanes) {
        if(!assignments.has(lane.partId)) assignments.set(lane.partId,[]);
        assignments.get(lane.partId).push({
          boardId:board.id, cutId:board.cuts[board.cuts.length-1].id,
          width:lane.width, role:lane.role, drawerId:lane.drawerId
        });
      }
    }
    // Wide panels first: use the available boards that could avoid a glue-up.
    const groups = new Map();
    for(const part of parts) {
      const key=part.width.toFixed(5)+'/'+part.length.toFixed(5);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(part);
    }
    const sortedGroups=[...groups.values()].sort((a,b)=>b[0].width-a[0].width||b[0].length-a[0].length);
    for(const group of sortedGroups){
      while(group.some(p=>availableParts.has(p.id))){
        const pending=group.filter(p=>availableParts.has(p.id));
        const candidates=inventory.map(board => {
          const perCut=Math.floor((board.usableWidth+kerf+eps)/(pending[0].width+kerf));
          return {board, capacity:slots(board,pending[0].length)>0 ? Math.min(perCut,pending.length):0};
        }).filter(x=>x.capacity>0).sort((a,b)=>
          b.capacity-a.capacity ||
          (a.board.usableWidth-a.capacity*pending[0].width)-(b.board.usableWidth-b.capacity*pending[0].width) ||
          a.board.available-b.board.available ||
          a.board.id.localeCompare(b.board.id));
        if(!candidates.length)break;
        const {board,capacity}=candidates[0];
        const selected=pending.slice(0,capacity);
        appendCut(board,selected[0].length,selected.map((p,i)=>({
          partId:p.id,drawerId:p.drawerId,drawerLabel:p.drawerLabel,role:p.role,
          copy:p.copy,width:p.width,strip:1,strips:1, offset:i*(p.width+kerf)
        })));
        for(const part of selected)availableParts.delete(part.id);
      }
    }
    // Only then try edge-glued construction for leftover complete panels.
    // A partial glue-up is never committed: it stays in the unassigned list.
    const minGlueWidth = settings.minGlueWidth === undefined ? 2 : n(settings.minGlueWidth);
    const unfilled=[...availableParts.values()].sort((a,b)=>b.width-a.width||b.length-a.length);
    for(const part of unfilled){
      const candidates=[];
      for(const board of inventory){
        if(board.usableWidth + eps < minGlueWidth)continue;
        const count=slots(board,part.length);
        for(let i=0;i<count;i++)candidates.push({board,width:board.usableWidth});
      }
      candidates.sort((a,b)=>b.width-a.width||a.board.available-b.board.available||a.board.id.localeCompare(b.board.id));

      // Find the fewest complete strips that can cover the panel.
      // Every selected strip must be at least minGlueWidth, even the final one.
      // Do not commit any cuts until the entire panel has a feasible assignment.
      let capacity=0,selected=[];
      for(const candidate of candidates){
        selected.push(candidate);
        capacity+=candidate.width;
        if(selected.length>=2 &&
           selected.length*minGlueWidth<=part.width+eps &&
           capacity+eps>=part.width)break;
      }
      if(selected.length<2 ||
         selected.length*minGlueWidth>part.width+eps ||
         capacity+eps<part.width)continue;

      // Allocate narrower available widths first, reserving at least the
      // minimum for every other strip. This avoids leftover slivers.
      selected=selected.slice().sort((a,b)=>a.width-b.width||a.board.id.localeCompare(b.board.id));
      let remaining=part.width;
      const lanes=[];
      for(let i=0;i<selected.length;i++){
        const future=(selected.length-i-1)*minGlueWidth;
        const width=Math.min(selected[i].width,remaining-future);
        if(width+eps<minGlueWidth)break;
        lanes.push({board:selected[i].board,width});
        remaining-=width;
      }
      if(lanes.length!==selected.length || remaining>eps)continue;
      lanes.forEach((x,index)=>appendCut(x.board,part.length,[{
        partId:part.id,drawerId:part.drawerId,drawerLabel:part.drawerLabel,role:part.role,
        copy:part.copy,width:x.width,strip:index+1,strips:lanes.length,offset:0
      }]));
      availableParts.delete(part.id);
    }
    const assigned=parts.length-availableParts.size;
    const inventoryBF=inventory.reduce((sum,b)=>sum+b.width*b.length/144,0);
    return {
      boards:inventory, parts, assigned, unassigned:[...availableParts.values()],
      crosscuts:inventory.reduce((sum,b)=>sum+b.cuts.length,0),
      glueUps:[...assignments.values()].filter(lanes=>lanes.length>1).length,
      assignments:Object.fromEntries(assignments), inventoryBF,warnings
    };
  }
  root.DrawerSolver={solve,demands};
})(typeof window !== 'undefined' ? window : globalThis);
