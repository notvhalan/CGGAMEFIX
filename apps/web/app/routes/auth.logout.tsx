import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import { logout } from "~/lib/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  await logout(request);
  return redirect('/');
}

export async function loader() {
  return redirect('/');
}
