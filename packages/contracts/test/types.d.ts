declare module "circomlibjs" {
  export const poseidonContract: {
    createCode(nInputs: number): string;
    generateABI(nInputs: number): unknown[];
  };
}
