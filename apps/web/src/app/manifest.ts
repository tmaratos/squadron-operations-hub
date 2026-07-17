import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Squadron Operations Hub",
    short_name: "Squadron Ops",
    description: "Administrative and operational management for a Civil Air Patrol squadron",
    start_url: "/",
    display: "standalone",
    background_color: "#08111f",
    theme_color: "#08111f"
  };
}
