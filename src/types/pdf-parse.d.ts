declare module 'pdf-parse/lib/pdf-parse.js' {
  const pdf: (data: Buffer, opts?: any) => Promise<{ numpages: number; text: string }>;
  export default pdf;
}
