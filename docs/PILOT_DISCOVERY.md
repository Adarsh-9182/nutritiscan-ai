# NutritiScan: pending-result pilot discovery

Working hypothesis, 29 September 2026: start in an Indian hospital with tests that are still pending when a patient is discharged. This is a field guide, not evidence that a partner has this problem or has agreed to a pilot. [AHRQ's discharge toolkit](https://www.ahrq.gov/patient-safety/settings/hospital/red/toolkit/redtool3a.html) calls for recording the pending test, expected result date, and person responsible for follow-up. The [Safdarjung Hospital manual](https://vmmc-sjh.mohfw.gov.in/sites/default/files/Hospital%20Manual%2C%20April%202025%2C%20DGHS%2C%20MoHFW%20-%2001.04.2025.pdf) provides an India-specific starting point for discharge documentation. Local practice must be observed before designing integrations or deadlines.

## First five conversations

Ask one hospital department for introductions to:

1. A discharge coordinator or ward nurse who prepares the discharge handoff.
2. A treating clinician who receives or reviews results after discharge.
3. A lab or radiology operations person who knows how results appear and get routed.
4. A hospital IT or medical records person who knows the actual systems, identifiers, and access rules.
5. A patient or caregiver, if the hospital approves a suitable research process, to understand how they learn about pending results.

Begin with roles 1 and 2. Ask for a 25–30 minute process walkthrough. Request a **fictional or fully de-identified example**; do not collect names, identifiers, phone numbers, screenshots of live records, or documents containing patient information. Record job titles rather than staff names in the research notes.

## Interview script

Opening: “Please walk me through the most recent discharge you can discuss where a test result was still pending. I want to understand what happened from discharge until somebody reviewed the result and decided whether the patient needed follow-up.”

Use these prompts in order; ask for an example rather than a preferred future feature:

1. **At discharge:** Who notices that a test is pending? Where is it recorded? Who tells the patient what to expect? What information is missing at that point?
2. **Ownership:** Who is accountable for checking the result after discharge? How does that person know they own it? What happens if they are off duty, the patient transfers, or no owner is assigned?
3. **Result arrival:** Which system receives the result? Is there a notification, queue, inbox, printout, phone call, or manual check? How are orders/results matched to the discharge encounter? What happens when a result is amended or delayed?
4. **Clinical review:** How is review documented? Who decides whether action is needed? How are urgent and routine findings handled? Who covers overdue items and after-hours cases?
5. **Patient contact and closure:** Who approves and sends a message or call? How is delivery or failed contact documented? What makes the team consider the loop closed?
6. **Volume and friction:** Roughly how many pending-result discharges occur per week in this department? In a recent example, how much staff time went into checking, chasing, correcting, or re-entering information? Where do errors or delays occur?
7. **Access and constraints:** Which data can a read-only tool access under hospital policy? Who can authorize a pilot, inspect a draft, and approve outbound communication? What existing channel would staff use for tasks and escalation?

If possible, observe a staff member using **dummy data** to show the actual screens and handoffs. Ask “What happened last time?” when an answer stays hypothetical. Do not ask “Would you use an AI agent?” as the main validation question.

## Workflow map to fill after each interview

| Step | Current role | System or artifact | Trigger and time | Proof of completion | Failure or handoff |
| --- | --- | --- | --- | --- | --- |
| Pending test captured at discharge | Unknown | Unknown | Unknown | Unknown | Unknown |
| Owner and deadline assigned | Unknown | Unknown | Unknown | Unknown | Unknown |
| Result received and matched | Unknown | Unknown | Unknown | Unknown | Unknown |
| Clinician reviews and decides | Unknown | Unknown | Unknown | Unknown | Unknown |
| Approved follow-up reaches patient | Unknown | Unknown | Unknown | Unknown | Unknown |
| Exception is escalated or case closed | Unknown | Unknown | Unknown | Unknown | Unknown |

Keep “unknown” until a staff member shows or confirms the answer. Note disagreements between roles. Capture timestamps only as ranges or aggregates during discovery. Seek a department's aggregate baseline later through an approved process.

## Demo walkthrough

Show `/discharge-demo` after the current workflow is mapped. Ask the coordinator and clinician to run its fictional case and narrate each point where their real process differs. Specifically ask whether the source citation, owner, deadline, result matching, clinical sign-off, approved message, and exception state reflect their work. The demo uses self-selected simulated roles and browser storage; it must never be presented as hospital-ready access control or audit evidence.

## Pilot decision

Choose one department and one pending-result type only if all of these are true:

- A named clinical owner and backup can be assigned for every result.
- The team can define a review deadline and escalation path for each result type; the product does not invent clinical time limits.
- There is an authorized source for discharge orders and a reliable way to detect the final or amended result.
- The hospital can specify who approves patient contact and which channel records delivery or failed contact.
- A sponsor can authorize a privacy/security review and a shadow workflow with appropriately governed data.
- Staff agree to measure their current process first, using a denominator they can actually obtain.

If any condition is missing, refine the synthetic prototype and keep discovery open. Do not put real cases into the public chat or browser demo.

## Measures and exit gates

Agree with the department on the eligible population, observation window, and clinical review deadline before measuring. For each eligible pending result, count **documented review by the agreed deadline**, **appropriate follow-up decision**, **owner assignment**, and **open or escalated exceptions**. Also record time to assignment/review, extraction omissions, incorrect matches, false alerts, clinician corrections, time spent, and delivery failures. Report both counts and percentages; small pilot samples can make percentages misleading.

**Shadow pilot gate:** every agent draft is checked against the source and the normal workflow by a clinician; the agent sends no messages or writes to hospital systems. Investigate any missed result, wrong patient match, or incorrect closure before expanding scope. A human owns every exception.

**Assisted pilot gate:** proceed only after the hospital signs off on identity, permissions, audit records, data handling, review, escalation, and incident response. The hospital sets acceptable error and workload thresholds; the team compares outcomes with its own baseline. Do not claim safety improvement or reduced readmissions from a prototype.

## Introduction message the founder can send

“Hi, we are exploring a tool for hospital teams to track test results still pending when a patient is discharged. Could you introduce me to a discharge coordinator and a clinician for a 25-minute workflow walkthrough? We only need a fictional or de-identified example and will not request patient records. The goal is to learn who owns each step and where follow-up gets delayed.”

After these conversations, update the [active product strategy](ACTIVE_PRODUCT_STRATEGY.md) with observed roles, systems, exceptions, baseline availability, and the pilot decision. Only then design the real case store and first authorized integration around that workflow.
