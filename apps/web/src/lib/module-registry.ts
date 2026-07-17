import type { ModuleDefinition } from "./types";

export const moduleRegistry: Record<string, ModuleDefinition> = {
  staff: {
    key: "staff",
    title: "Staff and Duty Assignments",
    subtitle: "People, positions, continuity, and workload",
    description: "See who owns each responsibility, identify vacancies, and hand work off without losing institutional knowledge.",
    stats: [
      { label: "Active Senior Members", value: 8, detail: "3 active this week", tone: "info" },
      { label: "Duty Positions Filled", value: "12 / 18", detail: "6 positions are vacant", tone: "warning" },
      { label: "Continuity Reviews", value: 4, detail: "Due this month", tone: "warning" },
      { label: "Members Overloaded", value: 2, detail: "More than 4 active roles", tone: "danger" }
    ],
    actions: [
      { label: "Assign Duty Position", description: "Add or transfer a staff responsibility." },
      { label: "Create Handoff", description: "Start a continuity handoff for a duty position." },
      { label: "Invite Senior Member", description: "Create a secure account invitation." }
    ],
    records: [
      { id: "staff-1", primary: "2d Lt. Tristan Maratos", secondary: "Aerospace Education Officer, IT Officer", tertiary: "4 active assignments", status: "Active", tone: "success" },
      { id: "staff-2", primary: "Maj. Steven Mellard", secondary: "Squadron Commander", tertiary: "3 commander approvals pending", status: "Active", tone: "success" },
      { id: "staff-3", primary: "Finance Officer", secondary: "No member assigned", tertiary: "Monthly report overdue", status: "Vacant", tone: "danger" },
      { id: "staff-4", primary: "Safety Officer", secondary: "Interim coverage by commander", tertiary: "Permanent assignment needed", status: "Interim", tone: "warning" }
    ]
  },
  meetings: {
    key: "meetings",
    title: "Meetings and Decisions",
    subtitle: "Agendas, minutes, decisions, and follow-through",
    description: "Turn staff discussions into documented decisions and assigned action items.",
    stats: [
      { label: "Upcoming Meetings", value: 3, detail: "Next: July 21", tone: "info" },
      { label: "Open Action Items", value: 9, detail: "From prior meetings", tone: "warning" },
      { label: "Decisions Pending", value: 4, detail: "Need commander review", tone: "warning" },
      { label: "Minutes Missing", value: 1, detail: "June staff meeting", tone: "danger" }
    ],
    actions: [
      { label: "Create Meeting", description: "Build an agenda and invite staff." },
      { label: "Record Decision", description: "Add a command decision outside a meeting." },
      { label: "Generate Minutes", description: "Create formatted meeting minutes." }
    ],
    records: [
      { id: "meeting-1", primary: "July Staff Meeting", secondary: "Jul 21, 2026 at 18:00", tertiary: "7 agenda items", status: "Scheduled", tone: "info" },
      { id: "meeting-2", primary: "Discord Migration Working Session", secondary: "Jul 24, 2026 at 19:00", tertiary: "Communications and cadet protection review", status: "Draft", tone: "warning" },
      { id: "meeting-3", primary: "June Staff Meeting", secondary: "Jun 16, 2026", tertiary: "8 action items, 5 completed", status: "Needs Minutes", tone: "danger" }
    ]
  },
  documents: {
    key: "documents",
    title: "Documents and Records",
    subtitle: "Controlled documents, evidence, templates, and retention",
    description: "Keep approved versions organized and make required evidence easy to locate during turnover or inspection.",
    stats: [
      { label: "Controlled Documents", value: 46, detail: "Across 11 categories", tone: "info" },
      { label: "Reviews Due", value: 7, detail: "Within 30 days", tone: "warning" },
      { label: "Expired", value: 2, detail: "Require replacement", tone: "danger" },
      { label: "Templates", value: 18, detail: "Ready for reuse", tone: "success" }
    ],
    actions: [
      { label: "Upload Document", description: "Add a new controlled document or record." },
      { label: "Create Template", description: "Build a reusable squadron template." },
      { label: "Request Review", description: "Send a document for approval." }
    ],
    records: [
      { id: "doc-1", primary: "Squadron Operations Plan", secondary: "Version 4, approved May 2026", tertiary: "Annual review due May 2027", status: "Current", tone: "success" },
      { id: "doc-2", primary: "July Safety Briefing", secondary: "Approved Jul 17, 2026", tertiary: "Linked to monthly requirement", status: "Approved", tone: "success" },
      { id: "doc-3", primary: "Emergency Contact Roster", secondary: "Last reviewed Apr 2026", tertiary: "Review overdue", status: "Expired", tone: "danger" }
    ]
  },
  processes: {
    key: "processes",
    title: "Process and Continuity Library",
    subtitle: "How the squadron completes recurring work",
    description: "Document repeatable procedures so the next person can perform the job without reconstructing it from old email.",
    stats: [
      { label: "Published Processes", value: 34, detail: "Across all staff sections", tone: "success" },
      { label: "Draft Processes", value: 12, detail: "Awaiting review", tone: "warning" },
      { label: "Missing Procedures", value: 8, detail: "Identified gaps", tone: "danger" },
      { label: "Recently Updated", value: 6, detail: "In the past 30 days", tone: "info" }
    ],
    actions: [
      { label: "Create Process", description: "Document a repeatable squadron workflow." },
      { label: "Import Checklist", description: "Convert an existing checklist into steps." },
      { label: "Record Handoff Notes", description: "Capture role-specific lessons learned." }
    ],
    records: [
      { id: "process-1", primary: "Monthly Finance Report", secondary: "Finance, 11 documented steps", tertiary: "Includes evidence checklist", status: "Published", tone: "success" },
      { id: "process-2", primary: "New Senior Member Onboarding", secondary: "Administration and Personnel", tertiary: "Draft is 70% complete", status: "Draft", tone: "warning" },
      { id: "process-3", primary: "Discord Account Onboarding", secondary: "Communications and IT", tertiary: "Role assignment and channel verification", status: "Published", tone: "success" }
    ]
  },
  finance: {
    key: "finance",
    title: "Finance and Funding",
    subtitle: "Budgets, purchases, reimbursements, grants, and donors",
    description: "Manage the workflow around official finance processes and keep funding opportunities moving instead of losing them in email.",
    stats: [
      { label: "Available Operating Funds", value: "$4,820", detail: "Planning estimate", tone: "success" },
      { label: "Pending Purchases", value: 5, detail: "$1,940 requested", tone: "warning" },
      { label: "Funding Opportunities", value: 9, detail: "3 require follow-up", tone: "info" },
      { label: "Overdue Report", value: 1, detail: "July monthly report", tone: "danger" }
    ],
    actions: [
      { label: "Create Purchase Request", description: "Start an internal purchase workflow." },
      { label: "Add Donor Lead", description: "Track a business, foundation, or individual." },
      { label: "Add Grant", description: "Record an opportunity and its deadlines." }
    ],
    records: [
      { id: "finance-1", primary: "Virtual Fly FAA AATD", secondary: "Vendor discount received", tertiary: "Donor or grant funding required", status: "Funding Needed", tone: "warning" },
      { id: "finance-2", primary: "ORNL Community Giving Program", secondary: "Potential STEM sponsorship", tertiary: "Contact research assigned", status: "Prospect", tone: "info" },
      { id: "finance-3", primary: "July Finance Report", secondary: "Monthly closeout", tertiary: "Supporting receipts incomplete", status: "Overdue", tone: "danger" }
    ]
  },
  logistics: {
    key: "logistics",
    title: "Logistics and Inventory",
    subtitle: "Equipment, supply levels, assignments, and maintenance",
    description: "Know what the squadron owns, where it is, who has it, and what needs attention.",
    stats: [
      { label: "Inventory Items", value: 238, detail: "Across 14 categories", tone: "info" },
      { label: "Assigned Equipment", value: 41, detail: "To 16 members", tone: "success" },
      { label: "Low Stock", value: 6, detail: "Reorder recommended", tone: "warning" },
      { label: "Inspection Issues", value: 3, detail: "Corrective action open", tone: "danger" }
    ],
    actions: [
      { label: "Add Inventory Item", description: "Record new squadron property or supplies." },
      { label: "Issue Equipment", description: "Assign equipment to a member." },
      { label: "Start Inventory", description: "Open a scheduled inventory cycle." }
    ],
    records: [
      { id: "logistics-1", primary: "Rocket Motors", secondary: "8 units remaining", tertiary: "Reorder point is 12", status: "Low Stock", tone: "warning" },
      { id: "logistics-2", primary: "Projector, Epson 1080p", secondary: "Assigned to Aerospace Education", tertiary: "Condition: serviceable", status: "Assigned", tone: "success" },
      { id: "logistics-3", primary: "Handheld Radios", secondary: "12 of 14 accounted for", tertiary: "2 require reconciliation", status: "Action Needed", tone: "danger" }
    ]
  },
  safety: {
    key: "safety",
    title: "Safety Management",
    subtitle: "Briefings, hazards, mitigations, and corrective actions",
    description: "Track monthly safety requirements and keep operational risks visible before they become incidents.",
    stats: [
      { label: "Open Hazards", value: 4, detail: "1 high priority", tone: "warning" },
      { label: "Briefing Completion", value: "82%", detail: "Current month", tone: "warning" },
      { label: "Corrective Actions", value: 3, detail: "2 due this week", tone: "danger" },
      { label: "Days Without Incident", value: 143, detail: "Squadron operations", tone: "success" }
    ],
    actions: [
      { label: "Log Hazard", description: "Record an observed safety concern." },
      { label: "Create Briefing", description: "Prepare the monthly safety briefing." },
      { label: "Assign Mitigation", description: "Create a corrective action owner." }
    ],
    records: [
      { id: "safety-1", primary: "Parking Lot Lighting", secondary: "Low visibility after evening meetings", tertiary: "Portable lighting recommended", status: "Open Hazard", tone: "warning" },
      { id: "safety-2", primary: "July Safety Briefing", secondary: "Severe weather and heat response", tertiary: "18 of 22 members acknowledged", status: "In Progress", tone: "info" },
      { id: "safety-3", primary: "Extension Cord Replacement", secondary: "Damaged cord removed from service", tertiary: "Replacement ordered", status: "Mitigated", tone: "success" }
    ]
  },
  aerospace: {
    key: "aerospace",
    title: "Aerospace Education",
    subtitle: "Curriculum, activities, field trips, and program continuity",
    description: "Plan aerospace programming months ahead and preserve lessons so another officer can run them later.",
    stats: [
      { label: "Lessons Ready", value: 14, detail: "Reusable lesson plans", tone: "success" },
      { label: "Upcoming Activities", value: 5, detail: "Next 90 days", tone: "info" },
      { label: "Field Trips", value: 2, detail: "Pending confirmation", tone: "warning" },
      { label: "AEX Progress", value: "67%", detail: "Current program year", tone: "warning" }
    ],
    actions: [
      { label: "Create Lesson", description: "Build a reusable aerospace activity." },
      { label: "Plan Field Trip", description: "Track contacts, approval, and logistics." },
      { label: "Update AEX Progress", description: "Record completed AEX activities." }
    ],
    records: [
      { id: "ae-1", primary: "Cirrus Aircraft Visit", secondary: "Proposed for September", tertiary: "Contact awaiting final availability", status: "Pending", tone: "warning" },
      { id: "ae-2", primary: "Virtual Fly Simulator Project", secondary: "FAA AATD training capability", tertiary: "Vendor engaged, funding path needed", status: "Planning", tone: "info" },
      { id: "ae-3", primary: "Rocketry Activity", secondary: "Lesson plan and supply list complete", tertiary: "Ready for scheduling", status: "Ready", tone: "success" }
    ]
  },
  "cadet-programs": {
    key: "cadet-programs",
    title: "Cadet Programs",
    subtitle: "Training plans, promotions, activities, and staff coordination",
    description: "Coordinate the squadron cadet program while keeping administrative work visible to the senior staff.",
    stats: [
      { label: "Active Cadets", value: 31, detail: "4 joined this quarter", tone: "success" },
      { label: "Promotion Ready", value: 6, detail: "Awaiting staff review", tone: "info" },
      { label: "Training Gaps", value: 5, detail: "Require scheduling", tone: "warning" },
      { label: "Parent Follow-ups", value: 3, detail: "Open communication items", tone: "warning" }
    ],
    actions: [
      { label: "Build Training Plan", description: "Create the next meeting or quarter plan." },
      { label: "Review Promotion", description: "Open the squadron promotion checklist." },
      { label: "Create Parent Notice", description: "Draft an operational announcement." }
    ],
    records: [
      { id: "cp-1", primary: "August Training Plan", secondary: "Leadership, drill, aerospace, and PT", tertiary: "Two instructor gaps remain", status: "Draft", tone: "warning" },
      { id: "cp-2", primary: "Cadet Staff Meeting", secondary: "Jul 28, 2026", tertiary: "Agenda published", status: "Scheduled", tone: "info" },
      { id: "cp-3", primary: "Promotion Review Queue", secondary: "6 cadets ready for review", tertiary: "Records verified", status: "Ready", tone: "success" }
    ]
  },
  "emergency-services": {
    key: "emergency-services",
    title: "Emergency Services",
    subtitle: "Qualifications, training, readiness, and mission support",
    description: "Track local readiness tasks and training without replacing official qualification records.",
    stats: [
      { label: "Mission Ready Members", value: 12, detail: "Local planning view", tone: "success" },
      { label: "Qualifications Expiring", value: 4, detail: "Within 60 days", tone: "warning" },
      { label: "Training Events", value: 3, detail: "Next 90 days", tone: "info" },
      { label: "Equipment Gaps", value: 2, detail: "Mission support items", tone: "danger" }
    ],
    actions: [
      { label: "Plan Training", description: "Create a squadron ES training event." },
      { label: "Track Renewal", description: "Add a local qualification reminder." },
      { label: "Open Readiness Review", description: "Review personnel and equipment gaps." }
    ],
    records: [
      { id: "es-1", primary: "Ground Team Refresher", secondary: "Aug 15, 2026", tertiary: "Instructor confirmed", status: "Scheduled", tone: "info" },
      { id: "es-2", primary: "Communications Equipment Check", secondary: "2 battery replacements needed", tertiary: "Logistics task created", status: "Action Needed", tone: "warning" },
      { id: "es-3", primary: "Qualification Renewal Review", secondary: "4 members within 60 days", tertiary: "Notifications queued", status: "In Progress", tone: "info" }
    ]
  },
  communications: {
    key: "communications",
    title: "Communications Center",
    subtitle: "Discord, announcements, channel links, and action capture",
    description: "Connect operational communication to tracked work without trying to replace Discord itself.",
    stats: [
      { label: "Linked Channels", value: 6, detail: "Discord channel mappings", tone: "success" },
      { label: "Unread Staff Messages", value: 9, detail: "Across approved channels", tone: "warning" },
      { label: "Messages Flagged", value: 3, detail: "Potential action items", tone: "info" },
      { label: "Integration Health", value: "Online", detail: "Last sync 2 minutes ago", tone: "success" }
    ],
    actions: [
      { label: "Link Discord Channel", description: "Map an approved channel to the hub." },
      { label: "Post Announcement", description: "Send an approved message to Discord." },
      { label: "Create Task from Message", description: "Capture a message as tracked work." }
    ],
    records: [
      { id: "comms-1", primary: "#senior-member-chat", secondary: "9 unread messages", tertiary: "Last activity 12 minutes ago", status: "Connected", tone: "success" },
      { id: "comms-2", primary: "#announcements", secondary: "No pending posts", tertiary: "Last post Jul 15", status: "Connected", tone: "success" },
      { id: "comms-3", primary: "Potential task: Donor research", secondary: "Source: #senior-member-chat", tertiary: "Needs owner and due date", status: "Flagged", tone: "warning" }
    ]
  },
  inspections: {
    key: "inspections",
    title: "Inspections and Corrective Actions",
    subtitle: "Self-inspection, evidence, findings, and readiness",
    description: "Stay inspection-ready by tracking checklist evidence and closing findings before an external review.",
    stats: [
      { label: "Checklist Completion", value: "81%", detail: "Current self-inspection", tone: "warning" },
      { label: "Open Findings", value: 7, detail: "2 high priority", tone: "danger" },
      { label: "Evidence Missing", value: 11, detail: "Across 5 functional areas", tone: "warning" },
      { label: "Areas Ready", value: "8 / 12", detail: "Meeting readiness threshold", tone: "success" }
    ],
    actions: [
      { label: "Start Self-Inspection", description: "Create a new inspection cycle." },
      { label: "Add Finding", description: "Record a gap and corrective action." },
      { label: "Upload Evidence", description: "Attach proof to a checklist item." }
    ],
    records: [
      { id: "inspection-1", primary: "Finance Records", secondary: "3 checklist items incomplete", tertiary: "Monthly report and receipt evidence", status: "At Risk", tone: "danger" },
      { id: "inspection-2", primary: "Aerospace Education", secondary: "All required evidence present", tertiary: "Last reviewed Jul 10", status: "Ready", tone: "success" },
      { id: "inspection-3", primary: "Logistics Inventory", secondary: "2 items require reconciliation", tertiary: "Corrective actions assigned", status: "In Progress", tone: "warning" }
    ]
  },
  reports: {
    key: "reports",
    title: "Reports and Exports",
    subtitle: "Operational summaries, recurring reports, and leadership briefs",
    description: "Generate consistent reports from the work already tracked in the hub.",
    stats: [
      { label: "Scheduled Reports", value: 8, detail: "Monthly and quarterly", tone: "info" },
      { label: "Due This Month", value: 5, detail: "2 completed", tone: "warning" },
      { label: "Leadership Briefs", value: 3, detail: "Available for export", tone: "success" },
      { label: "Failed Deliveries", value: 0, detail: "All automations healthy", tone: "success" }
    ],
    actions: [
      { label: "Generate Report", description: "Build a report from current data." },
      { label: "Schedule Report", description: "Create a recurring delivery." },
      { label: "Export Readiness", description: "Download the current readiness packet." }
    ],
    records: [
      { id: "report-1", primary: "Commander Weekly Brief", secondary: "Every Monday at 07:00", tertiary: "Dashboard, risks, deadlines, and approvals", status: "Scheduled", tone: "success" },
      { id: "report-2", primary: "July Finance Report", secondary: "Due Jul 15", tertiary: "Draft not generated", status: "Overdue", tone: "danger" },
      { id: "report-3", primary: "Quarterly Readiness Packet", secondary: "Next due Sep 30", tertiary: "Current completion 81%", status: "In Progress", tone: "info" }
    ]
  },
  calendar: {
    key: "calendar",
    title: "Operational Calendar",
    subtitle: "Meetings, deadlines, activities, and recurring requirements",
    description: "Put every squadron obligation on one operational calendar with ownership and supporting work attached.",
    stats: [
      { label: "Events This Month", value: 18, detail: "7 meetings, 6 deadlines, 5 activities", tone: "info" },
      { label: "Unstaffed Events", value: 3, detail: "Need responsible senior member", tone: "warning" },
      { label: "Conflicts", value: 2, detail: "Require schedule review", tone: "danger" },
      { label: "Synced Calendars", value: 2, detail: "Squadron and Discord events", tone: "success" }
    ],
    actions: [
      { label: "Create Event", description: "Add a meeting, deadline, or activity." },
      { label: "Create Recurrence", description: "Schedule a repeating requirement." },
      { label: "Publish Schedule", description: "Send the approved schedule to staff." }
    ],
    records: [
      { id: "calendar-1", primary: "Staff Meeting", secondary: "Jul 21, 18:00 to 20:00", tertiary: "County Clerk's Office", status: "Confirmed", tone: "success" },
      { id: "calendar-2", primary: "Aerospace Activity", secondary: "Jul 25, 18:30 to 20:30", tertiary: "Instructor assigned", status: "Confirmed", tone: "success" },
      { id: "calendar-3", primary: "Monthly Finance Report", secondary: "Jul 15", tertiary: "Deadline passed", status: "Overdue", tone: "danger" }
    ]
  },
  notifications: {
    key: "notifications",
    title: "Notifications and Automations",
    subtitle: "Reminders, escalations, delivery rules, and system health",
    description: "Make the system follow up automatically so obligations do not depend on one person remembering them.",
    stats: [
      { label: "Active Automations", value: 17, detail: "Across 8 modules", tone: "success" },
      { label: "Notifications Today", value: 24, detail: "19 delivered, 5 queued", tone: "info" },
      { label: "Escalations", value: 4, detail: "Overdue items", tone: "warning" },
      { label: "Delivery Failures", value: 0, detail: "All channels healthy", tone: "success" }
    ],
    actions: [
      { label: "Create Automation", description: "Build a trigger, condition, and action." },
      { label: "Send Notification", description: "Send a one-time operational message." },
      { label: "Review Escalations", description: "Open the overdue escalation queue." }
    ],
    records: [
      { id: "notification-1", primary: "Overdue Task Escalation", secondary: "Runs daily at 08:00", tertiary: "Commander notified after 3 days", status: "Active", tone: "success" },
      { id: "notification-2", primary: "Discord Staff Digest", secondary: "Runs weekdays at 17:00", tertiary: "Summarizes flagged messages", status: "Active", tone: "success" },
      { id: "notification-3", primary: "Safety Briefing Reminder", secondary: "4 members remain", tertiary: "Next reminder in 6 hours", status: "Queued", tone: "info" }
    ]
  },
  "public-affairs": {
    key: "public-affairs",
    title: "Public Affairs",
    subtitle: "Stories, releases, website content, and approval workflow",
    description: "Plan public communication and keep reviews, approvals, and publishing dates visible.",
    stats: [
      { label: "Content Drafts", value: 7, detail: "3 awaiting approval", tone: "warning" },
      { label: "Published This Month", value: 5, detail: "Website and social channels", tone: "success" },
      { label: "Media Contacts", value: 12, detail: "Local and regional", tone: "info" },
      { label: "Release Deadlines", value: 2, detail: "Within 7 days", tone: "warning" }
    ],
    actions: [
      { label: "Create Story", description: "Draft a squadron story or release." },
      { label: "Request Approval", description: "Send public content for review." },
      { label: "Update Website Queue", description: "Add a website content task." }
    ],
    records: [
      { id: "pa-1", primary: "Cirrus Visit Announcement", secondary: "Draft pending confirmed date", tertiary: "Photos and release forms planned", status: "Draft", tone: "warning" },
      { id: "pa-2", primary: "July Squadron Newsletter", secondary: "4 articles assembled", tertiary: "Commander review due Jul 20", status: "In Review", tone: "info" },
      { id: "pa-3", primary: "Website Quarterly Review", secondary: "Due Aug 5", tertiary: "Content inventory prepared", status: "Open", tone: "neutral" }
    ]
  },
  recruiting: {
    key: "recruiting",
    title: "Recruiting and Retention",
    subtitle: "Prospects, onboarding, follow-up, and member engagement",
    description: "Track prospective members and make sure current volunteers do not quietly fall through the cracks.",
    stats: [
      { label: "Active Prospects", value: 11, detail: "6 cadet, 5 senior", tone: "info" },
      { label: "Follow-ups Due", value: 7, detail: "Within 7 days", tone: "warning" },
      { label: "Onboarding", value: 4, detail: "Accounts and training in progress", tone: "success" },
      { label: "Retention Risks", value: 3, detail: "No activity in 60 days", tone: "danger" }
    ],
    actions: [
      { label: "Add Prospect", description: "Track a prospective member or parent." },
      { label: "Start Onboarding", description: "Create the onboarding checklist." },
      { label: "Record Follow-up", description: "Document contact and next action." }
    ],
    records: [
      { id: "recruit-1", primary: "Senior Member Prospect", secondary: "IT and communications background", tertiary: "Follow-up meeting requested", status: "Warm Lead", tone: "success" },
      { id: "recruit-2", primary: "Cadet Family Open House", secondary: "Aug 4, 2026", tertiary: "8 families registered", status: "Scheduled", tone: "info" },
      { id: "recruit-3", primary: "Inactive Member Review", secondary: "3 members with no activity in 60 days", tertiary: "Retention calls unassigned", status: "Action Needed", tone: "danger" }
    ]
  },
  audit: {
    key: "audit",
    title: "Audit Log",
    subtitle: "Who changed what, when, and why",
    description: "Maintain a reliable history of privileged changes and operational decisions.",
    stats: [
      { label: "Events Today", value: 42, detail: "Across 8 active users", tone: "info" },
      { label: "Privileged Changes", value: 6, detail: "Role and approval changes", tone: "warning" },
      { label: "Failed Actions", value: 0, detail: "No security failures", tone: "success" },
      { label: "Retention", value: "365 days", detail: "Current policy", tone: "neutral" }
    ],
    actions: [
      { label: "Export Audit Log", description: "Download a filtered audit record." },
      { label: "Create Review", description: "Open a periodic audit review." },
      { label: "Manage Retention", description: "Review audit retention policy." }
    ],
    records: [
      { id: "audit-1", primary: "Task reassigned", secondary: "Inventory Check to SM R. Cooper", tertiary: "By Maj. Mellard, 2 hours ago", status: "Recorded", tone: "success" },
      { id: "audit-2", primary: "Document approved", secondary: "July Safety Briefing", tertiary: "By 2d Lt. Maratos, 4 hours ago", status: "Recorded", tone: "success" },
      { id: "audit-3", primary: "Discord channel linked", secondary: "#senior-member-chat", tertiary: "By 2d Lt. Maratos, yesterday", status: "Recorded", tone: "success" }
    ]
  },
  compliance: {
    key: "compliance",
    title: "Compliance Requirements",
    subtitle: "Recurring obligations, evidence, approvals, and ownership",
    description: "Define what must happen, how often it happens, who owns it, and what evidence proves completion.",
    stats: [
      { label: "Active Requirements", value: 64, detail: "Across 12 functional areas", tone: "info" },
      { label: "Due This Month", value: 14, detail: "8 completed", tone: "warning" },
      { label: "Overdue", value: 3, detail: "Commander attention required", tone: "danger" },
      { label: "Evidence Complete", value: "91%", detail: "Current reporting period", tone: "success" }
    ],
    actions: [
      { label: "Add Requirement", description: "Create a recurring compliance obligation." },
      { label: "Attach Evidence", description: "Link proof of completion." },
      { label: "Generate Tasks", description: "Create upcoming tasks from requirements." }
    ],
    records: [
      { id: "compliance-1", primary: "Monthly Finance Report", secondary: "Responsible role: Finance Officer", tertiary: "Evidence: report and supporting records", status: "Overdue", tone: "danger" },
      { id: "compliance-2", primary: "Monthly Safety Education", secondary: "Responsible role: Safety Officer", tertiary: "18 of 22 acknowledgements", status: "In Progress", tone: "warning" },
      { id: "compliance-3", primary: "Quarterly Inventory", secondary: "Responsible role: Logistics Officer", tertiary: "Due Jul 20", status: "Due Soon", tone: "warning" }
    ]
  }
};

export function getModuleDefinition(key: string): ModuleDefinition {
  const definition = moduleRegistry[key];
  if (!definition) {
    throw new Error(`Unknown module: ${key}`);
  }
  return definition;
}
