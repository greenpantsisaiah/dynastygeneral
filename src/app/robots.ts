import type { MetadataRoute } from "next";

const BASE =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/admin/", "/leagues/", "/leagues", "/account", "/connect", "/soundboard"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
