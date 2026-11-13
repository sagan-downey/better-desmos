import Decimal from "decimal.js";

export function parseCSV(source:string):string[][]{
  if(source.length>2_000_000)throw new Error("CSV files must be at most 2 MB.");
  source=source.replace(/^\uFEFF/,"");
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false,closed=false;
  const cell=()=>{row.push(field);field="";closed=false;if(row.length>20)throw new Error("CSV supports at most 20 columns.");};
  const end=()=>{cell();rows.push(row);row=[];if(rows.length>5001)throw new Error("CSV supports at most 5000 data rows plus a header.");};
  for(let i=0;i<source.length;i++){
    const c=source[i]!;
    if(quoted){
      if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else field+=c;
    }else if(c===",")cell();
    else if(c==="\r"||c==="\n"){if(c==="\r"&&source[i+1]==="\n")i++;end();}
    else if(c==='"'&&!field&&!closed)quoted=true;
    else{if(closed||c==='"')throw new Error("Malformed CSV quoting.");field+=c;}
  }
  if(quoted)throw new Error("CSV has an unclosed quoted field.");
  if(field||row.length||closed)end();
  if(!rows.length)throw new Error("CSV is empty.");
  const width=rows[0]!.length;
  if(width<2)throw new Error("CSV requires at least two columns.");
  if(rows.some(r=>r.length!==width))throw new Error("Every CSV row must have the same number of columns.");
  if(rows.length*width>20020)throw new Error("CSV supports at most 20000 data cells plus headers.");
  return rows;
}

export function csvNumericCell(text:string):string{
  text=text.trim();
  if(!text)return "";
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)||!Number.isFinite(Number(text)))
    throw new Error(`CSV data must be finite numbers or empty cells; found "${text.slice(0,40)}".`);
  const number=new Decimal(text);
  if(Math.abs(number.e)>128)throw new Error("CSV number exceeds the 128-character table cell limit.");
  const result=number.toFixed();
  if(result.length>128)throw new Error("CSV number exceeds the 128-character table cell limit.");
  return result;
}

export function encodeCSV(rows:string[][]):string{
  return rows.map(row=>row.map(cell=>/[",\r\n]/.test(cell)?`"${cell.replace(/"/g,'""')}"`:cell).join(",")).join("\r\n")+"\r\n";
}
