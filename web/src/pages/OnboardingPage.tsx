import { useNavigate } from 'react-router-dom';
import { OnboardingFlow } from '../components/onboarding/OnboardingFlow';
import { useAppStore } from '../store/useAppStore';

export function OnboardingPage() {
  const navigate = useNavigate();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  return (
    <OnboardingFlow
      onComplete={() => {
        completeOnboarding();
        navigate('/');
      }}
    />
  );
}
