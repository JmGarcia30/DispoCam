import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wedding Camera",
    short_name: "Camera",
    description: "A private disposable camera for wedding guests.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f3ef",
    theme_color: "#272522",
    icons: [
      {
        src: "/icons/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
