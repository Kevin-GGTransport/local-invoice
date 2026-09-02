"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("callbackUrl");
  const callbackUrl =
    raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")
      ? raw
      : "/dashboard";

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
    });
    if (result?.error) {
      toast.error("用户名或密码错误");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md rounded-2xl border-slate-200/90 bg-white/95 text-slate-950 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.55)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-50">
      <CardHeader className="gap-4 px-5 pb-0 sm:px-7">
        <span className="flex size-11 items-center justify-center rounded-xl bg-slate-950 text-amber-400 shadow-lg shadow-slate-950/20 dark:bg-amber-500 dark:text-slate-950">
          <Truck className="size-5" aria-hidden="true" />
        </span>
        <CardTitle className="leading-none">
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-[1.72rem]">
            G&amp;G Ground Transportation System
          </h1>
        </CardTitle>
        <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
          陆运运营与账单管理平台
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 sm:px-7">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input placeholder="请输入用户名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密码</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="请输入密码" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="h-10 w-full bg-slate-950 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-900 focus-visible:ring-slate-950/30 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 dark:focus-visible:ring-amber-500/40"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "登录中…" : "登录"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
