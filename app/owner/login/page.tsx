import AuthForm from "../../AuthForm";

export default function OwnerLoginPage() {
  return <AuthForm mode="sign-in" audience="owner" defaultNext="/dashboard" />;
}
