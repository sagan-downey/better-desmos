declare module "jstat" {
  interface LocationDistribution {
    pdf(x: number, mean: number, scale: number): number;
    cdf(x: number, mean: number, scale: number): number;
    inv(p: number, mean: number, scale: number): number;
  }
  interface ShapeDistribution {
    pdf(x: number, shape: number): number;
    cdf(x: number, shape: number): number;
    inv(p: number, shape: number): number;
  }
  const library: {
    jStat: {
      gammaln(x: number): number;
      normal: LocationDistribution;
      uniform: LocationDistribution;
      studentt: ShapeDistribution;
      chisquare: ShapeDistribution;
      binomial: { pdf(x: number, trials: number, probability: number): number; cdf(x: number, trials: number, probability: number): number };
      poisson: { pdf(x: number, mean: number): number; cdf(x: number, mean: number): number };
    };
  };
  export default library;
}
