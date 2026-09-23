import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  CreateInstagramPostInput,
  InstagramPost,
  UpdateInstagramPostInput,
} from '@ecommerce/shared/contracts'
import { apiFetch } from './api'

const KEY = ['instagram-posts']

export const useInstagramPosts = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<InstagramPost[]>(ROUTES.cms.instagramPosts),
  })

export const useCreateInstagramPost = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateInstagramPostInput) =>
      apiFetch<InstagramPost>(ROUTES.cms.instagramPosts, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Otimista: a grade já mostra a nova ordem ao soltar o tile. Se a API recusar,
 * volta a ordem anterior — o tile "pula de volta", que é o feedback certo.
 */
export const useReorderInstagramPosts = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (posts: InstagramPost[]) =>
      apiFetch<InstagramPost[]>(ROUTES.cms.instagramPostsOrder, {
        method: 'PUT',
        body: JSON.stringify({ ids: posts.map((p) => p.id) }),
      }),
    onMutate: async (posts) => {
      await qc.cancelQueries({ queryKey: KEY })
      const previous = qc.getQueryData<InstagramPost[]>(KEY)
      qc.setQueryData(KEY, posts)
      return { previous }
    },
    onError: (_err, _posts, context) => {
      if (context?.previous) qc.setQueryData(KEY, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/** Pausar/ativar e trocar o modo. Otimista: o tile muda na hora do clique. */
export const useUpdateInstagramPost = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInstagramPostInput }) =>
      apiFetch<InstagramPost>(ROUTES.cms.instagramPost(id), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: KEY })
      const previous = qc.getQueryData<InstagramPost[]>(KEY)
      qc.setQueryData<InstagramPost[]>(KEY, (posts) =>
        posts?.map((p) => (p.id === id ? { ...p, ...input } : p)),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(KEY, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteInstagramPost = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(ROUTES.cms.instagramPost(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
