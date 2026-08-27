import { redirect } from "next/navigation";

/** The Health view now lives on the Today home page — this route
 * survives only so old links and bookmarks land somewhere real. */
export default function BiometricsPage() {
  redirect("/dashboard");
}
