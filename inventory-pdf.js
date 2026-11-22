/* Printable measured-lumber inventory. Self-contained PDF writer: no network or library dependency. */
(function(root){
 'use strict';
 const PAGE_W=612,PAGE_H=792,LEFT=44,RIGHT=568,TOP=740,ROWS_PER_PAGE=17,ROW_H=34;
 const ascii=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
 const pdfText=s=>ascii(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
 const fmt=value=>root.InchMeasurements.format(value);
 const text=(x,y,size,value,bold=false)=>'BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x+' '+y+' Tm ('+pdfText(value)+') Tj ET\n';
 const line=(x1,y1,x2,y2)=>x1+' '+y1+' m '+x2+' '+y2+' l S\n';
 function makePdf(boards){
  const entries=Array.isArray(boards)?boards:[];
  const pages=Math.max(1,Math.ceil(entries.length/ROWS_PER_PAGE));
  const objects=['']; // 1-based
  const push=s=>(objects.push(s),objects.length-1);
  const font=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const catalog=push('');
  const pageTree=push('');
  const pageIds=[];
  for(let pageNo=0;pageNo<pages;pageNo++){
   const start=pageNo*ROWS_PER_PAGE;
   const rows=entries.slice(start,start+ROWS_PER_PAGE);
   let stream='0.14 0.19 0.26 rg\n'+text(LEFT,TOP,20,'MEASURED LUMBER INVENTORY',true);
   stream+='0.33 0.39 0.45 rg\n'+text(LEFT,TOP-24,10,'4/4 SAB hard maple  |  Dimensions in inches');
   stream+=text(LEFT,TOP-43,10,entries.length+' boards  |  '+(entries.reduce((sum,b)=>sum+(Number(b.width)||0)*(Number(b.length)||0),0)/144).toFixed(2)+' BF measured (nominal 4/4)');
   stream+='0.12 0.19 0.26 RG\n0.7 w\n';
   const headerY=TOP-76;
   stream+=line(LEFT,headerY,RIGHT,headerY);
   stream+='0.18 0.24 0.32 rg\n';
   stream+=text(LEFT+6,headerY+10,10,'BOARD ID',true);
   stream+=text(178,headerY+10,10,'LABEL',true);
   stream+=text(377,headerY+10,10,'WIDTH',true);
   stream+=text(451,headerY+10,10,'LENGTH',true);
   stream+=text(529,headerY+10,10,'MARKED',true);
   for(let i=0;i<rows.length;i++){
    const b=rows[i],y=headerY-(i+1)*ROW_H;
    stream+='0.76 0.79 0.82 RG\n0.4 w\n'+line(LEFT,y,RIGHT,y);
    stream+='0.08 0.13 0.18 rg\n'+text(LEFT+6,y+10,16,String(b.id||'B'+(start+i+1)),true);
    const label=String(b.label||'');
    const id=String(b.id||'');
    if(label&&label!==id)stream+=text(178,y+13,10,label.length>33?label.slice(0,32)+'...':label);
    stream+=text(377,y+13,11,fmt(b.width));
    stream+=text(451,y+13,11,fmt(b.length));
    stream+='0.35 0.39 0.44 RG\n0.8 w\n540 '+(y+10)+' 13 13 re S\n';
   }
   if(!entries.length)stream+='0.45 0.48 0.52 rg\n'+text(LEFT+6,headerY-45,11,'No measured boards entered.');
   stream+='0.45 0.48 0.52 rg\n'+text(LEFT,43,9,'Board ID is the stable identifier used by the cut-stock solver.');
   stream+=text(493,43,9,'Page '+(pageNo+1)+' / '+pages);
   const bytes=new TextEncoder().encode(stream);
   const content=push('<< /Length '+bytes.length+' >>\nstream\n'+stream+'endstream');
   const id=push('<< /Type /Page /Parent '+pageTree+' 0 R /MediaBox [0 0 '+PAGE_W+' '+PAGE_H+'] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+content+' 0 R >>');
   pageIds.push(id);
  }
  objects[catalog]='<< /Type /Catalog /Pages '+pageTree+' 0 R >>';
  objects[pageTree]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
  let output='%PDF-1.4\n',offsets=[0];
  const encoder=new TextEncoder();
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
 root.InventoryPdf={makePdf};
})(typeof window!=='undefined'?window:globalThis);
