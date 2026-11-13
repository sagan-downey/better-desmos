import type { Node } from "./math";

type Rat={n:bigint;d:bigint};
export function normalizeSymbolic(n:Node):Node{
  if(n.type==="multicall"&&n.args.length===1)return {type:"call",name:n.name,argument:normalizeSymbolic(n.args[0]!)};
  if(n.type==="binary")return {...n,left:normalizeSymbolic(n.left),right:normalizeSymbolic(n.right)};
  if(n.type==="unary")return {...n,operand:normalizeSymbolic(n.operand)};
  return n;
}
const gcd=(a:bigint,b:bigint):bigint=>{a=a<0n?-a:a;while(b){[a,b]=[b,a%b];}return a;};
function rat(n:bigint,d=1n):Rat{
  if(!d)throw new Error("Symbolic division by zero.");
  if(n.toString().length>2048||d.toString().length>2048)throw new Error("Symbolic rational arithmetic exceeds the 2048-digit work limit.");
  if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};
}
const add=(a:Rat,b:Rat)=>rat(a.n*b.d+b.n*a.d,a.d*b.d);
const mul=(a:Rat,b:Rat)=>rat(a.n*b.n,a.d*b.d);
const neg=(a:Rat)=>rat(-a.n,a.d);
const number=(r:Rat):Node=>({type:"number",value:{kind:"rational",numerator:r.n,denominator:r.d}});
const zero=()=>number(rat(0n)),one=()=>number(rat(1n));
const value=(n:Node):Rat|undefined=>n.type==="number"?rat(n.value.numerator,n.value.denominator):undefined;
const is=(n:Node,v:bigint)=>{const r=value(n);return r?.n===v&&r.d===1n;};
const binary=(operator:"+"|"-"|"*"|"/"|"^",left:Node,right:Node):Node=>({type:"binary",operator,left,right});
const call=(name:string,argument:Node):Node=>({type:"call",name,argument});

function supported(n:Node):void{
  if(n.type==="number"||n.type==="variable"||n.type==="constant")return;
  if(n.type==="unary"){supported(n.operand);return;}
  if(n.type==="binary"){supported(n.left);supported(n.right);return;}
  if(n.type==="call"&&["sin","cos","tan","exp","ln","sqrt","abs"].includes(n.name)){supported(n.argument);return;}
  throw new Error("Symbolic tools support arithmetic, powers, sin/cos/tan, exp, ln, sqrt, and abs; other notation is unsupported.");
}

export function simplifyNode(n:Node):Node{
  supported(n);
  if(n.type==="unary"){
    const operand=simplifyNode(n.operand),r=value(operand);
    if(n.operator==="+")return operand;
    if(r)return number(neg(r));
    if(operand.type==="unary"&&operand.operator==="-")return operand.operand;
    return {...n,operand};
  }
  if(n.type==="call")return {...n,argument:simplifyNode(n.argument)};
  if(n.type!=="binary")return n;
  const left=simplifyNode(n.left),right=simplifyNode(n.right),a=value(left),b=value(right);
  if(a&&b){
    if(n.operator==="+")return number(add(a,b));
    if(n.operator==="-")return number(add(a,neg(b)));
    if(n.operator==="*")return number(mul(a,b));
    if(n.operator==="/")return number(mul(a,rat(b.d,b.n)));
    if(b.d===1n&&b.n>=-100n&&b.n<=100n){
      if(a.n===0n&&b.n<=0n)throw new Error("Zero to a nonpositive power is not simplified.");
      if(Math.max(a.n.toString().length,a.d.toString().length)*Number(b.n<0n?-b.n:b.n)>2048)
        throw new Error("Symbolic power exceeds the 2048-digit work limit.");
      return number(b.n<0n?rat(a.d**(-b.n),a.n**(-b.n)):rat(a.n**b.n,a.d**b.n));
    }
  }
  if((n.operator==="+"||n.operator==="-")&&is(right,0n))return left;
  if(n.operator==="+"&&is(left,0n))return right;
  if((n.operator==="*"||n.operator==="/")&&is(right,1n))return left;
  if(n.operator==="*"&&is(left,1n))return right;
  if(n.operator==="^"&&is(right,1n))return left;
  if(n.operator==="+"||n.operator==="-"){
    const term=(node:Node):{coefficient:Rat;body:Node}=>{
      if(node.type==="binary"&&node.operator==="*"){
        const a=value(node.left),b=value(node.right);
        if(a)return {coefficient:a,body:node.right};
        if(b)return {coefficient:b,body:node.left};
      }
      return {coefficient:rat(1n),body:node};
    };
    const a=term(left),b=term(right);
    if(symbolicSource(a.body)===symbolicSource(b.body)){
      const coefficient=add(a.coefficient,n.operator==="+"?b.coefficient:neg(b.coefficient));
      return coefficient.n===coefficient.d?a.body:binary("*",number(coefficient),a.body);
    }
  }
  if(n.operator==="*"&&symbolicSource(left)===symbolicSource(right))
    return binary("^",left,number(rat(2n)));
  return {...n,left,right};
}

export function symbolicSource(n:Node):string{
  switch(n.type){
    case "number":return n.value.denominator===1n?String(n.value.numerator):`(${n.value.numerator}/${n.value.denominator})`;
    case "variable":return n.name;
    case "constant":return n.value;
    case "unary":return `(${n.operator}${symbolicSource(n.operand)})`;
    case "binary":return `(${symbolicSource(n.left)}${n.operator}${symbolicSource(n.right)})`;
    case "call":return `${n.name}(${symbolicSource(n.argument)})`;
    default:throw new Error("Unsupported symbolic notation.");
  }
}

export function symbolicDerivative(n:Node,variable:string,degrees:boolean):Node{
  n=simplifyNode(n);
  supported(n);
  const depends=(n:Node):boolean=>n.type==="variable"?n.name===variable:
    n.type==="unary"?depends(n.operand):n.type==="binary"?depends(n.left)||depends(n.right):
    n.type==="call"?depends(n.argument):false;
  const product=(a:Node,b:Node)=>is(a,0n)||is(b,0n)?zero():binary("*",a,b);
  const derivative=(n:Node):Node=>{
    if(!depends(n))return zero();
    if(n.type==="variable")return one();
    if(n.type==="unary")return {...n,operand:derivative(n.operand)};
    if(n.type==="binary"){
      const {left:a,right:b,operator:op}=n,da=derivative(a),db=derivative(b);
      if(op==="+"||op==="-")return binary(op,da,db);
      if(op==="*")return binary("+",product(da,b),product(a,db));
      if(op==="/")return binary("/",binary("-",product(da,b),product(a,db)),binary("^",b,number(rat(2n))));
      const exponent=value(b);
      if(exponent)return product(product(b,binary("^",a,number(add(exponent,rat(-1n))))),da);
      throw new Error("Symbolic differentiation currently requires constant rational exponents.");
    }
    if(n.type==="call"){
      const u=n.argument,du=derivative(u);
      const angle=degrees?binary("/",{type:"constant",value:"pi"},number(rat(180n))):one();
      if(n.name==="sin")return product(product(angle,call("cos",u)),du);
      if(n.name==="cos")return product(product(angle,{type:"unary",operator:"-",operand:call("sin",u)}),du);
      if(n.name==="tan")return product(binary("/",angle,binary("^",call("cos",u),number(rat(2n)))),du);
      if(n.name==="exp")return product(call("exp",u),du);
      if(n.name==="ln")return binary("/",du,u);
      if(n.name==="sqrt")return binary("/",du,binary("*",number(rat(2n)),call("sqrt",u)));
      throw new Error("Symbolic derivative of abs is unsupported at its nondifferentiable points.");
    }
    throw new Error("Unsupported symbolic derivative.");
  };
  return simplifyNode(derivative(n));
}

export function factorPolynomial(tree:Node,variable:string):string{
  const trim=(p:Rat[])=>{while(p.length>1&&p.at(-1)!.n===0n)p.pop();return p;};
  const plus=(a:Rat[],b:Rat[])=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>add(a[i]??rat(0n),b[i]??rat(0n))));
  const times=(a:Rat[],b:Rat[])=>{
    if(a.length+b.length>10)throw new Error("Factoring supports degree at most 8.");
    const p=Array.from({length:a.length+b.length-1},()=>rat(0n));
    a.forEach((v,i)=>b.forEach((w,j)=>{p[i+j]=add(p[i+j]!,mul(v,w));}));return trim(p);
  };
  const polynomial=(n:Node):Rat[]=>{
    const r=value(n);if(r)return [r];
    if(n.type==="variable"&&n.name===variable)return [rat(0n),rat(1n)];
    if(n.type==="unary")return polynomial(n.operand).map(r=>n.operator==="-"?neg(r):r);
    if(n.type==="binary"){
      const a=polynomial(n.left);
      if(n.operator==="^"){
        const exponent=value(n.right);
        if(!exponent||exponent.d!==1n||exponent.n<0n||exponent.n>8n)throw new Error("Polynomial exponents must be integers from 0 to 8.");
        let result=[rat(1n)];for(let i=0n;i<exponent.n;i++)result=times(result,a);return result;
      }
      const b=polynomial(n.right);
      if(n.operator==="+")return plus(a,b);
      if(n.operator==="-")return plus(a,b.map(neg));
      if(n.operator==="*")return times(a,b);
      if(b.length===1)return a.map(v=>mul(v,rat(b[0]!.d,b[0]!.n)));
    }
    throw new Error("Factoring requires a polynomial in one variable with rational coefficients.");
  };
  let coefficients=trim(polynomial(tree));
  const factors:string[]=[];
  const text=(r:Rat)=>symbolicSource(number(r));
  const divisors=(n:bigint)=>{
    n=n<0n?-n:n;
    if(n>1000000n)throw new Error("Polynomial coefficients exceed the bounded rational-root search (1000000).");
    const result:bigint[]=[];for(let i=1n;i*i<=n;i++)if(n%i===0n){result.push(i);if(i*i!==n)result.push(n/i);}
    return result;
  };
  while(coefficients.length>1){
    let root:Rat|undefined;
    if(coefficients[0]!.n===0n)root=rat(0n);
    else {
      let denominator=1n;
      for(const r of coefficients)denominator=denominator/gcd(denominator,r.d)*r.d;
      let integers=coefficients.map(r=>r.n*(denominator/r.d));
      const common=integers.reduce((a,b)=>gcd(a,b),0n);
      integers=integers.map(n=>n/common);
      const numerators=divisors(integers[0]!),denominators=divisors(integers.at(-1)!);
      if(numerators.length*denominators.length>20000)throw new Error("Polynomial rational-root work limit exceeded.");
      search:for(const p of numerators)for(const q of denominators)for(const sign of [1n,-1n]){
        const candidate=rat(sign*p,q);
        const result=coefficients.reduceRight((sum,r)=>add(mul(sum,candidate),r),rat(0n));
        if(result.n===0n){root=candidate;break search;}
      }
    }
    if(!root)throw new Error("No further rational linear factors found; irrational/complex factors are not supported.");
    factors.push(root.n<0n?`(${variable}+${text(neg(root))})`:`(${variable}-${text(root)})`);
    const quotient:Rat[]=Array.from({length:coefficients.length-1},()=>rat(0n));
    quotient[quotient.length-1]=coefficients.at(-1)!;
    for(let i=quotient.length-2;i>=0;i--)quotient[i]=add(coefficients[i+1]!,mul(root,quotient[i+1]!));
    coefficients=trim(quotient);
  }
  return [...(coefficients[0]!.n===coefficients[0]!.d&&factors.length?[]:[text(coefficients[0]!)]),...factors].join("*");
}
