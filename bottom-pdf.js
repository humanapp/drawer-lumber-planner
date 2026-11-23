/* Printable drawer-bottom sheet diagrams with legible panel coordinates. */
(function(root){
'use strict';
const fmt=n=>root.InchMeasurements.format(n);
const esc=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?')
 .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const txt=(x,y,size,s,bold=false)=>'BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x.toFixed(2)+' '+y.toFixed(2)+' Tm ('+esc(s)+') Tj ET\n';
const rect=(x,y,w,h,fill=false)=>[x,y,w,h].map(v=>v.toFixed(2)).join(' ')+' re '+(fill?'f':'S')+'\n';
const line=(x1,y1,x2,y2)=>[x1,y1,'m',x2,y2,'l S\n'].map(v=>typeof v==='number'?v.toFixed(2):v).join(' ');
const PAGE_W=612,PAGE_H=792,LEFT=30,CHART_TOP=668,CHART_BOTTOM=83,CHART_MAX_W=302,LEGEND_X=356,LEGEND_ROW=25,LEGEND_ROWS=22;
function makePdf(plan){
 const pages=[];
 const pageHeader=()=>(
  '0.13 0.18 0.23 rg\n'+txt(LEFT,756,17,'DRAWER BOTTOM SHEET CUTTING PLAN',true)+
  '0.43 0.46 0.5 rg\n'+txt(LEFT,736,9,'Dimensions rounded to 1/32 inch. Kerf is shown between panels; verify before cutting.')
 );
 function title(sheet,continuation=false){
  return '0.13 0.18 0.23 rg\n'+txt(LEFT,711,13,
   sheet.label+'  '+fmt(sheet.width)+' x '+fmt(sheet.length)+'  THICKNESS '+fmt(sheet.thickness)+
   (sheet.trim?'  EDGE TRIM '+fmt(sheet.trim):'')+(continuation?' (continued)':''),true);
 }
 const sheets=(plan?.sheets||[]).filter(sheet=>sheet.placements.length);
 const numberedLegend=(rows,sheet,start,end,atY=650)=>{
  let result='0.13 0.18 0.23 rg\n'+txt(LEGEND_X,675,11,'PANEL KEY',true);
  for(let i=start;i<end;i++){
   const part=rows[i],y=atY-(i-start)*LEGEND_ROW;
   const rough=root.BottomSolver.roughCutFor(part,sheet,plan.kerf);
   result+='0.15 0.19 0.23 rg\n'+txt(LEGEND_X,y,10,(i+1)+'. '+part.coordinate,true);
   result+='0.55 0.1 0.12 rg\n'+txt(LEGEND_X+105,y,7.5,
    'R '+fmt(rough.width)+' x '+fmt(rough.length)+(rough.fits?'':' *'));
   result+='0.37 0.4 0.44 rg\n'+txt(LEGEND_X+13,y-11,8,fmt(part.width)+' x '+fmt(part.length))+
    txt(LEGEND_X+126,y-11,7,'x '+fmt(part.x)+' / y '+fmt(part.y));
  }
  return result;
 };
 if(!sheets.length){
  pages.push(pageHeader()+'0.13 0.18 0.23 rg\n'+txt(LEFT,695,12,'No assigned sheet cuts.'));
 }
 for(const sheet of sheets){
  const rows=sheet.placements,scale=Math.min(CHART_MAX_W/sheet.width,
   (CHART_TOP-CHART_BOTTOM)/sheet.length),sw=sheet.width*scale,sh=sheet.length*scale,
   left=LEFT,top=CHART_TOP;
  let out=pageHeader()+title(sheet);
  const ripFirst=plan.cutOrder==='rip-first';
  out+='0.35 0.38 0.42 rg\n'+txt(LEFT,688,9,
   ripFirst?'RIP FIRST: full-length strips parallel to grain, then crosscut within each strip.':
    'Alternate guillotine layout; see panel positions.');
  if(plan.kerf>0)out+='0.55 0.1 0.12 rg\n'+txt(LEFT,676,8,
   'RED DASH: rough cuts '+fmt(plan.kerf/2)+' beyond non-sheet edges. Trim edges are final. R = rough size.');
  out+='0.95 0.96 0.97 rg\n'+rect(left,top-sh,sw,sh,true);
  // Shade the unusable factory-edge perimeter in the physical sheet diagram.
  if(sheet.trim>0){
   const trim=Math.min(sheet.trim,sheet.width/2,sheet.length/2)*scale;
   out+='0.74 0.74 0.74 rg\n';
   for(const [rx,ry,rw,rh] of [
    [left,top-trim,sw,trim],
    [left,top-sh,sw,trim],
    [left,top-sh+trim,trim,Math.max(0,sh-2*trim)],
    [left+sw-trim,top-sh+trim,trim,Math.max(0,sh-2*trim)]
   ])if(rw>0&&rh>0)out+=rect(rx,ry,rw,rh,true);
   if(sheet.usableWidth>0&&sheet.usableLength>0)
    out+='0.48 0.49 0.5 RG\n0.55 w\n[2 2] 0 d\n'+
     rect(left+trim,top-sh+trim,sw-2*trim,sh-2*trim)+'[] 0 d\n';
  }
  // Draw every panel at full-sheet scale. Use the full coordinate when it fits
  // legibly and otherwise a short number that refers to the adjacent key.
  for(const [i,p] of rows.entries()){
   const px=left+p.x*scale,py=top-(p.y+p.cutLength)*scale,
    pw=p.cutWidth*scale,ph=p.cutLength*scale;
   out+=(i%2?'0.88 0.80 0.64 rg\n':'0.76 0.86 0.79 rg\n')+rect(px,py,pw,ph,true);
   out+='0.36 0.43 0.47 RG\n0.7 w\n'+rect(px,py,pw,ph);
   const label=p.coordinate,fullSize=10;
   const canFull=pw>=label.length*fullSize*.61+10&&ph>=22;
   const marker=String(i+1);
   if(canFull){
    out+='0.09 0.13 0.16 rg\n'+txt(px+5,py+ph/2,fullSize,label,true);
   }else if(pw>=marker.length*7+7&&ph>=12){
    out+='0.09 0.13 0.16 rg\n'+txt(px+4,py+ph/2,10,marker,true);
   }
  }
  // Rough-cut envelopes are the centerlines of the simulated wide
  // kerf, half a kerf outside every finished panel. Clip at the sheet edge.
  if(plan.kerf>0){
   out+='q\n'+rect(left,top-sh,sw,sh).replace('S\n','W n\n');
   out+='0.7 0.12 0.16 RG\n0.9 w\n[4 3] 0 d\n';
   for(const part of rows){
    const rough=root.BottomSolver.roughCutFor(part,sheet,plan.kerf),r=rough.bounds;
    const x1=left+r.x*scale,x2=x1+r.width*scale;
    const y1=top-(r.y+r.length)*scale,y2=y1+r.length*scale;
    if(!rough.finalEdges.left)out+=line(x1,y1,x1,y2);
    if(!rough.finalEdges.right)out+=line(x2,y1,x2,y2);
    if(!rough.finalEdges.top)out+=line(x1,y2,x2,y2);
    if(!rough.finalEdges.bottom)out+=line(x1,y1,x2,y1);
   }
   out+='[] 0 d\nQ\n';
  }
  // Subtle edge-to-edge cut projections; not extra full-sheet saw cuts.
  const xs=new Set(),ys=new Set();
  for(const p of rows){
   const rx=p.x+p.cutWidth,ry=p.y+p.cutLength;
   if(rx>1e-6&&rx<sheet.width-1e-6)xs.add(rx.toFixed(5));
   if(ry>1e-6&&ry<sheet.length-1e-6)ys.add(ry.toFixed(5));
  }
  out+='0.76 0.76 0.76 RG\n0.35 w\n[2 2] 0 d\n';
  for(const v of xs){const x=left+Number(v)*scale;out+=line(x,top-sh,x,top);}
  for(const v of ys){const y=top-Number(v)*scale;out+=line(left,y,left+sw,y);}
  out+='[] 0 d\n0.45 0.48 0.5 RG\n0.9 w\n'+rect(left,top-sh,sw,sh);
  out+=numberedLegend(rows,sheet,0,Math.min(LEGEND_ROWS,rows.length));
  if(ripFirst){
   const strips=sheet.strips||[];
   // Compact, cut-order summary below the legend when it fits.
   let y=102;
   if(strips.length&&rows.length<=17){
    out+='0.2 0.27 0.3 rg\n'+txt(LEGEND_X,y,8,'Full-length rips:',true);y-=12;
    for(const strip of strips.slice(0,5)){
     out+=txt(LEGEND_X,y,7.5,'R'+strip.index+'  '+fmt(strip.width)+' wide x '+fmt(sheet.length)+' full length');y-=11;
    }
   }
  }
  pages.push(out);
  // Keep the diagram large, even when a very crowded sheet requires a
  // second page for its coordinate legend.
  for(let start=LEGEND_ROWS;start<rows.length;start+=LEGEND_ROWS){
   pages.push(pageHeader()+title(sheet,true)+
    '0.36 0.39 0.43 rg\n'+txt(LEFT,685,10,'PANEL KEY (continued from sheet diagram)')+
    numberedLegend(rows,sheet,start,Math.min(rows.length,start+LEGEND_ROWS)));
  }
 }
 if(plan?.unassigned?.length){
  const parts=plan.unassigned;
  for(let start=0;start<parts.length;start+=35){
   let out=pageHeader()+'0.58 0.19 0.16 rg\n'+txt(LEFT,704,13,'UNASSIGNED BOTTOMS: '+parts.length,true);
   for(let i=start;i<Math.min(start+35,parts.length);i++){
    const p=parts[i],y=680-(i-start)*17;
    out+='0.25 0.3 0.35 rg\n'+txt(LEFT,y,9,
     p.coordinate+'  '+fmt(p.width)+' x '+fmt(p.length)+'  '+fmt(p.thickness)+' thick');
   }
   pages.push(out);
  }
 }
 const objects=[''],add=s=>(objects.push(s),objects.length-1);
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const catalog=add(''),tree=add(''),pageIds=[],encoder=new TextEncoder();
 for(let i=0;i<pages.length;i++){
  const source=pages[i]+'0.4 0.4 0.4 rg\n'+txt(LEFT,25,8,'Drawer bottom plan  -  Page '+(i+1)+' of '+pages.length);
  const streamId=add('<< /Length '+encoder.encode(source).length+' >>\nstream\n'+source+'endstream');
  pageIds.push(add('<< /Type /Page /Parent '+tree+' 0 R /MediaBox [0 0 '+PAGE_W+' '+PAGE_H+'] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+streamId+' 0 R >>'));
 }
 objects[catalog]='<< /Type /Catalog /Pages '+tree+' 0 R >>';
 objects[tree]='<< /Type /Pages /Kids ['+pageIds.map(i=>i+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
 let output='%PDF-1.4\n',offsets=[0];
 for(let i=1;i<objects.length;i++){
  offsets[i]=encoder.encode(output).length;
  output+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
 }
 const xref=encoder.encode(output).length;
 output+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objects.length;i++)output+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 output+='trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return new Blob([encoder.encode(output)],{type:'application/pdf'});
}
root.BottomPdf={makePdf};
})(typeof window!=='undefined'?window:globalThis);
