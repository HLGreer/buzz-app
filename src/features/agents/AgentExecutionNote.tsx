import { CloudIcon, InfoIcon } from "../../shared/design-system/icons";
import { PreferenceRow } from "../../shared/design-system/ui/PreferenceRow";
import { SettingsGroup } from "../../shared/design-system/ui/SettingsGroup";
import {
  executionDetails,
  type AgentExecutionLocation,
} from "./execution-location";

/** Execution guidance sits outside the settings container it explains. */
export function AgentExecutionNote({
  execution,
  runtime,
}: {
  execution: AgentExecutionLocation;
  runtime?: string;
}) {
  const Icon = execution === "remote" ? CloudIcon : InfoIcon;
  const { description } = executionDetails(execution, runtime);
  // Keep the cue compact; the composer explains where remote work happens.
  return (
    <div role="note">
      <SettingsGroup>
        <PreferenceRow
          icon={<Icon />}
          title={execution === "remote" ? "Remote agent" : description}
          subtitle={
            execution === "remote" && runtime === "block.builderlab/builderlab"
              ? "Runs on a Builderlab machine"
              : undefined
          }
        />
      </SettingsGroup>
    </div>
  );
}
