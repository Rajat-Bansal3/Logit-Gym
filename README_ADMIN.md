# Synapse Admin Panel

The panel is served by the backend at `/admin`. The page itself contains no account data; every admin API requires a valid Synapse access token and a matching user ID in the backend `ADMIN_USER_IDS` environment variable. There is no admin signup or public admin role.

## Enable access

1. Choose the existing Synapse account that should be the administrator. Look up its ID in PostgreSQL, for example:

   ```sql
   SELECT id, username FROM users WHERE username = 'your-username';
   ```

2. Set that ID in the backend environment (never in the Flutter app or browser):

   ```env
   ADMIN_USER_IDS=the-user-id
   ```

   Multiple explicitly authorized IDs can be comma-separated. With the variable empty, all admin APIs deny access.

3. Apply the schema to the exact database configured for the deployed backend, then regenerate the client:

   ```sh
   bunx prisma db push
   bunx prisma generate
   ```

   If your deployment applies SQL manually, use [prisma/admin_panel_migration.sql](./prisma/admin_panel_migration.sql) against that same database. It adds only the suspension flag, invoice payment ID, and refund-request table. Do not deploy the admin backend before this schema update is applied.

   If the backend starts before the migration is applied, the normal app API remains available, but gym suspension enforcement is temporarily skipped and a warning is logged.

4. Configure the Razorpay webhook to include `payment.failed` as well as the existing subscription events. Failed subscription payments will be recorded from that point forward; historical failures cannot be reconstructed if their payment IDs were not stored.

5. Deploy the backend and open `/admin`. Sign in with the authorized account's normal username and password. The access token is kept in browser session storage and cleared by Sign out.

## Panel contents

Overview reports gyms, users, active members, subscription states, Synapse subscription revenue, recorded gym collections, unpaid invoices, failed payments, and processed refunds. Gym rows show owner, members, plan, billing state, and gym-specific revenue. Admin actions create or activate/deactivate plans, extend active trials, suspend/restore gyms, and initiate a full Razorpay refund for a paid subscription invoice with an available payment ID.

Refund requests are stored with their gateway status and reference. Refunds are only available for platform subscription invoices; regular gym payments currently have no gateway payment reference in the data model. Gym suspension blocks authenticated access to that gym's APIs. Existing accounts keep their existing roles; only IDs in `ADMIN_USER_IDS` pass the admin API gate.

## WhatsApp messaging

The WhatsApp tab controls the global paid-message price and low-balance threshold, provider-approved template metadata and visibility, and manual wallet credits. Apply [prisma/whatsapp_messaging_migration.sql](./prisma/whatsapp_messaging_migration.sql) to the backend database before deploying this feature, then run `bunx prisma generate`. The migration is additive and does not drop existing tables or records. Do not run `prisma migrate reset` against a database containing application data.

Owners can select up to 100 members per campaign, review a server-calculated cost before sending, and choose fewer recipients or top up when the selection exceeds the wallet balance. For members without a recorded category-specific confirmation, the owner confirms the selected recipients in one step; that confirmation is recorded per member and category, rather than prompting separately for every member on every send. This is an attestation that the members have actually opted in, not a substitute for their permission. Members who have opted out cannot be included. Owners can also send utility reminders to members whose memberships have expired or expire in the next 10 days and view paginated message history. Each gym receives 100 lifetime successful Utility sends; failed sends do not consume that allowance or a paid-message charge. Wallet top-ups are manual: verify payment before crediting and include a clear reference note.

If the WhatsApp migration was applied before adding the opt-out timestamps, reapply the same SQL file before deploying this backend version. Its `IF NOT EXISTS` additions are safe to run again and preserve existing data.

Message delivery is intentionally unavailable until a WhatsApp Business messaging provider is selected, configured, and connected to the provider interface in `src/api/services/whatsapp.service.ts`. Admin template records are metadata only; they do not upload or approve templates with a provider. The app clearly reports this state and does not charge or consume the free allowance while the provider is unconfigured. Configure provider credentials only in the backend environment, and add provider delivery-status webhooks before treating accepted sends as delivered.
