import AuthForm from "../../AuthForm";

export default function DeskLoginPage() {
  return <AuthForm mode="sign-in" audience="desk" defaultNext="/dashboard" />;
}
