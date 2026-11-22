/* Display-only inch measurements, rounded to the nearest sixteenth. */
(function(root){
 'use strict';
 function format(value){
  const n=Number(value);
  if(!Number.isFinite(n))return '—';
  const negative=n<0?'-':'';
  const sixteenths=Math.round(Math.abs(n)*16);
  const whole=Math.floor(sixteenths/16),remainder=sixteenths%16;
  if(!remainder)return negative+whole+'"';
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  const divisor=gcd(remainder,16);
  return negative+(whole?whole+'-':'')+(remainder/divisor)+'/'+(16/divisor)+'"';
 }
 root.InchMeasurements={format};
})(typeof window!=='undefined'?window:globalThis);
