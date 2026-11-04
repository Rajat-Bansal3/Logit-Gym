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

3. Apply the additive Prisma schema changes and regenerate the client:

   ```sh
   bunx prisma db push
   bunx prisma generate
   ```

4. Configure the Razorpay webhook to include `payment.failed` as well as the existing subscription events. Failed subscription payments will be recorded from that point forward; historical failures cannot be reconstructed if their payment IDs were not stored.

5. Deploy the backend and open `/admin`. Sign in with the authorized account's normal username and password. The access token is kept in browser session storage and cleared by Sign out.

## Panel contents

Overview reports gyms, users, active members, subscription states, Synapse subscription revenue, recorded gym collections, unpaid invoices, failed payments, and processed refunds. Gym rows show owner, members, plan, billing state, and gym-specific revenue. Admin actions create or activate/deactivate plans, extend active trials, suspend/restore gyms, and initiate a full Razorpay refund for a paid subscription invoice with an available payment ID.

Refund requests are stored with their gateway status and reference. Refunds are only available for platform subscription invoices; regular gym payments currently have no gateway payment reference in the data model. Gym suspension blocks authenticated access to that gym's APIs. Existing accounts keep their existing roles; only IDs in `ADMIN_USER_IDS` pass the admin API gate.
