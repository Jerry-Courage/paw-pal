import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { libraryService } from '@/services/library';

export function useResources(type?: string) {
  return useQuery({
    queryKey: ['resources', type],
    queryFn: () => libraryService.getResources(type),
  });
}

export function useResource(id: number) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () => libraryService.getResource(id),
    enabled: !!id,
  });
}

export function useResourceProgress(id: number) {
  return useQuery({
    queryKey: ['resourceProgress', id],
    queryFn: () => libraryService.getProgress(id),
    enabled: !!id,
  });
}

export function useUploadResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ formData, onProgress }: { formData: FormData; onProgress?: (p: number) => void }) =>
      libraryService.uploadResource(formData, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => libraryService.deleteResource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
