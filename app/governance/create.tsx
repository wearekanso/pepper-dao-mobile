import { Redirect } from 'expo-router';

import { pickDesign } from '@/config/design';
import { PROPOSAL_CREATION_ENABLED } from '@/config/features';
import { LegacyCreateProposalScreen } from '@/designs/legacy/screens/create-proposal-screen';
import { CreateProposalScreen } from '@/designs/thermal/screens/create-proposal-screen';

const DesignedCreateProposalScreen = pickDesign({
  legacy: LegacyCreateProposalScreen,
  thermal: CreateProposalScreen,
  hq: LegacyCreateProposalScreen,
});

export default function CreateProposalRoute() {
  // Deep links can still reach this route while the feature is hidden
  if (!PROPOSAL_CREATION_ENABLED) return <Redirect href="/governance" />;

  return <DesignedCreateProposalScreen />;
}
