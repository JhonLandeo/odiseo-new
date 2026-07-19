import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { Syllabus, SyllabusWithProgress, SyllabusDistribution, CreateDistributionPayload, SyllabusSummary } from '../types';

export const useSyllabusStore = defineStore('syllabus', () => {
  const syllabus = ref<Syllabus | null>(null);
  const syllabiList = ref<SyllabusWithProgress[]>([]);
  const distributions = ref<SyllabusDistribution[]>([]);
  const generatedWeeks = ref<number[]>([]);
  const loading = ref(false);
  const hasFetched = ref(false);
  const error = ref<string | null>(null);

  async function fetchSyllabiByCycle(cycleId: string) {
    loading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const response = await api(`/api/v1/syllabus/cycle/${cycleId}`);
      syllabiList.value = response as SyllabusWithProgress[];
      hasFetched.value = true;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Error al obtener los sílabos del ciclo.';
      hasFetched.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function createSyllabus(payload: { cycleId: string; courseId: string }) {
    loading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const response = await api('/api/v1/syllabus', {
        method: 'POST',
        body: payload
      });
      syllabus.value = (response as { syllabus: Syllabus }).syllabus;
      if (syllabus.value) {
        // A freshly created syllabus has no distributions yet, so it starts with
        // zero filled weeks. `totalWeeks` is filled in by the next fetch from the
        // cycle; the list consumers guard against a 0/undefined value.
        const created: SyllabusWithProgress = {
          ...syllabus.value,
          totalWeeks: 0,
          filledWeeks: [],
        };
        syllabiList.value.push(created);
      }
    } catch (err: unknown) {
      error.value = (err as { data?: { message?: string } })?.data?.message || (err instanceof Error ? err.message : 'Error al crear el sílabo.');
    } finally {
      loading.value = false;
    }
  }

  async function addDistribution(syllabusId: string, payload: CreateDistributionPayload) {
    const tempId = 'temp-' + Date.now();
    const newDist: SyllabusDistribution = {
      id: tempId,
      syllabusId,
      templateId: payload.templateId,
      weekNumber: payload.weekNumber,
      topicId: payload.topicId,
      subtopicId: payload.subtopicId,
      questionCount: payload.questionCount,
      createdAt: '',
      updatedAt: '',
    };

    distributions.value.push(newDist);

    try {
      const api = useApi();
      const response = await api(`/api/v1/syllabus/${syllabusId}/distribution`, {
        method: 'POST',
        body: payload
      });

      const createdDist = (response as { distribution: SyllabusDistribution }).distribution;
      const index = distributions.value.findIndex(d => d.id === tempId);
      if (index !== -1) {
        distributions.value[index] = createdDist;
      }
    } catch (err: unknown) {
      distributions.value = distributions.value.filter(d => d.id !== tempId);
      throw err;
    }
  }

  async function updateDistributionQuestionCount(distId: string, _syllabusId: string, questionCount: number) {
    const dist = distributions.value.find(d => d.id === distId);
    if (!dist) return;

    const prevQuestionCount = dist.questionCount;
    dist.questionCount = questionCount;

    try {
      const api = useApi();
      await api(`/api/v1/syllabus/${_syllabusId}/distribution/${distId}`, {
        method: 'PATCH',
        body: { questionCount }
      });
    } catch (err: unknown) {
      dist.questionCount = prevQuestionCount;
      throw err;
    }
  }

  async function deleteDistribution(distId: string, _syllabusId: string) {
    const distIndex = distributions.value.findIndex(d => d.id === distId);
    if (distIndex === -1) return;

    const backupDist = distributions.value[distIndex];
    distributions.value.splice(distIndex, 1);

    try {
      const api = useApi();
      await api(`/api/v1/syllabus/${_syllabusId}/distribution/${distId}`, {
        method: 'DELETE'
      });
    } catch (err: unknown) {
      distributions.value.splice(distIndex, 0, backupDist);
      throw err;
    }
  }

  async function fetchSummary(syllabusId: string, templateId?: string) {
    loading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const params = templateId ? { templateId } : {};
      const response = await api(`/api/v1/syllabus/${syllabusId}/summary`, {
        params,
      });
      const summary = (response as { summary: SyllabusSummary }).summary;
      distributions.value = summary?.distributions || [];
      generatedWeeks.value = summary?.generatedWeeks || [];
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Error al obtener las distribuciones.';
    } finally {
      loading.value = false;
    }
  }

  async function cloneSyllabus(syllabusId: string, sourceId: string) {
    loading.value = true;
    try {
      const api = useApi();
      const response = await api(`/api/v1/syllabus/${syllabusId}/clone`, {
        method: 'POST',
        body: { sourceId }
      });
      distributions.value = (response as { summary: SyllabusSummary }).summary?.distributions || [];
    } catch (err: unknown) {
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function cloneCycleSyllabuses(targetCycleId: string, sourceCycleId: string) {
    loading.value = true;
    try {
      const api = useApi();
      const response = await api<{ clonedCount: number }>(`/api/v1/syllabus/cycle/${targetCycleId}/clone-from/${sourceCycleId}`, {
        method: 'POST'
      });
      await fetchSyllabiByCycle(targetCycleId);
      return response;
    } catch (err: unknown) {
      throw new Error((err as { data?: { message?: string } })?.data?.message || (err instanceof Error ? err.message : 'Error al clonar los sílabos del ciclo.'));
    } finally {
      loading.value = false;
    }
  }

  async function setTemplate(syllabusId: string, templateId: string) {
    if (syllabus.value) {
      syllabus.value.templateId = templateId;
    }
    try {
      const api = useApi();
      await api(`/api/v1/syllabus/${syllabusId}/template`, {
        method: 'PATCH',
        body: { templateId }
      });
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : 'Error al asignar plantilla al sílabo.');
    }
  }

  async function toggleSyllabusVisibility(id: string, isActive: boolean) {
    const target = syllabiList.value.find(s => s.id === id);
    if (!target) return;
    const prev = target.isActive;
    target.isActive = isActive;
    try {
      const api = useApi();
      await api(`/api/v1/syllabus/${id}/archive`, {
        method: 'PATCH',
        body: { isActive }
      });
    } catch (err: unknown) {
      target.isActive = prev;
      throw new Error(err instanceof Error ? err.message : 'Error al cambiar la visibilidad del sílabo.');
    }
  }

  const activeTemplateId = ref<string>('');

  return {
    syllabus,
    syllabiList,
    distributions,
    generatedWeeks,
    loading,
    hasFetched,
    error,
    activeTemplateId,
    fetchSyllabiByCycle,
    createSyllabus,
    addDistribution,
    updateDistributionQuestionCount,
    deleteDistribution,
    fetchSummary,
    cloneSyllabus,
    cloneCycleSyllabuses,
    setTemplate,
    toggleSyllabusVisibility
  };
});
