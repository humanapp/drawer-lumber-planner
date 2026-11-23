/* Inch formatting and editing. Keep decimal numbers in project JSON. */
(function(root){
 'use strict';
 const DENOMINATOR=32;
 const round32=value=>Math.round(Number(value)*DENOMINATOR)/DENOMINATOR;
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 function mixed(value,separator){
  const n=Number(value);
  if(!Number.isFinite(n))return '—';
  const negative=n<0?'-':'',units=Math.round(Math.abs(n)*DENOMINATOR);
  const whole=Math.floor(units/DENOMINATOR),remainder=units%DENOMINATOR;
  if(!remainder)return negative+whole+'"';
  const divisor=gcd(remainder,DENOMINATOR);
  return negative+(whole?whole+separator:'')+
   remainder/divisor+'/'+DENOMINATOR/divisor+'"';
 }
 // Existing diagram style uses a hyphen in mixed numbers.
 const format=value=>mixed(value,'-');
 // Input boxes use a space, matching conventional inch notation.
 const formatInput=value=>mixed(value,' ');
 function parse(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?round32(value):null;
  if(typeof value!=='string')return null;
  const s=value.trim().replace(/[″”]/g,'"').replace(/\s*"\s*$/,'').trim();
  if(!s)return null;
  let result;
  const decimal=s.match(/^(?:\d+(?:\.\d*)?|\.\d+)$/);
  if(decimal){
   result=Number(s);
  }else{
   // Supports "5 1/2", "5-1/2", "5/16", optional inch mark.
   const fraction=s.match(/^(?:(\d+)(?:\s+|\s*-\s*))?(\d+)\s*\/\s*(\d+)$/);
   if(!fraction)return null;
   const whole=Number(fraction[1]||0),numerator=Number(fraction[2]),
    denominator=Number(fraction[3]);
   if(!denominator||numerator>=denominator)return null;
   result=whole+numerator/denominator;
  }
  return Number.isFinite(result)&&result>=0?round32(result):null;
 }
 root.InchMeasurements={format,formatInput,parse,round32};
})(typeof window!=='undefined'?window:globalThis);
