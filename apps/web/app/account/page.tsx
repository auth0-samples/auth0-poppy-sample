import { getVisitor } from "@/lib/visitor";
import { ActionForm } from "../components/ActionForm";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { updateDisplayName } from "../actions";

export default async function AccountPage() {
  const visitor = await getVisitor();

  if (visitor.kind === "visitor" || visitor.kind === "guest") {
    return (
      <>
        <PageHeader title="Account" />
        <Notice signInTo="/account">Sign in to see your account.</Notice>
      </>
    );
  }

  const { user } = visitor.session;
  return (
    <>
      <PageHeader title="Account" />
      <dl className="profile">
        <dt>Name</dt>
        <dd>{visitor.name}</dd>
        <dt>Email</dt>
        <dd>{(user.email as string | undefined) ?? "None on file"}</dd>
        <dt>Auth0 user ID</dt>
        <dd>
          <code>{user.sub}</code>
        </dd>
      </dl>

      <Panel id="display-name-heading" title="Update display name">
        <ActionForm action={updateDisplayName} label="Save" pendingLabel="Saving…">
          <label className="field">
            <span>Display name</span>
            <input name="name" defaultValue={visitor.name} maxLength={60} required />
          </label>
        </ActionForm>
      </Panel>
    </>
  );
}
