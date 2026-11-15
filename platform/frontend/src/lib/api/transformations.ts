import apiClient from './client'
import { Transformation } from '@/lib/types/transformations'

// Read-only: transformations are internal records (document summaries); there
// is no UI to create, edit, delete or run them. The source page lists them for
// its "generate insight" menu.
export const transformationsApi = {
  list: async () => {
    const response = await apiClient.get<Transformation[]>('/transformations')
    return response.data
  },
}
