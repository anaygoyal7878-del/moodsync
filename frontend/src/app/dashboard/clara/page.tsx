import { PageHeader } from "@/components/companion/CompanionPrimitives";
import { ClaraChat } from "@/components/dashboard/clara/ClaraChat";

/** Clara in the app, alongside the messaging channel rather than
 * instead of it — both surfaces run the same agentic engine (see
 * docs/CLARA_ARCHITECTURE.md and backend/src/api/routes/clara.ts). */
export default function ClaraPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Clara" subtitle="Ask about your data. She answers from your real readings." />
      <ClaraChat />
    </div>
  );
}
