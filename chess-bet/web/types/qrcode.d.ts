declare module "qrcode" {
  export function toDataURL(text: string, opts?: { width?: number; margin?: number; errorCorrectionLevel?: string; color?: { dark?: string; light?: string } }): Promise<string>;
}
