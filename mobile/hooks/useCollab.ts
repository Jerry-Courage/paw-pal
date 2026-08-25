import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collabService } from '@/services/collab';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => collabService.list(),
  });
}

export function useWorkspace(id: number) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => collabService.get(id),
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; subject?: string; description?: string }) => collabService.create(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useJoinWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => collabService.join(inviteCode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useLeaveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => collabService.leave(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => collabService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useWorkspaceMessages(workspaceId: number) {
  return useQuery({
    queryKey: ['workspace-messages', workspaceId],
    queryFn: () => collabService.getMessages(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useSendMessage(workspaceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      content?: string;
      parent_id?: number;
      attachment_type?: string;
      audio?: { uri: string; name: string; type: string };
      attachment?: { uri: string; name: string; type: string };
    }) => collabService.sendMessage(workspaceId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] }),
  });
}

export function useEditMessage(workspaceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: number; content: string }) =>
      collabService.editMessage(workspaceId, messageId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] }),
  });
}

export function useDeleteMessage(workspaceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) => collabService.deleteMessage(workspaceId, messageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] }),
  });
}

export function useShareResource(workspaceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: number) => collabService.shareResource(workspaceId, resourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] });
    },
  });
}
