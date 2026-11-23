/* Printable drawer-bottom sheet cutting diagram and cut list. */
(function(root){
'use strict';
const fmt=n=>root.InchMeasurements.format(n);
const esc=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?')
 .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const txt=(x,y,size,s,bold=false)=>'BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x.toFixed(2)+' '+y.toFixed(2)+' Tm ('+esc(s)+') Tj ET\n';
const rect=(x,y,w,h,fill=false)=>[x,y,w,h].map(n=>n.toFixed(2)).join(' ')+' re '+(fill?'f':'S')+'\n';
function makePdf(plan){
 const pages=[],W=792,H=612,margin=36, bottom=40;
 let stream='',y;
 function page(){
  if(stream)pages.push(stream);
  stream='0.13 0.18 0.23 rg\n'+txt(margin,570,18,'DRAWER BOTTOM SHEET CUTTING PLAN',true);
  stream+='0.4 0.45 0.5 rg\n'+txt(margin,549,9,'Dimensions in inches, rounded to 1/32. Cut widths include no kerf; allow saw kerf between parts.');
  y=530;
 }
 page();
 const sheets=(plan?.sheets||[]).filter(s=>s.placements.length);
 if(!sheets.length)stream+=txt(margin,510,12,'No assigned sheet cuts.');
 for(const sheet of sheets){
  const rows=sheet.placements;
  const chartHeight=220,chartWidth=420;
  if(y<chartHeight+95){page()}
  stream+='0.13 0.18 0.23 rg\n'+txt(margin,y,12,sheet.label+'  '+fmt(sheet.width)+' x '+fmt(sheet.length)+'  THICKNESS '+fmt(sheet.thickness),true);
  y-=19;
  if(plan.cutOrder==='rip-first'){
   stream+='0.25 0.32 0.3 rg\\n'+txt(margin,y,9,
    'RIP FIRST: full-length strips parallel to grain, then crosscut within each strip.',true);
   y-=13;
  }else{
   stream+='0.3 0.3 0.3 rg\\n'+txt(margin,y,8,'Alternate guillotine layout; see panel positions.');
   y-=13;
  }
  const scale=Math.min(chartWidth/sheet.width,chartHeight/sheet.length);
  const sw=sheet.width*scale,sl=sheet.length*scale,x=margin,top=y;
  stream+='0.62 0.65 0.67 RG\n0.8 w\n'+rect(x,top-sl,sw,sl);
  for(const [i,part] of rows.entries()){
   const px=x+part.x*scale,py=top-(part.y+part.cutLength)*scale,
     pw=part.cutWidth*scale,ph=part.cutLength*scale;
   stream+=(i%2?'0.87 0.79 0.62 rg\n':'0.79 0.87 0.78 rg\n')+rect(px,py,pw,ph,true);
   stream+='0.36 0.42 0.47 RG\n0.5 w\n'+rect(px,py,pw,ph);
   if(pw>=42&&ph>=18)stream+='0.18 0.19 0.18 rg\n'+txt(px+3,py+ph/2,8,part.coordinate,true);
  }
  // Faint full-sheet projections of cut boundaries to match the SVG.
  // These are visual guides; they are not instructions to cut full width.
  const verticalGuides=new Set(),horizontalGuides=new Set();
  for(const part of rows){
   const px=part.x+part.cutWidth,py=part.y+part.cutLength;
   if(px>1e-6&&px<sheet.width-1e-6)verticalGuides.add(px.toFixed(5));
   if(py>1e-6&&py<sheet.length-1e-6)horizontalGuides.add(py.toFixed(5));
  }
  stream+='0.77 0.77 0.77 RG\\n0.3 w\\n[2 2] 0 d\\n';
  for(const value of verticalGuides){
   const xx=x+Number(value)*scale;
   stream+=xx.toFixed(2)+' '+(top-sl).toFixed(2)+' m '+xx.toFixed(2)+' '+top.toFixed(2)+' l S\\n';
  }
  for(const value of horizontalGuides){
   const yy=top-Number(value)*scale;
   stream+=x.toFixed(2)+' '+yy.toFixed(2)+' m '+(x+sw).toFixed(2)+' '+yy.toFixed(2)+' l S\\n';
  }
  stream+='[] 0 d\\n';
  y=top-sl-19;
  if(plan.cutOrder==='rip-first'){
   for(const strip of sheet.strips){
    if(y<bottom+14){page();stream+='0.13 0.18 0.23 rg\\n'+txt(margin,y,11,sheet.label+' (continued)',true);y-=18}
    stream+='0.25 0.32 0.3 rg\\n'+txt(margin+4,y,9,
     'R'+strip.index+': rip '+fmt(strip.width)+' wide x '+fmt(sheet.length)+' full length; crosscut '+strip.placements.map(p=>fmt(p.cutLength)).join(', '));
    y-=13;
   }
   y-=5;
  }
  for(const part of rows){
   if(y<bottom+15){page();stream+='0.13 0.18 0.23 rg\n'+txt(margin,y,11,sheet.label+' (continued)',true);y-=18}
   stream+='0.2 0.23 0.27 rg\n'+txt(margin+4,y,9,part.coordinate,true)
     +txt(margin+100,y,9,fmt(part.width)+' x '+fmt(part.length))
     +txt(margin+255,y,9,part.label.slice(0,30))
     +txt(margin+485,y,9,'x '+fmt(part.x)+' / y '+fmt(part.y))
     +txt(margin+615,y,9,part.rotated?'ROTATED':'');
   y-=15;
  }
  y-=19;
 }
 if(plan?.unassigned?.length){
  if(y<80)page();
  stream+='0.55 0.19 0.17 rg\n'+txt(margin,y,12,'UNASSIGNED BOTTOMS: '+plan.unassigned.length,true);y-=18;
  for(const part of plan.unassigned){
   if(y<bottom+10)page();
   stream+=txt(margin,y,9,part.coordinate+'  '+fmt(part.width)+' x '+fmt(part.length)+'  '+fmt(part.thickness)+' thick');y-=13;
  }
 }
 pages.push(stream);
 const objects=[''],add=s=>(objects.push(s),objects.length-1);
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const catalog=add(''),tree=add(''),pageIds=[],encoder=new TextEncoder();
 for(let i=0;i<pages.length;i++){
  const content=pages[i]+'0.4 0.4 0.4 rg\n'+txt(margin,22,8,'Drawer bottom plan  -  Page '+(i+1)+' of '+pages.length);
  const data=add('<< /Length '+encoder.encode(content).length+' >>\nstream\n'+content+'endstream');
  pageIds.push(add('<< /Type /Page /Parent '+tree+' 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+data+' 0 R >>'));
 }
 objects[catalog]='<< /Type /Catalog /Pages '+tree+' 0 R >>';
 objects[tree]='<< /Type /Pages /Kids ['+pageIds.map(i=>i+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
 let output='%PDF-1.4\n',offsets=[0];
 for(let i=1;i<objects.length;i++){offsets[i]=encoder.encode(output).length;output+=i+' 0 obj\n'+objects[i]+'\nendobj\n'}
 const xref=encoder.encode(output).length;
 output+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objects.length;i++)output+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 output+='trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return new Blob([encoder.encode(output)],{type:'application/pdf'});
}
root.BottomPdf={makePdf};
})(typeof window!=='undefined'?window:globalThis);
