import { describe, expect, it } from "vitest";
import { advanceSlider } from "./sliderPlayback";
describe("slider playback modes", () => {
  const options = { min: -2, max: 2, speed: 2 };
  it("preserves bounce direction and overshoot", () => {
    expect(advanceSlider(1,1,1,options)).toEqual({value:1,direction:-1,complete:false});
    expect(advanceSlider(-1,-1,1,options)).toEqual({value:-1,direction:1,complete:false});
    expect(advanceSlider(0,1,10,options).value).toBe(0);
  });
  it("wraps repeat, completes once, and continues beyond bounds", () => {
    expect(advanceSlider(1,1,1,{...options,mode:"repeat"}).value).toBe(-1);
    expect(advanceSlider(1,1,1,{...options,mode:"once"})).toEqual({value:2,direction:1,complete:true});
    expect(advanceSlider(1,1,10,{...options,mode:"continuous"}).value).toBe(21);
  });
  it("rejects invalid elapsed time and bounds", () => {
    expect(()=>advanceSlider(0,1,-1,options)).toThrow();
    expect(()=>advanceSlider(0,1,1,{...options,max:-2})).toThrow();
  });
});
