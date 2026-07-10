import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { HeartRatePulse } from '../components/dashboard/HeartRatePulse';
import { WellnessStateCard } from '../components/dashboard/WellnessStateCard';
import { ScentRecommendationCard } from '../components/dashboard/ScentRecommendationCard';
import { WellnessTimeline } from '../components/dashboard/WellnessTimeline';
import { ScenarioPicker } from '../components/dashboard/ScenarioPicker';

const container = {
  animate: { transition: { staggerChildren: 0.08 } },
};
const item = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export function DashboardPage() {
  const latestSample = useAppStore((s) => s.latestSample);
  const assessment = useAppStore((s) => s.assessment);
  const recommendation = useAppStore((s) => s.recommendation);
  const timeline = useAppStore((s) => s.timeline);
  const devices = useDeviceStore((s) => s.devices);

  const automationSummary = {
    autoCount: devices.filter((d) => d.mode === 'auto').length,
    manualCount: devices.filter((d) => d.mode === 'manual').length,
  };

  return (
    <motion.div variants={container} initial="initial" animate="animate" className="flex flex-col gap-4">
      <motion.div variants={item}>
        <ScenarioPicker />
      </motion.div>

      <motion.div variants={item} className="grid gap-4 sm:grid-cols-2">
        <HeartRatePulse sample={latestSample} />
        <WellnessStateCard assessment={assessment} />
      </motion.div>

      <motion.div variants={item}>
        <ScentRecommendationCard recommendation={recommendation} automationSummary={automationSummary} />
      </motion.div>

      <motion.div variants={item}>
        <WellnessTimeline entries={timeline} />
      </motion.div>
    </motion.div>
  );
}
