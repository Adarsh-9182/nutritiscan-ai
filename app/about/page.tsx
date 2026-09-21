import { redirect } from "next/navigation";
// Briefly the landing's home while the chat held "/"; the landing is back at "/".
export default function Page() { redirect("/"); }
