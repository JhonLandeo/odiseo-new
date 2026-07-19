import {
  Injectable,
  Inject,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { IAcademicTimeRepository } from './repositories/i-academic-time.repository';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateCycleMaterialTemplateDto,
  CreateTemplateCourseDto,
} from './dtos/create-material-template.dto';
import { UpdateCycleMaterialTemplateDto } from './dtos/update-material-template.dto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

@Injectable()
export class AcademicTimeUseCase {
  constructor(
    @Inject(IAcademicTimeRepository)
    private readonly repository: IAcademicTimeRepository,
  ) {}

  async getCycles(limit?: number, offset?: number, search?: string) {
    return this.repository.getCycles(limit, offset, search);
  }

  async createCycle(dto: {
    name: string;
    year: number;
    startDate: string;
    daysPerWeek: number;
    totalWeeks: number;
  }) {
    const { name, year, startDate, daysPerWeek, totalWeeks } = dto;

    const start = dayjs.utc(startDate);

    const cycleId = uuidv4();
    const cycle = {
      id: cycleId,
      name,
      year,
      startDate: start.format('YYYY-MM-DD'),
      endDate: '', // Will be assigned from the last week
      daysPerWeek,
      totalWeeks,
      weeks: [] as any[],
    };

    for (let i = 1; i <= totalWeeks; i++) {
      const currentWeekStart = start.add((i - 1) * 7, 'day');
      const currentWeekEnd = currentWeekStart.add(daysPerWeek - 1, 'day');

      cycle.weeks.push({
        id: uuidv4(),
        cycleId,
        weekNumber: i,
        startDate: currentWeekStart.format('YYYY-MM-DD'),
        endDate: currentWeekEnd.format('YYYY-MM-DD'),
        isActive: true,
      });
    }

    if (cycle.weeks.length > 0) {
      cycle.endDate = cycle.weeks[cycle.weeks.length - 1].endDate;
    }

    await this.repository.createCycle(cycle);
    return { id: cycleId };
  }

  async updateCycle(
    id: string,
    dto: {
      name?: string;
      year?: number;
      startDate?: string;
      daysPerWeek?: number;
      totalWeeks?: number;
    },
  ) {
    const { name, year, startDate, daysPerWeek, totalWeeks } = dto;

    // Check if cycle has active syllabus relations
    const existingCycle = await this.repository.getCycleWithSyllabus(id);
    if (!existingCycle) {
      throw new NotFoundException('Cycle not found');
    }

    const normalizeDate = (d: any): string => {
      if (!d) return '';
      return dayjs.utc(d).format('YYYY-MM-DD');
    };

    const finalStartDate =
      startDate !== undefined
        ? normalizeDate(startDate)
        : normalizeDate(existingCycle.startDate);
    const finalDaysPerWeek = daysPerWeek ?? existingCycle.daysPerWeek;
    const finalTotalWeeks = totalWeeks ?? existingCycle.totalWeeks;

    const existingStartDateNormalized = normalizeDate(existingCycle.startDate);

    const needsRecalculation =
      (startDate !== undefined &&
        existingStartDateNormalized !== finalStartDate) ||
      (daysPerWeek !== undefined &&
        existingCycle.daysPerWeek !== finalDaysPerWeek) ||
      (totalWeeks !== undefined &&
        existingCycle.totalWeeks !== finalTotalWeeks);

    if (needsRecalculation && existingCycle.hasSyllabus) {
      throw new ConflictException(
        'Cannot update cycle dates or weeks because it has active syllabus relationships.',
      );
    }

    const cycleUpdate: any = {};
    if (name !== undefined) cycleUpdate.name = name;
    if (year !== undefined) cycleUpdate.year = year;
    if (startDate !== undefined) cycleUpdate.startDate = finalStartDate;
    if (daysPerWeek !== undefined) cycleUpdate.daysPerWeek = finalDaysPerWeek;
    if (totalWeeks !== undefined) cycleUpdate.totalWeeks = finalTotalWeeks;

    if (needsRecalculation) {
      const start = dayjs.utc(finalStartDate);

      // Fetch existing weeks by cycleId (its stable key) to preserve their IDs
      // and isActive state. Never look them up by name — names are not unique
      // and an ILIKE search could return a different cycle's weeks.
      const existingWeeks = await this.repository.getWeeksByCycle(id);

      cycleUpdate.weeks = [];
      for (let i = 1; i <= finalTotalWeeks; i++) {
        const currentWeekStart = start.add((i - 1) * 7, 'day');
        const currentWeekEnd = currentWeekStart.add(
          finalDaysPerWeek - 1,
          'day',
        );

        const existingWeek = existingWeeks.find((w: any) => w.weekNumber === i);

        cycleUpdate.weeks.push({
          id: existingWeek ? existingWeek.id : uuidv4(),
          cycleId: id,
          weekNumber: i,
          startDate: currentWeekStart.format('YYYY-MM-DD'),
          endDate: currentWeekEnd.format('YYYY-MM-DD'),
          isActive: existingWeek ? existingWeek.isActive : true,
        });
      }

      if (cycleUpdate.weeks.length > 0) {
        cycleUpdate.endDate =
          cycleUpdate.weeks[cycleUpdate.weeks.length - 1].endDate;
      }
    }

    await this.repository.updateCycle(id, cycleUpdate);
    return { success: true };
  }

  async toggleCycleVisibility(id: string, isActive: boolean) {
    await this.repository.updateCycleVisibility(id, isActive);
  }

  async toggleWeekVisibility(id: string, isActive: boolean) {
    await this.repository.updateWeekVisibility(id, isActive);
  }

  async getActiveWeekNumbers(cycleId: string): Promise<number[]> {
    return this.repository.getActiveWeekNumbers(cycleId);
  }

  async deleteCycle(id: string) {
    // FR-005 / US3.5: a cycle may be soft-deleted ONLY when it has NO related
    // records; otherwise it must be deactivated, not deleted. The old guard
    // only looked at ACTIVE syllabuses, so a cycle carrying material templates,
    // generated materials, material requests, or an INACTIVE syllabus could be
    // tombstoned — its cycle_id FKs are ON DELETE CASCADE, but soft-delete is an
    // UPDATE that never fires them, leaving those rows orphaned by soft-delete.
    // getCycleUsage counts every dependent kind (syllabuses regardless of
    // is_active), subsuming the previous active-syllabus check.
    const usage = await this.repository.getCycleUsage(id);
    const dependants = [
      { count: usage.templates, label: 'material templates' },
      { count: usage.syllabus, label: 'syllabus' },
      { count: usage.materials, label: 'generated materials' },
      { count: usage.materialRequests, label: 'material requests' },
    ].filter((d) => d.count > 0);

    if (dependants.length > 0) {
      const detail = dependants.map((d) => `${d.count} ${d.label}`).join(', ');
      throw new ConflictException(
        `Cannot delete cycle because it has related records (${detail}). Please deactivate it instead.`,
      );
    }

    await this.repository.softDeleteCycle(id);
  }

  // --- Material Templates ---

  async getTemplates(cycleId: string) {
    return this.repository.getTemplatesByCycle(cycleId);
  }

  async createTemplate(cycleId: string, dto: CreateCycleMaterialTemplateDto) {
    // Optionally check if cycle exists
    const cycle = await this.repository.getCycleWithSyllabus(cycleId);
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }

    const templateId = uuidv4();
    const templateData = {
      id: templateId,
      cycleId,
      name: dto.name,
      scope: dto.scope,
      accumulationWeeks: dto.accumulationWeeks ?? null,
      courses: this.validateAndMapCourses(dto.courses),
    };

    await this.repository.createTemplate(templateData);
    return { id: templateId };
  }

  async updateTemplate(
    cycleId: string,
    templateId: string,
    dto: UpdateCycleMaterialTemplateDto,
  ) {
    // Object-level authorization (IDOR guard): the template must belong to the
    // cycle named in the URL BEFORE we mutate it or bulk-replace its courses.
    // A mismatched :cycleId gets a plain NotFound (never a hint the template
    // lives under another cycle), and — because this runs before any write —
    // a foreign template's row and its course rows are provably never touched.
    const owned = await this.repository.getTemplateInCycle(templateId, cycleId);
    if (!owned) {
      throw new NotFoundException('Template not found for this cycle.');
    }

    const templateData: any = {};
    if (dto.name !== undefined) templateData.name = dto.name;
    if (dto.scope !== undefined) templateData.scope = dto.scope;
    if (dto.accumulationWeeks !== undefined)
      templateData.accumulationWeeks = dto.accumulationWeeks;

    if (dto.courses) {
      templateData.courses = this.validateAndMapCourses(dto.courses);
    }

    await this.repository.updateTemplate(templateId, templateData);
    return { success: true };
  }

  async deleteTemplate(cycleId: string, templateId: string) {
    // Object-level authorization (IDOR guard) FIRST — before the usage check.
    // If the :cycleId does not own this template, refuse with a plain NotFound
    // and never reach getTemplateUsage: that keeps a wrong cycle from learning
    // (via a Conflict "in use by …" message) that the template exists or is
    // referenced under another cycle. Running before the delete also guarantees
    // the template's course rows are never removed for a non-owned template.
    const owned = await this.repository.getTemplateInCycle(templateId, cycleId);
    if (!owned) {
      throw new NotFoundException('Template not found for this cycle.');
    }

    // Same guard shape as deleteCycle. The template's FKs are SET NULL or
    // CASCADE, so the database happily deletes a template still in use — which
    // leaves GenerateMaterialUseCase failing with "El perfil seleccionado no
    // existe" forever and breaks the syllabus clone's template mapping. Refuse
    // instead, naming what depends on it so the operator can act.
    const usage = await this.repository.getTemplateUsage(templateId);
    const dependants = [
      { count: usage.syllabus, label: 'syllabus' },
      { count: usage.syllabusDistribution, label: 'syllabus distributions' },
      { count: usage.materialRequests, label: 'material requests' },
      { count: usage.materials, label: 'generated materials' },
    ].filter((d) => d.count > 0);

    if (dependants.length > 0) {
      const detail = dependants
        .map((d) => `${d.count} ${d.label}`)
        .join(', ');
      throw new ConflictException(
        `Cannot delete this material template because it is used by ${detail}. Remove or reassign them first.`,
      );
    }

    await this.repository.deleteTemplate(templateId);
    return { success: true };
  }

  private validateAndMapCourses(courses?: CreateTemplateCourseDto[]) {
    if (!courses) return [];
    return courses.map((c) => {
      const easy = c.easyCount ?? 0;
      const medium = c.mediumCount ?? 0;
      const hard = c.hardCount ?? 0;
      if (easy + medium + hard !== c.questionsQuantity) {
        throw new BadRequestException(
          `La suma de preguntas fáciles (${easy}), intermedias (${medium}) y difíciles (${hard}) debe ser igual a la cantidad total (${c.questionsQuantity}) para el curso ${c.courseId}`,
        );
      }
      return {
        id: uuidv4(),
        courseId: c.courseId,
        questionsQuantity: c.questionsQuantity,
        easyCount: easy,
        mediumCount: medium,
        hardCount: hard,
      };
    });
  }
}
