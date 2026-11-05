import type { ComponentProps } from "react";
import type { RelaySession } from "../../features/relay/session";
import { SurfaceButton } from "../../shared/design-system/ui/SurfaceButton";
import { ChannelMemberAvatars } from "./ChannelMemberAvatars";
import styles from "./ChannelHeaderIdentity.module.css";

/** One artwork/name target opens the conversation's existing member manager. */
export function ChannelHeaderIdentity({
  session,
  channelId,
  name,
  detail,
  ...props
}: Omit<
  ComponentProps<typeof SurfaceButton>,
  "children" | "className" | "aria-label" | "title" | "aria-haspopup"
> & {
  session: RelaySession;
  channelId: string;
  name: string;
  /** Extra context, such as a Solo chat's owner, for the name and hint. */
  detail?: string | undefined;
}) {
  return (
    <SurfaceButton
      {...props}
      aria-label={`Manage members of ${name}${detail ? `, ${detail}` : ""}`}
      title={detail ?? "Manage members"}
      aria-haspopup="dialog"
      className={styles.identity}
    >
      <span className={styles.avatars} aria-hidden="true">
        <ChannelMemberAvatars session={session} channelId={channelId} />
      </span>
      <span className={styles.label}>
        <span className={`${styles.name} text-body-sm`}>{name}</span>
      </span>
    </SurfaceButton>
  );
}
