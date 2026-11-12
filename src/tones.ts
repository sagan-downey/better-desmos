import { compileExpression, freeIdentifiers, graphRelation } from "./math";

export function isTone(source:string):boolean{return /^\s*tone\s*\(/i.test(source);}
export function evaluateTone(source:string,variables:Record<string,number>,expand:(source:string)=>string=(source)=>source):{frequency:number;gain:number}{
  const match=/^\s*tone\s*\(([\s\S]*)\)\s*$/i.exec(source);
  if(!match)throw new Error("Use tone(frequency) or tone(frequency, gain).");
  const args:string[]=[];let depth=0,start=0;
  for(let i=0;i<match[1]!.length;i++){
    const c=match[1]![i];
    if("([{".includes(c!))depth++;
    if(")]}".includes(c!))depth--;
    if(depth<0)throw new Error("Unbalanced tone arguments.");
    if(c===","&&depth===0){args.push(match[1]!.slice(start,i));start=i+1;}
  }
  args.push(match[1]!.slice(start));
  if(depth!==0||args.length<1||args.length>2||args.some(arg=>!arg.trim()))throw new Error("Use tone(frequency) or tone(frequency, gain).");
  const values=args.map(arg=>{
    const expanded=expand(arg);
    if(graphRelation(expanded)||freeIdentifiers(expanded).some(name=>["x","y","t"].includes(name)))throw new Error("Tone arguments must be scalar expressions; use sliders, not graph coordinates.");
    return compileExpression(expanded,variables)(0).value.toNumber();
  });
  const frequency=values[0]!,gain=values[1]??1;
  if(!Number.isFinite(frequency)||frequency<20||frequency>20000)throw new Error("Tone frequency must be between 20 and 20000 Hz.");
  if(!Number.isFinite(gain)||gain<0||gain>1)throw new Error("Tone gain must be between 0 and 1.");
  return {frequency,gain};
}

export class TonePlayer{
  private audio:AudioContext|undefined;
  private voices=new Map<number,{oscillator:OscillatorNode;volume:GainNode;gain:number}>();
  private generation=0;
  async start():Promise<number>{
    const generation=this.generation;
    this.audio??=new AudioContext();
    await this.audio.resume();
    if(this.audio.state!=="running")throw new Error("Audio is unavailable. Allow sound in your browser and retry.");
    return generation;
  }
  valid(generation:number):boolean{return generation===this.generation;}
  update(id:number,frequency:number,gain:number):void{
    if(!Number.isFinite(frequency)||frequency<20||frequency>20000||!Number.isFinite(gain)||gain<0||gain>1)
      throw new Error("Tone frequency must be 20-20000 Hz and gain 0-1.");
    const audio=this.audio;
    if(!audio||audio.state!=="running")throw new Error("Tone audio is not running.");
    let voice=this.voices.get(id);
    if(!voice){
      const oscillator=audio.createOscillator(),volume=audio.createGain();
      volume.gain.value=0;oscillator.connect(volume);volume.connect(audio.destination);
      oscillator.start();voice={oscillator,volume,gain};this.voices.set(id,voice);
    }
    voice.gain=gain;voice.oscillator.frequency.setValueAtTime(frequency,audio.currentTime);
    this.balance();
  }
  private balance():void{
    for(const voice of this.voices.values())voice.volume.gain.setTargetAtTime(
      0.12*voice.gain/Math.max(1,this.voices.size),this.audio!.currentTime,0.015);
  }
  stop(id?:number):void{
    this.generation++;
    for(const [key,voice]of this.voices){
      if(id!==undefined&&key!==id)continue;
      voice.oscillator.stop();voice.oscillator.disconnect();voice.volume.disconnect();this.voices.delete(key);
    }
    this.balance();
  }
  async close():Promise<void>{this.stop();if(this.audio){await this.audio.close();this.audio=undefined;}}
}
