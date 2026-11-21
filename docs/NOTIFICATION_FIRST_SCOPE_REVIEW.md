# ApplyFirst Notification-First Scope Review

Reviewed: November 20, 2026

## Decision

ApplyFirst is a notification-first monitor, not a directory students must repeatedly browse. The primary loop is:

1. Set class year, role interest, and alert timing.
2. ApplyFirst monitors each official source once on its program schedule.
3. Verified signals are matched to eligible students.
4. Students receive a concise opening or deadline email and continue to the official source.

The library remains valuable as the evidence and exploration layer behind those alerts.

## Scope Model

- **Core Programs** is the default view: discovery programs, fellowships, startup/VC fellowships, winternships, distinctive full-time alternatives, and a limited set of structured career-launch prep programs.
- **All Records** preserves useful adjacent scholarships, conference funding, communities, historical records, and other references.
- Existing saves, program watches, Focus subscriptions, and application history are not removed or rewritten by this classification.
- Classification is reversible metadata. It does not alter monitoring, delivery eligibility, or lifecycle records.

## Current-State Audit

| Capability | Exists? | Working? | Production verified? | Problem | Recommended action |
| --- | --- | --- | --- | --- | --- |
| Focus-based matching | Yes | Verified by Worker tests | Yes: active requests and delivery history | No current matching defect found | Keep |
| Source monitoring | Yes | Verified | Yes: 116 sources, `dueSources=0`, `discoveryDue=0` at review | Public status is point-in-time evidence | Keep weekly health review |
| Opening/deadline delivery | Yes | Verified by delivery tests | Yes: sent batches; no failed batch in reviewed aggregate | Provider acceptance does not prove inbox placement | Add bounce/complaint review before broad growth |
| Duplicate suppression | Yes | Verified | Yes: scheduled runs suppressed already-delivered items; no duplicate keys found | None found | Keep |
| Unsubscribe safety | Yes | Verified | Partial: no sends after unsubscribe; no current unsubscribed profile for a fresh replay | Live replay evidence is limited | Repeat with owner test profile before a major release |
| Save, Watch, Apply lifecycle | Yes | Verified by lifecycle/workspace tests | Partial: schema and records verified, no new production mutation performed | Full browser flow was not replayed against production | Keep regression suite and cohort observation |
| Waitlist protection | Yes | Verified by Turnstile/double-opt-in tests | Previously smoke-tested; not resubmitted in this task | No current issue found | Keep |
| Client error observability | Yes | Verified with redaction tests | Partial: production admin feed was not queried without a token | Requires weekly operations review | Keep weekly report |
| Maintainer review | Yes | Verified | Yes: 7 alert and 81 discovery candidates pending | Backlog can increase maintainer burden | Triage regularly; keep candidates quarantined |
| SMS | Partial, hidden implementation | Not enabled | Yes: production reports `sms=false` | Cost, consent, compliance, and demand unproven | Defer |

Production counts are a point-in-time operational check, not hard-coded product metrics.

## Safety Matrix

| Case | Expected behavior | Evidence |
| --- | --- | --- |
| Relevant current-cycle opening | Eligible for an action alert | Delivery classification tests |
| Future or preparation-stage program | Preparation/digest only when opted in | Delivery classification tests |
| Deadline approaching | Reminder only when current deadline evidence is defensible | Deadline reminder tests |
| Stale or previous-cycle page | Never represented as a current opening | Copy-state and source-safety tests |
| Ambiguous source change | Held for maintainer review | Source adapter and delivery tests |
| Ineligible student | No delivery | Match tests |
| Already delivered same program/cycle/signal | Suppressed | Dedupe tests and production runs |
| Unsubscribed/inactive recipient | Excluded before delivery | Recipient query and unsubscribe tests |
| Provider send failure | Recorded as failed, not sent | Delivery failure regression test |
| Repeated Mark Applied | Same-cycle ordinary action is idempotent; explicit Add Another Application creates another attempt | Lifecycle tests |

## What Changed In This Iteration

- Repositioned landing and first-session copy around Focus, monitoring, and verified email signals.
- Made opening plus deadline alerts the default timing for new setups; preparation alerts remain opt-in.
- Added a reversible Core Programs / All Records library scope.
- Kept Saved and Application History independent of the default scope filter.
- Reduced onboarding to four product-critical steps.
- Added a scope-classification regression test.

## Risks And Deferred Work

- The maintainer queues need regular triage; pending records must remain quarantined until reviewed.
- Email-provider acceptance is not the same as inbox delivery. Add bounce/complaint monitoring before broad public growth.
- Current beta identity is an invite-code workspace, not full authentication.
- SMS remains deferred because it adds provider cost, consent, compliance, and operational complexity without proven beta demand.
- Names remain part of the current alert setup because owner notifications and tester operations use them; changing that is a separate product decision.

## Scale Readiness

### Around 100 students

Continue cohort expansion if weekly reports show healthy scheduled runs, no duplicate sends, no real client-error trend, and a manageable review queue. Keep email only and audit a sample of open records weekly.

### Around 1,000 students

Load-test recipient fan-out and analytics queries, verify current Workers/D1/email limits and pricing, monitor bounce and complaint rates, and define an operational response time for source-review queues.

### Beyond 1,000 students

Adopt stronger account identity, formal delivery and monitoring SLOs, and queue-based fan-out only when measured request volume requires it. Preserve the rule that sources are fetched per program cadence, not once per student.

## Deployment Notes

This iteration requires no D1 migration, seed rewrite, Worker deployment, production data mutation, or student email. Before release, run the frontend and Worker regression suites, visually verify desktop/mobile layouts, then deploy the frontend through the existing Pages workflow.
