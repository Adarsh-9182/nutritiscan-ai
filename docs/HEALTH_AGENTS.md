# Health chat roles and activity

NutritiScan presents one health conversation with internal specialist roles.
These are existing language models with role instructions and scoped context,
not independently trained medical models or licensed professionals.

| Role | Current scope |
| --- | --- |
| Nutrition | Food and nutrition education, relevant entered meal context |
| Fitness | Activity, recovery and exercise education |
| Health information (`doctor` internally) | Symptom education and questions to discuss with a clinician |
| Lab | Explain supplied report text, reported values and available ranges |
| Coach | Habits, goals and small follow-up steps |

Recognizable single-topic questions route directly to a specialist; broader
questions use the supervisor and specialist tools. Provider selection and fallback
remain shared infrastructure. The request's safety checks and clinical answer
validation remain separate from role selection. Multiple agents do not establish
medical accuracy. Research chat uses its own public evidence workflow and storage.

## Activity display

The UI credits a direct specialist only when the completed model response reports
that route. Supervisor synthesis remains attributed to NutritiScan. Actual tool
execution can show specialist activity. Unknown roles, merely streamed tool inputs
and tool errors do not become completed consultation claims.

Built-in reference answers use the label **Reference guidance** and explicitly
state that no AI answer was generated for that turn. They do not emit simulated
consultation events. Saved older reference messages containing those events are
also filtered by the renderer. Deterministic safety messages use **Safety guidance**
and do not display a fictitious model team. Live source/tool metadata and software
checks are not independent clinical validation.
