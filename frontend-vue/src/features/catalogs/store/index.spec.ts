import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The store now issues requests through the central client (`useApi`); mock it
// so the assertions target the client instead of a global `$fetch`.
const api = vi.fn();
vi.mock('@/composables/useApi', () => ({ useApi: () => api }));

import { useCatalogsStore } from './index';

describe('Catalogs Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.mockReset();
  });

  it('toggles topic visibility optimistically', async () => {
    const store = useCatalogsStore();
    
    // Setup initial state
    store.courses = [
      {
        id: 'c1',
        name: 'Math',
        topics: [
          { id: 't1', name: 'Algebra', isActive: true, subtopics: [] }
        ]
      }
    ];

    // Mock API response for the central client
    api.mockResolvedValue({ id: 't1', isActive: false });

    await store.toggleVisibility('t1', false);

    // Verify optimistic update
    const topic = store.courses[0].topics[0];
    expect(topic.isActive).toBe(false);
    expect(api).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/catalogs/topics/t1/visibility'),
      expect.objectContaining({
        method: 'PATCH',
        body: { isActive: false }
      })
    );
  });
});
