import { AuthForm } from "@/modules/auth/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="login" initialMessage={params.error
    ? "Linkul de confirmare este invalid sau a expirat. Solicită un email nou."
    : params.verified === "1" ? "Email confirmat. Te poți autentifica." : undefined} />;
}
