import { Button } from "@onfloor/ui/components/button";
import { Input } from "@onfloor/ui/components/input";
import { Label } from "@onfloor/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import AuthCard from "./auth-card";
import Loader from "./loader";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            router.push("/simulator");
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <AuthCard
      title="Welcome Back"
      eyebrow="01 / Agent access"
      description="Sign in to your call-training workspace."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-5"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2.5">
                <Label htmlFor={field.name} className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="h-12 rounded-xl border-border bg-background px-4 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 dark:focus-visible:border-blue-400 dark:focus-visible:ring-blue-400/20"
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2.5">
                <Label htmlFor={field.name} className="text-sm font-medium">
                  Password
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="h-12 rounded-xl border-border bg-background px-4 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 dark:focus-visible:border-blue-400 dark:focus-visible:ring-blue-400/20"
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Sign In"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-6 flex justify-center border-t border-border pt-4">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="h-auto rounded-lg px-3 py-2 text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
        >
          Need an account? Sign Up
        </Button>
      </div>
    </AuthCard>
  );
}
