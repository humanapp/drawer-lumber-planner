/* Printable cutting plan: proportional crosscut bars plus exact per-lane dimensions. */
(function(root){
'use strict';
const PW=792,PH=612,L=38,R=754,TOP=566,BOTTOM=38,W=R-L;
const ascii=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
const escaped=s=>ascii(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const number=n=>Number(n).toFixed(2);
const text=(x,y,size,str,bold=false)=>'BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x.toFixed(2)+' '+y.toFixed(2)+' Tm ('+escaped(str)+') Tj ET\n';
const rect=(x,y,w,h,stroke=false)=>x.toFixed(2)+' '+y.toFixed(2)+' '+Math.max(0,w).toFixed(2)+' '+Math.max(0,h).toFixed(2)+' re '+(stroke?'S':'f')+'\n';
const line=(x,y,a,b)=>x.toFixed(2)+' '+y.toFixed(2)+' m '+a.toFixed(2)+' '+b.toFixed(2)+' l S\n';
function makePdf(plan){
 const boards=plan?.boards||[],pages=[];
 let stream='',y=0;
 function newPage(){
  if(stream)pages.push(stream);
  stream='0.13 0.18 0.23 rg\n'+text(L,TOP,19,'CROSSCUT ASSIGNMENT PLAN',true);
  stream+='0.37 0.42 0.46 rg\n'+text(L,TOP-21,9,'All dimensions in inches. Crosscut full-width first, rip strips, then trim to specified lengths.');
  stream+='0.73 0.75 0.77 RG\n0.6 w\n'+line(L,TOP-31,R,TOP-31);
  y=TOP-53;
 }
 function boardHeader(board,continued){
  stream+='0.13 0.18 0.23 rg\n'+text(L,y,12,board.id+'  '+(board.label===board.id?'':board.label+'  ')+number(board.width)+'" W x '+number(board.length)+'" L'+(continued?'  (continued)':''),true);
  y-=16;
 }
 function drawBoard(board){
  const height=Math.max(21,Math.min(42,board.width*3.3));
  const base=y-46,scale=W/Math.max(1,board.length);
  stream+='0.79 0.69 0.53 rg\n0.48 0.39 0.27 RG\n0.7 w\n'+rect(L,base,W,height);
  stream+=rect(L,base,W,height,true);
  const trim=Math.max(0,(board.width-board.usableWidth)/2);
  for(let i=0;i<board.cuts.length;i++){
   const cut=board.cuts[i],x=L+cut.start*scale,w=cut.length*scale;
   stream+=(i%2?'0.82 0.68 0.49 rg\n':'0.88 0.76 0.58 rg\n')+rect(x,base,w,height);
   for(const lane of cut.lanes){
    const ly=base+height-(trim+lane.offset+lane.width)/board.width*height;
    const lh=lane.width/board.width*height;
    stream+='0.42 0.32 0.21 RG\n0.5 w\n'+rect(x,ly,w,lh,true);
    if(w>43&&lh>10){
     const size=Math.min(8,Math.max(6,Math.min(lh-3,w/(lane.coordinate.length*.66+1))));
     stream+='0.15 0.12 0.09 rg\n'+text(x+3,ly+Math.max(2,lh/2-size/2),size,lane.coordinate,true);
    }
   }
   if(w>31)stream+='0.17 0.14 0.1 rg\n'+text(x+2,base+height+5,7,'C'+(i+1));
  }
  stream+='0.34 0.39 0.43 rg\n'+text(L,base-13,8,'Uncut tail: '+number(board.available)+'"    Usable width after edge trim: '+number(board.usableWidth)+'"');
  y=base-26;
 }
 function tableHeader(){
  stream+='0.84 0.86 0.88 rg\n'+rect(L,y-8,W,18);
  stream+='0.14 0.19 0.24 rg\n'+text(L+5,y-2,8,'CUT',true)+text(L+55,y-2,8,'CROSSCUT LENGTH',true)+text(L+165,y-2,8,'PANEL COORDINATE',true)
   +text(L+327,y-2,8,'STRIP WIDTH',true)+text(L+423,y-2,8,'TRIM-TO LENGTH',true)+text(L+548,y-2,8,'DRAWER',true);
  y-=22;
 }
 newPage();
 if(!boards.length)stream+=text(L,TOP-72,11,'No measured boards entered.');
 for(const board of boards){
  const rows=board.cuts.flatMap((cut,i)=>cut.lanes.map(lane=>({cut,cutNo:i+1,lane})));
  const diagramHeight=Math.max(21,Math.min(42,board.width*3.3))+85;
  if(y-diagramHeight-40<BOTTOM)newPage();
  boardHeader(board,false);
  drawBoard(board);
  tableHeader();
  if(!rows.length){
   stream+='0.40 0.44 0.47 rg\n'+text(L+5,y,9,'No cuts assigned to this board.');
   y-=22;
  }
  for(const row of rows){
   if(y-15<BOTTOM){
    newPage();boardHeader(board,true);tableHeader();
   }
   const lane=row.lane;
   stream+='0.15 0.18 0.22 rg\n'+text(L+5,y,9,'C'+row.cutNo)
    +text(L+55,y,9,number(row.cut.length)+'"')
    +text(L+165,y,9,lane.coordinate,true)
    +text(L+327,y,9,number(lane.width)+'"',true)
    +text(L+423,y,9,number(lane.length)+'"')
    +text(L+548,y,8,String(lane.drawerLabel||'').slice(0,30));
   stream+='0.83 0.85 0.87 RG\n0.35 w\n'+line(L,y-5,R,y-5);
   y-=17;
  }
  y-=19;
 }
 if(plan?.unassigned?.length){
  if(y-62<BOTTOM)newPage();
  stream+='0.55 0.16 0.16 rg\n'+text(L,y,12,plan.unassigned.length+' UNASSIGNED PANELS',true);
  y-=17;
  for(const part of plan.unassigned){
   if(y-15<BOTTOM)newPage();
   stream+='0.23 0.20 0.20 rg\n'+text(L+4,y,9,part.coordinate+'  '+number(part.width)+'" W x '+number(part.length)+'" L   '+part.drawerLabel);
   y-=14;
  }
 }
 pages.push(stream);
 const objects=[''],add=v=>(objects.push(v),objects.length-1);
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const catalog=add(''),pageTree=add(''),ids=[];
 for(let i=0;i<pages.length;i++){
  const content=pages[i]+'0.43 0.47 0.5 rg\n'+text(L,22,8,'Crosscut assignment plan   |   Page '+(i+1)+' of '+pages.length);
  const bytes=new TextEncoder().encode(content);
  const body=add('<< /Length '+bytes.length+' >>\nstream\n'+content+'endstream');
  ids.push(add('<< /Type /Page /Parent '+pageTree+' 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+body+' 0 R >>'));
 }
 objects[catalog]='<< /Type /Catalog /Pages '+pageTree+' 0 R >>';
 objects[pageTree]='<< /Type /Pages /Kids ['+ids.map(i=>i+' 0 R').join(' ')+'] /Count '+ids.length+' >>';
 let output='%PDF-1.4\n';
 const encoder=new TextEncoder(),offsets=[0];
 for(let i=1;i<objects.length;i++){offsets[i]=encoder.encode(output).length;output+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=encoder.encode(output).length;
 output+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objects.length;i++)output+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 output+='trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return new Blob([encoder.encode(output)],{type:'application/pdf'});
}
root.CrosscutPdf={makePdf};
})(typeof window!=='undefined'?window:globalThis);
