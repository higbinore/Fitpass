import AuthForm from "../../AuthForm";

export default function MemberLoginPage() {
  return <AuthForm mode="sign-in" audience="member" defaultNext="/dashboard" />;
}
