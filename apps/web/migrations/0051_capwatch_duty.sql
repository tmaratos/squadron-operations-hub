-- Keeping CAPWATCH alive is a job, and the job belongs to a duty position.
--
-- CAP revokes CAPWATCH access unless the authorised member completes the CAPWATCH Security assessment
-- annually and the commander approves the request again. That is not a thing to remember; it is a recurring
-- obligation with a regulation behind it, which is exactly what the duties catalogue is for.
--
-- Filed against IT and Systems rather than against a person on purpose. Whoever holds that position inherits
-- this, and the squadron does not lose its member directory because the person who set it up left. The same
-- reasoning is why the credential itself is replaceable from the settings page: the integration should never
-- need the developer who built it.
--
-- Marked CONFIRMED because the wording below is CAP's own published notice on the CAPWATCH download page,
-- not something the assistant inferred from a regulation.
INSERT OR IGNORE INTO role_duties (
  id, workspace_id, role, title, detail, cadence, due_month, due_day, lead_days,
  source_citation, source_url, source_quote, confidence, confirmed_at, active, created_at, updated_at
) VALUES (
  'duty-capwatch-revalidation',
  'tn-170',
  'IT and Systems',
  'Revalidate CAPWATCH access',
  'Complete the annual CAPWATCH Security assessment in eServices, have the request approved again, then open '
    || 'Settings, Integrations, CAPWATCH in the Hub and run Test connection. If the authorised member has '
    || 'changed since last year, or their eServices password has changed, replace the credential on that page '
    || '- no code change is needed for either. Access is revoked outright if the assessment lapses, and the '
    || 'member directory stops updating when that happens.',
  'ANNUAL',
  -- December, ahead of the January deadline CAP has used since the assessment was introduced, with a long
  -- lead so it is in front of somebody well before access is at risk.
  12, 1, 45,
  'CAPWATCH Security assessment, CAP eServices CAPWATCH Downloads notice',
  'https://www.capnhq.gov/cap.capwatch.web/default.aspx',
  'In efforts to further protect Civil Air Patrol''s data, CAPWATCH users will be required to complete a '
    || 'security assessment, "CAPWATCH Security", course annually to request access to CAPWATCH Downloads. '
    || 'After the assessment is approved by the IT Security Manager, the Wing Commander must approve the '
    || 'request before access is granted.',
  'CONFIRMED',
  datetime('now'),
  1,
  datetime('now'),
  datetime('now')
);
