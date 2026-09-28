declare module "pdf-to-printer" {
  export type PrintOptions = {
    printer?: string;
    copies?: number;
    monochrome?: boolean;
    side?: "one-sided" | "two-sided-long-edge" | "two-sided-short-edge";
  };
  export function print(pdfPath: string, options?: PrintOptions): Promise<void>;
}
