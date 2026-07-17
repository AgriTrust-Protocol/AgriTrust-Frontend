"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export type TaskStatus = "Planned" | "Assigned" | "InProgress" | "Completed" | "Cancelled";
export type ActivityType = "Irrigation" | "Fertilization" | "Pest control" | "Harvest" | "Scouting";

export interface FieldTask {
  id: string;
  title: string;
  field_id: string;
  activity_type: ActivityType;
  assignee_id?: string;
  assignee_name?: string;
  start: string;
  end: string;
  status: TaskStatus;
  notes?: string;
  weather_dependency?: boolean;
}

export type TaskInput = Omit<FieldTask, "id">;

const taskKey = ["tasks"] as const;

export function useTasks() {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({
    queryKey: taskKey,
    queryFn: () => apiClient.get<FieldTask[]>("/api/v1/tasks"),
    staleTime: 30_000,
  });

  const createTask = useMutation({
    mutationFn: (task: TaskInput) => apiClient.post<FieldTask>("/api/v1/tasks", task),
    onSuccess: (task) => queryClient.setQueryData<FieldTask[]>(taskKey, (current = []) => [...current, task]),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<TaskInput> }) =>
      apiClient.patch<FieldTask>(`/api/v1/tasks/${id}`, changes),
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey: taskKey });
      const previous = queryClient.getQueryData<FieldTask[]>(taskKey);
      queryClient.setQueryData<FieldTask[]>(taskKey, (current = []) =>
        current.map((task) => (task.id === id ? { ...task, ...changes } : task)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(taskKey, context?.previous),
    onSuccess: (task) => queryClient.setQueryData<FieldTask[]>(taskKey, (current = []) => current.map((item) => item.id === task.id ? task : item)),
  });

  return { ...tasksQuery, tasks: tasksQuery.data ?? [], createTask, updateTask };
}
