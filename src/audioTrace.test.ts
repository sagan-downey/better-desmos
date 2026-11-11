import { afterEach,describe,expect,it,vi } from "vitest";
import { AudioTracePlayer,traceFrequency,tracePoints } from "./audioTrace";
describe("audio trace mapping",()=>{
  it("maps increasing y to increasing pitch and clips outside viewport",()=>{
    expect(traceFrequency(-10,-10,10)).toBe(220);
    expect(traceFrequency(10,-10,10)).toBe(1760);
    expect(traceFrequency(100,-10,10)).toBe(1760);
    expect(traceFrequency(0,-10,10)).toBeGreaterThan(traceFrequency(-1,-10,10));
  });

  const testOscillator = () => ({
    type: "", frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(),
    connect: vi.fn(), disconnect: vi.fn(), onended: null,
  });
  class TestAudioContext {
    state = "suspended";
    currentTime = 0;
    destination = {};
    oscillators: Array<ReturnType<typeof testOscillator>> = [];
    volumes: number[] = [];
    resume = vi.fn(async () => { this.state = "running"; });
    close = vi.fn(async () => { this.state = "closed"; });
    createOscillator() {
      const node = testOscillator();
      this.oscillators.push(node);
      return node;
    }
    createGain() {
      return {
        connect: vi.fn(), disconnect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: (value: number) => { if (value) this.volumes.push(value); } },
      };
    }
    createStereoPanner() { return { pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  }
  describe("audio trace lifecycle and region chords", () => {
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    const setup = () => {
      const context = new TestAudioContext();
      vi.stubGlobal("AudioContext", class { constructor() { return context; } });
      return { context, player: new AudioTracePlayer() };
    };
    it("plays bounded-volume region chords and distinct negative-y tones", async () => {
      const { context, player } = setup();
      expect(() => player.tone({x:0,y:0},-1,1,-1,1)).toThrow();
      await player.start();
      player.tone({x:0,y:0,voices:[-1,0,1],region:true},-1,1,-1,1);
      expect(context.oscillators).toHaveLength(3);
      expect(context.oscillators.every((node) => node.type === "sawtooth")).toBe(true);
      expect(context.oscillators.map((node) => node.frequency.value)).toEqual([220,220*2**1.5,1760]);
      expect(context.volumes.reduce((a,b) => a+b,0)).toBeCloseTo(0.12);
      player.tone({x:0,y:-1},-1,1,-1,1);
      expect(context.oscillators.at(-1)!.type).toBe("triangle");
      await player.close();
      expect(context.close).toHaveBeenCalledOnce();
      expect(context.oscillators.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
    });
    it("cancels scheduled samples and never plays silent gaps", async () => {
      vi.useFakeTimers();
      const {context,player} = setup(), notify = vi.fn(), fail = vi.fn();
      await player.start();
      player.sequence([{x:0,y:0},undefined,{x:1,y:1}],[-1,1,-1,1],notify,fail);
      vi.advanceTimersByTime(65);
      expect(notify).toHaveBeenCalledTimes(2);
      expect(context.oscillators).toHaveLength(1);
      player.stop();vi.runAllTimers();
      expect(notify).toHaveBeenCalledTimes(2); expect(fail).not.toHaveBeenCalled();
      await player.close();
    });
    it("reports resume failures and playback errors", async () => {
      const {context,player} = setup();
      context.resume.mockImplementationOnce(async () => {});
      await expect(player.start()).rejects.toThrow("unavailable");
      await player.start();
      const fail = vi.fn();
      player.sequence([{x:0,y:NaN}],[-1,1,-1,1],vi.fn(),fail);
      expect(fail).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining("finite")}));
      await player.close();
    });
  });
  it("samples exact endpoints and represents nonfinite gaps",()=>{
    const points=tracePoints(x=>x===0?NaN:x*x,-1,1,3);
    expect(points).toEqual([{x:-1,y:1},undefined,{x:1,y:1}]);
    expect(()=>tracePoints(()=>1,2,1)).toThrow();
    expect(()=>traceFrequency(1,0,0)).toThrow();
  });
});
