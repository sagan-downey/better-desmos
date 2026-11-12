import { afterEach,describe,expect,it,vi } from "vitest";
import { evaluateTone,TonePlayer } from "./tones";
afterEach(()=>vi.unstubAllGlobals());
describe("expression tones",()=>{
  it("evaluates safe scalar formulas and optional gain",()=>{
    expect(evaluateTone("tone(220*2^a, 1/2)",{a:1})).toEqual({frequency:440,gain:0.5});
    expect(evaluateTone("tone(220+sqrt(48400))",{})).toEqual({frequency:440,gain:1});
  });
  it("reports invalid ranges, arity, domains and graph coordinates",()=>{
    for(const source of ["tone(0)","tone(20001)","tone(440,2)","tone(440,-1)","tone(x)","tone(440,)","tone(440,1,1)","tone(sqrt(-1))","tone(440);alert(1)"])
      expect(()=>evaluateTone(source,{}),source).toThrow();
  });
  it("starts silently, caps combined volume, updates and stops every voice",async()=>{
    const frequencies:number[]=[],volumes:number[]=[],stopped:number[]=[];
    let voices=0;
    vi.stubGlobal("AudioContext",class {
      state="running";currentTime=0;destination={};
      async resume(){} async close(){}
      createOscillator(){const id=++voices;return{
        frequency:{setValueAtTime:(value:number)=>frequencies.push(value)},
        connect(){},disconnect(){},start(){},stop(){stopped.push(id);},
      };}
      createGain(){return{gain:{value:0,setTargetAtTime:(value:number)=>volumes.push(value)},connect(){},disconnect(){}};}
    });
    const player=new TonePlayer();
    expect(voices).toBe(0);
    const generation=await player.start();
    expect(voices).toBe(0);
    player.update(1,440,1);player.update(2,880,0.5);player.update(1,220,1);
    expect(voices).toBe(2);expect(frequencies).toEqual([440,880,220]);
    expect(volumes.slice(-2)).toEqual([0.06,0.03]);
    player.stop(1);expect(stopped).toEqual([1]);expect(player.valid(generation)).toBe(false);
    await player.close();expect(stopped).toEqual([1,2]);
  });
  it("cancels a pending audio startup when muted",async()=>{
    let resume:()=>void=()=>{};
    vi.stubGlobal("AudioContext",class {
      state="running";resume(){return new Promise<void>(resolve=>{resume=resolve;});}
    });
    const player=new TonePlayer(),start=player.start();player.stop();resume();
    expect(player.valid(await start)).toBe(false);
  });
});
