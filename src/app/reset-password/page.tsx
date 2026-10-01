import { AuthForm } from "@/modules/auth/components/auth-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="reset" token={params.error ? undefined : params.token}
    initialMessage={params.error || !params.token ? "Linkul este invalid sau a expirat. Solicită un link nou." : undefined} />;
}
