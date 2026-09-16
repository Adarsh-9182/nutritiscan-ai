import type { Workspace } from "./types";
// Fictional, isolated sample. Never copied into a real account.
export const DEMO: Workspace = {
  profile: {
    name: "Aarav",
    language: "English",
    conditions: "",
    medicines: "",
    allergies: "",
  },
  reports: [
    {
      id: "demo-september",
      title: "Annual wellness panel",
      date: "2026-09-10",
      lab: "Example Lab",
      notes: "Fictional sample for exploring the product.",
      confirmed: true,
      createdAt: "2026-09-10T10:00:00Z",
      version: 1,
      observations: [
        { name: "Vitamin B12", value: 245, unit: "pg/mL", low: 200, high: 900 },
        { name: "Hemoglobin", value: 14.2, unit: "g/dL", low: 13, high: 17 },
        { name: "Glucose", value: 92, unit: "mg/dL", low: 70, high: 100 },
        { name: "Vitamin D", value: 24, unit: "ng/mL", low: 30, high: 100 },
      ],
    },
    {
      id: "demo-june",
      title: "Summer health check",
      date: "2026-06-10",
      lab: "Example Lab",
      notes: "Fictional sample.",
      confirmed: true,
      createdAt: "2026-06-10T10:00:00Z",
      version: 1,
      observations: [
        { name: "Vitamin B12", value: 218, unit: "pg/mL", low: 200, high: 900 },
        { name: "Hemoglobin", value: 14, unit: "g/dL", low: 13, high: 17 },
        { name: "Glucose", value: 96, unit: "mg/dL", low: 70, high: 100 },
        { name: "Vitamin D", value: 22, unit: "ng/mL", low: 30, high: 100 },
      ],
    },
  ],
  tasks: [
    {
      id: "demo-task-1",
      title: "Prepare questions for my next appointment",
      date: "2026-09-18",
      done: false,
      createdAt: "2026-09-10T10:00:00Z",
      version: 1,
    },
    {
      id: "demo-task-2",
      title: "Bring my current medicine list",
      date: "2026-09-18",
      done: false,
      createdAt: "2026-09-10T10:00:00Z",
      version: 1,
    },
    {
      id: "demo-task-3",
      title: "Add my September report",
      date: "2026-09-10",
      done: true,
      createdAt: "2026-09-10T10:00:00Z",
      version: 1,
    },
  ],
};
