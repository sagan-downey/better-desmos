export interface TracePoint { x:number; y:number }
export function traceFrequency(y:number,yMin:number,yMax:number):number{
  if(![y,yMin,yMax].every(Number.isFinite)||yMin>=yMax)throw new Error("Audio trace needs finite, increasing graph bounds.");
  const position=Math.max(0,Math.min(1,(y-yMin)/(yMax-yMin)));
  return 220*2**(position*3);
}
export function tracePoints(
  evaluate:(x:number)=>number,xMin:number,xMax:number,count=201,
):Array<TracePoint|undefined>{
  if(!Number.isFinite(xMin)||!Number.isFinite(xMax)||xMin>=xMax||!Number.isInteger(count)||count<2||count>2048)throw new Error("Invalid audio trace interval.");
  return Array.from({length:count},(_,index)=>{
    const x=xMin+(xMax-xMin)*index/(count-1);
    const y=evaluate(x);
    return Number.isFinite(y)?{x,y}:undefined;
  });
}
export class AudioTracePlayer{
  private audio:AudioContext|undefined;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private sources=new Set<OscillatorNode>();
  async start():Promise<void>{
    this.audio??=new AudioContext();
    await this.audio.resume();
    if(this.audio.state!=="running")throw new Error("Audio is unavailable. Allow sound in your browser and retry.");
  }
  tone(point:TracePoint,xMin:number,xMax:number,yMin:number,yMax:number,duration=0.12):void{
    if(!this.audio||this.audio.state!=="running")throw new Error("Start audio trace before playing a point.");
    const frequency=traceFrequency(point.y,yMin,yMax);
    const oscillator=this.audio.createOscillator(),gain=this.audio.createGain(),pan=this.audio.createStereoPanner();
    oscillator.type=point.y<0?"triangle":"sine";
    oscillator.frequency.value=frequency;
    pan.pan.value=Math.max(-1,Math.min(1,2*(point.x-xMin)/(xMax-xMin)-1));
    const now=this.audio.currentTime;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(0.12,now+0.01);
    gain.gain.setValueAtTime(0.12,now+duration-0.02);gain.gain.linearRampToValueAtTime(0,now+duration);
    oscillator.connect(gain);gain.connect(pan);pan.connect(this.audio.destination);
    oscillator.start(now);oscillator.stop(now+duration);
    this.sources.add(oscillator);oscillator.onended=()=>{this.sources.delete(oscillator);oscillator.disconnect();gain.disconnect();pan.disconnect();};
  }
  sequence(points:Array<TracePoint|undefined>,bounds:[number,number,number,number],notify:(index:number,point:TracePoint|undefined)=>void,fail:(error:Error)=>void):void{
    this.stop();
    let index=0;
    const next=()=>{
      if(index>=points.length){this.timer=undefined;notify(index,undefined);return;}
      const point=points[index];
      notify(index,point);
      try{if(point)this.tone(point,...bounds,0.06);}
      catch(reason){this.stop();fail(reason instanceof Error?reason:new Error("Audio playback failed."));return;}
      index++;
      this.timer=setTimeout(next,65);
    };
    next();
  }
  stop():void{
    if(this.timer!==undefined)clearTimeout(this.timer);
    this.timer=undefined;
    for(const oscillator of this.sources){oscillator.stop();oscillator.disconnect();}
    this.sources.clear();
  }
  async close():Promise<void>{this.stop();if(this.audio){await this.audio.close();this.audio=undefined;}}
}
