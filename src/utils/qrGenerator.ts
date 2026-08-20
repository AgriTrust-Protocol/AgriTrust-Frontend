import QRCode from "qrcode";
import pako from "pako";

export const generateQrDataUrl = async (payload: object, expiresIn: number): Promise<string> => {
  const jsonStr = JSON.stringify(payload);
  // compress using pako (browser version) - already imported in component
  // This utility is a thin wrapper; component can call directly.
  // For completeness we return the data URL.
  // Note: In a real environment, you might use Buffer, but in browser use Uint8Array.
  const compressed = pako.deflate(jsonStr);
  const base64 = Buffer.from(compressed).toString("base64");
  const dataUrl = await QRCode.toDataURL(base64, { errorCorrectionLevel: "M", margin: 2 });
  return dataUrl;
};
