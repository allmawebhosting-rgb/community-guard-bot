import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ThreadSummary = {
  id: string;
  title: string;
  updated_at: string;
};

export function threadsQueryOptions() {
  return queryOptions({
    queryKey: ["threads"],
    queryFn: async (): Promise<ThreadSummary[]> => {
      const { data, error } = await supabase
        .from("threads")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function createThread(title = "New conversation"): Promise<ThreadSummary> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("threads")
    .insert({ user_id: userId, title })
    .select("id, title, updated_at")
    .single();
  if (error) throw error;
  return data;
}
