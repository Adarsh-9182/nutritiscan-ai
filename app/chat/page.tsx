import { redirect } from "next/navigation";

/** Existing links now open the account-scoped companion. */
export default function Page() {
  redirect("/workspace");
}
