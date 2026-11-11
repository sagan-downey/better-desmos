export function numericSource(value:number):string{
  if(!Number.isFinite(value))throw new Error("Expression values must be finite.");
  const text=String(value),match=/^(.*)e([+-]?\d+)$/i.exec(text);
  return match?`(${match[1]}*10^(${Number(match[2])}))`:text;
}
