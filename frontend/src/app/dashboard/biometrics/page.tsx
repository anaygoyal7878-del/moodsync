import { backendFetch } from "@/lib/api";
import { BiometricsSection } from "@/components/dashboard/BiometricsSection";
import type { NormalizedBiometricReading } from "@moodsync/shared";

export default async function BiometricsPage() {
  const [latestResult, historyResult] = await Promise.all([
    backendFetch<{ reading: NormalizedBiometricReading | null }>("/api/biometrics/latest"),
    backendFetch<{ readings: NormalizedBiometricReading[] }>("/api/biometrics/history?days=7"),
  ]);
  const latest = latestResult.ok ? latestResult.data.reading : null;
  const history = historyResult.ok ? historyResult.data.readings : [];

  return <BiometricsSection latest={latest} history={history} />;
}
