import QRCode from "qrcode";

export function eventQrFilename(eventName: string): string {
  const slug = eventName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "event";
  return `${slug}-qr.png`;
}

export function createJoinQrDataUrl(joinUrl: string): Promise<string> {
  return QRCode.toDataURL(joinUrl, {
    type: "image/png",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 360,
    color: { dark: "#171615", light: "#FFFFFF" },
  });
}
