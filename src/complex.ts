export interface Complex { re: number; im: number }
export const COMPLEX_FUNCTIONS = ["real","imag","conj","arg"] as const;
export const complex = (re: number, im = 0): Complex => {
  if(!Number.isFinite(re)||!Number.isFinite(im))throw new Error("Complex result is undefined or exceeds the supported numeric range.");
  return {re:re===0?0:re,im:im===0?0:im};
};
export const add=(a:Complex,b:Complex)=>complex(a.re+b.re,a.im+b.im);
export const neg=(a:Complex)=>complex(-a.re,-a.im);
export const sub=(a:Complex,b:Complex)=>add(a,neg(b));
export const mul=(a:Complex,b:Complex)=>complex(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
export function div(a:Complex,b:Complex):Complex{
  if(b.re===0&&b.im===0)throw new Error("Division by zero.");
  if(Math.abs(b.re)>=Math.abs(b.im)){
    const r=b.im/b.re,d=1+r*r;
    return complex((a.re/b.re+(a.im/b.re)*r)/d,(a.im/b.re-(a.re/b.re)*r)/d);
  }
  const r=b.re/b.im,d=1+r*r;
  return complex(((a.re/b.im)*r+a.im/b.im)/d,((a.im/b.im)*r-a.re/b.im)/d);
}
export function log(a:Complex):Complex{
  if(a.re===0&&a.im===0)throw new Error("Complex logarithm is undefined at zero.");
  const scale=Math.max(Math.abs(a.re),Math.abs(a.im));
  return complex(Math.log(scale)+Math.log(Math.hypot(a.re/scale,a.im/scale)),Math.atan2(a.im,a.re));
}
export const exp=(a:Complex)=>complex(Math.exp(a.re)*Math.cos(a.im),Math.exp(a.re)*Math.sin(a.im));
export function pow(a:Complex,b:Complex):Complex{
  if(a.re===0&&a.im===0){
    if(b.im===0&&b.re>0)return complex(0);
    if(b.im===0&&b.re===0)return complex(1);
    throw new Error("This power of zero is undefined.");
  }
  if(b.im===0&&Number.isSafeInteger(b.re)&&Math.abs(b.re)<=100000){
    let result=complex(1),base=a,n=Math.abs(b.re);
    while(n>0){if(n%2)result=mul(result,base);n=Math.floor(n/2);if(n)base=mul(base,base);}
    return b.re<0?div(complex(1),result):result;
  }
  return exp(mul(b,log(a)));
}
export function sqrt(a:Complex):Complex{
  const r=Math.hypot(a.re,a.im);
  if(a.re>=0){const re=Math.sqrt(r/2+a.re/2);return complex(re,re===0?0:a.im/(2*re));}
  const im=(a.im<0?-1:1)*Math.sqrt(r/2-a.re/2);
  return complex(a.im/(2*im),im);
}
const i=complex(0,1),one=complex(1);
export function complexFunction(name:string,a:Complex,degrees=false):Complex{
  if(name==="real")return complex(a.re);
  if(name==="imag")return complex(a.im);
  if(name==="conj")return complex(a.re,-a.im);
  if(name==="abs")return complex(Math.hypot(a.re,a.im));
  if(name==="arg"){
    if(a.re===0&&a.im===0)throw new Error("Argument is undefined at zero.");
    return complex(Math.atan2(a.im,a.re)*(degrees?180/Math.PI:1));
  }
  if(name==="sqrt")return sqrt(a);
  if(name==="exp")return exp(a);
  if(name==="ln")return log(a);
  if(name==="log")return div(log(a),complex(Math.LN10));
  const aliases:Record<string,string>={arcsin:"asin",arccos:"acos",arctan:"atan",arcsinh:"asinh",arccosh:"acosh",arctanh:"atanh"};
  name=aliases[name]??name;
  if(["sin","cos","tan","sec","csc","cot"].includes(name)){
    const z=degrees?mul(a,complex(Math.PI/180)):a;
    const sin=complex(Math.sin(z.re)*Math.cosh(z.im),Math.cos(z.re)*Math.sinh(z.im));
    const cos=complex(Math.cos(z.re)*Math.cosh(z.im),-Math.sin(z.re)*Math.sinh(z.im));
    return name==="sin"?sin:name==="cos"?cos:name==="tan"?div(sin,cos):name==="sec"?div(one,cos):name==="csc"?div(one,sin):div(cos,sin);
  }
  if(["sinh","cosh","tanh","sech","csch","coth"].includes(name)){
    const sinh=complex(Math.sinh(a.re)*Math.cos(a.im),Math.cosh(a.re)*Math.sin(a.im));
    const cosh=complex(Math.cosh(a.re)*Math.cos(a.im),Math.sinh(a.re)*Math.sin(a.im));
    return name==="sinh"?sinh:name==="cosh"?cosh:name==="tanh"?div(sinh,cosh):name==="sech"?div(one,cosh):name==="csch"?div(one,sinh):div(cosh,sinh);
  }
  let result:Complex;
  if(name==="asin"&&a.re<0)return neg(complexFunction("asin",neg(a),degrees));
  if(name==="asin")result=mul(neg(i),log(add(mul(i,a),sqrt(sub(one,mul(a,a))))));
  else if(name==="acos")result=sub(complex(Math.PI/2),complexFunction("asin",a));
  else if(name==="atan")result=mul(complex(0,0.5),sub(log(sub(one,mul(i,a))),log(add(one,mul(i,a)))));
  else if(name==="asinh")return a.re<0?neg(complexFunction("asinh",neg(a))):log(add(a,sqrt(add(mul(a,a),one))));
  else if(name==="acosh")return log(add(a,mul(sqrt(add(a,one)),sqrt(sub(a,one)))));
  else if(name==="atanh")return mul(complex(0.5),sub(log(add(one,a)),log(sub(one,a))));
  else if(["arcsec","arccsc","arccot"].includes(name))return complexFunction(name==="arcsec"?"acos":name==="arccsc"?"asin":"atan",div(one,a),degrees);
  else if(["arcsech","arccsch","arccoth"].includes(name))return complexFunction(name==="arcsech"?"acosh":name==="arccsch"?"asinh":"atanh",div(one,a));
  else throw new Error(`"${name}" does not support nonreal arguments.`);
  return degrees?mul(result,complex(180/Math.PI)):result;
}
export function integrateComplex(evaluate:(x:number)=>Complex,lower:number,upper:number):Complex{
  if(!Number.isFinite(lower)||!Number.isFinite(upper))throw new Error("Complex integral bounds must be finite.");
  if(lower===upper)return complex(0);
  let evaluations=0;
  const sample=(x:number)=>{
    if(++evaluations>20000)throw new Error("Complex integral did not converge within 20000 evaluations.");
    return evaluate(x);
  };
  const simpson=(a:number,b:number,fa:Complex,fm:Complex,fb:Complex)=>mul(add(add(fa,mul(complex(4),fm)),fb),complex((b-a)/6));
  const integrate=(a:number,b:number,fa:Complex,fm:Complex,fb:Complex,whole:Complex,tolerance:number,depth:number):Complex=>{
    const middle=a/2+b/2,fl=sample(a/2+middle/2),fr=sample(middle/2+b/2);
    const left=simpson(a,middle,fa,fl,fm),right=simpson(middle,b,fm,fr,fb),difference=sub(add(left,right),whole);
    if(Math.hypot(difference.re,difference.im)<=15*tolerance)return add(add(left,right),div(difference,complex(15)));
    if(depth===0)throw new Error("Complex integral did not converge.");
    return add(integrate(a,middle,fa,fl,fm,left,tolerance/2,depth-1),integrate(middle,b,fm,fr,fb,right,tolerance/2,depth-1));
  };
  const fa=sample(lower),fm=sample(lower/2+upper/2),fb=sample(upper);
  return integrate(lower,upper,fa,fm,fb,simpson(lower,upper,fa,fm,fb),1e-12,24);
}
export function formatComplex(value:Complex):string{
  const re=Number(value.re.toPrecision(12)),im=Number(value.im.toPrecision(12));
  return im===0?String(re):re===0?`${im}i`:`${re} ${im<0?"-":"+"} ${Math.abs(im)}i`;
}
