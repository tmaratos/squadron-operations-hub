# Email intake

Turns forwarded email into Hub tasks.

Mail sent to an address on the squadron domain is handed to this Worker by Cloudflare Email Routing.
The Worker files the message as a task in **Command Intake**, tagged "email", assigned to the member it came from.

## Who is allowed to send

A message is only accepted when either:

1. it is addressed to a member's personal intake code, for example `tasks+7f3a9c@...`, or
2. the sender's address matches a member's Hub account.

Anything else is rejected, so the address cannot be used to flood the Hub.

## Why forwarding instead of connecting Gmail

Reading Gmail through Google's API needs restricted-scope approval from the Google administrators of the
member's domain. For CAP (tncap.us) accounts that approval is not ours to give, so forwarding is used instead.
It works the same way for Gmail, Outlook, and any other mail service, with no passwords and no scopes.
