import {
  Injectable,
  Inject,
  ConflictException,
  BadRequestException,
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
      throw new Error('Cycle not found');
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
    const cycle = await this.repository.getCycleWithSyllabus(id);
    if (cycle && cycle.hasSyllabus) {
      throw new ConflictException(
        'Cannot delete cycle because it has active syllabus relationships. Please deactivate it instead.',
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
      throw new Error('Cycle not found');
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
    // Note: In a real scenario, we might verify template belongs to cycleId
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
